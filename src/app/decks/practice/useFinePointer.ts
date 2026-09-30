import { useEffect, useState } from 'react';

// Issue #946: a desktop is a device with a mouse or a touchpad, whatever the size of its screen.
// `(pointer: fine)` tells it apart from a phone or a tablet, where a finger is the pointer.
export const FINE_POINTER_QUERY = '(pointer: fine)';

// True while the primary pointer is fine. False on the server and on the first render, so the
// pre-rendered page draws the touch sizes, and a desktop takes its own sizes after it mounts.
export function useFinePointer(): boolean {
  const [fine, setFine] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(FINE_POINTER_QUERY);
    setFine(Boolean(mql.matches));
    const handler = (e: MediaQueryListEvent) => setFine(e.matches);
    mql.addEventListener?.('change', handler);
    return () => mql.removeEventListener?.('change', handler);
  }, []);

  return fine;
}
