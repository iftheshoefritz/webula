import { rectIntersection, ClientRect, DroppableContainer } from '@dnd-kit/core';
import { collisionDetection } from '../../../app/decks/practice/collisionDetection';

// A ship's crew zone (34x26 px) sits nested inside its ship row, which sits inside a mission
// column. `rectIntersection`'s own ranking, by overlap ratio, favours whichever enclosing zone
// the dragged card overlaps more of in absolute terms, which is usually the bigger one — the
// #645 bug: a personnel card aimed squarely at a ship still filed into the mission's personnel
// pile. `collisionDetection` re-ranks the same overlap set by area, smallest first, so the ship
// wins whenever the dragged card's rect touches it at all, not only when the pointer's exact
// coordinate falls inside its tiny rect.
const rect = (left: number, top: number, width: number, height: number): ClientRect => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
});

const droppableContainer = (id: string): DroppableContainer => ({ id } as DroppableContainer);

const argsFor = (
  collisionRect: ClientRect,
  rects: Record<string, ClientRect>
): Parameters<typeof collisionDetection>[0] => ({
  active: { id: 'dragged-card' } as never,
  collisionRect,
  droppableContainers: Object.keys(rects).map(droppableContainer),
  droppableRects: new Map(Object.entries(rects)) as never,
  pointerCoordinates: null,
});

describe('collisionDetection', () => {
  it('picks the smallest-area zone a dragged card overlaps, not the one with the greatest overlap ratio', () => {
    const rects = {
      'crew-ship-1': rect(100, 100, 34, 26), // nested inside the ship row
      'ship-row-0': rect(90, 90, 72, 46), // encloses the crew zone
    };
    // The dragged card's rect overlaps the ship row more (in absolute area) than it overlaps the
    // small crew zone nested inside it.
    const collisionRect = rect(70, 62, 56, 78);

    // Plain `rectIntersection` ranks the bigger ship row first: this is the bug (#645).
    const plain = rectIntersection(argsFor(collisionRect, rects));
    expect(plain[0].id).toBe('ship-row-0');

    // `collisionDetection` ranks the smaller, nested crew zone first instead.
    const result = collisionDetection(argsFor(collisionRect, rects));
    expect(result[0].id).toBe('crew-ship-1');
  });

  it('leaves a card that only overlaps the ship row (not any ship) routed to the ship row', () => {
    const rects = {
      'crew-ship-1': rect(100, 100, 34, 26),
      'ship-row-0': rect(90, 90, 72, 46),
    };
    // The dragged card's rect does not reach the ship's own footprint (100,100)-(134,126) at all.
    const collisionRect = rect(90, 90, 8, 8);

    const result = collisionDetection(argsFor(collisionRect, rects));
    expect(result[0].id).toBe('ship-row-0');
  });

  it('breaks a tie between equal-area zones by the greater overlap ratio', () => {
    const rects = {
      'dilemma-pile-top': rect(0, 0, 56, 40),
      'dilemma-pile-bottom': rect(0, 40, 56, 40),
    };
    // The dragged card sits mostly over the bottom half.
    const collisionRect = rect(0, 30, 56, 40);

    const result = collisionDetection(argsFor(collisionRect, rects));
    expect(result[0].id).toBe('dilemma-pile-bottom');
  });

  it('returns no collisions when the dragged card overlaps nothing', () => {
    const rects = { 'ship-row-0': rect(90, 90, 72, 46) };
    const collisionRect = rect(0, 0, 10, 10);

    const result = collisionDetection(argsFor(collisionRect, rects));
    expect(result).toHaveLength(0);
  });

  it('returns a single collision unchanged', () => {
    const rects = { 'ship-row-0': rect(90, 90, 72, 46) };
    const collisionRect = rect(90, 90, 72, 46);

    const result = collisionDetection(argsFor(collisionRect, rects));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('ship-row-0');
  });
});
