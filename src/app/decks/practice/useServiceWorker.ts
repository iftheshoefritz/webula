import { useEffect } from 'react';

// Registers the service worker of `src/app/sw.ts` (#1051), from the practice page only. The
// worker's scope is `/`, so it also serves the `_next/static` chunks of other routes from its
// precache, but only `/decks/practice` gets an offline fallback.
//
// `@serwist/next` sets `window.serwist` in a production build. Under `yarn dev` it builds no worker
// and leaves `window.serwist` unset, so nothing registers.
export function useServiceWorker() {
  useEffect(() => {
    if ('serviceWorker' in navigator && window.serwist !== undefined) {
      void window.serwist.register();
    }
  }, []);
}
