// Records a bot game from the start to the first revealed dilemma, on the whole screen. Run it
// through `scripts/record_bot_attempt.sh`.
//
//   bash scripts/record_bot_attempt.sh [mouse|touch] [<out-dir>]
//
// It uses the screencast, the pointer marker and the ffmpeg steps of `record_controls.mjs`, but
// keeps the whole screen and has no length limit. The video shows Load deck with the TNG beginner
// deck against the bot with the Klingon beginner deck's dilemmas, then plays turns by the rules of
// step 3 below until a ship and PERSONNEL personnel are at the headquarters. The personnel board
// the ship, the ship moves to mission 1, the attempt starts, and the first dilemma of the bot's
// stack is revealed. The deck shuffle is random, so each run shows other cards. It writes
// `<out-dir>/bot-attempt-<mode>.mp4`, by default in `public/videos`.
//
// `docs/bot-game-video.md` describes the recording: what the video shows, the turn rules, the
// timing, and how to run it again.

import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPTS = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(SCRIPTS);
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const MODE = process.argv[2] || 'mouse';
const OUT_DIR = path.resolve(process.argv[3] || path.join(ROOT, 'public/videos'));
if (MODE !== 'mouse' && MODE !== 'touch') {
  console.error('usage: bash scripts/record_bot_attempt.sh [mouse|touch] [<out-dir>]');
  process.exit(1);
}
const WIDTH = 1280;
const HEIGHT = 720;
const CALL_TIMEOUT_MS = 15000;
// The longest pause between two frames that stays in the video.
// A `pause` stays in the video at its full length.
const MAX_GAP_S = 0.25;
// The pause on each screen of the deck picker, for a caption that says what to press.
const PICKER_PAUSE_S = 1.5;
// The pause after the cards are selected, before the drag.
const SELECT_PAUSE_S = 0.5;
const ATTEMPT_PAUSE_S = 1.5;
// How long the pointer rests on a target before it presses, where no longer rest is set. In the
// mouse mode the pointer first glides to the target, GLIDE_STEP_PX each frame.
const HOVER_S = 0.2;
const GLIDE_STEP_PX = 40;
// The step of a drag in `cdp_input.mjs`. Its default is 8 px; a longer step moves faster.
process.env.CDP_INPUT_STEP_PX = '40';
const LEAD_IN_S = 1;
const HOLD_END_S = 3;
const FPS = 25;
// The attempt starts once this many personnel and a ship are in play.
const PERSONNEL = 8;
const OPENING_HAND = 7;
// The most cards a hand holds at the end of a turn. The rest go to the discard pile.
const MAX_HAND = 7;
// The counters of each turn. A draw costs 1, a personnel or a ship its cost.
const COUNTERS = 7;
const MAX_TURNS = 20;
const HEADQUARTERS = 0;
const TARGET_MISSION = 1;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
  const at = (e) => { window.__pointer = [e.clientX, e.clientY]; m.style.display = 'block'; m.style.transform = 'translate(' + e.clientX + 'px,' + e.clientY + 'px)'; };
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

// The hand of the save, each card with its type and cost from the card data, and the ship and the
// personnel in play: the ships of every mission, the crew, and the away team at the headquarters.
const STATE = `(async () => {
  const s = JSON.parse(localStorage.getItem('practiceGame'));
  window.__cardFacts ??= await (async () => {
    const text = await (await fetch('/cards_with_processed_columns.txt')).text();
    const m = {};
    for (const l of text.split('\\n').slice(1)) {
      const r = l.split('\\t').map((v) => v.replace(/^"|"$/g, ''));
      if (r[5]) m[r[5].toLowerCase().replace(/(^|[^0-9])0+(\\d+)/g, '$1$2')] = { type: r[6], cost: Number(r[7]) || 0 };
    }
    return m;
  })();
  const facts = (c) => ({ id: c.id, ...window.__cardFacts[c.key] });
  const ships = s.table.missions.flatMap((m) => m.ships);
  const personnel = [...ships.flatMap((sh) => sh.crew ?? []), ...s.table.missions[${HEADQUARTERS}].awayTeam]
    .map(facts).filter((c) => c.type === 'Personnel');
  return JSON.stringify({
    hand: s.table.hand.map(facts),
    ship: ships[0]?.id ?? null,
    personnel: personnel.length,
    waiting: s.table.missions[${HEADQUARTERS}].awayTeam.map((c) => c.id),
  });
})()`;

