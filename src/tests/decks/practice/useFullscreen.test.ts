import { act, renderHook } from '@testing-library/react';
import { runsOnIos, useFullscreen } from '../../../app/decks/practice/useFullscreen';

// jsdom has no Fullscreen API, so each test defines the parts it needs on `document` (#921).
const setDocument = (key: string, value: unknown) =>
  Object.defineProperty(document, key, { configurable: true, writable: true, value });

describe('useFullscreen (#921)', () => {
  let layer: HTMLDivElement;

  beforeEach(() => {
    layer = document.createElement('div');
    setDocument('fullscreenEnabled', true);
    setDocument('fullscreenElement', null);
    setDocument(
      'exitFullscreen',
      jest.fn(() => {
        setDocument('fullscreenElement', null);
        document.dispatchEvent(new Event('fullscreenchange'));
        return Promise.resolve();
      })
    );
    layer.requestFullscreen = jest.fn(() => {
      setDocument('fullscreenElement', layer);
      document.dispatchEvent(new Event('fullscreenchange'));
      return Promise.resolve();
    });
  });

  afterEach(() => {
    for (const key of ['fullscreenEnabled', 'fullscreenElement', 'exitFullscreen', 'webkitFullscreenEnabled']) {
      delete (document as unknown as Record<string, unknown>)[key];
    }
  });

  it('is not enabled when the browser has no Fullscreen API for an element', () => {
    setDocument('fullscreenEnabled', false);
    const { result } = renderHook(() => useFullscreen(layer));
    expect(result.current.enabled).toBe(false);
    expect(result.current.mode).toBe('homeScreen');
  });

  it('is not enabled when the element has no requestFullscreen (#1127)', () => {
    (layer as unknown as Record<string, unknown>).requestFullscreen = undefined;
    const { result } = renderHook(() => useFullscreen(layer));
    expect(result.current.enabled).toBe(false);
    expect(result.current.mode).toBe('homeScreen');
    expect(() => act(() => result.current.toggle())).not.toThrow();
  });

  it('hides the button in an installed app with no Fullscreen API (#1127)', () => {
    setDocument('fullscreenEnabled', false);
    const original = window.matchMedia;
    window.matchMedia = jest.fn((query: string) => ({ matches: query === '(display-mode: standalone)' })) as unknown as typeof window.matchMedia;
    try {
      const { result } = renderHook(() => useFullscreen(layer));
      expect(result.current.mode).toBe('none');
    } finally {
      window.matchMedia = original;
    }
  });

  it('reports a page in the fullscreen display mode as standalone (#1155)', () => {
    const original = window.matchMedia;
    window.matchMedia = jest.fn((query: string) => ({ matches: query === '(display-mode: fullscreen)' })) as unknown as typeof window.matchMedia;
    try {
      const { result } = renderHook(() => useFullscreen(layer));
      expect(result.current.standalone).toBe(true);
    } finally {
      window.matchMedia = original;
    }
  });

  it('shows no button before the element mounts (#1127)', () => {
    setDocument('fullscreenEnabled', false);
    const { result } = renderHook(() => useFullscreen(null));
    expect(result.current.mode).toBe('none');
  });

  it('puts the game layer into fullscreen, and takes it out again', () => {
    const { result } = renderHook(() => useFullscreen(layer));
    expect(result.current.enabled).toBe(true);
    expect(result.current.mode).toBe('fullscreen');
    expect(result.current.isFullscreen).toBe(false);

    act(() => result.current.toggle());
    expect(layer.requestFullscreen).toHaveBeenCalledTimes(1);
    expect(result.current.isFullscreen).toBe(true);

    act(() => result.current.toggle());
    expect(document.exitFullscreen).toHaveBeenCalledTimes(1);
    expect(result.current.isFullscreen).toBe(false);
  });

  it('follows a fullscreenchange it did not start, such as the Escape key', () => {
    const { result } = renderHook(() => useFullscreen(layer));
    act(() => result.current.toggle());
    expect(result.current.isFullscreen).toBe(true);

    act(() => {
      setDocument('fullscreenElement', null);
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    expect(result.current.isFullscreen).toBe(false);
  });

  it('falls back to the webkit names for Safari', () => {
    setDocument('fullscreenEnabled', undefined);
    setDocument('webkitFullscreenEnabled', true);
    const webkitRequest = jest.fn();
    (layer as unknown as Record<string, unknown>).requestFullscreen = undefined;
    (layer as unknown as Record<string, unknown>).webkitRequestFullscreen = webkitRequest;

    const { result } = renderHook(() => useFullscreen(layer));
    expect(result.current.enabled).toBe(true);
    act(() => result.current.toggle());
    expect(webkitRequest).toHaveBeenCalledTimes(1);
  });
});

describe('runsOnIos (#1207)', () => {
  const mac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

  it('is true on an iPad, and on a Mac with touch points, which is iPadOS Safari', () => {
    expect(runsOnIos('Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15')).toBe(true);
    expect(runsOnIos(mac, 5)).toBe(true);
  });

  it('is false on a Mac with no touch points, desktop Chrome and Android', () => {
    expect(runsOnIos(mac, 0)).toBe(false);
    expect(runsOnIos('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36')).toBe(false);
    expect(runsOnIos('Mozilla/5.0 (Linux; Android 14) Chrome/120.0 Mobile Safari/537.36', 5)).toBe(false);
  });
});
