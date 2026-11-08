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
import { render, screen, act, fireEvent, cleanup } from '@testing-library/react';
import { getSession } from 'next-auth/react';
import PracticeDrawPage from '../../../app/decks/practice/PracticeTable';
import useDataFetching from '../../../hooks/useDataFetching';
import { deckFromTsv, extractDrawDeck } from '../../../app/decks/deckBuilderUtils';
import { OPPONENT_DILEMMAS, collectorsKey } from '../../../lib/dilemmaBot/opponentPile';
import { SearchRequest, answerSearch } from '../../../lib/dilemmaBot/searchRequest';
import { ThreadedSearchResponse } from '../../../lib/dilemmaBot/useSearchWorker';
import { isLegalPileStack } from '../../../lib/dilemmaBot/pile/search';
import { pileAttemptOf } from '../../../lib/dilemmaBot/pile/tableAttempt';
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
import { botRedraws } from '../../../app/decks/practice/useBotAttemptStart';
import { PileSearchResult } from '../../../lib/dilemmaBot/pile/search';

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
    // The dilemmas the bot did not choose are counted, never named (#1561).
    expect(text).toMatch(/, and moved 6 dilemmas to the bottom of the dilemma pile$/);
    expect(text).not.toMatch(/Dilemma \d/);
    expect(JSON.stringify(game.log)).not.toMatch(/Dilemma \d/);
    const undone = gameReducer(game, { type: 'undo' });
    expect(undone.table).toBe(before.table);
    expect(undone.table.attempt).toBeUndefined();
  });

  it('counts one returned dilemma as "1 dilemma" (#1561)', () => {
    const before = initialGameState(botTable());
    const game = gameReducer(before, botAction(before.table, ['d0', 'd1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7']));
    const text = logEntryText(game.log[0]);
    expect(text).toMatch(/, and moved 1 dilemma to the bottom of the dilemma pile$/);
    expect(text).not.toMatch(/Dilemma \d/);
  });

  it('gives only the count for an entry of a save from before #1561, which names the returned dilemmas', () => {
    const text = logEntryText({
      turn: 1,
      kind: 'botAttempt',
      mission: 'Moab IV',
      personnel: 12,
      subtract: 3,
      drew: 9,
      stacked: 7,
      returned: ['Dilemma 0', 'Dilemma 8'],
    });
    expect(text).toMatch(/put 7 in the stack, and moved 2 dilemmas to the bottom of the dilemma pile$/);
    expect(text).not.toMatch(/Dilemma \d/);
  });

  it('marks an attempt the bot started with an empty stack (#1536), and no other', () => {
    const before = botTable();
    expect(tableReducer(before, botAction(before, [])).attempt).toMatchObject({ phase: 'face', botChoseNone: true });
    expect(tableReducer(before, botAction(before, ['d4'])).attempt).not.toHaveProperty('botChoseNone');
    expect(tableReducer(before, { type: 'startAttempt', missionIndex: 0, personnel: 12, subtract: 3 }).attempt).not.toHaveProperty('botChoseNone');
  });

  it('records the chosen stack, and each card the table reveals in the facing phase (#1556)', () => {
    const before = botTable();
    const after = tableReducer(before, botAction(before, ['d4', 'd1', 'd7']));
    expect(after.attempt).toMatchObject({ botStack: ['d4', 'd1', 'd7'], botRevealed: [] });
    const first = tableReducer(after, { type: 'flip', id: 'd4' });
    expect(first.attempt!.botRevealed).toEqual(['d4']);
    // A card turned face down again, and revealed once more, is recorded once.
    const again = tableReducer(tableReducer(first, { type: 'flip', id: 'd4' }), { type: 'flip', id: 'd4' });
    expect(again.attempt!.botRevealed).toEqual(['d4']);
    // A fetched card: it enters the stack face down, and its reveal is recorded too.
    const fetched = tableReducer(tableReducer(first, { type: 'move', id: 'd9', to: 'dilemmaStack', position: 'top' }), { type: 'flip', id: 'd9' });
    expect(fetched.attempt!.botRevealed).toEqual(['d4', 'd9']);
    expect(fetched.attempt!.botStack).toEqual(['d4', 'd1', 'd7']);
    // A flip off the stack records nothing.
    expect(tableReducer(after, { type: 'flip', id: 'd10' }).attempt).toBe(after.attempt);
  });

  it('records no reveal outside a bot attempt, or in the dilemma choice (#1556)', () => {
    const plain = { ...botTable(), dilemmaStack: [dilemma(20)] };
    const facing = tableReducer(tableReducer(plain, { type: 'startAttempt', missionIndex: 0, personnel: 12, subtract: 3 }), { type: 'setAttemptPhase', phase: 'face' });
    expect(tableReducer(facing, { type: 'flip', id: 'd20' }).attempt).not.toHaveProperty('botRevealed');
    const choosing = tableReducer(plain, { type: 'startAttempt', missionIndex: 0, personnel: 12, subtract: 3, botDraw: 9, botSpend: 9 });
    expect(tableReducer(choosing, { type: 'flip', id: 'd20' }).attempt).not.toHaveProperty('botRevealed');
  });

  it('takes back a recorded reveal with undo, and records it again with redo (#1556)', () => {
    const before = initialGameState(botTable());
    const started = gameReducer(before, botAction(before.table, ['d4', 'd1']));
    const flipped = gameReducer(started, { type: 'flip', id: 'd4' });
    expect(flipped.table.attempt!.botRevealed).toEqual(['d4']);
    const undone = gameReducer(flipped, { type: 'undo' });
    expect(undone.table.attempt!.botRevealed).toEqual([]);
    expect(gameReducer(undone, { type: 'redo' }).table.attempt!.botRevealed).toEqual(['d4']);
  });

  it('does nothing while an attempt is running', () => {
    const started = tableReducer(botTable(), { type: 'startAttempt', missionIndex: 0, personnel: 12, subtract: 3 });
    expect(tableReducer(started, botAction(started, ['d0']))).toBe(started);
  });
});

