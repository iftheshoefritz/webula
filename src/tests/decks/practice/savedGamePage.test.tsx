// The practice game is saved to localStorage under `practiceGame` and restored on a reload (#976).
let mockSearchParamsValue = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  useSearchParams: () => mockSearchParamsValue,
}));

jest.mock('../../../hooks/useDataFetching', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('../../../app/decks/deckBuilderUtils', () => ({
  ...jest.requireActual('../../../app/decks/deckBuilderUtils'),
  deckFromTsv: jest.fn(),
  extractDrawDeck: jest.fn(),
  shuffleArray: jest.fn((arr) => arr),
}));

jest.mock('next-auth/react', () => ({
  getSession: jest.fn(),
  signIn: jest.fn(),
}));

jest.mock('posthog-js', () => ({ capture: jest.fn() }));

jest.mock('react-icons/fa', () => ({
  FaLayerGroup: () => null,
  FaMobileAlt: () => null,
  FaForward: () => null,
  FaTrash: () => null,
  FaFolder: () => null,
  FaFolderOpen: () => null,
  FaFolderPlus: () => null,
  FaSignInAlt: () => null,
  FaEdit: () => null,
  FaCheck: () => null,
  FaTimes: () => null,
  FaArrowLeft: () => null,
  FaExchangeAlt: () => null,
}));

jest.mock('next/link', () => {
  return function MockLink({ children, href }: { children: React.ReactNode; href: string }) {
    return <a href={href}>{children}</a>;
  };
});

import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { getSession, signIn } from 'next-auth/react';
import PracticeDrawPage from '../../../app/decks/practice/PracticeTable';
import useDataFetching from '../../../hooks/useDataFetching';
import { deckFromTsv, extractDrawDeck } from '../../../app/decks/deckBuilderUtils';
import { PRACTICE_DECK_TSV } from '../../../lib/practiceDeck';

const makeCards = (n: number, prefix: string) =>
  Array.from({ length: n }, (_, i) => ({
    collectorsinfo: `${prefix}${String(i + 1).padStart(3, '0')}`,
    originalName: `Card ${prefix}${i + 1}`,
    type: 'equipment',
    name: `card ${prefix}${i + 1}`,
    imagefile: `card_${prefix}${i + 1}`,
    pile: 'drawDeck',
    count: 1,
  }));

const deckOf = (cards: ReturnType<typeof makeCards>) =>
  Object.fromEntries(cards.map((c) => [c.collectorsinfo, { count: 1, row: c }]));

// The builder's deck deals 3 cards to the draw deck (10 - a 7 card hand); the Drive deck deals 13.
const builderCards = makeCards(10, '1U');
const builderDeck = deckOf(builderCards);
const driveCards = makeCards(20, '9R');
const driveDeck = deckOf(driveCards);

const session = { expires: new Date(Date.now() + 3600_000).toISOString(), hasDriveScope: true };
const driveFile = { id: 'file-1', name: 'My Drive deck' };

const drawPileCount = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /^download from the draw deck$/i }));
  });
  const count = document.querySelectorAll('[data-testid="card-list-panel-drawDeck"] [data-card-id]').length;
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /^close draw deck$/i }));
  });
  return count;
};

const handLabel = () => screen.getByRole('button', { name: /^hand, \d+ cards?, tap to open$/i });

const drawOne = async () => {
  await act(async () => {
    fireEvent.click(screen.getAllByRole('button', { name: /draw deck top, tap to draw/i })[0]);
  });
};

const renderPage = async () => {
  let result: ReturnType<typeof render> | undefined;
  await act(async () => {
    result = render(<PracticeDrawPage />);
  });
  return result!;
};

// The saves written to `key`, from a spy on `localStorage.setItem`.
const savesWritten = (spy: jest.SpyInstance, key: string) =>
  spy.mock.calls.filter(([k]) => k === key).map(([, value]) => JSON.parse(value as string));

// A save of the empty `initialTableState`: no card in any zone and no mission (#1005).
const isEmptyTable = (table: Record<string, unknown>) =>
  Object.entries(table).every(([zone, value]) =>
    zone === 'missions'
      ? (value as Record<string, unknown>[]).every((slot) =>
          Object.values(slot).every((pile) => pile === null || (Array.isArray(pile) && pile.length === 0)),
        )
      : !Array.isArray(value) || value.length === 0,
  );

