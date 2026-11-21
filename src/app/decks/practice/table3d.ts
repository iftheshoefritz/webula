// The 3D look of the practice table, after the board of a digital card game such as MTG Arena: the
// board of missions and ships leans away from the player in perspective on a playmat, the table is
// a lit surface of felt, every card on it sits a little above it with a shadow under it, and each
// pile is as thick as it is tall (`pileDepth.ts`). The table always draws so (#1822); only the
// attempt layout keeps its bottom row flat.
//
// The tilt is a transform of an element inside the mission row's measured box (`setMissionRows`) and
// one inside the bottom row's (`setBottomRow`), never of those boxes: `useShipRows` and
// `computeTableScale` read their rects, so the sizes of the table do not change with the tilt and
// cannot feed back into it. A transformed element keeps its
// layout box. dnd-kit measures each droppable with `getBoundingClientRect`, which gives the box
// around the projected card, and the browser hit-tests the tilted cards as drawn, so a tap and a
// drop land where the player sees the card.
import type { CSSProperties } from 'react';

// How far the table leans back, in degrees, and the distance of the eye, in px. It hinges at the
// bottom edge of the bottom row, the edge nearest the player, so the bottom row barely moves and the
// missions recede.
export const BOARD_TILT_DEG = 18;
export const BOARD_PERSPECTIVE = 1200;

// The board and the bottom row are two elements, since the hands inside the same column are
// `position: fixed` and a transformed ancestor would re-anchor them. Each takes the same tilt about
// the same hinge, a point on screen, the middle of the bottom row's bottom edge: two elements turned
// by the same transform about the same point lie in one plane, so the table is one surface, and a
// layout distance between them is the same distance in that plane. `layoutLeft`/`layoutTop` are the
// element's own layout position on screen, before its transform (`layoutPosition`).
export interface Point {
  x: number;
  y: number;
}

export const planeTiltStyle = (hinge: Point, layoutLeft: number, layoutTop: number): CSSProperties => ({
  transform: `perspective(${BOARD_PERSPECTIVE}px) rotateX(${BOARD_TILT_DEG}deg)`,
  transformOrigin: `${round(hinge.x - layoutLeft)}px ${round(hinge.y - layoutTop)}px`,
});

// An element's position on screen as laid out, which its own transform does not change: its
// offset from its offset parent, plus that parent's box. The practice table's offset parents
// (the game layer, a `relative` wrapper) take no transform.
export function layoutPosition(el: HTMLElement): Point {
  const parent = el.offsetParent as HTMLElement | null;
  const base = parent ? parent.getBoundingClientRect() : { left: 0, top: 0 };
  return { x: base.left + (parent?.clientLeft ?? 0) + el.offsetLeft, y: base.top + (parent?.clientTop ?? 0) + el.offsetTop };
}

const round = (n: number): number => Math.round(n * 100) / 100;

// The class of the game layer that draws the lit surface and the shadows of the cards
// (`globals.css`).
export const TABLE_3D_CLASS = 'table-3d';
