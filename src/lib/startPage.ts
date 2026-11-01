// The start page a visitor chose on the splash of `/` with Remember my choice on (#1406). A bare
// `/` sends a remembered `decks` or `practice` to its page, and a remembered `search` only skips
// the splash. `/?home=1` shows the splash whatever is remembered, and `/?search=1` opens the card
// search whatever is remembered, with no splash and no redirect (#1438).
export type StartPage = 'search' | 'decks' | 'practice';

export const START_PAGE_KEY = 'startPage';

// The URL of the splash of `/`, where a visitor changes or forgets the start page.
export const HOME_SPLASH_HREF = '/?home=1';

// The URL of the card search for every visitor: a bare `/` may redirect or show the splash.
export const SEARCH_HREF = '/?search=1';

const START_PAGES: readonly StartPage[] = ['search', 'decks', 'practice'];

function isStartPage(value: unknown): value is StartPage {
  return typeof value === 'string' && (START_PAGES as readonly string[]).includes(value);
}

// The remembered choice, or null when there is none, when the stored value is not a choice, or
// when localStorage cannot be read.
export function readStartPage(): StartPage | null {
  try {
    const value = localStorage.getItem(START_PAGE_KEY);
    return isStartPage(value) ? value : null;
  } catch {
    return null;
  }
}

// Stores `page`, or clears the remembered choice when `page` is null.
export function writeStartPage(page: StartPage | null): void {
  try {
    if (page) localStorage.setItem(START_PAGE_KEY, page);
    else localStorage.removeItem(START_PAGE_KEY);
  } catch {
    // A browser that blocks localStorage remembers nothing.
  }
}

// True when the practice table would deal nothing: no saved game and no current deck with cards.
// Practice then opens the table with the Load deck picker open (`?openPicker=true`, #980).
function hasPracticeDeck(): boolean {
  try {
    if (localStorage.getItem('practiceGame')) return true;
    const raw = localStorage.getItem('currentDeck');
    if (!raw) return false;
    const deck = JSON.parse(raw) as Record<string, unknown>;
    return deck !== null && typeof deck === 'object' && Object.keys(deck).length > 0;
  } catch {
    return false;
  }
}

export function practiceHref(): string {
  return hasPracticeDeck() ? '/decks/practice' : '/decks/practice?openPicker=true';
}

// The page a choice opens.
export function startPageHref(page: StartPage): string {
  if (page === 'decks') return '/decks';
  if (page === 'practice') return practiceHref();
  return '/';
}
