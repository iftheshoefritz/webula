import { Collision, CollisionDetection, pointerWithin, rectIntersection } from '@dnd-kit/core';

// Two stages, and the order between them is the whole point.
//
// Stage 1, `pointerWithin`: while the pointer sits inside a zone, that zone wins, and dnd-kit
// already ranks nested zones correctly here — a ship's crew zone lies wholly inside its ship row,
// so its corners are nearer the pointer and it outranks the row. This stage is what keeps a drop
// aimed at the ship row, but not at a ship, out of that ship's crew: the pointer is inside the
// row only, so the row wins even though the dragged card's much wider rect also covers the ship
// (#645's acceptance check: a personnel card dropped on the row, off any ship, files into the
// mission's personnel pile).
//
// Stage 2, area-ranked `rectIntersection`, runs only when the pointer is inside no zone at all.
// `rectIntersection` alone ranks by overlap ratio, which favours whichever enclosing zone the
// dragged card overlaps more of in absolute terms — usually the bigger one. That was the #645
// bug: in the small gaps between a mission's own zone, its ship row, and the bottom row that sits
// partly below the viewport's bottom edge, the pointer is inside nothing, and the mission or the
// ship row then outranked a ship the player was plainly aiming at. Ranking the same overlap set
// by area, smallest first, picks the most nested zone the card touches instead, and needs no
// pointer. Ties — the dilemma pile's two same-size halves (#607) — keep `rectIntersection`'s own
// tie-break, the greater overlap ratio.
//
// Ranking by area alone, with no `pointerWithin` stage, is not enough: a ship is only 34x26 px
// inside a 72x26 px row, so a dragged card's rect touches the ship almost anywhere in the row,
// and every such drop boarded the ship regardless of where the player aimed.
//
// A separate module, not defined inline in `page.tsx`: Next.js only allows a page module to
// export the page's own default component and a small fixed set of named exports (`metadata`,
// `generateStaticParams`, and the like), so a plain named export here fails the production build
// even though it passes every Jest test (`yarn build`'s page-shape check runs only there).
const overlapRatio = (collision: Collision): number => (collision.data as { value?: number } | undefined)?.value ?? 0;

export const collisionDetection: CollisionDetection = (args) => {
  const withinPointer = pointerWithin(args);
  if (withinPointer.length > 0) return withinPointer;
  const intersections = rectIntersection(args);
  if (intersections.length <= 1) return intersections;
  const areaOf = (id: Collision['id']): number => {
    const rect = args.droppableRects.get(id);
    return rect ? rect.width * rect.height : Infinity;
  };
  return [...intersections].sort((a, b) => areaOf(a.id) - areaOf(b.id) || overlapRatio(b) - overlapRatio(a));
};