describe('Saved practice game (#976)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    mockSearchParamsValue = new URLSearchParams();
    localStorage.clear();
    localStorage.setItem('currentDeck', JSON.stringify(builderDeck));

    (useDataFetching as jest.Mock).mockReturnValue({ data: builderCards, loading: false });
    (deckFromTsv as jest.Mock).mockReturnValue(driveDeck);
    (extractDrawDeck as jest.Mock).mockImplementation((deck) =>
      Object.values(deck).map((entry) => (entry as { row: unknown }).row),
    );
    (getSession as jest.Mock).mockResolvedValue(null);

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      })),
    });
  });

  it('restores a moved card after the page mounts again', async () => {
    const first = await renderPage();
    expect(await drawPileCount()).toBe(3);
    await drawOne();
    expect(await drawPileCount()).toBe(2);
    expect(handLabel()).toHaveAccessibleName(/^hand, 8 cards/i);
    first.unmount();

    await renderPage();
    expect(await drawPileCount()).toBe(2);
    expect(handLabel()).toHaveAccessibleName(/^hand, 8 cards/i);
  });

  it('deals a new game when the deck in the builder changed between the mounts', async () => {
    const first = await renderPage();
    await drawOne();
    first.unmount();

    localStorage.setItem('currentDeck', JSON.stringify(deckOf(makeCards(12, '2U'))));
    await renderPage();
    expect(await drawPileCount()).toBe(5);
    expect(handLabel()).toHaveAccessibleName(/^hand, 7 cards/i);
  });

  it('keeps the fixture game under its own key and leaves practiceGame alone', async () => {
    (deckFromTsv as jest.Mock).mockReturnValue(builderDeck);
    localStorage.setItem('practiceGame', 'seeded save');
    mockSearchParamsValue = new URLSearchParams('fixture=1');

    const first = await renderPage();
    await drawOne();
    first.unmount();
    expect(localStorage.getItem('practiceGame')).toBe('seeded save');
    expect(localStorage.getItem('practiceGame:fixture=1')).not.toBeNull();

    await renderPage();
    expect(await drawPileCount()).toBe(2);
    expect(handLabel()).toHaveAccessibleName(/^hand, 8 cards/i);
  });

  it('keeps the ?fixture=piles game apart from the ?fixture=1 game', async () => {
    (deckFromTsv as jest.Mock).mockReturnValue(builderDeck);
    mockSearchParamsValue = new URLSearchParams('fixture=1');
    const first = await renderPage();
    await drawOne();
    first.unmount();

    mockSearchParamsValue = new URLSearchParams('fixture=piles');
    await renderPage();
    expect(localStorage.getItem('practiceGame:fixture=piles')).not.toBeNull();
    expect(localStorage.getItem('practiceGame:fixture=1')).not.toEqual(localStorage.getItem('practiceGame:fixture=piles'));
  });

  it('deals a new game with ?reset=1 and replaces the save', async () => {
    const first = await renderPage();
    await drawOne();
    first.unmount();

    mockSearchParamsValue = new URLSearchParams('reset=1');
    const second = await renderPage();
    expect(await drawPileCount()).toBe(3);
    expect(handLabel()).toHaveAccessibleName(/^hand, 7 cards/i);
    second.unmount();

    mockSearchParamsValue = new URLSearchParams();
    await renderPage();
    expect(await drawPileCount()).toBe(3);
  });

  it('deals a new fixture game with ?fixture=1&reset=1', async () => {
    (deckFromTsv as jest.Mock).mockReturnValue(builderDeck);
    mockSearchParamsValue = new URLSearchParams('fixture=1');
    const first = await renderPage();
    await drawOne();
    first.unmount();

    mockSearchParamsValue = new URLSearchParams('fixture=1&reset=1');
    await renderPage();
    expect(await drawPileCount()).toBe(3);
    expect(handLabel()).toHaveAccessibleName(/^hand, 7 cards/i);
  });

  it('never writes an empty table over a valid save on a restore (#1005)', async () => {
    const first = await renderPage();
    await drawOne();
    first.unmount();

    const setItem = jest.spyOn(Storage.prototype, 'setItem');
    await renderPage();
    expect(await drawPileCount()).toBe(2);

    const saves = savesWritten(setItem, 'practiceGame');
    expect(saves.length).toBeGreaterThan(0);
    saves.forEach((save) => expect(isEmptyTable(save.table)).toBe(false));
  });

  it('never writes an empty table on a first visit with no save (#1005)', async () => {
    const setItem = jest.spyOn(Storage.prototype, 'setItem');
    await renderPage();
    expect(await drawPileCount()).toBe(3);

    const saves = savesWritten(setItem, 'practiceGame');
    expect(saves.length).toBeGreaterThan(0);
    saves.forEach((save) => expect(isEmptyTable(save.table)).toBe(false));
  });

  it('keeps playing when the write throws', async () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    await renderPage();
    await drawOne();

    expect(await drawPileCount()).toBe(2);
  });
});
