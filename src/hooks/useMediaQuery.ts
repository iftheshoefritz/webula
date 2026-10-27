import { useCallback, useSyncExternalStore } from 'react';

/**
 * Whether the media query `query` matches, kept up to date by its `change` event (#1308). The server
 * render and the hydration render return `serverValue`, so the pre-rendered page and the first client
 * render agree, and the client value follows right after. A browser with no `matchMedia` counts as
 * no match, and a `MediaQueryList` with no `addEventListener` is read on each render only.
 */
export function useMediaQuery<S extends boolean | null>(query: string, serverValue: S): boolean | S {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window.matchMedia !== 'function') return () => {};
      const mql = window.matchMedia(query);
      mql?.addEventListener?.('change', onChange);
      return () => mql?.removeEventListener?.('change', onChange);
    },
    [query]
  );
  const getSnapshot = () =>
    typeof window.matchMedia === 'function' && Boolean(window.matchMedia(query)?.matches);
  return useSyncExternalStore<boolean | S>(subscribe, getSnapshot, () => serverValue);
}

const subscribeNothing = () => () => {};

/**
 * False on the server and through hydration, true on the client after it: the guard for a portal into
 * `document.body`, which the server does not have.
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(subscribeNothing, () => true, () => false);
}
