// Records the clips of the Controls panel (#1089, #1091). Run it through `scripts/record_controls.sh`.
//
//   bash scripts/record_controls.sh <row-id> [touch|mouse]
//   bash scripts/record_controls.sh --all
//
// The rows come from `src/app/decks/practice/controls.ts`, read with the TypeScript compiler, so
// the list and the code cannot drift apart. `--all` records every row that sets `clip`, in the
// columns it sets. A row id records the columns its gesture in `GESTURES` has.
//
// For each clip the recorder opens the fixture in agent-browser, with `agent_browser_desktop.sh`
// for a mouse clip and a plain `agent-browser open` for a touch clip, injects a pointer marker,
// starts `Page.startScreencast` on its own CDP connection, runs the gesture with the existing
// tools (`practice_drag.sh`, `cdp_input.sh`), and stops. ffmpeg then crops the frames to the part
// of the table the gesture uses and writes `public/controls/<id>-<touch|mouse>.{webm,mp4,webp}`,
// the paths of `clipFiles`.
//
// The screencast sends a frame only when the screen changes, so the page sits still while a tool
// starts up and sends nothing. Each gap between two frames is cut to `MAX_GAP_S`, which drops
// that dead time from the clip.

import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPTS = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(SCRIPTS);
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const CALL_TIMEOUT_MS = 10000;

// A clip over this size makes the panel slow on a phone (#1089).
const MAX_BYTES = 200 * 1024;
// The longest pause between two frames that stays in the clip.
const MAX_GAP_S = 0.3;
// How long the clip rests on its first and its last frame.
const LEAD_IN_S = 0.4;
const HOLD_END_S = 1;
// A longer clip is sped up to this length.
const MAX_CLIP_S = 4;
const FPS = 25;
// The width of a clip, in pixels. A narrower crop keeps its own width.
const CLIP_WIDTH = 480;
// The space around the elements the gesture uses, in CSS pixels.
const CROP_PAD = 16;

const FIXTURE_PILES = '/decks/practice?fixture=piles&reset=1&menu=0';
const FIXTURE_FRESH = '/decks/practice?fixture=1&reset=1&menu=0';

// The gesture of each clip, keyed by the row `id` of `controls.ts`. #1092 and #1093 add entries.
//
// - `fixture`: the page the clip starts from.
// - `crop`: selectors of the elements the gesture uses. The clip shows the box around all of them,
//   read from the page before the gesture starts.
// - `run(ctx, mode)`: the gesture. `ctx.drag(cardId, target)` runs `practice_drag.sh`, with
//   `--touch` in the touch mode, and returns what it printed. `ctx.input(...)` runs
//   `cdp_input.sh`. `ctx.evaluate(js)` reads the page.
const GESTURES = {
  'mission-drop-halves': {
    fixture: FIXTURE_PILES,
    modes: ['touch', 'mouse'],
    crop: ['[data-zone="mission-under-3"]', '[data-zone="mission-on-3"]', '[data-testid="dilemma-pile"]'],
    async run(ctx) {
      const topDilemma = `document.querySelector('[data-testid="dilemma-pile"] [data-card-id]')?.dataset.cardId`;
      const under = await ctx.drag(await ctx.evaluate(topDilemma), 'mission-under-3');
      if (under !== 'mission-under-3') throw new Error(`the first dilemma went to ${under}, not under the mission`);
      await ctx.drag(await ctx.evaluate(topDilemma), 'mission-on-3');
      const on = await ctx.evaluate(`document.querySelector('[data-testid="mission-on-dilemmas-3"]')?.getAttribute('aria-label') || ''`);
      if (!/1 dilemma on it/.test(on)) throw new Error('the second dilemma was not placed on the mission card');
    },
  },
};

// A circle at the pointer or the finger, filled while pressed. It lives only while recording, takes
// no pointer events, and hides when a finger lifts.
const MARKER = `(() => {
  document.getElementById('__recordMarker')?.remove();
  const m = document.createElement('div');
  m.id = '__recordMarker';
  Object.assign(m.style, {
    position: 'fixed', left: '0', top: '0', width: '24px', height: '24px', margin: '-12px 0 0 -12px',
    borderRadius: '50%', border: '2px solid rgba(255,255,255,0.95)', boxShadow: '0 0 0 2px rgba(0,0,0,0.6)',
    background: 'transparent', pointerEvents: 'none', zIndex: '2147483647', display: 'none',
  });
  document.body.appendChild(m);
  const at = (e) => { m.style.display = 'block'; m.style.transform = 'translate(' + e.clientX + 'px,' + e.clientY + 'px)'; };
  const on = {
    pointermove: (e) => at(e),
    pointerdown: (e) => { at(e); m.style.background = 'rgba(255,255,255,0.6)'; },
    pointerup: (e) => { at(e); m.style.background = 'transparent'; if (e.pointerType === 'touch') m.style.display = 'none'; },
    pointercancel: (e) => { m.style.background = 'transparent'; if (e.pointerType === 'touch') m.style.display = 'none'; },
  };
  for (const [t, f] of Object.entries(on)) window.addEventListener(t, f, true);
  window.__recordMarker = () => { for (const [t, f] of Object.entries(on)) window.removeEventListener(t, f, true); m.remove(); };
  return 'ok';
})()`;

