'use client';

// Issue #1155: a layer that shows where the page takes each tap, to diagnose a tap that acts at a
// point other than under the finger. It draws a dot at the `clientX`/`clientY` of each
// `pointerdown`, names the element `document.elementFromPoint` returns there, and prints the
// numbers of the viewport that can offset a hit test from what is drawn.
//
// `?debugTaps=1` turns it on and `?debugTaps=0` turns it off. The choice is stored, so it lasts
// past a reload and a navigation that drops the parameter.

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

export const DEBUG_TAPS_KEY = 'practiceDebugTaps';
// How many of the latest taps keep their dot.
export const DEBUG_TAP_DOTS = 5;

// Off on the server and through hydration. The parameter is stored when React subscribes, outside
// render, and React reads the snapshot again after it subscribes, so the snapshot sees the write.
export function useDebugTaps(param: string | null): boolean {
  const subscribe = useCallback(
    () => {
      try {
        if (param === '1') localStorage.setItem(DEBUG_TAPS_KEY, '1');
        else if (param === '0') localStorage.removeItem(DEBUG_TAPS_KEY);
      } catch {
        // No storage: the snapshot falls back to the parameter.
      }
      return () => {};
    },
    [param]
  );
  const getSnapshot = useCallback(() => {
    try {
      return localStorage.getItem(DEBUG_TAPS_KEY) === '1';
    } catch {
      return param === '1';
    }
  }, [param]);
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

type Tap = { id: number; x: number; y: number; target: string };

function describe(element: Element | null): string {
  if (!element) return 'nothing';
  const named = element.closest('[data-testid], [data-zone], [data-card-id], [aria-label]');
  const el = named ?? element;
  const name =
    el.getAttribute('data-testid') ??
    el.getAttribute('data-zone') ??
    el.getAttribute('data-card-id') ??
    el.getAttribute('aria-label');
  return name ? `${el.tagName.toLowerCase()} ${name}` : el.tagName.toLowerCase();
}

function readViewport(standalone: boolean | null) {
  const viewport = window.visualViewport;
  return [
    `scrollY ${Math.round(window.scrollY)}`,
    `vv.offsetTop ${viewport ? Math.round(viewport.offsetTop) : '-'}`,
    `vv.height ${viewport ? Math.round(viewport.height) : '-'}`,
    `innerHeight ${window.innerHeight}`,
    `screen.height ${window.screen.height}`,
    `standalone ${standalone === null ? '?' : standalone}`,
  ].join(' · ');
}

export function TapDebugOverlay({ standalone }: { standalone: boolean | null }) {
  const [taps, setTaps] = useState<Tap[]>([]);
  const [numbers, setNumbers] = useState('');

  useEffect(() => {
    let nextId = 0;
    const update = () => setNumbers(readViewport(standalone));
    const onPointerDown = (event: PointerEvent) => {
      const tap = {
        id: nextId++,
        x: event.clientX,
        y: event.clientY,
        target: describe(document.elementFromPoint(event.clientX, event.clientY)),
      };
      setTaps((prev) => [...prev, tap].slice(-DEBUG_TAP_DOTS));
      update();
    };
    update();
    const viewport = window.visualViewport;
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
    };
  }, [standalone]);

  const last = taps[taps.length - 1];

  return (
    <div data-testid="tap-debug-overlay" className="pointer-events-none fixed inset-0 z-[1000]">
      {taps.map((tap) => (
        <div
          key={tap.id}
          data-testid="tap-debug-dot"
          className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500 ring-2 ring-white"
          style={{ left: tap.x, top: tap.y }}
        />
      ))}
      <div className="absolute left-1/2 top-1 -translate-x-1/2 rounded bg-black/80 px-2 py-1 font-mono text-[10px] leading-tight text-white">
        <div>{numbers}</div>
        {last && (
          <div>
            tap {Math.round(last.x)},{Math.round(last.y)} → {last.target}
          </div>
        )}
      </div>
    </div>
  );
}
