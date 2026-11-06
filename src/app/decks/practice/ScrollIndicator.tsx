'use client';

import React, { RefObject, useEffect, useState } from 'react';

// #1544: the indicator that shows that a panel element scrolls, and which part of it is in view.
// The native scrollbar of a scrolling panel element is hidden (`scrollbar-hidden`, `globals.css`):
// iOS Safari draws it as an overlay that shows only while a finger moves, and a classic scrollbar
// takes width from the cards. The page draws its own thumb instead, on a faint track over the
// right edge of the scroller. It takes no width and no pointer events, so a press on the right
// edge still reaches a card or the empty grid, and a drag in the grid scrolls it as before.
//
// The indicator is not a child of the scroller, because an absolute child of a scrolling element
// scrolls with its content. It goes in a positioned box that holds the scroller and does not
// scroll, a box that lines up with the scroller's own.

// The gap between the track and the scroller's top, bottom and right edges.
export const SCROLL_INDICATOR_INSET = 3; // px
export const SCROLL_INDICATOR_WIDTH = 4; // px
// The shortest thumb, so a long list still gives a thumb the player can see.
export const SCROLL_INDICATOR_MIN_THUMB = 16; // px

export interface ScrollMetrics {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

export interface ScrollThumb {
  // The length of the track, the scroller's height less the inset at each end.
  track: number;
  // The thumb's length and its offset from the top of the track.
  length: number;
  offset: number;
}

// The thumb of a scroller with `metrics`, or null when its content fits. The length is the part of
// the track that the visible part is of the content, never below the minimum, and the offset puts
// the thumb at the top of the track at the top and at its bottom at the bottom.
export function scrollThumb(
  { scrollTop, scrollHeight, clientHeight }: ScrollMetrics,
  inset = SCROLL_INDICATOR_INSET,
  minLength = SCROLL_INDICATOR_MIN_THUMB
): ScrollThumb | null {
  if (scrollHeight <= clientHeight || clientHeight <= 0) return null;
  const track = Math.max(0, clientHeight - 2 * inset);
  const length = Math.min(track, Math.max(minLength, (track * clientHeight) / scrollHeight));
  const maxScroll = scrollHeight - clientHeight;
  const fraction = Math.min(1, Math.max(0, scrollTop / maxScroll));
  return { track, length, offset: fraction * (track - length) };
}

// The thumb over the right edge of the scroller `scrollerRef`, while `scrolls` (from
// `useScrollsVertically`). It reads the scroller on its `scroll` event, on a resize, and when
// `deps` change (the scroller keeps its capped height while its content grows). It holds its own
// state, so a scroll re-renders the thumb and not the cards.
export function ScrollIndicator({
  scrollerRef,
  scrolls,
  deps,
}: {
  scrollerRef: RefObject<HTMLElement | null>;
  scrolls: boolean;
  deps: unknown[];
}) {
  const [metrics, setMetrics] = useState<ScrollMetrics | null>(null);
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !scrolls) {
      setMetrics(null);
      return;
    }
    const measure = () =>
      setMetrics({ scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight });
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', measure);
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollerRef, scrolls, ...deps]);
  const thumb = scrolls && metrics ? scrollThumb(metrics) : null;
  if (!thumb) return null;
  // The scroller fills the positioned box, so its top is the box's top, and the scroller's border
  // is the only difference: the inset keeps the track inside it.
  return (
    <div
      data-testid="scroll-indicator"
      aria-hidden
      className="pointer-events-none absolute rounded-full bg-white/[0.08]"
      style={{
        top: SCROLL_INDICATOR_INSET,
        right: SCROLL_INDICATOR_INSET,
        width: SCROLL_INDICATOR_WIDTH,
        height: thumb.track,
      }}
    >
      <div
        data-testid="scroll-indicator-thumb"
        className="absolute left-0 right-0 rounded-full bg-white/50"
        style={{ top: thumb.offset, height: thumb.length }}
      />
    </div>
  );
}
