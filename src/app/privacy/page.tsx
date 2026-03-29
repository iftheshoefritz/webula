import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy – Webula',
  description: 'Privacy policy for Webula, the Star Trek CCG deck builder.',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gradient-page font-body text-text-primary">
      <div className="max-w-3xl mx-auto px-4 py-12 text-sm">
        <h1 className="text-2xl font-bold mb-6 text-white">Privacy Policy</h1>
        <p className="mb-4 text-gray-400">Last updated: March 2026</p>

        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3 text-white">1. Who we are</h2>
          <p>
            Webula is a Star Trek CCG 2nd Edition deck-builder and card-search application. The data controller
            is the Webula project. For privacy questions, open an issue at the project&apos;s GitHub
            repository.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3 text-white">2. Data we collect</h2>

          <h3 className="font-semibold mt-4 mb-2 text-gray-100">2a. Anonymous analytics (PostHog — always on)</h3>
          <p>
            On every visit we collect cookieless, anonymous page-view counts via PostHog. This
            tracking uses <strong>no cookies</strong>, stores <strong>no persistent
            identifiers</strong>, and does <strong>not</strong> send your IP address to PostHog.
            Because no identifying information is collected, individual users cannot be tracked or
            re-identified across visits.
          </p>
          <p className="mt-2">
            <strong>Legal basis:</strong> Legitimate interest (GDPR Art. 6(1)(f)). No consent is
            required for purely aggregate, non-identifying analytics. PostHog&apos;s own cookieless
            mode is designed to be used without a consent gate under GDPR.
          </p>

          <h3 className="font-semibold mt-4 mb-2 text-gray-100">2b. Enhanced analytics (PostHog — with consent)</h3>
          <p>
            If you click &quot;Accept&quot; in the consent banner, PostHog is re-initialised with
            standard persistence (cookies / localStorage). This enables richer analytics such as
            navigation flows and session-level aggregates. PostHog assigns a pseudonymous device
            identifier stored in a browser cookie. No personally identifiable information is included
            in these events.
          </p>
          <p className="mt-2">
            <strong>Legal basis:</strong> Consent (GDPR Art. 6(1)(a)). You can withdraw consent at
            any time by clearing your browser&apos;s local storage or clicking &quot;Decline&quot; on
            a new visit.
          </p>

          <h3 className="font-semibold mt-4 mb-2 text-gray-100">2b. Google Sign-In and Drive</h3>
          <p>
            If you choose to sign in with Google, we request the following OAuth scopes:
          </p>
          <ul className="list-disc list-inside mt-2 space-y-1">
            <li><code>userinfo.profile</code> and <code>userinfo.email</code> — to identify your account.</li>
            <li><code>drive.appdata</code> — to save and load your decks in a hidden app-specific
              folder in your Google Drive. Only Webula can access this folder.</li>
          </ul>
          <p className="mt-2">
            Your Google access token and refresh token are stored in a server-side encrypted JWT
            session cookie and are never shared with third parties.
          </p>
          <p className="mt-2">
            <strong>Legal basis:</strong> Contract / legitimate interest (GDPR Art. 6(1)(b)/(f)).
            This data is processed solely to provide the Drive save/load feature you explicitly
            requested by signing in.
          </p>

          <h3 className="font-semibold mt-4 mb-2 text-gray-100">2c. Browser local storage</h3>
          <p>
            Deck data (current deck, saved decks, deck title) is stored in your browser&apos;s{' '}
            <code>localStorage</code> under the keys <code>browserDecks</code>,{' '}
            <code>currentDeck</code>, and <code>deckTitle</code>. This data never leaves your device
            and is not transmitted to any server.
          </p>
          <p className="mt-2">
            <strong>Legal basis:</strong> Strictly necessary for the functioning of the application.
            No consent is required.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3 text-white">3. Data retention</h2>
          <ul className="list-disc list-inside space-y-2">
            <li>
              <strong>Anonymous analytics:</strong> PostHog retains aggregate page-view data per their
              own retention policy. No per-user data is stored because no user identifiers are
              collected.{' '}
              <strong>Enhanced analytics (consent-based):</strong> Withdrawing consent stops future
              enhanced data collection but does not delete past events.
            </li>
            <li>
              <strong>Google Drive decks:</strong> Deck files remain in your Google Drive until you
              delete them through the app or revoke app access via your Google Account settings.
            </li>
            <li>
              <strong>Local storage:</strong> Data persists until you clear your browser storage or
              uninstall the browser.
            </li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3 text-white">4. Your rights</h2>
          <p>
            Under GDPR you have the right to access, rectify, erase, and port your data, and to
            object to or restrict processing. For Drive data, you can delete deck files directly in
            the app or revoke Webula&apos;s access at{' '}
            <a
              href="https://myaccount.google.com/permissions"
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-blue-400"
            >
              myaccount.google.com/permissions
            </a>
            . For analytics data, please contact us via the project&apos;s GitHub repository.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3 text-white">5. Third-party services</h2>
          <ul className="list-disc list-inside space-y-2">
            <li>
              <strong>PostHog</strong> — analytics platform. See their{' '}
              <a
                href="https://posthog.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-blue-400"
              >
                privacy policy
              </a>
              .
            </li>
            <li>
              <strong>Google</strong> — OAuth authentication and Drive storage. See{' '}
              <a
                href="https://policies.google.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-blue-400"
              >
                Google&apos;s privacy policy
              </a>
              .
            </li>
          </ul>
        </section>

        <div className="mt-10 border-t border-gray-700 pt-6">
          <Link href="/" className="text-blue-400 underline">
            ← Back to card search
          </Link>
        </div>
      </div>
    </div>
  );
}
