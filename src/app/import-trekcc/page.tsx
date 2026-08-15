import type { Metadata } from 'next';
import Link from 'next/link';
import BookmarkletLink from '../../components/BookmarkletLink';
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
          <h2 className="text-lg font-semibold mb-3 text-white">Desktop: drag the bookmarklet</h2>
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
              Click the &quot;Import from TrekCC&quot; bookmarklet. If you have more than one deck, pick which one to
              import from the popup. Webula opens in a new tab with the deck already loaded.
            </li>
          </ol>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3 text-white">iOS: get a Shortcut from the author</h2>
          <p>
            iOS Safari doesn&apos;t support bookmarklets, and iOS Shortcuts tears down the page before the
            bookmarklet&apos;s fetch requests can finish, so importing on iPhone/iPad needs a separate, pre-built
            Shortcut rather than this bookmarklet. There&apos;s no self-serve setup for this yet — ask the app
            author for a Shortcut link to install.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3 text-white">How it works</h2>
          <p>
            The bookmarklet runs on trekcc.org itself, as you, so it can fetch your &quot;Download Deck to
            Lackey&quot; export using your existing trekcc.org session. It then sends that decklist to Webula&apos;s
            share endpoint and opens your deck at <code>webula.app/decks?share=…</code> — the same link format used
            by Webula&apos;s own &quot;Copy share link&quot; button. Nothing is stored on trekcc.org, and Webula never
            sees your trekcc.org login.
          </p>
        </section>

        <div className="mt-10 border-t border-gray-700 pt-6">
          <Link href="/decks" className="text-blue-400 underline">
            ← Back to deck builder
          </Link>
        </div>
      </div>
    </div>
  );
}
