'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getSession, signIn } from 'next-auth/react';
import Link from 'next/link';

type DeckPayload = { trekccDeckId: string | null; title: string; content: string };
type DeckResult = {
  trekccDeckId: string | null;
  title: string;
  status: 'created' | 'updated' | 'failed';
  error?: string;
};

const DRIVE_SCOPE = 'openid profile email https://www.googleapis.com/auth/drive.appdata';

export default function BulkImportClient() {
  const searchParams = useSearchParams();
  const shareId = searchParams.get('share');
  const callbackUrl = shareId ? `/import-trekcc/bulk?share=${shareId}` : '/import-trekcc/bulk';

  const [decks, setDecks] = useState<DeckPayload[] | null>(null);
  const [status, setStatus] = useState<'loading' | 'needs-signin' | 'saving' | 'done' | 'error'>('loading');
  const [results, setResults] = useState<DeckResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const saveDecks = async (decksToSave: DeckPayload[]) => {
    setStatus('saving');
    try {
      const res = await fetch('/api/drive/bulk', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decks: decksToSave }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json?.error === 'drive_scope_missing') {
          setStatus('needs-signin');
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

  useEffect(() => {
    if (!shareId) {
      setStatus('error');
      setError('Missing import batch — try the bookmarklet again.');
      return;
    }
    (async () => {
      try {
        const pasteResponse = await fetch(`/api/share?id=${shareId}`);
        if (!pasteResponse.ok) throw new Error('Could not load your imported decks');
        const { content } = await pasteResponse.json();
        const parsedDecks: DeckPayload[] = JSON.parse(content);
        setDecks(parsedDecks);

        const session = (await getSession()) as { expires: string } | null;
        const isSessionExpired = session && new Date() > new Date(session.expires);
        if (!session || isSessionExpired) {
          setStatus('needs-signin');
          return;
        }
        await saveDecks(parsedDecks);
      } catch (err: any) {
        setStatus('error');
        setError(err?.message || 'Failed to load your imported decks');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareId]);

  const handleSignIn = () => {
    signIn('google', { callbackUrl }, { scope: DRIVE_SCOPE, include_granted_scopes: 'true' });
  };

  return (
    <div className="min-h-screen bg-gradient-page font-body text-text-primary">
      <div className="max-w-2xl mx-auto px-4 py-12 text-sm">
        <h1 className="text-2xl font-bold mb-6 text-white">Import decks from TrekCC</h1>

        {status === 'loading' && <p>Loading your decks…</p>}

        {status === 'needs-signin' && decks && (
          <div>
            <p className="mb-4">
              Sign in with Google to save {decks.length} deck{decks.length === 1 ? '' : 's'} to your Webula Google
              Drive.
            </p>
            <button
              onClick={handleSignIn}
              className="px-4 py-2 rounded bg-accent/20 border border-accent/40 text-accent font-semibold"
            >
              Sign in with Google
            </button>
          </div>
        )}

        {status === 'saving' && decks && <p>Saving {decks.length} decks to Google Drive…</p>}

        {status === 'error' && <p className="text-red-400">{error}</p>}

        {status === 'done' && (
          <div>
            <p className="mb-4 font-semibold text-white">Import complete:</p>
            <ul className="space-y-2 mb-6">
              {results.map((r, i) => (
                <li key={i} className="flex justify-between border-b border-gray-700 pb-1">
                  <span>{r.title}</span>
                  <span
                    className={
                      r.status === 'failed'
                        ? 'text-red-400'
                        : r.status === 'updated'
                        ? 'text-blue-400'
                        : 'text-green-400'
                    }
                  >
                    {r.status}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-10 border-t border-gray-700 pt-6">
          <Link href="/decks" className="text-blue-400 underline">
            ← Go to deck builder
          </Link>
        </div>
      </div>
    </div>
  );
}
