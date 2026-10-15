import { useCallback, useEffect, useRef, useState } from 'react';
import { reloadPage } from './reloadPage';
import { isBrowserOnline } from './useOnline';

// Registers the service worker of `src/app/sw.ts` (#1051), from the practice page only. The
// worker's scope is `/`, so it also serves the `_next/static` chunks of other routes from its
// precache, but only `/decks/practice` gets an offline fallback.
//
// `@serwist/next` sets `window.serwist` in a production build. Under `yarn dev` it builds no worker
// and leaves `window.serwist` unset, so nothing registers.
//
// A page that stays open, such as the Home Screen app on an iPhone that resumes the same page,
// makes no navigation, so the browser never checks for a new `sw.js` (#1104). Each time the page
// comes back to the foreground while online, it asks the registration to check. The new worker
// takes control at once (`skipWaiting`, `clientsClaim`), and the page then offers a reload: it
// never reloads on its own, since the table saves to localStorage (#976) and a reload the player
// chooses restores the game. A `controllerchange` on a page that had no controller is the first
// install, not an update, so it offers nothing.
export interface ServiceWorkerUpdate {
  // A new build has taken control of the page, and the player has not dismissed the prompt.
  updateReady: boolean;
  // The player tapped Reload, and the page has not gone yet (#1134). The new page may take a while
  // to come, so the prompt says the tap was taken, and a second tap does nothing.
  reloading: boolean;
  reload: () => void;
  dismiss: () => void;
}

export function useServiceWorker(): ServiceWorkerUpdate {
  const [updateReady, setUpdateReady] = useState(false);
  const [reloading, setReloading] = useState(false);
  const reloadingRef = useRef(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || window.serwist === undefined) return;
    const container = navigator.serviceWorker;
    void window.serwist.register();

    let hadController = container.controller != null;
    const handleControllerChange = () => {
      if (hadController && isBrowserOnline()) setUpdateReady(true);
      hadController = container.controller != null;
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible' || !isBrowserOnline()) return;
      container
        .getRegistration()
        .then((registration) => registration?.update())
        .catch(() => {});
    };
    container.addEventListener('controllerchange', handleControllerChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      container.removeEventListener('controllerchange', handleControllerChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // A later build fires its own `controllerchange`, so the prompt comes back only for that one.
  const dismiss = useCallback(() => setUpdateReady(false), []);

  // A ref, not the state, guards the second tap: two taps before the next render both see the old
  // state.
  const reload = useCallback(() => {
    if (reloadingRef.current) return;
    reloadingRef.current = true;
    setReloading(true);
    reloadPage();
  }, []);

  return { updateReady, reloading, reload, dismiss };
}
