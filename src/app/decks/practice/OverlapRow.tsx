'use client';

// One row of overlapping cards (#802), shared by the dilemma stack's panel (`CardListPanel.tsx`) and
// the open fan of the hand and of the dilemma hand (`CardHand.tsx`). It owns the layout only: it
// measures its own width, packs the cards into that width with `offsetFor` (`overlapOffset.ts`),
// and places each card by its own `left`, with a `zIndex` that rises left to right, so a later
// card's edge sits on top of the one before it. The card itself is the caller's: the stack draws
// the full card image with a per-card drop target, the fan draws the same image with no drop
// target of its own.
//
// jsdom reports 0 for every measurement and stubs `ResizeObserver` out, and a fan measures 0
// before its first layout, so a width of 0 falls back to a bound of `cardWidth x count`: the
// cards sit edge to edge.
//
// A caller may mark one place between two cards, or at an end of the row (#956): `markBoundary` is
// the index of the card whose left edge the mark sits on, or the card count for the right end.
// `renderMark` draws it, absolutely placed at that edge, above every card. It changes no card's
// `left`, so the row does not move under the pointer while the mark comes and goes.

import React, { useEffect, useRef, useState } from 'react';
import { offsetFor } from './overlapOffset';

export default function OverlapRow<T>({
  items,
  keyFor,
  cardWidth,
  height,
  maxOffset = cardWidth,
  centered = false,
  renderCard,
  markBoundary = null,
  renderMark,
}: {
  items: T[];
  keyFor: (item: T) => string;
  cardWidth: number;
  // The height of one card: the row takes that and no more.
  height: number;
  // The widest the gap between two card edges may grow. The default never spaces the cards
  // further apart than their own width.
  maxOffset?: number;
  // Centre the cards in the measured width (the fan) instead of starting them at its left edge
  // (the stack, whose end labels read left to right).
  centered?: boolean;
  renderCard: (item: T, idx: number) => React.ReactNode;
  markBoundary?: number | null;
  renderMark?: (left: number, zIndex: number) => React.ReactNode;
}) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [rowWidth, setRowWidth] = useState(0);
  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const measure = () => setRowWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const count = items.length;
  const maxWidth = rowWidth > 0 ? rowWidth : cardWidth * Math.max(count, 1);
  const offset = offsetFor(count, cardWidth, maxWidth, maxOffset);
  const contentWidth = count === 0 ? cardWidth : cardWidth + offset * (count - 1);
  const showMark = renderMark !== undefined && markBoundary !== null && markBoundary >= 0 && markBoundary <= count;
  const markLeft = markBoundary !== null && markBoundary >= count ? contentWidth : (markBoundary ?? 0) * offset;

  return (
    <div ref={rowRef} className="w-full" style={{ height }}>
      <div className={`relative ${centered ? 'mx-auto' : ''}`} style={{ width: contentWidth, height }}>
        {items.map((item, idx) => (
          <div key={keyFor(item)} className="absolute top-0" style={{ left: idx * offset, zIndex: idx + 1 }}>
            {renderCard(item, idx)}
          </div>
        ))}
        {showMark && renderMark(markLeft, count + 1)}
      </div>
    </div>
  );
}
