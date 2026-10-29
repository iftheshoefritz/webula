'use client';

// Spike for #1182, option C: a minimap and zoom. Both mission rows sit on one canvas, as on a real
// table: the opponent's row on the far side, mirrored, and the player's row on the near side. The
// canvas is larger than the space above the bottom row, so the player sees a part of it at a time:
//
// - The default view is the player's own row at its normal size (zoom 1), as today.
// - A pinch, Ctrl + the mouse wheel, or the − and + buttons zoom between "fit", where both rows
//   and all 10 locations show at once, and `MAX_ZOOM`, where one location fills much of the screen.
// - A drag on the bare table pans. A drag that starts on a card is still a card drag.
// - During a card drag, holding the card near an edge of the table pans that way, so a ship
//   dragged from the player's row toward the top edge slides the opponent's row into view, at any
//   zoom. The opponent strip above the table counts as the top edge. The bottom row below the table
//   has drop targets of its own, so it never pans.
// - The minimap, in the opponent strip, draws all 10 locations, coloured by who is there, and an
//   outline of the part on screen. A tap or a drag on it moves the view there. It is flatter than
//   the table (its own scale on each axis), so it fits the 20 px strip and covers no card.
//
// The canvas is a CSS transform, so every drop target keeps working at any zoom: dnd-kit measures
// with `getBoundingClientRect`, which includes the transform. The mission scale is measured from the
// viewport, not from the player's row, so a zoom never feeds back into the size of the cards.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDndContext, useDndMonitor } from '@dnd-kit/core';
import type { ReactNode } from 'react';
import { PRESENCE_STYLE } from './OpponentMissionRow';
import type { Presence } from './OpponentMissionRow';

const MAX_ZOOM = 2.5;
const ZOOM_STEP = 1.5;
const MINIMAP_WIDTH = 84; // px
const MINIMAP_HEIGHT = 20; // px, the opponent strip's height
// A gap between the two rows, the middle of the table.
const TABLE_MIDDLE = 12; // px
// Pan at the edge during a drag: the band along each edge of the table where a dragged card slides
// the canvas, and the speed at the edge itself, which falls to 0 at the inner side of the band.
const EDGE_ZONE = 40; // px
const EDGE_SPEED = 6; // px a frame

