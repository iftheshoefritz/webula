'use client';
// The sign-in hint of a playtester's device (#1660), on the practice table's game menu splash and in
// the missing-cards warning of a deck load. A plain Google sign-in with no Drive scope, as
// `stats-sign-in`, that comes back to the same page: the saved game is restored from localStorage,
// and `PlaytestCardsProvider` fetches the cards for the new session.
import { useSyncExternalStore } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { FaSignInAlt } from 'react-icons/fa';
import { readPlaytestDevice, showPlaytestSignIn } from '../lib/playtestDevice';

const noSubscribe = () => () => {};
const browserOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false;

const usePlaytestDevice = () => useSyncExternalStore(noSubscribe, readPlaytestDevice, () => false);

// Only a playtester's device reads the session here, so the hint costs the others nothing.
export default function PlaytestSignInHint({ className = '' }: { className?: string }) {
  return usePlaytestDevice() ? <SignedOutHint className={className} /> : null;
}

function SignedOutHint({ className }: { className: string }) {
  const { status } = useSession();
  const online = useSyncExternalStore(noSubscribe, browserOnline, () => true);
  if (!showPlaytestSignIn(true, status, online)) return null;
  return (
    <div data-testid="playtest-sign-in" className={`flex flex-wrap items-center gap-2 ${className}`}>
      <span>You may need to sign in to see playtest cards</span>
      <button
        type="button"
        className="btn-primary inline-flex items-center"
        data-testid="playtest-sign-in-button"
        onClick={() => signIn('google', { callbackUrl: window.location.href })}
      >
        <FaSignInAlt className="inline mr-2" />
        Sign in with Google
      </button>
    </div>
  );
}
