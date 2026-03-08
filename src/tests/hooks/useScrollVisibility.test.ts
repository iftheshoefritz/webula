import { act, renderHook } from '@testing-library/react';
import { createRef } from 'react';
import useScrollVisibility from '../../hooks/useScrollVisibility';

// Helper to set window.scrollY (jsdom always returns 0 without this).
function setWindowScrollY(value: number) {
  Object.defineProperty(window, 'scrollY', { configurable: true, value });
}

describe('useScrollVisibility', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    // Reset scroll position to top before each test.
    setWindowScrollY(0);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('starts with isVisible = true', () => {
    const { result } = renderHook(() => useScrollVisibility());
    expect(result.current).toBe(true);
  });

  it('stays visible without any scrolling — there is no initial hide timer', () => {
    const { result } = renderHook(() => useScrollVisibility({ hideDelay: 1000 }));

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    // Should still be visible — no initial hide timer fires when at the top.
    expect(result.current).toBe(true);
  });

  it('sets isVisible = true when a scroll event fires on window', () => {
    setWindowScrollY(100);
    const { result } = renderHook(() => useScrollVisibility());

    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });

    expect(result.current).toBe(true);
  });

  it('sets isVisible = false after hideDelay ms of inactivity when scrolled down', () => {
    setWindowScrollY(100);
    const { result } = renderHook(() => useScrollVisibility({ hideDelay: 1000 }));

    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });

    expect(result.current).toBe(true);

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(result.current).toBe(false);
  });

  it('stays visible when scroll position is back at the top (scrollY = 0)', () => {
    const { result } = renderHook(() => useScrollVisibility({ hideDelay: 1000 }));

    // Scroll down, triggering a hide timer.
    setWindowScrollY(100);
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });

    // Scroll back to top — no new hide timer should be set.
    setWindowScrollY(0);
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });

    // Advance well past hideDelay — overlay should remain visible at the top.
    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(result.current).toBe(true);
  });

  it('resets the debounce timer on each scroll event when scrolled down', () => {
    setWindowScrollY(100);
    const { result } = renderHook(() => useScrollVisibility({ hideDelay: 1000 }));

    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });

    act(() => {
      jest.advanceTimersByTime(800);
    });

    // Second scroll before timer expires — should reset the countdown.
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });

    act(() => {
      jest.advanceTimersByTime(800);
    });

    // Only 800ms since last scroll, so still visible.
    expect(result.current).toBe(true);

    act(() => {
      jest.advanceTimersByTime(200);
    });

    // Now 1000ms since last scroll, should be hidden.
    expect(result.current).toBe(false);
  });

  it('uses a custom target element when provided', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const ref = createRef<HTMLElement>();
    (ref as React.MutableRefObject<HTMLElement>).current = div;
    Object.defineProperty(div, 'scrollTop', { configurable: true, value: 100 });

    const { result } = renderHook(() => useScrollVisibility({ target: ref, hideDelay: 500 }));

    expect(result.current).toBe(true);

    act(() => {
      div.dispatchEvent(new Event('scroll'));
    });

    expect(result.current).toBe(true);

    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(result.current).toBe(false);

    document.body.removeChild(div);
  });

  it('does not trigger on window when a custom target is used', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const ref = createRef<HTMLElement>();
    (ref as React.MutableRefObject<HTMLElement>).current = div;
    Object.defineProperty(div, 'scrollTop', { configurable: true, value: 100 });

    const { result } = renderHook(() => useScrollVisibility({ target: ref, hideDelay: 500 }));

    // Scroll the target element and let the hide timer fire.
    act(() => {
      div.dispatchEvent(new Event('scroll'));
    });
    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(result.current).toBe(false);

    // A window scroll should NOT re-show the bar when a custom target is set.
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });

    expect(result.current).toBe(false);

    document.body.removeChild(div);
  });

  it('resets isVisible to true when scrolling down after the hide timer has fired', () => {
    setWindowScrollY(100);
    const { result } = renderHook(() => useScrollVisibility({ hideDelay: 500 }));

    // Scroll down and let the timer expire.
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(result.current).toBe(false);

    // Scrolling again should bring it back.
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    expect(result.current).toBe(true);
  });

  it('does not start a hide timer while suspended, even when scrolled down', () => {
    setWindowScrollY(100);
    const { result } = renderHook(() => useScrollVisibility({ hideDelay: 1000, suspended: true }));

    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });

    // Well past the hideDelay — overlay should still be visible because suspended=true.
    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(result.current).toBe(true);
  });

  it('cancels a pending hide timer when suspended becomes true', () => {
    setWindowScrollY(100);
    const { result, rerender } = renderHook(
      ({ suspended }: { suspended: boolean }) => useScrollVisibility({ hideDelay: 1000, suspended }),
      { initialProps: { suspended: false } }
    );

    // Scroll down to start the hide timer.
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });

    // Advance partway through the timer.
    act(() => {
      jest.advanceTimersByTime(500);
    });

    // Opening the popover should cancel the pending timer.
    rerender({ suspended: true });

    // Advance well past the original timer — overlay should remain visible.
    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(result.current).toBe(true);
  });

  it('resumes the hide timer on next scroll after suspended becomes false', () => {
    setWindowScrollY(100);
    const { result, rerender } = renderHook(
      ({ suspended }: { suspended: boolean }) => useScrollVisibility({ hideDelay: 1000, suspended }),
      { initialProps: { suspended: true } }
    );

    // Scroll while suspended — no timer should be set.
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(result.current).toBe(true);

    // Close the popover — suspension lifted.
    rerender({ suspended: false });

    // Scroll again now that it's no longer suspended.
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });

    // Just before timer fires — still visible.
    act(() => {
      jest.advanceTimersByTime(999);
    });
    expect(result.current).toBe(true);

    // Timer fires — now hidden.
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current).toBe(false);
  });

  it('removes the event listener on unmount', () => {
    const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');

    const { unmount } = renderHook(() => useScrollVisibility());
    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('scroll', expect.any(Function));
    removeEventListenerSpy.mockRestore();
  });

  it('uses the provided hideDelay when scrolled down', () => {
    setWindowScrollY(100);
    const { result } = renderHook(() => useScrollVisibility({ hideDelay: 2000 }));

    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });

    // Just before the timer fires — still visible.
    act(() => {
      jest.advanceTimersByTime(1999);
    });
    expect(result.current).toBe(true);

    // Timer fires — now hidden.
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current).toBe(false);
  });
});