// --- Unexpected Difficulties (#1563) ----------------------------------------------------------

const udTable = (): TableState => ({ ...botTable(), botPile: { id: 'beginner:tos.txt', name: 'TOS', unexpectedDifficulties: true } });
// The page's redraw: the first draw goes to the bottom of the pile, face up, and as many are drawn again.
const redrawAction = (table: TableState, count = 6) => {
  const first = drawFromDilemmaPile(table.dilemmaPile, count);
  const second = drawFromDilemmaPile([...first.pile, ...first.drawn.map((c) => ({ ...c, face: 'up' as const }))], count);
  return {
    ...botAction(table, []),
    botDraw: count,
    pile: second.pile,
    drawn: second.drawn.map((c) => c.id),
    stack: ['d7', 'd9'],
    redrawn: first.drawn.map((c) => c.id),
  };
};

describe('the botAttempt action with Unexpected Difficulties (#1563)', () => {
  it('deals the second draw, keeps the first at the bottom of the pile face up, and sets the flag', () => {
    const after = tableReducer(udTable(), redrawAction(udTable()));
    expect(after.botUsedUnexpectedDifficulties).toBe(true);
    expect(after.dilemmaStack.map((c) => c.id)).toEqual(['d7', 'd9']);
    expect(after.attempt).toMatchObject({ phase: 'face', drawn: 6 });
    // The first draw at the bottom, face up, then the rest of the second draw.
    expect(after.dilemmaPile.map((c) => c.id)).toEqual(['d0', 'd1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd8', 'd10', 'd11']);
    expect(after.dilemmaPile.every((c) => c.face === 'up')).toBe(true);
  });

  it('refuses a redraw when the bot used the card already, or its deck lacks it', () => {
    const used = { ...udTable(), botUsedUnexpectedDifficulties: true as const };
    expect(tableReducer(used, redrawAction(used))).toBe(used);
    const chula = botTable();
    expect(tableReducer(chula, redrawAction(chula))).toBe(chula);
    // An attempt with no redraw leaves the flag as it is.
    expect(tableReducer(udTable(), botAction(udTable(), ['d4'])).botUsedUnexpectedDifficulties).toBeUndefined();
  });

  it('logs the card and the count, names no dilemma, and one undo clears the flag', () => {
    const before = initialGameState(udTable());
    const game = gameReducer(before, redrawAction(before.table));
    expect(game.log).toHaveLength(1);
    const text = logEntryText(game.log[0]);
    expect(text).toMatch(/the bot drew 6 dilemmas, used Unexpected Difficulties to return them and draw 6 more, and put 2 in the stack/);
    expect(text).not.toMatch(/Dilemma \d/);
    const undone = gameReducer(game, { type: 'undo' });
    expect(undone.table).toBe(before.table);
    expect(undone.table.botUsedUnexpectedDifficulties).toBeUndefined();
  });
});

