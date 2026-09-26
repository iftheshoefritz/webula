'use client';

// One row of overlapping cards (#802), shared by the dilemma stack's panel (`PilePanel.tsx`) and
// the open fan of the hand and of the dilemma hand (`CardHand.tsx`). It owns the layout only: it
// measures its own width, packs the cards into that width with `offsetFor` (`overlapOffset.ts`),
// and places each card by its own `left`, with a `zIndex` that rises left to right, so a later
// card's edge sits on top of the one before it. The card itself is the caller's: the stack draws
// the cropped art with a per-card drop target, the fan draws the full card image.
//
// jsdom reports 0 for every measurement and stubs `ResizeObserver` out, and a fan measures 0
// before its first layout, so a width of 0 falls back to a bound of `cardWidth x count`: the
// cards sit edge to edge.

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

  return (
    <div ref={rowRef} className="w-full" style={{ height }}>
      <div className={`relative ${centered ? 'mx-auto' : ''}`} style={{ width: contentWidth, height }}>
        {items.map((item, idx) => (
          <div key={keyFor(item)} className="absolute top-0" style={{ left: idx * offset, zIndex: idx + 1 }}>
            {renderCard(item, idx)}
          </div>
        ))}
      </div>
    </div>
  );
}
