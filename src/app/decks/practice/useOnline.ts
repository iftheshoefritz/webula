import { useSyncExternalStore } from 'react';

// Whether the browser is online (#1053, part 4 of #1047): `navigator.onLine`, kept up to date by
// the `online` and `offline` events. The server render, which has no `navigator`, counts as online.
const subscribe = (onChange: () => void) => {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
};

export const isBrowserOnline = (): boolean => typeof navigator === 'undefined' || navigator.onLine !== false;

export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, isBrowserOnline, () => true);
}
