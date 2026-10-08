// Sends touch and mouse input to the agent-browser page through raw CDP (#1035).
// Run it through `scripts/cdp_input.sh`, which finds the browser's DevTools URL.
//
//   bash scripts/cdp_input.sh tap <x> <y> | <selector>
//   bash scripts/cdp_input.sh pan <selector> <dx> <dy>
//   bash scripts/cdp_input.sh touch-drag <x> <y> <tx> <ty>
//   bash scripts/cdp_input.sh touch-drag <x> <y> --to-eval '<js that returns "x y">'
//   bash scripts/cdp_input.sh click <x> <y> | <selector> [--mod shift,ctrl,meta,alt]
//   bash scripts/cdp_input.sh mouse-drag <x> <y> <tx> <ty> [--mod shift,ctrl,meta,alt]
//
// agent-browser 0.27.0 drives only a mouse, and `agent-browser keydown Shift` does not set
// `shiftKey` on the mouse events that follow. CDP does both:
//
// - `Input.dispatchMouseEvent` with `modifiers` (Alt=1, Ctrl=2, Meta=4, Shift=8) delivers pointer
//   and click events with the modifier flags set.
// - After `Emulation.setTouchEmulationEnabled`, `Input.dispatchTouchEvent` delivers pointer events
//   with `pointerType: "touch"`, and a tap ends in a `click`. A series of `touchMove`s over a
//   `touch-action: pan-y` element scrolls it, and the page sees `pointercancel`.
//   `Input.synthesizeScrollGesture` scrolls nothing in headless mode, so it is not used here.
//
// Emulation state belongs to the CDP session that set it, so each run enables touch emulation
// and sends all its events on one connection. Every call has a timeout: one run of `touchMove`s
// once hung with no reply.
//
// Each command prints what the page saw: the pointer events, their pointer type and modifier
// keys, and the element each one hit. `pan` prints the `scrollTop` and `scrollLeft` of the
// selector's element before and after.

const CALL_TIMEOUT_MS = 5000;
const STEP_PX = 8;
const STEP_WAIT_MS = 16;
// The first move of a drag. The `PointerSensor` in `page.tsx` needs 8 px before a drag starts,
// so a single large move does not start it (see the mid-drag section of AGENTS.md).
const FIRST_MOVE = { dx: 4, dy: -8 };

const MODIFIERS = { alt: 1, ctrl: 2, meta: 4, shift: 8 };

function fail(message) {
  console.error(message);
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error(`could not connect to ${url}`)), { once: true });
  });
  let nextId = 1;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(`${msg.error.message}`));
      else resolve(msg.result);
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
  return { ws, send };
}

async function attachToPage(send) {
  const { targetInfos } = await send('Target.getTargets');
  const pages = targetInfos.filter((t) => t.type === 'page' && !t.url.startsWith('devtools://'));
  if (pages.length === 0) fail('no page is open in agent-browser. Open one with `npx agent-browser open <url>`.');
  const page = pages.find((t) => t.attached) || pages[0];
  const { sessionId } = await send('Target.attachToTarget', { targetId: page.targetId, flatten: true });
  return sessionId;
}

// The recorder lists the pointer events and clicks the page sees, in capture phase, so a
// handler that stops propagation does not hide one. Each entry names the element hit by its
// nearest data-testid, data-zone, data-card-id or aria-label.
const RECORDER = `(() => {
  const name = (t) => {
    for (let a = t; a && a.nodeType === 1; a = a.parentElement) {
      for (const k of ['data-testid', 'data-zone', 'data-card-id', 'aria-label']) {
        const v = a.getAttribute(k);
        if (v && v !== 'practice-game-layer') return k + '=' + v;
      }
    }
    return t && t.tagName ? t.tagName.toLowerCase() : '?';
  };
  const old = window.__cdpInput;
  if (old) old.stop();
  const seen = [];
  const types = ['pointerdown', 'pointerup', 'pointercancel', 'click'];
  const on = (e) => {
    const mods = ['shift', 'ctrl', 'meta', 'alt'].filter((m) => e[m + 'Key']);
    seen.push([e.type, e.pointerType || '', ...mods, 'on ' + name(e.target)].filter(Boolean).join(' '));
  };
  types.forEach((t) => document.addEventListener(t, on, true));
  window.__cdpInput = { seen, stop: () => types.forEach((t) => document.removeEventListener(t, on, true)) };
  return 'ok';
})()`;

