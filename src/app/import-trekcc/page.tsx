import type { Metadata } from 'next';
import Link from 'next/link';
import BookmarkletLink from '../../components/BookmarkletLink';
import { bookmarkletHref, iosListDecksSource, iosImportDeckSource } from './bookmarklet';

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
          <h2 className="text-lg font-semibold mb-3 text-white">iOS: use a Shortcut instead</h2>
          <p className="mb-2">
            iOS Safari doesn&apos;t let you type or paste a bookmarklet directly into a new bookmark, and iOS
            Shortcuts tears down the page as soon as a &quot;Run JavaScript on Web Page&quot; script finishes, before
            the desktop bookmarklet&apos;s fetch requests can complete. So the Shortcut needs two separate
            JavaScript actions — one to list your decks, one to import the deck you pick — with native Shortcuts
            steps in between:
          </p>
          <ol className="list-decimal list-inside space-y-2">
            <li>Open the Shortcuts app and create a new Shortcut.</li>
            <li>
              Add a &quot;Run JavaScript on Web Page&quot; action and paste this as its JavaScript (tap the code box
              to select all, then copy):
              <pre className="mt-2 p-3 bg-bg-secondary border border-border rounded overflow-x-auto text-xs whitespace-pre-wrap break-all">
                {iosListDecksSource}
              </pre>
              This calls completion() immediately with a dictionary of your deck names and download links, so it
              runs before Shortcuts can tear the page down.
            </li>
            <li>
              Add a &quot;Get Dictionary Value&quot; action, set it to &quot;Get Keys&quot; from the previous
              action&apos;s result, then add a &quot;Choose from List&quot; action fed by those keys — this shows
              your deck names and lets you pick one.
            </li>
            <li>
              Add another &quot;Get Dictionary Value&quot; action. Set the dictionary back to the result of the
              first &quot;Run JavaScript on Web Page&quot; action, and set the key to the &quot;Chosen Item&quot;
              from the previous step — this looks up the download link for the deck you picked.
            </li>
            <li>
              Add a second &quot;Run JavaScript on Web Page&quot; action and paste this as its JavaScript:
              <pre className="mt-2 p-3 bg-bg-secondary border border-border rounded overflow-x-auto text-xs whitespace-pre-wrap break-all">
                {iosImportDeckSource}
              </pre>
              Then edit the pasted text: tap to place the cursor inside{' '}
              <code>&apos;PASTE DECK NAME HERE&apos;</code>, delete that placeholder, and use Shortcuts&apos;
              variable-insertion menu to insert the &quot;Chosen Item&quot; from the &quot;Choose from List&quot;
              step. Do the same for <code>&apos;PASTE DECK LINK HERE&apos;</code>, inserting the value from the
              &quot;Get Dictionary Value&quot; step in step 4 instead.
            </li>
            <li>
              Add an &quot;If&quot; action checking whether the second script&apos;s result starts with{' '}
              <code>error:</code>. In the &quot;Otherwise&quot; branch, add &quot;Open URLs&quot; with that result
              to open your imported deck in Webula. In the &quot;If&quot; branch, add &quot;Show Alert&quot; with
              that result so import failures are visible instead of silent.
            </li>
            <li>Name the Shortcut (e.g. &quot;Import from TrekCC&quot;) and enable it in the Safari share sheet.</li>
            <li>
              On your{' '}
              <a
                href="https://www.trekcc.org/decklists/?mode=list"
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-blue-400"
              >
                trekcc.org decks list
              </a>
              , tap the Share button and run the Shortcut.
            </li>
          </ol>
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
