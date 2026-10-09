// #1068: when the toolbar shows or hides (the game layer resizes) at the end of the document's
// scroll, the hook moves the scroll position back from the end, so the next swipe can hide the
// toolbar again.
import { renderHook } from '@testing-library/react';
import { scrollRoomTarget, SCROLL_ROOM, useToolbarScrollRoom } from '../../../app/decks/practice/toolbarScrollRoom';

describe('scrollRoomTarget (#1068)', () => {
  it('moves back from the end when the document is at its maximum scroll', () => {
    expect(scrollRoomTarget(120, 120)).toBe(120 - SCROLL_ROOM);
  });

  it('leaves a scroll in the middle of the range alone', () => {
    expect(scrollRoomTarget(50, 120)).toBeNull();
  });

  it('does nothing when the document cannot scroll', () => {
    expect(scrollRoomTarget(0, 0)).toBeNull();
  });
});

describe('useToolbarScrollRoom (#1068)', () => {
  let resize: () => void;
  const originalResizeObserver = global.ResizeObserver;
  const scrollTo = jest.fn();

  beforeEach(() => {
    global.ResizeObserver = class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
    scrollTo.mockClear();
    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 520 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 400 });
  });

  afterEach(() => {
    global.ResizeObserver = originalResizeObserver;
  });

  const setScrollY = (y: number) => Object.defineProperty(window, 'scrollY', { configurable: true, value: y });

  it('scrolls back from the end on a resize at the maximum scroll', () => {
    renderHook(() => useToolbarScrollRoom(document.createElement('div')));
    setScrollY(120);
    resize();
    expect(scrollTo).toHaveBeenCalledWith({ top: 120 - SCROLL_ROOM, behavior: 'instant' });
  });

  it('makes no call on a resize in the middle of the range', () => {
    renderHook(() => useToolbarScrollRoom(document.createElement('div')));
    setScrollY(60);
    resize();
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
