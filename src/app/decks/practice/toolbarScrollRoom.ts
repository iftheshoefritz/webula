'use client';

// Issue #1068: mobile Safari hides its toolbar when the document scrolls down, and `page.tsx`'s
// `practice-scroll-spacer` gives the document 120 px of room to scroll. Once the player has
// scrolled the toolbar away, the document usually sits at its maximum scroll. When the toolbar
// comes back for any reason (a tap near the top edge of the screen), the scroll position stays at
// the end, so the next downward swipe has no room to move and the toolbar stays.
//
// `useToolbarScrollRoom` watches the game layer, the same `ResizeObserver` signal `useTableScale`
// (`tableScale.ts`) reads for a toolbar change. When the layer resizes and the document is at or
// near its maximum scroll, it moves the scroll position back from the end, without animation, so
// the next swipe can scroll and hide the toolbar again. It acts on the resize only, never on a
// `scroll` event, so it does not fight a scroll the player is making: the toolbar changes after the
// gesture ends.

import { useEffect } from 'react';

// How close to the maximum scroll counts as "at the end".
export const SCROLL_END_THRESHOLD = 20; // px
// How far back from the end the scroll position moves: half the spacer's 120 px of extra room.
export const SCROLL_ROOM = 60; // px

// The scroll position to move to, or null to leave it alone. Pure, so plain numbers can test it.
export function scrollRoomTarget(scrollY: number, maxScroll: number): number | null {
  if (maxScroll <= 0) return null;
  if (scrollY < maxScroll - SCROLL_END_THRESHOLD) return null;
  const target = Math.max(0, maxScroll - Math.min(SCROLL_ROOM, maxScroll / 2));
  return target < scrollY ? target : null;
}

export function useToolbarScrollRoom(gameLayer: HTMLElement | null): void {
  useEffect(() => {
    if (!gameLayer) return;
    const onResize = () => {
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      const target = scrollRoomTarget(window.scrollY, maxScroll);
      if (target !== null) window.scrollTo({ top: target, behavior: 'instant' });
    };
    const observer = new ResizeObserver(onResize);
    observer.observe(gameLayer);
    return () => observer.disconnect();
  }, [gameLayer]);
}
