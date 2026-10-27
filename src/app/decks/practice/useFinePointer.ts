import { useMediaQuery } from '../../../hooks/useMediaQuery';

// Issue #946: a desktop is a device with a mouse or a touchpad, whatever the size of its screen.
// `(pointer: fine)` tells it apart from a phone or a tablet, where a finger is the pointer.
export const FINE_POINTER_QUERY = '(pointer: fine)';

// True while the primary pointer is fine. False on the server and through hydration, so the
// pre-rendered page draws the touch sizes, and a desktop takes its own sizes right after.
export function useFinePointer(): boolean {
  return useMediaQuery(FINE_POINTER_QUERY, false);
}