// Returns "x y" of a point where the card `id` is on top, as JSON, or null. The cards of the open
// hand and of a panel overlap, so the centre of a card is often under its neighbour.
const visiblePoint = (id) => `(() => {
  const el = document.querySelector('[data-card-id="${id}"]');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  for (let fy = 0.3; fy <= 0.9; fy += 0.1) for (let fx = 0.9; fx >= 0.1; fx -= 0.1) {
    const x = Math.round(r.left + r.width * fx), y = Math.round(r.top + r.height * fy);
    if (y < innerHeight && el.contains(document.elementFromPoint(x, y))) return JSON.stringify([x, y]);
  }
  return null;
})()`;

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const url = `${BASE_URL}/decks/practice`;
  if (MODE === 'mouse') {
    await run('bash', [path.join(SCRIPTS, 'agent_browser_desktop.sh'), url]);
  } else {
    await run('npx', ['agent-browser', 'close', '--all'], { allowFail: true });
    await run('npx', ['agent-browser', 'open', url]);
  }
  await run('npx', ['agent-browser', 'set', 'viewport', String(WIDTH), String(HEIGHT)]);
  await run('npx', ['agent-browser', 'open', url]);
  await sleep(2000);
  // A fresh page: no saved game, and the game menu splash open, as a player first sees it.
  await run('npx', ['agent-browser', 'eval', 'localStorage.clear(); location.reload(); "ok"']);
  await sleep(4000);

  const cdpUrl = (await run('npx', ['agent-browser', 'get', 'cdp-url'])).split('\n').pop().replace(/"/g, '');
  const { ws, send, onEvent } = await connect(cdpUrl);
  const { targetInfos } = await send('Target.getTargets');
  const target = targetInfos.find((t) => t.type === 'page' && t.url.startsWith(BASE_URL));
  if (!target) throw new Error('agent-browser has no page open');
  const { sessionId } = await send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
  const page = (method, params) => send(method, params, sessionId);
  // `agent-browser set viewport` sizes the layout but not always the surface the screencast
  // captures: with the browser's window at 800x600, the frames showed only the top-left 800x513
  // of a 1280x720 page. The override on this session sizes both, for as long as it stays open.
  await page('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false, screenWidth: WIDTH, screenHeight: HEIGHT });
  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await page('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (exceptionDetails) throw new Error(`page error: ${exceptionDetails.exception?.description || exceptionDetails.text}`);
    return result.value;
  };
  const input = (...args) => run('bash', [path.join(SCRIPTS, 'cdp_input.sh'), ...args]);
  const drag = async (cardId, targetName) => {
    const out = await run('bash', [path.join(SCRIPTS, 'practice_drag.sh'), ...(MODE === 'touch' ? ['--touch'] : []), cardId, targetName], { allowFail: true });
    const last = out.split('\n').pop();
    console.log(`  drag ${cardId} -> ${targetName}: ${last}`);
    return last;
  };
  // Waits `seconds` on a still screen. The screencast sends no frame while the screen is still,
  // so the video would cut the wait to MAX_GAP_S; a pause keeps its whole length.
  const holds = [];
  const pause = async (seconds) => {
    const start = Date.now() / 1000;
    await sleep(seconds * 1000);
    holds.push([start, Date.now() / 1000]);
  };
  const waitFor = async (expression, ms = 15000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (await evaluate(expression)) return;
      await sleep(200);
    }
    throw new Error(`timed out: ${expression}`);
  };

  // Moves the mouse from where it is to x, y in steps, so the video shows the pointer travel.
  const glideTo = async (x, y) => {
    const [fx, fy] = (await evaluate('window.__pointer')) || [WIDTH / 2, HEIGHT / 2];
    const steps = Math.max(1, Math.ceil(Math.hypot(x - fx, y - fy) / GLIDE_STEP_PX));
    for (let i = 1; i <= steps; i++) {
      const px = Math.round(fx + ((x - fx) * i) / steps);
      const py = Math.round(fy + ((y - fy) * i) / steps);
      await page('Input.dispatchMouseEvent', { type: 'mouseMoved', x: px, y: py });
      await sleep(16);
    }
  };
  // Presses a target at its centre: a CSS selector, or `{ text }` for the button with that text.
  // The pointer glides to the target and rests there for `hover` seconds first, so a viewer sees
  // what is about to be pressed.
  const press = async (target, hover = HOVER_S) => {
    const find = typeof target === 'string'
      ? `document.querySelector(${JSON.stringify(target)})`
      : `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === ${JSON.stringify(target.text)})`;
    await waitFor(`!!${find}`);
    const [x, y] = JSON.parse(await evaluate(`(() => { const r = ${find}.getBoundingClientRect(); return JSON.stringify([Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]); })()`));
    if (MODE === 'mouse') await glideTo(x, y);
    await pause(hover);
    await input(MODE === 'touch' ? 'tap' : 'click', String(x), String(y));
  };
  // A screen of the deck picker: a short look at the screen, then a long rest on the target, so a
  // caption has time to say what to press.
  const pressOnPicker = async (target) => {
    await pause(1);
    await press(target, PICKER_PAUSE_S);
  };

  // Load deck asks to throw away the current game. Accept it, as a player would.
  onEvent((msg) => {
    if (msg.method === 'Page.javascriptDialogOpening' && msg.sessionId === sessionId) {
      page('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
    }
  });

  await evaluate(MARKER);
  const frames = [];
  const framesDir = await mkdtemp(path.join(tmpdir(), 'bot-attempt-'));
  const writes = [];
  let badFrame = null;
  onEvent((msg) => {
    if (msg.method !== 'Page.screencastFrame' || msg.sessionId !== sessionId) return;
    const { data, metadata, sessionId: frameId } = msg.params;
    const file = path.join(framesDir, `${String(frames.length).padStart(5, '0')}.png`);
    if (metadata.deviceWidth !== WIDTH || metadata.deviceHeight !== HEIGHT) {
      badFrame ??= `${metadata.deviceWidth}x${metadata.deviceHeight}`;
    }
    frames.push({ file, t: metadata.timestamp, received: Date.now() / 1000 });
    writes.push(writeFile(file, Buffer.from(data, 'base64')));
    page('Page.screencastFrameAck', { sessionId: frameId }).catch(() => {});
  });
  await page('Page.enable');
  await page('Page.startScreencast', { format: 'png', everyNthFrame: 1, maxWidth: WIDTH, maxHeight: HEIGHT });
  await sleep(800);

  try {
    // 1. The bot game: Load deck, the TNG beginner deck's missions and draw deck, the bot with the
    //    Klingon beginner deck's dilemmas.
    console.log('start a bot game');
    await pressOnPicker({ text: 'Load deck' });
    await pressOnPicker({ text: 'Beginner decks' });
    await pressOnPicker(`button[aria-label="Load the missions and draw deck of TNG Beginner Deck - Lucas Thompson"]`);
    await pressOnPicker(`[data-testid="practice-deck-picker-play-bot"]`);
    await pressOnPicker(`[aria-label="Play against the bot with the dilemmas of Klingon Beginner Deck - Lucas Thompson"]`);
    await waitFor(`!document.querySelector('[data-testid="practice-deck-picker"]') && JSON.parse(localStorage.getItem('practiceGame') || '{}').table?.opponent === 'bot'`);
    await sleep(2500);

    const state = async () => JSON.parse(await evaluate(STATE));
    const draw = async () => {
      await press(`[data-testid="draw-pile"]`);
      await sleep(400);
    };
    // Taps each card to select it, then drags the first: the drag takes the whole selection. A card
    // of a panel that scrolls is scrolled into view first.
    const playGroup = async (ids, targetName) => {
      for (const id of ids) {
        let point = await evaluate(visiblePoint(id));
        if (!point) {
          await evaluate(`document.querySelector('[data-card-id="${id}"]')?.scrollIntoView({ block: 'nearest' })`);
          await sleep(400);
          point = await evaluate(visiblePoint(id));
        }
        if (!point) throw new Error(`no point of ${id} is on top`);
        const [x, y] = JSON.parse(point);
        if (MODE === 'mouse') await glideTo(x, y);
        await pause(HOVER_S);
        await input(MODE === 'touch' ? 'tap' : 'click', String(x), String(y));
      }
      const selected = await evaluate(`document.querySelectorAll('[aria-label^="Deselect "]').length`);
      if (selected !== ids.length) throw new Error(`${selected} cards are selected, not ${ids.length}`);
      await pause(SELECT_PAUSE_S);
      return drag(ids[0], targetName);
    };
    const openHand = async () => {
      if (await evaluate(`!!document.querySelector('[data-testid="hand-arc"]')`)) return;
      await press(`[data-testid="hand-closed-fan"]`);
      await waitFor(`!!document.querySelector('[data-testid="hand-arc"]')`);
      await sleep(500);
    };
    // Escape closes the open hand. Its backdrop would take the next tap and only close it.
    const closeHand = async () => {
      if (!(await evaluate(`!!document.querySelector('[data-testid="hand-arc"]')`))) return;
      await page('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await page('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await sleep(500);
    };

    // 2. The opening hand: 7 draws, before the first turn.
    console.log('draw the opening hand');
    for (let i = 0; i < OPENING_HAND; i++) await draw();
    await sleep(800);

    // 3. The turns. Each turn has COUNTERS: a draw costs 1, a personnel or a ship its cost. While
    //    the cards that the table still needs cost less than the counters left, draw. Then play the
    //    ship, if none is in play, and the cheapest personnel that fit, all in one drag, at the
    //    headquarters. At the end of the turn a hand of more than MAX_HAND discards the rest.
    let s = await state();
    const done = () => s.ship && s.personnel >= PERSONNEL;
    for (let turn = 1; !done(); turn++) {
      if (turn > MAX_TURNS) throw new Error(`no ship and ${PERSONNEL} personnel after ${MAX_TURNS} turns`);
      let counters = COUNTERS;
      console.log(`turn ${turn}`);
      while (counters > 0 && !done()) {
        const ships = s.ship ? [] : s.hand.filter((c) => c.type === 'Ship');
        const personnel = s.personnel >= PERSONNEL ? [] : s.hand.filter((c) => c.type === 'Personnel');
        const needed = [...ships, ...personnel].reduce((sum, c) => sum + c.cost, 0);
        const ship = ships.filter((c) => c.cost <= counters).sort((a, b) => a.cost - b.cost)[0];
        if (needed < counters || (!ship && !personnel.some((c) => c.cost <= counters))) {
          console.log(`  draw (${counters} counters)`);
          await draw();
          counters -= 1;
        } else if (ship) {
          console.log(`  play the ship ${ship.id} (cost ${ship.cost})`);
          await openHand();
          if ((await drag(ship.id, `ship-row-${HEADQUARTERS}`)) !== `crew-${ship.id}`) throw new Error('the ship did not reach the headquarters');
          counters -= ship.cost;
        } else {
          const group = [];
          let cost = 0;
          for (const c of [...personnel].sort((a, b) => a.cost - b.cost)) {
            if (cost + c.cost > counters || s.personnel + group.length >= PERSONNEL) break;
            group.push(c.id);
            cost += c.cost;
          }
          console.log(`  play ${group.join(', ')} (cost ${cost}) at the headquarters`);
          await openHand();
          await playGroup(group, `mission-on-${HEADQUARTERS}`);
          counters -= cost;
        }
        await sleep(500);
        s = await state();
      }
      if (done()) break;
      if (s.hand.length > MAX_HAND) {
        // Discard the cards the table needs least: other types first, then a second ship, then the
        // most expensive personnel.
        const rank = (c) => (c.type === 'Personnel' ? 2 : c.type === 'Ship' && !s.ship ? 3 : c.type === 'Ship' ? 1 : 0);
        const order = [...s.hand].sort((a, b) => rank(a) - rank(b) || b.cost - a.cost);
        const extra = order.slice(0, s.hand.length - MAX_HAND).map((c) => c.id);
        console.log(`  discard ${extra.join(', ')}`);
        await openHand();
        // The discard pile shows no badge, so `practice_drag.sh` cannot name it: read the hand.
        await playGroup(extra, 'discard');
        s = await state();
        if (s.hand.length > MAX_HAND) throw new Error(`the hand still holds ${s.hand.length} cards after the discard`);
      }
      await closeHand();
      await press(`[data-testid="turn-counter"]`);
      await sleep(1000);
    }
    await sleep(800);

    // 4. The personnel that wait at the headquarters board the ship: open the away team panel,
    //    select them, and drag them aboard in one drag.
    const ship = s.ship;
    if (s.waiting.length > 0) {
      console.log(`board ${s.waiting.length} personnel from the headquarters`);
      await closeHand();
      await press(`[data-zone="mission-on-${HEADQUARTERS}"]`);
      await waitFor(`!!document.querySelector('[data-testid="card-list-panel-awayTeam"]')`);
      await pause(1);
      await playGroup(s.waiting, `crew-${ship}`);
      await sleep(800);
      s = await state();
      if (s.waiting.length > 0) throw new Error(`${s.waiting.length} personnel did not board`);
    }

    // 5. The ship to the mission.
    console.log('move the ship');
    await closeHand();
    await drag(ship, `ship-row-${TARGET_MISSION}`);
    const at = await evaluate(`JSON.parse(localStorage.getItem('practiceGame')).table.missions.findIndex((m) => m.ships.some((s) => s.id === '${ship}'))`);
    if (at !== TARGET_MISSION) throw new Error(`the ship is at mission ${at}`);
    await sleep(1000);

    // 6. The attempt: the crew panel, Attempt, Start, and the bot's choice.
    console.log('attempt');
    await press(`[data-card-id="${ship}"]`);
    await press(`[data-testid="attempt-button"]`, ATTEMPT_PAUSE_S);
    await press(`[data-testid="attempt-start"]`, ATTEMPT_PAUSE_S);
    await waitFor(`!!document.querySelector('[data-testid="attempt-layout"]') && !document.querySelector('[data-testid="attempt-dialog"]')`, 60000);
    await sleep(1500);
    const stack = await evaluate(`JSON.parse(localStorage.getItem('practiceGame')).table.dilemmaStack.length`);
    console.log(`  the bot chose ${stack} dilemmas`);
    if (stack === 0) throw new Error('the bot chose no dilemmas');

    // 7. The first dilemma.
    console.log('reveal');
    await press(`[aria-label="Reveal top dilemma"]`, ATTEMPT_PAUSE_S);
    await sleep(1000);
    // Move the pointer off the card, so the hover preview does not cover the table.
    if (MODE === 'mouse') await run('npx', ['agent-browser', 'mouse', 'move', '900', '650'], { allowFail: true });
    await pause(1);
  } finally {
    await page('Page.stopScreencast').catch(() => {});
    await evaluate('window.__recordMarker && window.__recordMarker()').catch(() => {});
    ws.close();
  }
  await Promise.all(writes);
  if (badFrame) throw new Error(`the screencast captured ${badFrame}, not ${WIDTH}x${HEIGHT}: part of the page would be off the video`);
  console.log(`frame clock - script clock: ${(frames[0].t - frames[0].received).toFixed(2)} s`);

  // Each gap is cut to MAX_GAP_S, plus the time of any pause inside it.
  const paused = (from, to) => holds.reduce((sum, [a, b]) => sum + Math.max(0, Math.min(b, to) - Math.max(a, from)), 0);
  const durations = frames.map((f, i) =>
    i + 1 < frames.length ? Math.min(frames[i + 1].t - f.t, MAX_GAP_S + paused(f.t, frames[i + 1].t)) : HOLD_END_S
  );
  durations[0] = Math.max(durations[0], LEAD_IN_S);
  const total = durations.reduce((a, b) => a + b, 0);
  const list = frames.map((f, i) => `file '${f.file}'\nduration ${durations[i].toFixed(4)}`).join('\n');
  const listFile = path.join(framesDir, 'list.txt');
  await writeFile(listFile, `${list}\nfile '${frames[frames.length - 1].file}'\n`);
  const filter = `scale=${WIDTH}:-2:flags=lanczos,fps=${FPS}`;
  const inputArgs = ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listFile];
  const base = path.join(OUT_DIR, `bot-attempt-${MODE}`);
  await run('ffmpeg', [...inputArgs, '-vf', filter, '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', `${base}.mp4`]);
  await rm(framesDir, { recursive: true, force: true });
  const { size } = await stat(`${base}.mp4`);
  console.log(`${base}.mp4  ${(size / 1024).toFixed(0)} KB, ${total.toFixed(1)} s, ${frames.length} frames`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
