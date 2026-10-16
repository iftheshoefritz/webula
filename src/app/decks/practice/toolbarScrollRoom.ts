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
//
// Issue #1155: an app added to the home screen has no toolbar to hide, and iOS draws a `fixed`
// layer of a scrolled document in one place and hit-tests it in another, so a tap acts above the
// finger. While the page runs standalone, the hook does the opposite: `PracticeTable` renders no
// spacer, the root cannot scroll or overscroll, and any scroll that still happens (a rubber-band,
// a rotation) goes back to 0 at once.

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

// `standalone` is null until it is known, and the hook then does nothing.
export function useToolbarScrollRoom(gameLayer: HTMLElement | null, standalone: boolean | null): void {
  useEffect(() => {
    if (!gameLayer || standalone !== false) return;
    const onResize = () => {
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      const target = scrollRoomTarget(window.scrollY, maxScroll);
      if (target !== null) window.scrollTo({ top: target, behavior: 'instant' });
    };
    const observer = new ResizeObserver(onResize);
    observer.observe(gameLayer);
    return () => observer.disconnect();
  }, [gameLayer, standalone]);

  useEffect(() => {
    if (standalone !== true) return;
    const root = document.documentElement;
    const { overflow, overscrollBehavior } = root.style;
    root.style.overflow = 'hidden';
    root.style.overscrollBehavior = 'none';
    const pin = () => {
      if (window.scrollY !== 0 || window.scrollX !== 0) window.scrollTo(0, 0);
    };
    pin();
    const viewport = window.visualViewport;
    window.addEventListener('scroll', pin);
    window.addEventListener('resize', pin);
    window.addEventListener('orientationchange', pin);
    viewport?.addEventListener('resize', pin);
    viewport?.addEventListener('scroll', pin);
    return () => {
      root.style.overflow = overflow;
      root.style.overscrollBehavior = overscrollBehavior;
      window.removeEventListener('scroll', pin);
      window.removeEventListener('resize', pin);
      window.removeEventListener('orientationchange', pin);
      viewport?.removeEventListener('resize', pin);
      viewport?.removeEventListener('scroll', pin);
    };
  }, [standalone]);
}
