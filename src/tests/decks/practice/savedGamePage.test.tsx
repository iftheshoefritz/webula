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

// The builder's deck holds 10 cards and the Drive deck 20. A new game deals no hand and leaves every
// card in the draw deck (#1115).
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

const handOf = (n: number) => new RegExp(`^hand, ${n} cards?`, 'i');

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

// The deck of the attempt fixture (#1169): Bilana System, slot 2, is a space mission with the crewed ship.
const mockAttemptDeck = () => {
  const row = (id: string, type: string, extra: Record<string, unknown> = {}) => ({
    collectorsinfo: id,
    originalName: `Card ${id}`,
    name: `card ${id}`,
    imagefile: `card_${id}`,
    type,
    pile: type === 'mission' ? 'mission' : type === 'dilemma' ? 'dilemmaPile' : 'drawDeck',
    count: 1,
    ...extra,
  });
  const rows = [
    ...['p', 'p', 's', 'h', 'p'].map((t, i) => row(`M${i}`, 'mission', { missiontype: t })),
    ...Array.from({ length: 20 }, (_, i) => row(`P${i}`, 'personnel')),
    row('S0', 'ship'),
    ...Array.from({ length: 6 }, (_, i) => row(`E${i}`, 'event')),
    ...Array.from({ length: 10 }, (_, i) => row(`K${i}`, 'equipment')),
    ...Array.from({ length: 10 }, (_, i) => row(`D${i}`, 'dilemma')),
  ];
  (deckFromTsv as jest.Mock).mockReturnValue(Object.fromEntries(rows.map((r) => [r.collectorsinfo, { count: 1, row: r }])));
  (extractDrawDeck as jest.Mock).mockImplementation((deck) =>
    Object.values(deck)
      .map((entry) => (entry as { row: { pile: string } }).row)
      .filter((r) => r.pile === 'drawDeck'),
  );
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
    expect(await drawPileCount()).toBe(10);
    await drawOne();
    expect(await drawPileCount()).toBe(9);
    expect(handLabel()).toHaveAccessibleName(handOf(1));
    first.unmount();

    await renderPage();
    expect(await drawPileCount()).toBe(9);
    expect(handLabel()).toHaveAccessibleName(handOf(1));
  });

  it('restores the dealt hand of a game saved before #1115', async () => {
    const first = await renderPage();
    first.unmount();
    // Rewrite the save as the old deal left it: the top 7 cards in the hand, face up.
    const save = JSON.parse(localStorage.getItem('practiceGame')!);
    const dealt = save.table.drawDeck.splice(0, 7);
    save.table.hand = dealt.map((c: Record<string, unknown>) => ({ ...c, face: 'up' }));
    localStorage.setItem('practiceGame', JSON.stringify(save));

    await renderPage();
    expect(await drawPileCount()).toBe(3);
    expect(handLabel()).toHaveAccessibleName(handOf(7));
  });

  it('deals a new game when the deck in the builder changed between the mounts', async () => {
    const first = await renderPage();
    await drawOne();
    first.unmount();

    localStorage.setItem('currentDeck', JSON.stringify(deckOf(makeCards(12, '2U'))));
    await renderPage();
    expect(await drawPileCount()).toBe(12);
    expect(handLabel()).toHaveAccessibleName(handOf(0));
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
    expect(await drawPileCount()).toBe(9);
    expect(handLabel()).toHaveAccessibleName(handOf(1));
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
    // The piles fixture deals its own hand of 7; the plain fixture deals none (#1115).
    expect(handLabel()).toHaveAccessibleName(handOf(7));
    expect(localStorage.getItem('practiceGame:fixture=1')).not.toEqual(localStorage.getItem('practiceGame:fixture=piles'));
  });

  it('keeps the ?fixture=attempt game under its own key, with an attempt at Bilana System (#1169)', async () => {
    mockAttemptDeck();
    const savedTable = (key: string) => JSON.parse(localStorage.getItem(key)!).table;

    mockSearchParamsValue = new URLSearchParams('fixture=piles');
    (await renderPage()).unmount();
    expect(savedTable('practiceGame:fixture=piles').attempt).toBeUndefined();

    mockSearchParamsValue = new URLSearchParams('fixture=attempt');
    const first = await renderPage();
    const dealt = savedTable('practiceGame:fixture=attempt');
    expect(dealt.attempt).toEqual({ missionIndex: 2, shipId: dealt.missions[2].ships[0].id, personnel: 12, subtract: 3 });
    // The attempt opens in the attempt layout (#1164), with draw/spend N in its strip.
    expect(screen.getByTestId('attempt-strip')).toHaveTextContent(/draw\/spend 9/i);
    const { attempt: _attempt, ...rest } = dealt;
    // The rest of the table is the piles table, apart from the instance ids of the second deal.
    const withoutIds = (table: unknown) => JSON.stringify(table).replace(/"id":"[^"]*"/g, '"id"');
    expect(withoutIds(rest)).toEqual(withoutIds(savedTable('practiceGame:fixture=piles')));
    first.unmount();

    // A remount restores the attempt, in the attempt layout; once ended, `reset=1` deals it again.
    const second = await renderPage();
    expect(screen.getByTestId('attempt-layout')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByTestId('attempt-done'));
    });
    expect(screen.queryByTestId('attempt-layout')).toBeNull();
    expect(screen.queryByTestId('attempt-overlay-2')).toBeNull();
    second.unmount();
    mockSearchParamsValue = new URLSearchParams('fixture=attempt&reset=1');
    await renderPage();
    expect(screen.getByTestId('attempt-layout')).toBeInTheDocument();
  });

  it('shows the attempt layout in place of the mission row, with View full table and Back to attempt (#1164)', async () => {
    mockAttemptDeck();
    mockSearchParamsValue = new URLSearchParams('fixture=attempt&reset=1');
    await renderPage();
    const zones = (id: string) => document.querySelectorAll(`[data-zone="${id}"]`).length;
    const shipId = JSON.parse(localStorage.getItem('practiceGame:fixture=attempt')!).table.missions[2].ships[0].id;

    // The attempt layout: the attempted mission's drop targets once each, and no other mission.
    expect(screen.getByTestId('attempt-layout')).toBeInTheDocument();
    expect(screen.getByTestId('attempt-status')).toHaveTextContent(/^Attempting card M2 with card S0$/i);
    for (const id of ['mission-on-2', 'mission-under-2', 'ship-row-2', `crew-${shipId}`, 'dilemmaStack']) expect(zones(id)).toBe(1);
    for (const i of [0, 1, 3, 4]) expect(zones(`mission-on-${i}`)).toBe(0);
    expect(screen.queryByTestId('attempt-overlay-2')).toBeNull();

    // View full table: the mission row, with Back to attempt, and only that, over the mission.
    await act(async () => {
      fireEvent.click(screen.getByTestId('attempt-view-full-table'));
    });
    expect(screen.queryByTestId('attempt-layout')).toBeNull();
    for (const i of [0, 1, 2, 3, 4]) expect(zones(`mission-on-${i}`)).toBe(1);
    expect(zones('dilemmaStack')).toBe(1);
    expect(screen.getByTestId('attempt-overlay-2')).toHaveTextContent(/^Back to attempt$/);
    // Page state, not part of the save.
    expect(JSON.parse(localStorage.getItem('practiceGame:fixture=attempt')!).table.attempt).toBeDefined();

    await act(async () => {
      fireEvent.click(screen.getByTestId('attempt-back-to-attempt'));
    });
    expect(screen.getByTestId('attempt-layout')).toBeInTheDocument();
    expect(zones('mission-on-0')).toBe(0);

    // Attempt done: the mission row again, with no overlay.
    await act(async () => {
      fireEvent.click(screen.getByTestId('attempt-done'));
    });
    expect(screen.queryByTestId('attempt-layout')).toBeNull();
    expect(screen.queryByTestId('attempt-overlay-2')).toBeNull();
    for (const i of [0, 1, 2, 3, 4]) expect(zones(`mission-on-${i}`)).toBe(1);
  });

  it('restores a game saved mid-attempt in the attempt layout, even after View full table (#1164)', async () => {
    mockAttemptDeck();
    mockSearchParamsValue = new URLSearchParams('fixture=attempt&reset=1');
    const first = await renderPage();
    await act(async () => {
      fireEvent.click(screen.getByTestId('attempt-view-full-table'));
    });
    expect(screen.queryByTestId('attempt-layout')).toBeNull();
    first.unmount();

    mockSearchParamsValue = new URLSearchParams('fixture=attempt');
    await renderPage();
    expect(screen.getByTestId('attempt-layout')).toBeInTheDocument();
  });

  it('deals a new game with ?reset=1 and replaces the save', async () => {
    const first = await renderPage();
    await drawOne();
    first.unmount();

    mockSearchParamsValue = new URLSearchParams('reset=1');
    const second = await renderPage();
    expect(await drawPileCount()).toBe(10);
    expect(handLabel()).toHaveAccessibleName(handOf(0));
    second.unmount();

    mockSearchParamsValue = new URLSearchParams();
    await renderPage();
    expect(await drawPileCount()).toBe(10);
  });

  it('deals a new fixture game with ?fixture=1&reset=1', async () => {
    (deckFromTsv as jest.Mock).mockReturnValue(builderDeck);
    mockSearchParamsValue = new URLSearchParams('fixture=1');
    const first = await renderPage();
    await drawOne();
    first.unmount();

    mockSearchParamsValue = new URLSearchParams('fixture=1&reset=1');
    await renderPage();
    expect(await drawPileCount()).toBe(10);
    expect(handLabel()).toHaveAccessibleName(handOf(0));
  });

  it('never writes an empty table over a valid save on a restore (#1005)', async () => {
    const first = await renderPage();
    await drawOne();
    first.unmount();

    const setItem = jest.spyOn(Storage.prototype, 'setItem');
    await renderPage();
    expect(await drawPileCount()).toBe(9);

    const saves = savesWritten(setItem, 'practiceGame');
    expect(saves.length).toBeGreaterThan(0);
    saves.forEach((save) => expect(isEmptyTable(save.table)).toBe(false));
  });

  it('never writes an empty table on a first visit with no save (#1005)', async () => {
    const setItem = jest.spyOn(Storage.prototype, 'setItem');
    await renderPage();
    expect(await drawPileCount()).toBe(10);

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

    expect(await drawPileCount()).toBe(9);
  });
});
