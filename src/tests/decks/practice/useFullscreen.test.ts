import { act, renderHook } from '@testing-library/react';
import { useFullscreen } from '../../../app/decks/practice/useFullscreen';

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
  });

  it('puts the game layer into fullscreen, and takes it out again', () => {
    const { result } = renderHook(() => useFullscreen(layer));
    expect(result.current.enabled).toBe(true);
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
