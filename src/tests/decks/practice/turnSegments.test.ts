// The segments of a turn (#1605): play and draw, orders and discard, advanced by the next-turn button.
import {
  tableReducer,
  initialTableState,
  nextSegmentOf,
  CardInstance,
  MissionSlot,
  MISSION_SLOTS,
  TableState,
} from '../../../app/decks/practice/tableReducer';
import {
  gameReducer,
  gameLogText,
  initialGameState,
  isLogEntry,
  LogEntry,
  logByTurn,
  logEntryText,
} from '../../../app/decks/practice/gameLog';

const instance = (id: string, name: string, type = 'personnel', extra: Partial<CardInstance> = {}): CardInstance => ({
  id,
  card: { name, originalName: name, type },
  face: 'up',
  ...extra,
});

const hand = (n: number) => Array.from({ length: n }, (_, i) => instance(`h${i}`, `Card ${i}`, 'event'));

const slots = (): MissionSlot[] =>
  Array.from({ length: MISSION_SLOTS }, (_, i) => ({
    mission: i === 0 ? instance('m0', 'Moab IV', 'mission') : null,
    ships: [],
    awayTeam: i === 0 ? [instance('p1', 'Data', 'personnel', { stopped: true })] : [],
    underMission: [],
  }));

const table = (overrides: Partial<TableState> = {}): TableState => ({ ...initialTableState, missions: slots(), ...overrides });

const attempt = { type: 'startAttempt', missionIndex: 0, personnel: 1, subtract: 0 } as const;

describe('tableReducer: the segments of a turn (#1605)', () => {
  it('starts a new game, a reset and the next turn in play and draw', () => {
    expect(initialTableState.segment).toBe('playAndDraw');
    const reset = tableReducer(table({ segment: 'discard', turn: 4 }), { type: 'reset', cards: [], missions: [], dilemmas: [] });
    expect(reset.segment).toBe('playAndDraw');
    expect(tableReducer(table({ segment: 'orders' }), { type: 'nextTurn' }).segment).toBe('playAndDraw');
  });

  it('goes from play and draw to orders, and keeps the turn', () => {
    const next = tableReducer(table({ hand: hand(9) }), { type: 'advanceSegment' });
    expect(next.segment).toBe('orders');
    expect(next.turn).toBe(1);
    expect(next.missions[0].awayTeam[0].stopped).toBe(true);
  });

  it('goes from orders to the next turn with a hand of 7, and to discard with a hand of 8', () => {
    const seven = tableReducer(table({ segment: 'orders', hand: hand(7), rangeUsed: { s: 2 } }), { type: 'advanceSegment' });
    expect(seven).toMatchObject({ turn: 2, segment: 'playAndDraw' });
    expect(seven.missions[0].awayTeam[0].stopped).toBe(false);
    expect(seven.rangeUsed).toBeUndefined();
    const eight = tableReducer(table({ segment: 'orders', hand: hand(8) }), { type: 'advanceSegment' });
    expect(eight).toMatchObject({ turn: 1, segment: 'discard' });
  });

  it('goes from discard to the next turn whatever the hand holds', () => {
    for (const n of [3, 12]) {
      expect(tableReducer(table({ segment: 'discard', hand: hand(n) }), { type: 'advanceSegment' })).toMatchObject({
        turn: 2,
        segment: 'playAndDraw',
      });
    }
  });

  it('names where a tap goes', () => {
    expect(nextSegmentOf({ segment: 'playAndDraw', hand: hand(9) })).toBe('orders');
    expect(nextSegmentOf({ segment: 'orders', hand: hand(7) })).toBe('nextTurn');
    expect(nextSegmentOf({ segment: 'orders', hand: hand(8) })).toBe('discard');
    expect(nextSegmentOf({ segment: 'discard', hand: hand(8) })).toBe('nextTurn');
  });

  it('moves an attempt started in play and draw to orders, and leaves discard alone', () => {
    expect(tableReducer(table(), attempt).segment).toBe('orders');
    expect(tableReducer(table({ segment: 'discard' }), attempt).segment).toBe('discard');
    const refused = table();
    expect(tableReducer(refused, { ...attempt, missionIndex: 1 })).toBe(refused);
  });

  it('moves a bot attempt started in play and draw to orders', () => {
    const bot = tableReducer(table({ opponent: 'bot' }), {
      type: 'botAttempt',
      missionIndex: 0,
      personnel: 1,
      subtract: 0,
      botDraw: 0,
      botSpend: 0,
      pile: [],
      drawn: [],
      stack: [],
      random: false,
    });
    expect(bot.attempt).toBeDefined();
    expect(bot.segment).toBe('orders');
  });
});

describe('gameReducer and the log of the segments (#1605)', () => {
  it('makes one entry per advance, and one undo takes it back', () => {
    const toOrders = gameReducer(initialGameState(table()), { type: 'advanceSegment' });
    expect(toOrders.log).toEqual([{ kind: 'segment', to: 'orders', turn: 1, segment: 'orders' }]);
    expect(logEntryText(toOrders.log[0])).toBe('Went to orders');
    const nextTurn = gameReducer(toOrders, { type: 'advanceSegment' });
    expect(nextTurn.log[1]).toEqual({ kind: 'nextTurn', turn: 2, segment: 'playAndDraw' });
    expect(gameReducer(nextTurn, { type: 'undo' }).table.segment).toBe('orders');
  });

  it('takes back an attempt and its segment with one undo', () => {
    const started = gameReducer(initialGameState(table()), attempt);
    expect(started.log).toHaveLength(1);
    expect(started.log[0].segment).toBe('orders');
    const undone = gameReducer(started, { type: 'undo' });
    expect(undone.table.attempt).toBeUndefined();
    expect(undone.table.segment).toBe('playAndDraw');
  });

  it('heads the entries of each segment under their turn in the text', () => {
    const log: LogEntry[] = [
      { kind: 'score', delta: 5, score: 5, turn: 1, segment: 'playAndDraw' },
      { kind: 'segment', to: 'orders', turn: 1, segment: 'orders' },
      { kind: 'segment', to: 'discard', turn: 1, segment: 'discard' },
      { kind: 'nextTurn', turn: 2, segment: 'playAndDraw' },
    ];
    expect(gameLogText(log)).toBe(
      [
        'Turn 1',
        'Play and Draw Cards',
        '- Score +5 (now 5)',
        'Execute Orders',
        '- Went to orders',
        'Discard Excess Cards',
        '- Went to discard',
        '',
        'Turn 2',
        'Play and Draw Cards',
        '- Started turn 2',
      ].join('\n')
    );
  });

  it('reads an entry from before the segments as play and draw', () => {
    const old = { kind: 'score', delta: 5, score: 5, turn: 1 };
    expect(isLogEntry(old)).toBe(true);
    expect(logByTurn([old as LogEntry])[0].segments).toEqual([{ segment: 'playAndDraw', entries: [old] }]);
  });
});
