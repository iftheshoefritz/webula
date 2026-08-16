'use client';

import { useState } from 'react';
import { getSession, signIn } from 'next-auth/react';
import { TREKCC_IMPORT_FIXTURE } from '../lib/trekccImportFixture';

type DeckResult = {
  trekccDeckId: string | null;
  title: string;
  status: 'created' | 'updated' | 'failed';
  error?: string;
};

const DRIVE_SCOPE = 'openid profile email https://www.googleapis.com/auth/drive.appdata';

// Manual verification aid (not a hidden test-only endpoint): lets anyone signed in confirm
// the bulk-import-to-Drive path works, including that a second press updates the same
// three files instead of duplicating them, without needing a real trekcc.org decklist.
export default function TrekccFixtureImportButton() {
  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [results, setResults] = useState<DeckResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setStatus('saving');
    setError(null);
    try {
      const session = (await getSession()) as { expires: string; hasDriveScope?: boolean } | null;
      const isSessionExpired = session && new Date() > new Date(session.expires);
      if (!session || isSessionExpired || !session.hasDriveScope) {
        signIn('google', { callbackUrl: '/import-trekcc' }, { scope: DRIVE_SCOPE, include_granted_scopes: 'true' });
        return;
      }

      const res = await fetch('/api/drive/bulk', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decks: TREKCC_IMPORT_FIXTURE }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json?.error === 'drive_scope_missing') {
          signIn('google', { callbackUrl: '/import-trekcc' }, { scope: DRIVE_SCOPE, include_granted_scopes: 'true' });
          return;
        }
        throw new Error(json?.error || 'Import failed');
      }
      setResults(json.results || []);
      setStatus('done');
    } catch (err: any) {
      setStatus('error');
      setError(err?.message || 'Import failed');
    }
  };

  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold mb-3 text-white">Verify it works</h2>
      <p className="mb-3">
        Press this button to send {TREKCC_IMPORT_FIXTURE.length} sample decks straight to your Webula Google Drive.
        Press it again afterward — the same {TREKCC_IMPORT_FIXTURE.length} files should update in place instead of
        duplicating.
      </p>
      <button
        onClick={handleClick}
        disabled={status === 'saving'}
        className="px-4 py-2 rounded bg-accent/20 border border-accent/40 text-accent font-semibold disabled:opacity-50"
      >
        {status === 'saving' ? 'Importing…' : 'Import 3 test decks'}
      </button>
      {status === 'error' && <p className="mt-3 text-red-400">{error}</p>}
      {status === 'done' && (
        <ul className="mt-3 space-y-1">
          {results.map((r, i) => (
            <li key={i} className="flex justify-between border-b border-gray-700 pb-1">
              <span>
                {r.title}
                {r.status === 'failed' && r.error && (
                  <span className="block text-xs text-red-400">{r.error}</span>
                )}
              </span>
              <span
                className={
                  r.status === 'failed' ? 'text-red-400' : r.status === 'updated' ? 'text-blue-400' : 'text-green-400'
                }
              >
                {r.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
