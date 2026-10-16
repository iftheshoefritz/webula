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
  let resize: (() => void) | undefined;
  const originalResizeObserver = global.ResizeObserver;
  const scrollTo = jest.fn();

  beforeEach(() => {
    resize = undefined;
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
    renderHook(() => useToolbarScrollRoom(document.createElement('div'), false));
    setScrollY(120);
    resize?.();
    expect(scrollTo).toHaveBeenCalledWith({ top: 120 - SCROLL_ROOM, behavior: 'instant' });
  });

  it('makes no call on a resize in the middle of the range', () => {
    renderHook(() => useToolbarScrollRoom(document.createElement('div'), false));
    setScrollY(60);
    resize?.();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('makes no call while it does not know yet whether the page runs standalone', () => {
    renderHook(() => useToolbarScrollRoom(document.createElement('div'), null));
    setScrollY(120);
    resize?.();
    expect(scrollTo).not.toHaveBeenCalled();
  });
});

// #1155: in an app added to the home screen, a scrolled document takes a tap above the finger, so
// the hook keeps the document at scroll 0 and leaves the scroll room alone.
describe('useToolbarScrollRoom while standalone (#1155)', () => {
  const scrollTo = jest.fn();
  const originalResizeObserver = global.ResizeObserver;
  let observed = false;

  beforeEach(() => {
    observed = false;
    global.ResizeObserver = class {
      observe() {
        observed = true;
      }
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
    scrollTo.mockClear();
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
  });

  afterEach(() => {
    global.ResizeObserver = originalResizeObserver;
  });

  it('does not watch the game layer for the scroll room', () => {
    renderHook(() => useToolbarScrollRoom(document.createElement('div'), true));
    expect(observed).toBe(false);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('scrolls back to 0 on a resize, a scroll and an orientation change', () => {
    renderHook(() => useToolbarScrollRoom(document.createElement('div'), true));
    for (const type of ['resize', 'scroll', 'orientationchange']) {
      scrollTo.mockClear();
      Object.defineProperty(window, 'scrollY', { configurable: true, value: 40 });
      window.dispatchEvent(new Event(type));
      expect(scrollTo).toHaveBeenCalledWith(0, 0);
    }
  });

  it('makes no call when the document is already at 0', () => {
    renderHook(() => useToolbarScrollRoom(document.createElement('div'), true));
    window.dispatchEvent(new Event('resize'));
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('stops the root from scrolling, and gives it back on unmount', () => {
    const { unmount } = renderHook(() => useToolbarScrollRoom(document.createElement('div'), true));
    expect(document.documentElement.style.overflow).toBe('hidden');
    expect(document.documentElement.style.overscrollBehavior).toBe('none');
    unmount();
    expect(document.documentElement.style.overflow).toBe('');
    expect(document.documentElement.style.overscrollBehavior).toBe('');
  });
});