describe('botRedraws (#1563)', () => {
  const result = (mode: PileSearchResult['mode']) => ({ mode }) as PileSearchResult;

  it('redraws with 4 or more drawn, the card held and unused, when no stack can end the attempt', () => {
    expect(botRedraws(udTable(), 4, result('cannot-fail'))).toBe(true);
    expect(botRedraws(udTable(), 3, result('cannot-fail'))).toBe(false);
    expect(botRedraws(udTable(), 9, result('probability'))).toBe(false);
    expect(botRedraws(udTable(), 9, result('confident'))).toBe(false);
    expect(botRedraws({ ...udTable(), botUsedUnexpectedDifficulties: true }, 9, result('cannot-fail'))).toBe(false);
    expect(botRedraws(botTable(), 9, result('cannot-fail'))).toBe(false);
    expect(botRedraws({ ...udTable(), botPile: { id: 'beginner:x.txt', name: 'X' } }, 9, result('cannot-fail'))).toBe(false);
  });
});

// --- The page ----------------------------------------------------------------------------------

const chulaRows = OPPONENT_DILEMMAS.map((d) => ({
  collectorsinfo: collectorsKey(d.collectorsInfo),
  originalName: d.title,
  name: d.title.toLowerCase(),
  imagefile: `chula_${collectorsKey(d.collectorsInfo)}`,
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

  it('with N 9, Draw 7 and Spend 11, draws 7 and asks choosePileStack for a stack of 11, then opens the facing phase', async () => {
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
    const titles = table.dilemmaStack.map((c: { key: string }) => chulaRows.find((r) => r.collectorsinfo === c.key)!.originalName);
    // The seed is random, and the empty stack is one of the legal stacks, so the stack may be empty:
    // `tableAttempt.test.ts` checks the map from titles back to the drawn cards.
    expect(titles.every((t: string | undefined) => typeof t === 'string')).toBe(true);
    const { attempt } = pileAttemptOf({ cards: [], mission: { missiontype: 's' }, placedOn: [], underMission: [], missions: [], hand: [], discard: [], turn: 1 });
    expect(isLegalPileStack(attempt, titles, titles, 6)).toBe(true);
    expect(screen.getByTestId('undo-button')).toHaveAttribute('aria-label', expect.stringMatching(/in the stack at random/));
  });

  it('with Draw 0, shows the empty stack as an outline that reads "No dilemmas chosen", through a reload (#1536)', async () => {
    await openPopup('bot');
    setField('attempt-bot-draw', '0');
    await start();
    expect(saved('bot').attempt).toMatchObject({ phase: 'face', botChoseNone: true });
    const zone = document.querySelector('[data-zone="dilemmaStack"]') as HTMLElement;
    expect(zone.style.visibility).toBe('visible');
    expect(zone).toHaveTextContent('No dilemmas chosen');
    expect(screen.getByRole('button', { name: /no dilemmas chosen/i })).toBeInTheDocument();

    cleanup();
    mockSearchParamsValue = new URLSearchParams('fixture=bot&menu=0');
    await act(async () => {
      render(<PracticeDrawPage />);
    });
    const restored = document.querySelector('[data-zone="dilemmaStack"]') as HTMLElement;
    expect(restored.style.visibility).toBe('visible');
    expect(restored).toHaveTextContent('No dilemmas chosen');
  });

  it('with a chosen stack, shows the stack with no "No dilemmas chosen" (#1536)', async () => {
    // Start with an empty stack, then give the save a stack of one with no mark, as a Start whose
    // bot chose a dilemma leaves it.
    await openPopup('bot');
    setField('attempt-bot-draw', '0');
    await start();
    const key = 'practiceGame:fixture=bot';
    const save = JSON.parse(localStorage.getItem(key)!);
    const [top, ...rest] = save.table.dilemmaPile;
    save.table.dilemmaPile = rest;
    save.table.dilemmaStack = [{ ...top, face: 'down' }];
    delete save.table.attempt.botChoseNone;
    localStorage.setItem(key, JSON.stringify(save));
    cleanup();
    mockSearchParamsValue = new URLSearchParams('fixture=bot&menu=0');
    await act(async () => {
      render(<PracticeDrawPage />);
    });
    expect(saved('bot').dilemmaStack).toHaveLength(1);
    expect(screen.getByAltText('Face-down dilemma stack')).toBeInTheDocument();
    expect(document.querySelector('[data-zone="dilemmaStack"]')).not.toHaveTextContent('No dilemmas chosen');
  });

  it('in a game with a deck\'s dilemmas, Start opens the dilemma choice with nothing drawn, as before', async () => {
    await openPopup('piles');
    await start();
    expect(mockRequests).toHaveLength(0);
    expect(saved('piles').attempt).toMatchObject({ phase: 'choose', drawn: 0 });
  });
});

describe('Start in a bot game whose deck holds Unexpected Difficulties (#1563)', () => {
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

  const key = 'practiceGame:fixture=bot';
  // The `?fixture=bot` game, with a bot pile whose deck holds the card, reloaded.
  const openUdGame = async (skills = 'Physics, 2 Science') => {
    mockAttemptDeck(skills);
    mockSearchParamsValue = new URLSearchParams('fixture=bot&reset=1&menu=0');
    await act(async () => {
      render(<PracticeDrawPage />);
    });
    const save = JSON.parse(localStorage.getItem(key)!);
    save.table.botPile = { id: 'beginner:tos.txt', name: 'TOS', unexpectedDifficulties: true };
    localStorage.setItem(key, JSON.stringify(save));
    cleanup();
    mockSearchParamsValue = new URLSearchParams('fixture=bot&menu=0');
    await act(async () => {
      render(<PracticeDrawPage />);
    });
  };
  const openAttempt = async () => {
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Card S0' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('attempt-button'));
    });
  };
  const replyAs = async (request: SearchRequest, mode: PileSearchResult['mode']) => {
    const answer = answerSearch(request as Extract<SearchRequest, { kind: 'table' }>);
    await act(async () => {
      mockReply!({ ...answer, result: { ...answer.result, mode }, thread: 'background' });
    });
  };

  it('redraws once when no stack can end the attempt, in one action, and not again in the same game', async () => {
    await openUdGame();
    await openAttempt();
    const pileBefore = saved('bot').dilemmaPile.length;
    await start();
    expect(mockRequests).toHaveLength(1);
    await replyAs(mockRequests[0], 'cannot-fail');
    // The second request draws as many again, and nothing changed yet.
    expect(mockRequests).toHaveLength(2);
    expect(mockRequests[1].id).not.toBe(mockRequests[0].id);
    expect(mockRequests[1].drawn).toHaveLength(mockRequests[0].drawn.length);
    expect(saved('bot').attempt).toBeUndefined();
    expect(screen.getByTestId('attempt-start')).toHaveTextContent('The bot is choosing…');

    await replyAs(mockRequests[1], 'cannot-fail');
    expect(mockRequests).toHaveLength(2);
    const table = saved('bot');
    expect(table.botUsedUnexpectedDifficulties).toBe(true);
    expect(table.attempt).toMatchObject({ phase: 'face', drawn: 9 });
    expect(table.dilemmaPile.length + table.dilemmaStack.length).toBe(pileBefore);
    expect(screen.getByTestId('undo-button')).toHaveAttribute('aria-label', expect.stringMatching(/used Unexpected Difficulties to return them and draw 9 more/));

    // A second attempt in the same game does not redraw.
    await act(async () => {
      fireEvent.click(screen.getByTestId('attempt-done'));
    });
    await openAttempt();
    await start();
    expect(mockRequests).toHaveLength(3);
    await replyAs(mockRequests[2], 'cannot-fail');
    expect(mockRequests).toHaveLength(3);
    expect(saved('bot').attempt).toMatchObject({ phase: 'face' });
    expect(screen.getByTestId('undo-button')).not.toHaveAttribute('aria-label', expect.stringMatching(/Unexpected Difficulties/));
  });

  it('does not redraw when a stack can end the attempt, or with 3 drawn', async () => {
    await openUdGame();
    await openAttempt();
    await start();
    await replyAs(mockRequests[0], 'probability');
    expect(mockRequests).toHaveLength(1);
    expect(saved('bot').botUsedUnexpectedDifficulties).toBeUndefined();
    await act(async () => {
      fireEvent.click(screen.getByTestId('attempt-done'));
    });
    await openAttempt();
    setField('attempt-bot-draw', '3');
    await start();
    await replyAs(mockRequests[1], 'cannot-fail');
    expect(mockRequests).toHaveLength(2);
    expect(saved('bot').attempt).toMatchObject({ phase: 'face', drawn: 3 });
    expect(saved('bot').botUsedUnexpectedDifficulties).toBeUndefined();
  });

  it('does not redraw on the random path', async () => {
    await openUdGame('');
    await openAttempt();
    await start();
    expect(mockRequests).toHaveLength(0);
    expect(saved('bot').attempt).toMatchObject({ phase: 'face', drawn: 9 });
    expect(saved('bot').botUsedUnexpectedDifficulties).toBeUndefined();
  });

  it('never redraws with the Chula pile', async () => {
    await openPopup('bot');
    await start();
    await replyAs(mockRequests[0], 'cannot-fail');
    expect(mockRequests).toHaveLength(1);
    expect(saved('bot').botUsedUnexpectedDifficulties).toBeUndefined();
  });
});
