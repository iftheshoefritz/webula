import { Collision, CollisionDetection, rectIntersection } from '@dnd-kit/core';

// Picks, among every zone the dragged card's own rect overlaps, the one with the smallest area,
// not the one `rectIntersection` alone would rank first (the greatest overlap ratio). A ship's
// crew zone sits nested inside its ship row, itself inside a mission column, so it is always the
// smallest of the three whenever they all overlap the dragged card — and `rectIntersection`'s
// own ranking, by overlap ratio, instead favours whichever enclosing zone the dragged card
// happens to overlap more of in absolute terms, which is usually the bigger one (#645: a
// personnel card aimed squarely at a ship still filed into the mission's personnel pile, because
// the ship row or the mission had the greater overlap ratio). Ranking by area instead needs no
// pointer at all, so a drop still works when the pointer itself leaves every zone, as it can at
// the bottom row, which sits partly below the bottom edge of the viewport. Ties — the dilemma
// pile's two same-size halves (#607) — keep `rectIntersection`'s own tie-break, the greater
// overlap ratio.
//
// A separate module, not defined inline in `page.tsx`: Next.js only allows a page module to
// export the page's own default component and a small fixed set of named exports (`metadata`,
// `generateStaticParams`, and the like), so a plain named export here fails the production build
// even though it passes every Jest test (`yarn build`'s page-shape check runs only there).
const overlapRatio = (collision: Collision): number => (collision.data as { value?: number } | undefined)?.value ?? 0;

export const collisionDetection: CollisionDetection = (args) => {
  const intersections = rectIntersection(args);
  if (intersections.length <= 1) return intersections;
  const areaOf = (id: Collision['id']): number => {
    const rect = args.droppableRects.get(id);
    return rect ? rect.width * rect.height : Infinity;
  };
  return [...intersections].sort((a, b) => areaOf(a.id) - areaOf(b.id) || overlapRatio(b) - overlapRatio(a));
};
