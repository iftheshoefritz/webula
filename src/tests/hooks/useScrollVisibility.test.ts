import { act, renderHook } from '@testing-library/react';
import { createRef } from 'react';
import useScrollVisibility from '../../hooks/useScrollVisibility';

describe('useScrollVisibility', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('starts with isVisible = true', () => {
    const { result } = renderHook(() => useScrollVisibility());
    expect(result.current).toBe(true);
  });

  it('sets isVisible = true when a scroll event fires on window', () => {
    const { result } = renderHook(() => useScrollVisibility());

    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });

    expect(result.current).toBe(true);
  });

  it('sets isVisible = false after hideDelay ms with no scrolling (initial hide)', () => {
    const { result } = renderHook(() => useScrollVisibility({ hideDelay: 1000 }));

    expect(result.current).toBe(true);

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(result.current).toBe(false);
  });

  it('sets isVisible = false after hideDelay ms of inactivity', () => {
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

  it('resets the debounce timer on each scroll event', () => {
    const { result } = renderHook(() => useScrollVisibility({ hideDelay: 1000 }));

    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });

    act(() => {
      jest.advanceTimersByTime(800);
    });

    // Second scroll before timer expires — should reset the countdown
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });

    act(() => {
      jest.advanceTimersByTime(800);
    });

    // Only 800ms since last scroll, so still visible
    expect(result.current).toBe(true);

    act(() => {
      jest.advanceTimersByTime(200);
    });

    // Now 1000ms since last scroll, should be hidden
    expect(result.current).toBe(false);
  });

  it('uses a custom target element when provided', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const ref = createRef<HTMLElement>();
    (ref as React.MutableRefObject<HTMLElement>).current = div;

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

    const { result } = renderHook(() => useScrollVisibility({ target: ref, hideDelay: 500 }));

    // Let the initial hide timer expire so isVisible becomes false.
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

  it('resets isVisible to true when scrolling after the hide timer has fired', () => {
    const { result } = renderHook(() => useScrollVisibility({ hideDelay: 500 }));

    // Let the initial hide timer expire
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(result.current).toBe(false);

    // Scrolling should bring it back
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    expect(result.current).toBe(true);
  });

  it('removes the event listener on unmount', () => {
    const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');

    const { unmount } = renderHook(() => useScrollVisibility());
    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('scroll', expect.any(Function));
    removeEventListenerSpy.mockRestore();
  });

  it('defaults hideDelay to 3000ms', () => {
    const { result } = renderHook(() => useScrollVisibility());

    // Starts visible; should still be visible just before the timer fires.
    act(() => {
      jest.advanceTimersByTime(2999);
    });

    expect(result.current).toBe(true);

    act(() => {
      jest.advanceTimersByTime(1);
    });

    expect(result.current).toBe(false);
  });
});
