import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PlaytestAdminClient, { PlaytestAdminSignIn } from '../../../components/PlaytestAdminClient';
import { loadCards } from '../../../lib/loadCards';
import { pageCallerEmail } from '../../../lib/pageCallerEmail';
import { isPlaytestOwner } from '../../../lib/playtestAccess';
import { playtestAdminFixtureAllowed } from '../../../lib/playtestAdminFixture';
import PlaytestAdminFixture from './PlaytestAdminFixture';

export const metadata: Metadata = { title: 'Webula', robots: { index: false, follow: false } };

// The owner-only upload page of the playtest cards (#1613). The owners are the server-only
// `PLAYTEST_ADMIN_EMAILS`, so the server decides: a signed-out visitor gets a sign-in button, a
// signed-in visitor who is not an owner the 404 page, and an owner the page. The page reads the
// cookies, so it renders at request time and never at build time.
export default async function PlaytestAdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const realNames = () => loadCards().data.map((card) => card.originalName);
  if (playtestAdminFixtureAllowed() && (await searchParams).fixture === '1') {
    return <PlaytestAdminFixture realNames={realNames()} />;
  }
  const email = await pageCallerEmail();
  if (!email) return <PlaytestAdminSignIn />;
  if (!isPlaytestOwner(email)) notFound();
  return <PlaytestAdminClient realNames={realNames()} />;
}
