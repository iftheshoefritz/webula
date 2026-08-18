import type { Metadata } from 'next';
import Link from 'next/link';
import BookmarkletLink from '../../components/BookmarkletLink';
import TrekccFixtureImportButton from '../../components/TrekccFixtureImportButton';
import { bookmarkletHref } from './bookmarklet';

export const metadata: Metadata = {
  title: 'Import from TrekCC – Webula',
  description: 'One-click bookmarklet to import your decks from trekcc.org into Webula.',
};

export default function ImportTrekccPage() {
  return (
    <div className="min-h-screen bg-gradient-page font-body text-text-primary">
      <div className="max-w-3xl mx-auto px-4 py-12 text-sm">
        <h1 className="text-2xl font-bold mb-6 text-white">Import from TrekCC</h1>

        <p className="mb-4">
          This bookmarklet lets you pull a deck straight from{' '}
          <a
            href="https://www.trekcc.org/decklists/?mode=list"
            target="_blank"
            rel="noopener noreferrer"
            className="underline text-blue-400"
          >
            your trekcc.org decks list
          </a>{' '}
          into Webula in one click, without manually downloading and re-uploading a file.
        </p>

        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3 text-white">Drag the bookmarklet</h2>
          <ol className="list-decimal list-inside space-y-2">
            <li>
              Drag this link to your browser&apos;s bookmarks bar:{' '}
              <BookmarkletLink
                href={bookmarkletHref}
                className="inline-block px-3 py-1 rounded bg-accent/20 border border-accent/40 text-accent font-semibold no-underline cursor-move"
              >
                Import from TrekCC
              </BookmarkletLink>
            </li>
            <li>
              Go to your{' '}
              <a
                href="https://www.trekcc.org/decklists/?mode=list"
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-blue-400"
              >
                trekcc.org decks list
              </a>{' '}
              while signed in.
            </li>
            <li>
              Click the &quot;Import from TrekCC&quot; bookmarklet. If you have more than one deck, select the ones
              you want (or &quot;Select all&quot;) from the popup and click &quot;Import selected&quot;. Webula opens
              in a new tab — with a single deck already loaded for you to review and save, or with several decks
              saved straight to your Google Drive.
            </li>
          </ol>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3 text-white">How it works</h2>
          <p>
            The bookmarklet runs on trekcc.org itself, as you, so it can fetch your &quot;Download Deck to
            Lackey&quot; export using your existing trekcc.org session. For a single deck, it sends that decklist to
            Webula&apos;s share endpoint and opens your deck at <code>webula.app/decks?share=…</code> — the same
            link format used by Webula&apos;s own &quot;Copy share link&quot; button — so you can review and save it
            yourself. For several selected decks, Webula opens a new tab that signs you in if needed and saves every
            deck straight to your Google Drive, re-importing the same trekCC deck later updates its existing file
            instead of creating a duplicate. Nothing is stored on trekcc.org, and Webula never sees your trekcc.org
            login.
          </p>
        </section>

        <TrekccFixtureImportButton />

        <div className="mt-10 border-t border-gray-700 pt-6">
          <Link href="/decks" className="text-blue-400 underline">
            ← Back to deck builder
          </Link>
        </div>
      </div>
    </div>
  );
}
