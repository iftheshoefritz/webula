const mockReloadPage = jest.fn();
jest.mock('../../../app/decks/practice/reloadPage', () => ({ reloadPage: () => mockReloadPage() }));

import { act, renderHook } from '@testing-library/react';
import { useServiceWorker } from '../../../app/decks/practice/useServiceWorker';

// A stand-in for `navigator.serviceWorker`: a `controller` the test sets, `controllerchange`
// listeners the test fires, and a registration whose `update` the test reads.
function mockContainer(controller: object | null) {
  const target = new EventTarget();
  const update = jest.fn().mockResolvedValue(undefined);
  const container = {
    controller,
    getRegistration: jest.fn().mockResolvedValue({ update }),
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    // A new worker takes control: `clientsClaim` sets the controller, then the event fires.
    takeControl() {
      container.controller = {};
      target.dispatchEvent(new Event('controllerchange'));
    },
  };
  return { container, update };
}

const setVisibility = (state: DocumentVisibilityState) => {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
};

const setOnline = (online: boolean) => {
  Object.defineProperty(navigator, 'onLine', { value: online, configurable: true });
};

// #1051: the practice page registers the service worker that `@serwist/next` sets up in a
// production build, and does nothing when there is none (`yarn dev`, or a browser with no
// service workers).
describe('useServiceWorker', () => {
  const nav = navigator as { serviceWorker?: unknown };
  const hadServiceWorker = 'serviceWorker' in nav;

  beforeEach(() => {
    Object.defineProperty(nav, 'serviceWorker', { value: {}, configurable: true });
  });

  afterEach(() => {
    delete (window as Partial<Window>).serwist;
    if (!hadServiceWorker) delete nav.serviceWorker;
    setOnline(true);
  });

  it('registers the worker once when the build set one up', () => {
    const register = jest.fn().mockResolvedValue(undefined);
    window.serwist = { register } as unknown as Window['serwist'];
    Object.defineProperty(nav, 'serviceWorker', { value: mockContainer(null).container, configurable: true });

    const { rerender } = renderHook(() => useServiceWorker());
    rerender();

    expect(register).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the build set up no worker', () => {
    expect(() => renderHook(() => useServiceWorker())).not.toThrow();
  });

  // #1104: a page that stays open checks for a new build when it comes back, and offers a reload
  // once the new build has taken control.
  describe('updates', () => {
    const setup = (controller: object | null) => {
      window.serwist = { register: jest.fn().mockResolvedValue(undefined) } as unknown as Window['serwist'];
      const mock = mockContainer(controller);
      Object.defineProperty(nav, 'serviceWorker', { value: mock.container, configurable: true });
      const hook = renderHook(() => useServiceWorker());
      return { ...mock, hook };
    };

    it('checks for an update when the page comes back while online', async () => {
      const { update } = setup({});
      setOnline(true);

      await act(async () => setVisibility('visible'));

      expect(update).toHaveBeenCalledTimes(1);
    });

    it('does not check when the page is hidden', async () => {
      const { update } = setup({});

      await act(async () => setVisibility('hidden'));

      expect(update).not.toHaveBeenCalled();
    });

    it('does not check offline', async () => {
      const { update } = setup({});
      setOnline(false);

      await act(async () => setVisibility('visible'));

      expect(update).not.toHaveBeenCalled();
    });

    it('offers a reload when a new worker replaces the controller', () => {
      const { container, hook } = setup({});
      expect(hook.result.current.updateReady).toBe(false);

      act(() => container.takeControl());

      expect(hook.result.current.updateReady).toBe(true);
    });

    it('offers nothing on the first install, when the page had no controller', () => {
      const { container, hook } = setup(null);

      act(() => container.takeControl());

      expect(hook.result.current.updateReady).toBe(false);
    });

    it('offers the next build after the first install', () => {
      const { container, hook } = setup(null);

      act(() => container.takeControl());
      act(() => container.takeControl());

      expect(hook.result.current.updateReady).toBe(true);
    });

    it('offers nothing offline', () => {
      const { container, hook } = setup({});
      setOnline(false);

      act(() => container.takeControl());

      expect(hook.result.current.updateReady).toBe(false);
    });

    it('hides the prompt on dismiss until the next build', () => {
      const { container, hook } = setup({});

      act(() => container.takeControl());
      act(() => hook.result.current.dismiss());
      expect(hook.result.current.updateReady).toBe(false);

      act(() => container.takeControl());
      expect(hook.result.current.updateReady).toBe(true);
    });

    // #1134: two taps before the next render both reach the same `reload`.
    it('reloads once however many times reload is called', () => {
      mockReloadPage.mockClear();
      const { container, hook } = setup({});

      act(() => container.takeControl());
      expect(hook.result.current.reloading).toBe(false);
      act(() => {
        const { reload } = hook.result.current;
        reload();
        reload();
      });

      expect(hook.result.current.reloading).toBe(true);
      expect(mockReloadPage).toHaveBeenCalledTimes(1);
    });
  });
});
