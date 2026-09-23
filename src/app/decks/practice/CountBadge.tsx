'use client';

// A small circular count badge (see the parent design in issue #130), shared by every table
// element that shows a count on its top-right corner: the draw pile, the discard pile, and a
// ship's crew count (#600). The caller positions it (each needs a `relative` ancestor of its
// own size) and skips rendering it entirely when there is nothing to count.
//
// Issue #663: the closed hand (`CardHand.tsx`) stacks its cards with a rising `zIndex` (up to
// the hand's card count, which has no upper bound), and renders this badge after those cards.
// Without its own `z-index`, the badge's default stacking order loses to the last card once the
// hand holds more than one, so part of the badge sits behind the top card. A `z-index` far above
// any hand size keeps the badge above every card, in any caller's stacking context; the other
// three callers have no competing sibling `z-index`, so they render unchanged.
//
// Issue #716: that `z-index` also has to stay below the overlays that can sit on top of a badge's
// element: the card preview (`z-[200]` in `CardPreview.tsx`) and the pile panel
// (`z-[150]` in `PilePanel.tsx`). `z-[140]` is comfortably above any hand's card count and
// comfortably below both overlays.
export default function CountBadge({ count }: { count: number }) {
  return (
    <span className="absolute -top-2 -right-2 z-[140] bg-accent text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center shadow">
      {count}
    </span>
  );
}
