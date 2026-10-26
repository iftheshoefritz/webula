// Issue #1299: in a bot game, Start draws, lets the bot choose the stack, and opens the facing phase,
// as one action, one log entry and one undo.
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

jest.mock('next/link', () => {
  return function MockLink({ children, href }: { children: React.ReactNode; href: string }) {
    return <a href={href}>{children}</a>;
  };
});

// The search answers only when the test says so: each request waits in `mockRequests`.
const mockRequests: SearchRequest[] = [];
let mockReply: ((r: ThreadedSearchResponse) => void) | null = null;
jest.mock('../../../lib/dilemmaBot/useSearchWorker', () => ({
  useSearchWorker: (onResponse: (r: ThreadedSearchResponse) => void) => {
    mockReply = onResponse;
    return (request: SearchRequest) => mockRequests.push(request);
  },
}));

import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { getSession } from 'next-auth/react';
import PracticeDrawPage from '../../../app/decks/practice/PracticeTable';
import useDataFetching from '../../../hooks/useDataFetching';
import { deckFromTsv, extractDrawDeck } from '../../../app/decks/deckBuilderUtils';
import { OPPONENT_DILEMMAS, collectorsKey } from '../../../lib/dilemmaBot/opponentPile';
import { SearchRequest, answerSearch } from '../../../lib/dilemmaBot/searchRequest';
import { ThreadedSearchResponse } from '../../../lib/dilemmaBot/useSearchWorker';
import { isLegalStack } from '../../../lib/dilemmaBot/search';
import { dilemmaIdOf } from '../../../lib/dilemmaBot/chulaPile';
import {
  CardInstance,
  MISSION_SLOTS,
  MissionSlot,
  TableState,
  drawFromDilemmaPile,
  initialTableState,
  tableReducer,
} from '../../../app/decks/practice/tableReducer';
import { gameReducer, initialGameState, logEntryText } from '../../../app/decks/practice/gameLog';

// --- The reducer and the log -------------------------------------------------------------------

const slot = (overrides: Partial<MissionSlot> = {}): MissionSlot => ({ mission: null, ships: [], awayTeam: [], underMission: [], ...overrides });
const dilemma = (i: number): CardInstance => ({
  id: `d${i}`,
  card: { name: `dilemma ${i}`, originalName: `Dilemma ${i}`, type: 'dilemma' },
  face: 'down',
});
const botTable = (): TableState => ({
  ...initialTableState,
  opponent: 'bot',
  dilemmaPile: Array.from({ length: 12 }, (_, i) => dilemma(i)),
  missions: Array.from({ length: MISSION_SLOTS }, (_, i) =>
    slot({ mission: i === 0 ? { id: 'm0', card: { name: 'moab iv', originalName: 'Moab IV', type: 'mission', missiontype: 'p' }, face: 'up' } : null })
  ),
});
const botAction = (table: TableState, stack: string[]) => {
  const { drawn, pile } = drawFromDilemmaPile(table.dilemmaPile, 9);
  return {
    type: 'botAttempt' as const,
    missionIndex: 0,
    personnel: 12,
    subtract: 3,
    botDraw: 9,
    botSpend: 9,
    pile,
    drawn: drawn.map((c) => c.id),
    stack,
    random: false,
  };
};

describe('the botAttempt action (#1299)', () => {
  it('draws 9, stacks face down in order, returns the rest face up in draw order, and leaves the attempt facing', () => {
    const before = botTable();
    const after = tableReducer(before, botAction(before, ['d4', 'd1', 'd7']));
    expect(after.attempt).toMatchObject({ phase: 'face', drawn: 9, botDraw: 9, botSpend: 9 });
    expect(after.dilemmaStack.map((c) => c.id)).toEqual(['d4', 'd1', 'd7']);
    expect(after.dilemmaStack.every((c) => c.face === 'down')).toBe(true);
    expect(after.dilemmaHand).toEqual([]);
    expect(after.dilemmaPile.map((c) => c.id)).toEqual(['d9', 'd10', 'd11', 'd0', 'd2', 'd3', 'd5', 'd6', 'd8']);
    expect(after.dilemmaPile.slice(3).every((c) => c.face === 'up')).toBe(true);
    // The card instances are kept as dealt, but for their face.
    expect({ ...after.dilemmaStack[0], face: 'down' }).toEqual(before.dilemmaPile[4]);
  });

  it('makes one log entry, and one undo restores the table from before Start', () => {
    const before = initialGameState(botTable());
    const game = gameReducer(before, botAction(before.table, ['d4', 'd1', 'd7']));
    expect(game.log).toHaveLength(1);
    const text = logEntryText(game.log[0]);
    expect(text).toMatch(/the bot drew 9 dilemmas and put 3 in the stack/);
    expect(text).not.toMatch(/Dilemma 4|Dilemma 1\b|Dilemma 7/);
    expect(text).toMatch(/Dilemma 0, .*Dilemma 8 to the bottom of the dilemma pile/);
    const undone = gameReducer(game, { type: 'undo' });
    expect(undone.table).toBe(before.table);
    expect(undone.table.attempt).toBeUndefined();
  });

  it('does nothing while an attempt is running', () => {
    const started = tableReducer(botTable(), { type: 'startAttempt', missionIndex: 0, personnel: 12, subtract: 3 });
    expect(tableReducer(started, botAction(started, ['d0']))).toBe(started);
  });
});

// --- The page ----------------------------------------------------------------------------------