interface View {
  z: number;
  tx: number;
  ty: number;
}

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface Sizes {
  vw: number;
  vh: number;
  cw: number;
  ch: number;
  their: Box | null;
  your: Box | null;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

// Keeps the canvas on screen: a canvas narrower or shorter than the viewport centres on that axis,
// and a larger one never shows empty space past its edges.
function clampView(view: View, s: Sizes): View {
  const w = s.cw * view.z;
  const h = s.ch * view.z;
  return {
    z: view.z,
    tx: w <= s.vw ? (s.vw - w) / 2 : clamp(view.tx, s.vw - w, 0),
    ty: h <= s.vh ? (s.vh - h) / 2 : clamp(view.ty, s.vh - h, 0),
  };
}

export const fitZoom = (s: Sizes): number => Math.min(1, s.vh / s.ch, s.vw / s.cw);

// The default view: zoom 1, the bottom of the canvas, which is the player's own row.
const homeView = (s: Sizes): View => clampView({ z: 1, tx: 0, ty: s.vh - s.ch }, s);

function innerBox(wrapper: HTMLElement | null): Box | null {
  const inner = wrapper?.firstElementChild as HTMLElement | null;
  if (!wrapper || !inner) return null;
  // The wrapper is not positioned, so the inner element's offsets are already from the canvas.
  return {
    left: inner.offsetLeft,
    top: inner.offsetTop,
    width: inner.offsetWidth,
    height: inner.offsetHeight,
  };
}

export function ZoomTable({
  viewportRef,
  theirRow,
  yourRow,
  yourRowRef,
  theirCells,
  yourCells,
  controlsSlot,
}: {
  // The viewport, for `useMissionScale`.
  viewportRef: (element: HTMLDivElement | null) => void;
  theirRow: ReactNode;
  yourRow: ReactNode;
  // The player's row, the element `PracticeTable` calls `missionRows`.
  yourRowRef: (element: HTMLDivElement | null) => void;
  // Who is at each location, in the order each row draws its slots.
  theirCells: Presence[];
  yourCells: Presence[];
  // Where the minimap and the zoom buttons draw: a slot in the opponent strip.
  controlsSlot: HTMLElement | null;
}) {
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const theirRef = useRef<HTMLDivElement>(null);
  const yourRef = useRef<HTMLDivElement | null>(null);
  const [sizes, setSizes] = useState<Sizes | null>(null);
  // Null until the player zooms or pans: the home view, which follows a resize.
  const [view, setView] = useState<View | null>(null);
  const [gesturing, setGesturing] = useState(false);

  const setViewportEl = useCallback(
    (element: HTMLDivElement | null) => {
      setViewport(element);
      viewportRef(element);
    },
    [viewportRef],
  );
  const setYourRowEl = useCallback(
    (element: HTMLDivElement | null) => {
      yourRef.current = element;
      yourRowRef(element);
    },
    [yourRowRef],
  );

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!viewport || !canvas) return;
    const measure = () =>
      setSizes({
        vw: viewport.clientWidth,
        vh: viewport.clientHeight,
        cw: canvas.offsetWidth,
        ch: canvas.offsetHeight,
        their: innerBox(theirRef.current),
        your: innerBox(yourRef.current),
      });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [viewport]);

  const current: View | null = sizes ? clampView(view ?? homeView(sizes), sizes) : null;
  const minZoom = sizes ? fitZoom(sizes) : 1;

  // Zooms to `z` about a point of the viewport, so the table under that point stays under it.
  const zoomAt = useCallback(
    (z: number, px: number, py: number, from: View | null = current) => {
      if (!sizes || !from) return;
      const nz = clamp(z, fitZoom(sizes), MAX_ZOOM);
      const cx = (px - from.tx) / from.z;
      const cy = (py - from.ty) / from.z;
      setView(clampView({ z: nz, tx: px - cx * nz, ty: py - cy * nz }, sizes));
    },
    [sizes, current],
  );

  // Pinch and pan on the bare table, and Ctrl + wheel. Native listeners, so the wheel can call
  // `preventDefault` and a pinch never reaches the browser's own page zoom.
  const stateRef = useRef({ sizes, current, zoomAt });
  stateRef.current = { sizes, current, zoomAt };
  useEffect(() => {
    if (!viewport) return;
    const pointers = new Map<number, { x: number; y: number }>();
    let start: { view: View; dist: number; mid: { x: number; y: number }; pan: { x: number; y: number } } | null = null;
    const local = (e: PointerEvent) => {
      const rect = viewport.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const begin = () => {
      const view = stateRef.current.current;
      if (!view) return;
      const pts = Array.from(pointers.values());
      const mid =
        pts.length === 2 ? { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 } : pts[0];
      const dist = pts.length === 2 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0;
      start = { view, dist, mid, pan: mid };
    };
    const onDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      const onCard = target.closest('[data-card-id], button, [role="button"], [data-minimap]');
      // One finger on the bare table pans; a second finger anywhere makes it a pinch.
      if (onCard && pointers.size === 0) return;
      pointers.set(e.pointerId, local(e));
      if (pointers.size <= 2) {
        begin();
        setGesturing(true);
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId) || !start) return;
      pointers.set(e.pointerId, local(e));
      const { sizes, zoomAt } = stateRef.current;
      if (!sizes) return;
      const pts = Array.from(pointers.values());
      if (pts.length >= 2 && start.dist > 0) {
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        zoomAt(start.view.z * (dist / start.dist), start.mid.x, start.mid.y, start.view);
      } else if (pts.length === 1) {
        const dx = pts[0].x - start.pan.x;
        const dy = pts[0].y - start.pan.y;
        setView(clampView({ ...start.view, tx: start.view.tx + dx, ty: start.view.ty + dy }, sizes));
      }
    };
    const onUp = (e: PointerEvent) => {
      if (!pointers.delete(e.pointerId)) return;
      if (pointers.size > 0) begin();
      else {
        start = null;
        setGesturing(false);
      }
    };
    const onWheel = (e: WheelEvent) => {
      const { current, zoomAt, sizes } = stateRef.current;
      if (!current || !sizes) return;
      e.preventDefault();
      const rect = viewport.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        zoomAt(current.z * Math.exp(-e.deltaY * 0.01), e.clientX - rect.left, e.clientY - rect.top);
      } else {
        setView(clampView({ ...current, tx: current.tx - e.deltaX, ty: current.ty - e.deltaY }, sizes));
      }
    };
    viewport.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    viewport.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      viewport.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      viewport.removeEventListener('wheel', onWheel);
    };
  }, [viewport]);

  const mx = sizes ? MINIMAP_WIDTH / sizes.cw : 0;
  const my = sizes ? MINIMAP_HEIGHT / sizes.ch : 0;
  // Moves the view so a point of the minimap is at the centre of the screen. From the fit view it
  // zooms in to zoom 1 first, so a tap on a location of the overview goes to that location.
  const centreOnMinimap = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!sizes || !current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = (e.clientX - rect.left) / mx;
    const cy = (e.clientY - rect.top) / my;
    const z = current.z <= minZoom + 0.01 ? 1 : current.z;
    setView(clampView({ z, tx: sizes.vw / 2 - cx * z, ty: sizes.vh / 2 - cy * z }, sizes));
  };
  // The part of the canvas on screen, in canvas pixels, clipped to the canvas: a canvas smaller than
  // the viewport sits centred with space around it.
  const visible =
    sizes && current
      ? {
          x0: Math.max(0, -current.tx / current.z),
          y0: Math.max(0, -current.ty / current.z),
          x1: Math.min(sizes.cw, (sizes.vw - current.tx) / current.z),
          y1: Math.min(sizes.ch, (sizes.vh - current.ty) / current.z),
        }
      : { x0: 0, y0: 0, x1: 0, y1: 0 };
  // Pan at the edge during a card drag. dnd-kit reports the drag's movement, not the pointer, so the
  // pointer is the press point plus that movement.
  const { droppableContainers, measureDroppableContainers } = useDndContext();
  const dragPointer = useRef<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const endDrag = () => {
    dragPointer.current = null;
    setDragging(false);
  };
  useDndMonitor({
    onDragStart: () => setDragging(true),
    onDragMove: (event) => {
      const press = event.activatorEvent as PointerEvent | null;
      if (!press || typeof press.clientX !== 'number') return;
      dragPointer.current = { x: press.clientX + event.delta.x, y: press.clientY + event.delta.y };
    },
    onDragEnd: endDrag,
    onDragCancel: endDrag,
  });
  useEffect(() => {
    if (!dragging || !viewport) return;
    // The speed for a pointer `distance` px inside an edge, or past it.
    const push = (distance: number) =>
      distance < EDGE_ZONE ? EDGE_SPEED * (1 - Math.max(0, distance) / EDGE_ZONE) : 0;
    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const pointer = dragPointer.current;
      const { sizes, current } = stateRef.current;
      if (!pointer || !sizes || !current) return;
      const rect = viewport.getBoundingClientRect();
      if (pointer.y > rect.bottom) return;
      const vx = push(pointer.x - rect.left) - push(rect.right - pointer.x);
      const vy = push(pointer.y - rect.top) - push(rect.bottom - pointer.y);
      if (vx === 0 && vy === 0) return;
      const next = clampView({ ...current, tx: current.tx + vx, ty: current.ty + vy }, sizes);
      if (next.tx === current.tx && next.ty === current.ty) return;
      stateRef.current.current = next;
      setView(next);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [dragging, viewport]);
  // dnd-kit measures the drop targets when a drag starts and when a container scrolls, not when a
  // transform moves them, so each pan during a drag measures them again.
  const tx = current?.tx;
  const ty = current?.ty;
  const z = current?.z;
  useLayoutEffect(() => {
    if (!dragging) return;
    measureDroppableContainers(droppableContainers.getEnabled().map((container) => container.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a new pan or zoom is the trigger
  }, [dragging, tx, ty, z]);

  const zoomBy = (factor: number) => {
    if (!sizes || !current) return;
    zoomAt(current.z * factor, sizes.vw / 2, sizes.vh / 2);
  };

  return (
    <div
      ref={setViewportEl}
      data-testid="zoom-table"
      data-zoom={current ? current.z.toFixed(2) : undefined}
      className="relative flex-1 min-h-0 overflow-hidden touch-none"
    >
      <div
        ref={canvasRef}
        data-testid="zoom-canvas"
        className={`absolute left-0 top-0 w-full ${
          gesturing || dragging ? '' : 'motion-safe:transition-transform motion-safe:duration-200'
        }`}
        style={{
          transformOrigin: '0 0',
          transform: current ? `translate(${current.tx}px, ${current.ty}px) scale(${current.z})` : undefined,
          visibility: current ? undefined : 'hidden',
        }}
      >
        <div ref={theirRef}>{theirRow}</div>
        <div
          className="mx-8 border-t border-dashed border-white/20"
          style={{ marginTop: TABLE_MIDDLE, marginBottom: TABLE_MIDDLE }}
          aria-hidden="true"
        />
        <div ref={setYourRowEl}>{yourRow}</div>
      </div>

      {sizes &&
        current &&
        controlsSlot &&
        createPortal(
          <span className="flex items-center gap-1">
            <button
              type="button"
              data-testid="zoom-out"
              aria-label="Zoom out"
              disabled={current.z <= minZoom + 0.01}
              onClick={() => zoomBy(1 / ZOOM_STEP)}
              className="w-5 h-5 rounded-full bg-black/60 text-text-primary disabled:opacity-40"
            >
              −
            </button>
            <div
              data-minimap
              data-testid="minimap"
              role="img"
              aria-label="Minimap of the table: the opponent's missions on top, yours below"
              className="relative rounded-sm bg-black/70 ring-1 ring-white/30 cursor-pointer touch-none"
              style={{ width: MINIMAP_WIDTH, height: MINIMAP_HEIGHT }}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                centreOnMinimap(e);
              }}
              onPointerMove={(e) => {
                if (e.buttons > 0 || e.pointerType === 'touch') centreOnMinimap(e);
              }}
            >
              {(
                [
                  [sizes.their, theirCells],
                  [sizes.your, yourCells],
                ] as const
              ).map(([box, cells], row) =>
                box ? (
                  <div
                    key={row}
                    className="absolute flex gap-px"
                    style={{ left: box.left * mx, top: box.top * my, width: box.width * mx, height: Math.max(4, box.height * my * 0.6) }}
                  >
                    {cells.map((cell, i) => (
                      <span
                        key={i}
                        data-presence={cell}
                        className="block flex-1 rounded-[1px]"
                        style={{ background: PRESENCE_STYLE[cell] }}
                      />
                    ))}
                  </div>
                ) : null,
              )}
              <div
                data-testid="minimap-view"
                className="absolute border border-white pointer-events-none"
                style={{
                  left: visible.x0 * mx,
                  top: visible.y0 * my,
                  width: (visible.x1 - visible.x0) * mx,
                  height: (visible.y1 - visible.y0) * my,
                }}
              />
            </div>
            <button
              type="button"
              data-testid="zoom-in"
              aria-label="Zoom in"
              disabled={current.z >= MAX_ZOOM - 0.01}
              onClick={() => zoomBy(ZOOM_STEP)}
              className="w-5 h-5 rounded-full bg-black/60 text-text-primary disabled:opacity-40"
            >
              +
            </button>
            <button
              type="button"
              data-testid="zoom-home"
              aria-label="Back to your missions"
              onClick={() => setView(null)}
              className="h-5 px-1.5 rounded-full bg-sky-800 text-sky-50"
            >
              Mine
            </button>
          </span>,
          controlsSlot,
        )}
    </div>
  );
}
