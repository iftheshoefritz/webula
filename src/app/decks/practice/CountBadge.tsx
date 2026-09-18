'use client';

// A small circular count badge (see the parent design in issue #130), shared by every table
// element that shows a count on its top-right corner: the draw pile, the discard pile, and a
// ship's crew count (#600). The caller positions it (each needs a `relative` ancestor of its
// own size) and skips rendering it entirely when there is nothing to count.
export default function CountBadge({ count }: { count: number }) {
  return (
    <span className="absolute -top-2 -right-2 bg-accent text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center shadow">
      {count}
    </span>
  );
}