const chulaRows = OPPONENT_DILEMMAS.map((d) => ({
  collectorsinfo: collectorsKey(d.collectorsInfo),
  originalName: d.title,
  name: d.title.toLowerCase(),
  imagefile: `chula_${d.id}`,
  type: 'dilemma',
  cost: d.cost,
}));

// The deck of the attempt fixture: Bilana System, slot 2, is a space mission with the crewed ship.
const mockAttemptDeck = (skills: string) => {
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
    ...['p', 'p', 's', 'h', 'p'].map((t, i) => row(`M${i}`, 'mission', { missiontype: t, skills })),
    ...Array.from({ length: 20 }, (_, i) => row(`P${i}`, 'personnel', { skills: 'Science', integrity: 5, cunning: 5, strength: 5 })),
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

const saved = (fixture: string) => JSON.parse(localStorage.getItem(`practiceGame:fixture=${fixture}`)!).table;

const openPopup = async (fixture: string, skills = 'Physics, 2 Science') => {
  mockAttemptDeck(skills);
  mockSearchParamsValue = new URLSearchParams(`fixture=${fixture}&reset=1&menu=0`);
  await act(async () => {
    render(<PracticeDrawPage />);
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Card S0' }));
  });
  await act(async () => {
    fireEvent.click(screen.getByTestId('attempt-button'));
  });
};

const setField = (testId: string, value: string) => fireEvent.change(screen.getByTestId(testId), { target: { value } });

const start = async () => {
  await act(async () => {
    fireEvent.click(screen.getByTestId('attempt-start'));
  });
};

const reply = async (request: SearchRequest) => {
  await act(async () => {
    mockReply!({ ...answerSearch(request), thread: 'background' });
  });
};

describe('Start in a bot game (#1299)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequests.length = 0;
    localStorage.clear();
    (useDataFetching as jest.Mock).mockReturnValue({ data: chulaRows, loading: false });
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

  it('with N 9, Draw 7 and Spend 11, draws 7 and asks chooseStack for a stack of 11, then opens the facing phase', async () => {
    await openPopup('bot');
    expect(screen.getByTestId('attempt-result')).toHaveTextContent('draw/spend 9');
    setField('attempt-bot-draw', '7');
    setField('attempt-bot-spend', '11');
    const pileBefore = saved('bot').dilemmaPile.length;
    await start();

    expect(mockRequests).toHaveLength(1);
    expect(mockRequests[0]).toMatchObject({ kind: 'table', n: 11 });
    expect(mockRequests[0].drawn).toHaveLength(7);
    // Nothing changed yet.
    expect(saved('bot').attempt).toBeUndefined();

    await reply(mockRequests[0]);
    const table = saved('bot');
    expect(table.attempt).toMatchObject({ phase: 'face', drawn: 7, botDraw: 7, botSpend: 11 });
    expect(table.dilemmaHand).toEqual([]);
    expect(table.dilemmaPile.length + table.dilemmaStack.length).toBe(pileBefore);
    expect(screen.queryByTestId('attempt-dialog')).toBeNull();
    expect(screen.getByTestId('attempt-layout')).toBeInTheDocument();
    expect(screen.getByTestId('attempt-draw-spend')).toHaveTextContent('draw 7, spend 11');
    expect(screen.queryByTestId('attempt-draw-dilemma')).toBeNull();
    expect(screen.queryByTestId('attempt-drawn-count')).toBeNull();
    expect(screen.queryByTestId('attempt-face-dilemmas')).toBeNull();
    expect(screen.queryByTestId('attempt-back-to-choosing')).toBeNull();
    expect(screen.getByTestId('undo-button')).toHaveAttribute('aria-label', expect.stringMatching(/the bot drew 7 dilemmas/));
  });

  it('while the bot chooses, disables Start and undo; Cancel changes nothing and a later reply is dropped', async () => {
    await openPopup('bot');
    // A first action, so undo has something to take back.
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: /draw deck top, tap to draw/i })[0]);
    });
    const before = localStorage.getItem('practiceGame:fixture=bot');
    await start();

    expect(screen.getByTestId('attempt-start')).toBeDisabled();
    expect(screen.getByTestId('attempt-start')).toHaveTextContent('The bot is choosing…');
    await act(async () => {
      fireEvent.click(screen.getByTestId('undo-button'));
    });
    expect(localStorage.getItem('practiceGame:fixture=bot')).toBe(before);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    });
    expect(screen.queryByTestId('attempt-dialog')).toBeNull();
    await reply(mockRequests[0]);
    expect(localStorage.getItem('practiceGame:fixture=bot')).toBe(before);
    expect(screen.queryByTestId('attempt-layout')).toBeNull();
  });

  it('chooses a legal stack at random when the requirements cannot be read, and the log says so', async () => {
    await openPopup('bot', '');
    setField('attempt-bot-spend', '6');
    await start();
    expect(mockRequests).toHaveLength(0);
    const table = saved('bot');
    expect(table.attempt).toMatchObject({ phase: 'face', drawn: 9 });
    const ids = table.dilemmaStack.map((c: { key: string }) => dilemmaIdOf({ collectorsinfo: c.key })!);
    expect(isLegalStack(ids, ids, 6)).toBe(true);
    expect(screen.getByTestId('undo-button')).toHaveAttribute('aria-label', expect.stringMatching(/in the stack at random/));
  });

  it('in a game with a deck\'s dilemmas, Start opens the dilemma choice with nothing drawn, as before', async () => {
    await openPopup('piles');
    await start();
    expect(mockRequests).toHaveLength(0);
    expect(saved('piles').attempt).toMatchObject({ phase: 'choose', drawn: 0 });
  });
});
