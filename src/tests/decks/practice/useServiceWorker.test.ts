import { renderHook } from '@testing-library/react';
import { useServiceWorker } from '../../../app/decks/practice/useServiceWorker';

// #1051: the practice page registers the service worker that `@serwist/next` sets up in a
// production build, and does nothing when there is none (`yarn dev`, or a browser with no
// service workers).
describe('useServiceWorker', () => {
  const nav = navigator as Navigator & { serviceWorker?: unknown };
  const hadServiceWorker = 'serviceWorker' in nav;

  beforeEach(() => {
    Object.defineProperty(nav, 'serviceWorker', { value: {}, configurable: true });
  });

  afterEach(() => {
    delete (window as Partial<Window>).serwist;
    if (!hadServiceWorker) delete nav.serviceWorker;
  });

  it('registers the worker once when the build set one up', () => {
    const register = jest.fn().mockResolvedValue(undefined);
    window.serwist = { register } as unknown as Window['serwist'];

    const { rerender } = renderHook(() => useServiceWorker());
    rerender();

    expect(register).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the build set up no worker', () => {
    expect(() => renderHook(() => useServiceWorker())).not.toThrow();
  });
});
