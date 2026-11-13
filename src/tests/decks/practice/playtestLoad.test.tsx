// Playtest cards on the practice table (#1615). The playtest cards of a playtester join the public
// cards after them, so a Drive load waits for them, and their late arrival never deals again.
// Invented cards only: no playtest card is ever committed.
let mockSearchParamsValue = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  useSearchParams: () => mockSearchParamsValue,
}));

jest.mock('../../../hooks/useDataFetching', () => ({
  __esModule: true,
  default: jest.fn(),
}));

// The playtest cards the provider would give: none and pending first, then the merge.
let mockPlaytest: { rows: any[]; sets: { label: string; value: string; version: number }[]; settled: boolean } = { rows: [], sets: [], settled: false };
jest.mock('../../../hooks/usePlaytestCards', () => {
  const { useMemo } = jest.requireActual('react');
  return {
    usePlaytestCards: () => mockPlaytest,
    useWithPlaytestCards: (publicData: any[]) => {
      const rows = mockPlaytest.rows;
      return useMemo(() => (rows.length === 0 ? publicData : [...publicData, ...rows]), [publicData, rows]);
    },
  };
});

jest.mock('../../../app/decks/deckBuilderUtils', () => ({
  ...jest.requireActual('../../../app/decks/deckBuilderUtils'),
  shuffleArray: jest.fn((arr) => arr),
}));

jest.mock('../../../app/decks/practice/offlineDecks', () => ({
  ...jest.requireActual('../../../app/decks/practice/offlineDecks'),
  useOfflineDecks: () => ({
    decks: [],
    progress: null,
    refreshing: false,
    failed: [],
    makeOffline: jest.fn(),
    remove: jest.fn(),
    isOffline: () => false,
  }),
}));

jest.mock('next-auth/react', () => ({
  getSession: jest.fn(),
  signIn: jest.fn(),
}));

jest.mock('posthog-js', () => ({ capture: jest.fn() }));

jest.mock('next/link', () => {
  return function MockLink({ children, href }: { children: React.ReactNode; href: string }) {
    return <a href={href}>{children}</a>;
  };
});

import React from 'react';
import { render, screen, act, fireEvent, within } from '@testing-library/react';
import { getSession } from 'next-auth/react';
import PracticeDrawPage from '../../../app/decks/practice/PracticeTable';
import useDataFetching from '../../../hooks/useDataFetching';
import { DeckList } from '../../../types';

const row = (originalName: string, collectorsinfo: string, type: string, set = 'premiere') => ({
  name: originalName.toLowerCase(),
  originalName,
  collectorsinfo,
  imagefile: collectorsinfo,
  backimagefile: '',
  type,
  set,
});

const publicData = [
  row('Public Mission', '1m1', 'mission'),
  row('Public Widget', '1e1', 'equipment'),
  row('Public Snag', '1d1', 'dilemma'),
];
const testGadget = row('Test Gadget', 'PT-9004A', 'equipment', 'testseta');

const DECK_TEXT = 'Deck:\n3\tPublic Widget\n2\tTest Gadget\nDilemmas:\n1\tPublic Snag\nMissions:\n1\tPublic Mission';
const fileA = { id: 'a', name: 'Deck A' };
const session = { expires: new Date(Date.now() + 3600_000).toISOString(), hasDriveScope: true };

const save = () => JSON.parse(localStorage.getItem('practiceGame')!);

const click = async (name: string) => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
};

const openPicker = async () => {
  if (!screen.queryByRole('button', { name: 'Load deck' })) await click('Game menu');
  await click('Load deck');
};

describe('playtest cards on the practice table (#1615)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParamsValue = new URLSearchParams();
    mockPlaytest = { rows: [], sets: [], settled: false };
    localStorage.clear();
    (useDataFetching as jest.Mock).mockReturnValue({ data: publicData, loading: false });
    (getSession as jest.Mock).mockResolvedValue(session);
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    global.fetch = jest.fn((url: string) => {
      if (url.startsWith('/api/drive?')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ files: [fileA] }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(DECK_TEXT) });
    }) as unknown as typeof fetch;
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

  it('deals a Drive deck that names a playtest card with the card, when the load starts before the playtest cards arrive', async () => {
    let result: ReturnType<typeof render> | undefined;
    await act(async () => {
      result = render(<PracticeDrawPage />);
    });
    await openPicker();
    await click('Load the missions and draw deck of Deck A');
    await click('Load the dilemmas of Deck A');
    // The deck text is in, and the load waits for the playtest cards.
    expect(localStorage.getItem('practiceGame')).toBeNull();

    mockPlaytest = { rows: [testGadget], sets: [{ label: 'TestSetA', value: 'testseta', version: 3 }], settled: true };
    await act(async () => {
      result!.rerender(<PracticeDrawPage />);
    });

    const dealt: DeckList = save().dealtDeck;
    expect(dealt['PT-9004A']).toMatchObject({ count: 2, row: { originalName: 'Test Gadget', set: 'testseta' } });
    expect(dealt['1e1'].count).toBe(3);
    const drawn = [...save().table.drawDeck, ...save().table.hand];
    expect(drawn.filter((c: any) => c.key === 'PT-9004A')).toHaveLength(2);
  });

  it('loads at once when the playtest cards have settled already', async () => {
    mockPlaytest = { rows: [], sets: [], settled: true };
    await act(async () => {
      render(<PracticeDrawPage />);
    });
    await openPicker();
    await click('Load the missions and draw deck of Deck A');
    await click('Load the dilemmas of Deck A');
    expect(Object.keys(save().dealtDeck).sort()).toEqual(['1d1', '1e1', '1m1']);
  });

  it('does not deal a game in progress again when the playtest cards arrive', async () => {
    const builderDeck: DeckList = {
      '1m1': { count: 1, row: { ...publicData[0], count: 1, pile: 'mission' } },
      '1e1': { count: 4, row: { ...publicData[1], count: 4, pile: 'drawDeck' } },
      'PT-9004A': { count: 1, row: { ...testGadget, count: 1, pile: 'drawDeck' } },
    };
    localStorage.setItem('currentDeck', JSON.stringify(builderDeck));
    let result: ReturnType<typeof render> | undefined;
    await act(async () => {
      result = render(<PracticeDrawPage />);
    });
    const nextTurn = within(screen.getByTestId('turn-score-column')).getByRole('button', { name: 'Next turn' });
    await act(async () => {
      fireEvent.click(nextTurn);
    });
    const drawOrder = save().table.drawDeck.map((c: any) => c.id);
    expect(save().table.turn).toBe(2);

    mockPlaytest = { rows: [testGadget], sets: [{ label: 'TestSetA', value: 'testseta', version: 3 }], settled: true };
    await act(async () => {
      result!.rerender(<PracticeDrawPage />);
    });

    expect(save().table.turn).toBe(2);
    expect(save().table.drawDeck.map((c: any) => c.id)).toEqual(drawOrder);
  });
});