function fail(message) {
  console.error(message);
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Runs a command and resolves with its output. The event loop stays free, so the screencast
// frames keep coming while a tool runs.
function run(cmd, args, { allowFail = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0 && !allowFail) reject(new Error(`${cmd} ${args.join(' ')} exited ${code}\n${out}${err}`));
      else resolve(out.trim());
    });
  });
}

async function loadRows() {
  const ts = (await import('typescript')).default;
  const source = await readFile(path.join(ROOT, 'src/app/decks/practice/controls.ts'), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  });
  const dir = await mkdtemp(path.join(tmpdir(), 'controls-'));
  const file = path.join(dir, 'controls.mjs');
  await writeFile(file, outputText);
  const mod = await import(pathToFileURL(file).href);
  await rm(dir, { recursive: true, force: true });
  return mod;
}

async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error(`could not connect to ${url}`)), { once: true });
  });
  let nextId = 1;
  const pending = new Map();
  const listeners = [];
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    } else if (msg.method) {
      for (const l of listeners) l(msg);
    }
  });
  const send = (method, params = {}, sessionId) => {
    const id = nextId++;
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`${method} got no reply in ${CALL_TIMEOUT_MS} ms`));
      }, CALL_TIMEOUT_MS);
      pending.set(id, {
        resolve: (r) => (clearTimeout(timer), resolve(r)),
        reject: (e) => (clearTimeout(timer), reject(e)),
      });
    });
  };
  return { ws, send, onEvent: (l) => listeners.push(l) };
}

async function openPage(mode, url) {
  if (mode === 'mouse') {
    await run('bash', [path.join(SCRIPTS, 'agent_browser_desktop.sh'), url]);
  } else {
    await run('npx', ['agent-browser', 'close', '--all'], { allowFail: true });
    await run('npx', ['agent-browser', 'open', url]);
    await run('npx', ['agent-browser', 'wait', '--load', 'load'], { allowFail: true });
  }
  // The fixture deals after the load, and the card images come after that.
  await sleep(2500);
}

