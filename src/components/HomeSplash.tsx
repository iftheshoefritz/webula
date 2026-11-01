'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { FaSearch, FaLayerGroup, FaPlayCircle } from 'react-icons/fa';
import { readStartPage, startPageHref, writeStartPage, type StartPage } from '../lib/startPage';

const subscribeNothing = () => () => {};

// The splash of `/` (#1406): Search cards, Build a deck or Practice, with Remember my choice.
//
// It decides once, from the URL the page loaded with, so a search box cleared mid-session never
// brings it back. It shows on a bare `/` when nothing is remembered, and on `/?home=1` always. A
// load with `q`, every Discord and shared link, or with `search=1`, the Search cards links (#1438),
// never shows it and never redirects. A remembered
// `decks` or `practice` sends a bare `/` there with `router.replace`, so Back does not bounce.
//
// The server render has no splash: localStorage is read only after hydration, so the page and its
// metadata stay as they were. The splash is `z-50`, after the search bars in the DOM, and the
// consent banner, also `z-50` and later in the root layout, stays usable over it.
export default function HomeSplash({
  initialQuery,
  initialHome,
  initialSearch = false,
}: {
  initialQuery: string;
  initialHome: boolean;
  initialSearch?: boolean;
}) {
  const router = useRouter();
  const mounted = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const remembered = useMemo<StartPage | null>(() => (mounted ? readStartPage() : null), [mounted]);
  const [dismissed, setDismissed] = useState(false);
  const [remember, setRemember] = useState<boolean | null>(null);

  const searchRequested = initialSearch || !!initialQuery;
  const redirectTo = mounted && !searchRequested && !initialHome && remembered && remembered !== 'search' ? remembered : null;

  useEffect(() => {
    if (redirectTo) router.replace(startPageHref(redirectTo));
  }, [redirectTo, router]);

  const visible = mounted && !dismissed && (initialHome || (!searchRequested && remembered === null));
  if (!visible) return null;

  const rememberChecked = remember ?? remembered !== null;

  const choose = (page: StartPage) => {
    writeStartPage(rememberChecked ? page : null);
    if (page === 'search') setDismissed(true);
  };

  const choices: { page: StartPage; label: string; detail: string; icon: React.ReactNode }[] = [
    { page: 'search', label: 'Search cards', detail: 'Find any card in the database', icon: <FaSearch /> },
    { page: 'decks', label: 'Build a deck', detail: 'Missions, dilemmas and draw deck', icon: <FaLayerGroup /> },
    { page: 'practice', label: 'Practice', detail: 'Play a solo game on the table', icon: <FaPlayCircle /> },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="home-splash-title"
      data-testid="home-splash"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-y-auto bg-[#131713]/95 px-6 py-4"
    >
      <h1 id="home-splash-title" className="mb-3 font-display text-2xl text-text-primary">
        Webula
      </h1>
      <div className="grid w-full max-w-[18rem] grid-cols-1 gap-2 landscape:max-w-[40rem] landscape:grid-cols-3">
        {choices.map(({ page, label, detail, icon }) => (
          <Link
            key={page}
            href={startPageHref(page)}
            onClick={() => choose(page)}
            data-testid={`home-choice-${page}`}
            className="flex items-center gap-3 rounded-md border border-white/10 bg-bg-secondary px-4 py-2.5 text-text-secondary hover:bg-white/[0.1] hover:text-text-primary landscape:flex-col landscape:gap-1 landscape:py-4 landscape:text-center"
          >
            <span className="text-xl text-accent" aria-hidden="true">{icon}</span>
            <span className="flex flex-col">
              <span className="text-base text-text-primary">{label}</span>
              <span className="text-xs text-text-muted">{detail}</span>
              {remembered === page && (
                <span data-testid="home-remembered" className="text-xs text-accent">Your start page</span>
              )}
            </span>
          </Link>
        ))}
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm text-text-secondary">
        <input
          type="checkbox"
          data-testid="home-remember"
          checked={rememberChecked}
          onChange={(e) => setRemember(e.target.checked)}
          className="accent-accent"
        />
        Remember my choice
      </label>
      {remembered !== null && (
        <p className="mt-1 text-center text-xs text-text-muted">
          Turn this off and make a choice to forget your start page.
        </p>
      )}
    </div>
  );
}