async function main() {
  const [url, command, ...rest] = process.argv.slice(2);
  if (!url || !command) fail('usage: bash scripts/cdp_input.sh <tap|pan|touch-drag|click|mouse-drag> ...');

  let modifiers = 0;
  let toEval = null;
  const args = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--mod') {
      for (const m of (rest[++i] || '').split(',').filter(Boolean)) {
        if (!(m in MODIFIERS)) fail(`unknown modifier "${m}". Use shift, ctrl, meta or alt.`);
        modifiers |= MODIFIERS[m];
      }
    } else if (rest[i] === '--to-eval') {
      toEval = rest[++i];
    } else {
      args.push(rest[i]);
    }
  }

  const { ws, send } = await connect(url);
  const sessionId = await attachToPage(send);
  const page = (method, params) => send(method, params, sessionId);
  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await page('Runtime.evaluate', { expression, returnByValue: true });
    if (exceptionDetails) fail(`page error: ${exceptionDetails.exception?.description || exceptionDetails.text}`);
    return result.value;
  };

  // A point is two numbers, or a selector whose centre is the point.
  const takePoint = async () => {
    if (args.length >= 2 && !isNaN(Number(args[0])) && !isNaN(Number(args[1]))) {
      const p = { x: Number(args.shift()), y: Number(args.shift()) };
      return p;
    }
    const selector = args.shift();
    if (!selector) fail(`${command} needs a point: <x> <y> or a selector.`);
    const p = await evaluate(
      `(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`
    );
    if (!p) fail(`no element matches ${selector}.`);
    return p;
  };

  const touch = (type, p) =>
    page('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x: p.x, y: p.y, id: 1 }],
      modifiers,
    });
  const mouse = (type, p, pressed) =>
    page('Input.dispatchMouseEvent', {
      type,
      x: p.x,
      y: p.y,
      modifiers,
      button: type === 'mouseMoved' && !pressed ? 'none' : 'left',
      buttons: pressed ? 1 : 0,
      clickCount: type === 'mouseMoved' ? 0 : 1,
      pointerType: 'mouse',
    });
  // Moves in steps of at most STEP_PX, so the page sees a path and not a jump.
  const glide = async (from, to, move) => {
    const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / STEP_PX));
    for (let i = 1; i <= steps; i++) {
      await move({ x: Math.round(from.x + ((to.x - from.x) * i) / steps), y: Math.round(from.y + ((to.y - from.y) * i) / steps) });
      await sleep(STEP_WAIT_MS);
    }
  };

  const isTouch = ['tap', 'pan', 'touch-drag'].includes(command);
  if (isTouch) await page('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await evaluate(RECORDER);

  const lines = [];
  if (command === 'tap') {
    const p = await takePoint();
    await touch('touchStart', p);
    await sleep(50);
    await touch('touchEnd', p);
    lines.push(`tap at ${p.x} ${p.y}`);
  } else if (command === 'pan') {
    const selector = args[0];
    const from = await takePoint();
    const dx = Number(args.shift() ?? 0);
    const dy = Number(args.shift() ?? 0);
    const scroll = `(() => { const e = document.querySelector(${JSON.stringify(selector)}); return e.scrollTop + ' ' + e.scrollLeft; })()`;
    const [top0, left0] = (await evaluate(scroll)).split(' ');
    const to = { x: from.x + dx, y: from.y + dy };
    await touch('touchStart', from);
    await glide(from, to, (p) => touch('touchMove', p));
    await touch('touchEnd', to);
    await sleep(300);
    const [top1, left1] = (await evaluate(scroll)).split(' ');
    lines.push(`pan ${from.x} ${from.y} -> ${to.x} ${to.y}`);
    lines.push(`scrollTop ${top0} -> ${top1}`);
    if (dx !== 0) lines.push(`scrollLeft ${left0} -> ${left1}`);
  } else if (command === 'touch-drag' || command === 'mouse-drag') {
    const from = await takePoint();
    const press = command === 'touch-drag' ? (p) => touch('touchStart', p) : (p) => mouse('mousePressed', p, true);
    const move = command === 'touch-drag' ? (p) => touch('touchMove', p) : (p) => mouse('mouseMoved', p, true);
    const release = command === 'touch-drag' ? (p) => touch('touchEnd', p) : (p) => mouse('mouseReleased', p, false);
    if (command === 'mouse-drag') await mouse('mouseMoved', from, false);
    await press(from);
    const first = { x: from.x + FIRST_MOVE.dx, y: from.y + FIRST_MOVE.dy };
    await move(first);
    await sleep(100);
    // The layout can reflow when the drag starts, so a target given as a script is read now.
    let to;
    if (toEval) {
      const answer = String(await evaluate(toEval));
      const m = /^(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)$/.exec(answer);
      if (!m) {
        // Release at the press point: a release there cancels the drag (#774).
        await release(from);
        console.log(answer);
        ws.close();
        process.exit(3);
      }
      to = { x: Number(m[1]), y: Number(m[2]) };
    } else {
      to = await takePoint();
    }
    await glide(first, to, move);
    // A second move at the same point. dnd-kit reads the last pointer event.
    await move(to);
    await sleep(50);
    await release(to);
    lines.push(`${command} ${from.x} ${from.y} -> ${to.x} ${to.y}`);
  } else if (command === 'click') {
    const p = await takePoint();
    await mouse('mouseMoved', p, false);
    await mouse('mousePressed', p, true);
    await mouse('mouseReleased', p, false);
    lines.push(`click at ${p.x} ${p.y}`);
  } else {
    fail(`unknown command "${command}". Use tap, pan, touch-drag, click or mouse-drag.`);
  }

  await sleep(200);
  const seen = await evaluate('(() => { const r = window.__cdpInput; if (!r) return []; r.stop(); return r.seen; })()');
  if (isTouch) await page('Emulation.setTouchEmulationEnabled', { enabled: false });
  for (const line of lines) console.log(line);
  console.log(seen.length ? `saw: ${seen.join('; ')}` : 'saw: no pointer event');
  ws.close();
  process.exit(0);
}

main().catch((error) => fail(error.message));
