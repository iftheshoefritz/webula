// A flag of the device (#1660): this browser once loaded playtest cards for a signed-in user. It is
// set when `PlaytestCardsProvider` gets a non-empty `sets`, and never cleared, a sign-out included,
// so a playtester who comes back signed out is told to sign in. A device that never loaded playtest
// cards has no flag and never sees the word "playtest".
export const PLAYTEST_DEVICE_KEY = 'playtest-device';

export function readPlaytestDevice(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(PLAYTEST_DEVICE_KEY) === '1';
  } catch {
    return false;
  }
}

export function markPlaytestDevice(): void {
  try {
    window.localStorage.setItem(PLAYTEST_DEVICE_KEY, '1');
  } catch {
    // A full or blocked storage leaves the flag off: the hint does not show.
  }
}

// The sign-in hint shows on a playtester's device while the session reads as signed out, and not
// offline, where a sign-in cannot work and the cached cards load anyway (#1615).
export const showPlaytestSignIn = (
  device: boolean,
  status: 'loading' | 'authenticated' | 'unauthenticated',
  online: boolean,
) => device && status === 'unauthenticated' && online;
