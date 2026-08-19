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

        <p className="mb-4 text-text-secondary">
          This only works on desktop browsers — it isn&apos;t supported on iOS or other mobile devices.
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
            The bookmarklet runs on trekcc.org while you&apos;re signed in, so it can grab your deck the same way
            trekcc.org already lets you export it. For a single deck, it opens that deck in Webula for you to review
            and save. For several selected decks, it saves them straight to your Google Drive (signing you in first
            if needed) — re-importing the same deck later updates its existing file instead of creating a duplicate.
            Nothing is stored on trekcc.org, and Webula never sees your trekcc.org login.
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