async function record(rowId, gesture, mode, outDir) {
  console.log(`${rowId} (${mode})`);
  await openPage(mode, BASE_URL + gesture.fixture);
  const cdpUrl = (await run('npx', ['agent-browser', 'get', 'cdp-url'])).split('\n').pop().replace(/"/g, '');
  const { ws, send, onEvent } = await connect(cdpUrl);
  const { targetInfos } = await send('Target.getTargets');
  const target = targetInfos.find((t) => t.type === 'page' && !t.url.startsWith('devtools://'));
  if (!target) throw new Error('agent-browser has no page open');
  const { sessionId } = await send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
  const page = (method, params) => send(method, params, sessionId);
  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await page('Runtime.evaluate', { expression, returnByValue: true });
    if (exceptionDetails) throw new Error(`page error: ${exceptionDetails.exception?.description || exceptionDetails.text}`);
    return result.value;
  };

  const crop = await evaluate(`(() => {
    const rects = ${JSON.stringify(gesture.crop)}.map((s) => document.querySelector(s)).filter(Boolean).map((e) => e.getBoundingClientRect());
    if (rects.length === 0) return null;
    const pad = ${CROP_PAD};
    const x = Math.max(0, Math.min(...rects.map((r) => r.left)) - pad);
    const y = Math.max(0, Math.min(...rects.map((r) => r.top)) - pad);
    const right = Math.min(innerWidth, Math.max(...rects.map((r) => r.right)) + pad);
    const bottom = Math.min(innerHeight, Math.max(...rects.map((r) => r.bottom)) + pad);
    return { x, y, w: right - x, h: bottom - y, vw: innerWidth, vh: innerHeight };
  })()`);
  if (!crop) throw new Error(`none of ${gesture.crop.join(', ')} is on the page`);

  await evaluate(MARKER);
  const frames = [];
  const framesDir = await mkdtemp(path.join(tmpdir(), `clip-${rowId}-${mode}-`));
  const writes = [];
  onEvent((msg) => {
    if (msg.method !== 'Page.screencastFrame' || msg.sessionId !== sessionId) return;
    const { data, metadata, sessionId: frameId } = msg.params;
    const file = path.join(framesDir, `${String(frames.length).padStart(5, '0')}.png`);
    frames.push({ file, t: metadata.timestamp });
    writes.push(writeFile(file, Buffer.from(data, 'base64')));
    page('Page.screencastFrameAck', { sessionId: frameId }).catch(() => {});
  });
  await page('Page.enable');
  await page('Page.startScreencast', { format: 'png', everyNthFrame: 1 });
  await sleep(300);

  const ctx = {
    evaluate,
    drag: (cardId, targetName) =>
      // A drop that leaves no badge to read exits non-zero, so the gesture checks the page itself.
      run('bash', [path.join(SCRIPTS, 'practice_drag.sh'), ...(mode === 'touch' ? ['--touch'] : []), cardId, targetName], {
        allowFail: true,
      }).then((out) => out.split('\n').pop()),
    input: (...args) => run('bash', [path.join(SCRIPTS, 'cdp_input.sh'), ...args]),
  };
  try {
    await gesture.run(ctx, mode);
    // The landed cue plays for about 450 ms after the drop.
    await sleep(800);
  } finally {
    await page('Page.stopScreencast').catch(() => {});
    await evaluate('window.__recordMarker && window.__recordMarker()').catch(() => {});
    ws.close();
  }
  await Promise.all(writes);
  if (frames.length < 2) throw new Error('the screencast sent fewer than 2 frames');

  // The time of each frame on the clip, with each gap cut to MAX_GAP_S, then sped up to fit.
  const durations = frames.map((f, i) => (i + 1 < frames.length ? Math.min(frames[i + 1].t - f.t, MAX_GAP_S) : HOLD_END_S));
  durations[0] = Math.max(durations[0], LEAD_IN_S);
  const total = durations.reduce((a, b) => a + b, 0);
  const speed = Math.max(1, total / MAX_CLIP_S);
  const list = frames.map((f, i) => `file '${f.file}'\nduration ${(durations[i] / speed).toFixed(4)}`).join('\n');
  // The concat demuxer takes the last file's duration only when the file is listed again.
  const listFile = path.join(framesDir, 'list.txt');
  await writeFile(listFile, `${list}\nfile '${frames[frames.length - 1].file}'\n`);

  const fx = crop.x / crop.vw;
  const fy = crop.y / crop.vh;
  const fw = crop.w / crop.vw;
  const fh = crop.h / crop.vh;
  const width = Math.min(CLIP_WIDTH, Math.round(crop.w / 2) * 2);
  const filter = `crop=trunc(iw*${fw.toFixed(5)}/2)*2:trunc(ih*${fh.toFixed(5)}/2)*2:iw*${fx.toFixed(5)}:ih*${fy.toFixed(5)},scale=${width}:-2:flags=lanczos`;
  const input = ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listFile];
  const base = path.join(outDir, `${rowId}-${mode}`);
  await run('ffmpeg', [...input, '-vf', `${filter},fps=${FPS}`, '-an', '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '42', '-row-mt', '1', '-pix_fmt', 'yuv420p', `${base}.webm`]);
  await run('ffmpeg', [...input, '-vf', `${filter},fps=${FPS}`, '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '30', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', `${base}.mp4`]);
  // The poster is the last frame: the gesture done.
  await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', frames[frames.length - 1].file, '-vf', filter, '-quality', '80', `${base}.webp`]);
  await rm(framesDir, { recursive: true, force: true });

  const seconds = (total / speed).toFixed(1);
  for (const ext of ['webm', 'mp4', 'webp']) {
    const file = `${base}.${ext}`;
    const { size } = await stat(file);
    const warn = size > MAX_BYTES ? `  WARNING: over ${MAX_BYTES / 1024} KB` : '';
    console.log(`  ${path.relative(ROOT, file)}  ${(size / 1024).toFixed(1)} KB${ext === 'webp' ? '' : `, ${seconds} s`}${warn}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) fail('usage: bash scripts/record_controls.sh <row-id> [touch|mouse] | --all');

  const { CONTROL_ROWS } = await loadRows();
  const jobs = [];
  if (args[0] === '--all') {
    for (const row of CONTROL_ROWS.filter((r) => r.clip)) {
      const gesture = GESTURES[row.id];
      if (!gesture) fail(`the row "${row.id}" sets clip, but scripts/record_controls.mjs has no gesture for it.`);
      for (const mode of ['touch', 'mouse']) if (row.clip[mode]) jobs.push([row.id, gesture, mode]);
    }
  } else {
    const [rowId, only] = args;
    if (!CONTROL_ROWS.some((r) => r.id === rowId)) fail(`controls.ts has no row "${rowId}".`);
    const gesture = GESTURES[rowId];
    if (!gesture) fail(`scripts/record_controls.mjs has no gesture for "${rowId}". Add one to GESTURES.`);
    if (only && !gesture.modes.includes(only)) fail(`the gesture of "${rowId}" has no ${only} mode. It has ${gesture.modes.join(' and ')}.`);
    for (const mode of only ? [only] : gesture.modes) jobs.push([rowId, gesture, mode]);
  }

  const outDir = path.join(ROOT, 'public/controls');
  await mkdir(outDir, { recursive: true });
  for (const [rowId, gesture, mode] of jobs) await record(rowId, gesture, mode, outDir);
  await run('npx', ['agent-browser', 'close', '--all'], { allowFail: true });
}

main().catch((error) => fail(error.message));
