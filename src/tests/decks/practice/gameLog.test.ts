import {
  tableReducer,
  initialTableState,
  CardInstance,
  MissionSlot,
  MISSION_SLOTS,
  TableAction,
  TableState,
} from '../../../app/decks/practice/tableReducer';
import {
  gameReducer,
  gameLogText,
  GameAction,
  GameState,
  initialGameState,
  LogEntry,
  logEntryText,
  cardsText,
  EMPTY_LOG_TEXT,
  withShuffleOrders,
  segmentCounters,
  segmentTotalText,
  isLogEntry,
  effectiveLog,
  turnCharges,
  turnCounters,
  turnCounterLimit,
  tableLimitGrants,
  downloadedThisTurn,
  pendingDiscountsOf,
} from '../../../app/decks/practice/gameLog';

jest.mock('../../../app/decks/deckBuilderUtils', () => ({
  ...jest.requireActual('../../../app/decks/deckBuilderUtils'),
  shuffleArray: jest.fn((arr: unknown[]) => [...arr].reverse()),
}));

const card = (name: string, type = 'personnel', extra: Record<string, unknown> = {}) => ({ name, originalName: name, type, ...extra });

const instance = (id: string, name: string, face: 'up' | 'down' = 'up', type = 'personnel', extra = {}): CardInstance => ({
  id,
  card: card(name, type, extra),
  face,
});

const slots = (overrides: Partial<MissionSlot>[] = []): MissionSlot[] =>
  Array.from({ length: MISSION_SLOTS }, (_, i) => ({
    mission: null,
    ships: [],
    awayTeam: [],
    underMission: [],
    ...overrides[i],
  }));

const table = (overrides: Partial<TableState> = {}): TableState => ({ ...initialTableState, missions: slots(), ...overrides });

// Each action as the page dispatches it, with the result of its shuffles chosen first (#1401).
const run = (start: TableState, ...actions: GameAction[]): GameState =>
  actions.reduce((state, action) => gameReducer(state, withShuffleOrders(state.table, action)), initialGameState(start));

const onlyEntry = (state: GameState): LogEntry => {
  expect(state.log).toHaveLength(1);
  return state.log[0];
};

describe('gameReducer: which actions make an entry (#1065)', () => {
  const data = instance('c1', 'Data');
  const worf = instance('c2', 'Worf');
  const excavation = instance('m1', 'Excavation', 'up', 'mission', { backimagefile: 'back' });

  it('logs a draw from the draw deck as an unseen card, under turn 1', () => {
    const state = run(table({ drawDeck: [instance('d1', 'Secret', 'down')] }), { type: 'drawCard', from: 'drawDeck', to: 'hand' });
    const entry = onlyEntry(state);
    expect(entry).toEqual({ kind: 'draw', from: 'drawDeck', to: 'hand', turn: 1, segment: 'playAndDraw', cost: 1 });
    expect(logEntryText(entry)).toBe('Drew a card from the draw deck into the hand (cost 1)');
    expect(JSON.stringify(entry)).not.toContain('Secret');
  });

  it('logs a dilemma draw', () => {
    const state = run(table({ dilemmaPile: [instance('d1', 'Secret', 'down', 'dilemma')] }), {
      type: 'drawCard',
      from: 'dilemmaPile',
      to: 'dilemmaHand',
    });
    expect(logEntryText(onlyEntry(state))).toBe('Drew a dilemma from the dilemma pile into the dilemma hand');
  });

  it('makes no entry for a draw from an empty deck', () => {
    const start = initialGameState(table());
    expect(gameReducer(start, { type: 'drawCard', from: 'drawDeck', to: 'hand' })).toBe(start);
  });

  it('logs a move with the card, the source and the destination', () => {
    // In orders, so the move is no play (#1606).
    const state = run(table({ hand: [data], segment: 'orders' }), { type: 'move', id: 'c1', to: 'core' });
    expect(logEntryText(onlyEntry(state))).toBe('Moved Data from the hand to the core');
  });

  it('names the mission of an away team, and the slot number of a slot with no mission card', () => {
    const state = run(
      table({ hand: [data, worf], missions: slots([{ mission: excavation }]), segment: 'orders' }),
      { type: 'move', id: 'c1', to: { zone: 'missionPile', missionIndex: 0, pile: 'awayTeam' } },
      { type: 'move', id: 'c2', to: { zone: 'missionPile', missionIndex: 1, pile: 'awayTeam' } }
    );
    expect(state.log.map(logEntryText)).toEqual([
      'Moved Data from the hand to the away team at Excavation',
      'Moved Worf from the hand to the away team at Mission 2',
    ]);
  });

  it('makes one entry for a batch of moves, with a table equal to sequential tableReducer calls', () => {
    const start = table({ hand: [data, worf] });
    const actions: TableAction[] = [
      { type: 'move', id: 'c1', to: 'discard' },
      { type: 'move', id: 'c2', to: 'discard' },
    ];
    const state = run(start, { type: 'batch', actions });
    expect(state.table).toEqual(actions.reduce(tableReducer, start));
    expect(logEntryText(onlyEntry(state))).toBe('Moved Data and Worf from the hand to the discard pile');
  });

  it('lists each destination of a batch whose cards went to different places', () => {
    const ship = instance('s1', 'Enterprise', 'up', 'ship');
    const state = run(table({ core: [data, ship], missions: slots([{ mission: excavation }]) }), {
      type: 'batch',
      actions: [
        { type: 'move', id: 'c1', to: { zone: 'missionPile', missionIndex: 0, pile: 'awayTeam' } },
        { type: 'move', id: 's1', to: { zone: 'shipRow', missionIndex: 0 } },
      ],
    });
    expect(logEntryText(onlyEntry(state))).toBe(
      'Moved Data from the core to the away team at Excavation; Enterprise from the core to Excavation'
    );
  });

  it('names a ship row by its mission alone, so a move between missions reads "from X to Y" (#1633)', () => {
    const ship = instance('s1', 'Enterprise', 'up', 'ship');
    const moab = instance('m2', 'Moab IV', 'up', 'mission', { backimagefile: 'back' });
    const start = table({ missions: slots([{ mission: excavation, ships: [ship] }, { mission: moab }]) });
    const state = run(start, { type: 'move', id: 's1', to: { zone: 'shipRow', missionIndex: 1 } });
    expect(logEntryText(onlyEntry(state))).toBe('Moved Enterprise from Excavation to Moab IV (used range 0, 0 left)');
  });

  it('says "a card" for an unseen batch, and names the end of an ordered pile', () => {
    const state = run(table({ drawDeck: [instance('d1', 'Secret', 'down')] }), {
      type: 'batch',
      actions: [{ type: 'move', id: 'd1', to: 'core' }],
      unseen: true,
    });
    expect(logEntryText(onlyEntry(state))).toBe('Moved a card from the draw deck to the core');

    const top = run(table({ hand: [data, worf] }), {
      type: 'batch',
      // A 'top' drop dispatches the group in reverse; the entry reads in the group's order.
      actions: [
        { type: 'move', id: 'c2', to: 'drawDeck', position: 'top' },
        { type: 'move', id: 'c1', to: 'drawDeck', position: 'top' },
      ],
    });
    expect(logEntryText(onlyEntry(top))).toBe('Moved Data and Worf from the hand to the top of the draw deck');
  });

  it('logs a download as one entry: the cards taken, then the shuffle', () => {
    const state = run(table({ drawDeck: [data, worf, instance('c3', 'Riker')] }), {
      type: 'batch',
      actions: [
        { type: 'move', id: 'c1', to: 'hand' },
        { type: 'shuffle', location: 'drawDeck' },
      ],
    });
    expect(logEntryText(onlyEntry(state))).toBe('Moved Data from the draw deck to the hand, then shuffled the draw deck');
  });

  it('makes no entry for a drop back in the same zone, a refused move, or a batch of them', () => {
    const start = table({ hand: [data, worf], core: [instance('e1', 'Event', 'up', 'event')] });
    expect(run(start, { type: 'move', id: 'c1', to: 'hand' }).log).toEqual([]);
    expect(run(start, { type: 'move', id: 'c1', to: { zone: 'on', targetId: 'c1' } }).log).toEqual([]);
    expect(run(start, { type: 'move', id: 'nope', to: 'core' }).log).toEqual([]);
    expect(
      run(start, {
        type: 'batch',
        actions: [
          { type: 'move', id: 'c1', to: 'hand' },
          { type: 'move', id: 'c2', to: 'hand' },
        ],
      }).log
    ).toEqual([]);
  });

  it('names the card placed on', () => {
    const state = run(table({ hand: [data], core: [instance('e1', 'Event', 'up', 'event')], segment: 'orders' }), {
      type: 'move',
      id: 'c1',
      to: { zone: 'on', targetId: 'e1' },
    });
    expect(logEntryText(onlyEntry(state))).toBe('Moved Data from the hand to the cards on Event');
  });

  it('logs a flip of a selection as one entry with each new face', () => {
    const state = run(table({ core: [data, instance('c2', 'Worf', 'down')] }), {
      type: 'batch',
      actions: [
        { type: 'flip', id: 'c1' },
        { type: 'flip', id: 'c2' },
      ],
    });
    expect(logEntryText(onlyEntry(state))).toBe('Turned Worf face up; Data face down');
  });

  it('makes no entry for a refused flip', () => {
    expect(run(table({ missions: slots([{ mission: excavation }]) }), { type: 'flip', id: 'm1' }).log).toEqual([]);
  });

  it('logs a mission flip, and none for a mission with no back', () => {
    const state = run(table({ missions: slots([{ mission: excavation }]) }), { type: 'flipMission', id: 'm1' });
    expect(logEntryText(onlyEntry(state))).toBe('Flipped Excavation to its back');
    const plain = instance('m2', 'Plain', 'up', 'mission');
    expect(run(table({ missions: slots([{ mission: plain }]) }), { type: 'flipMission', id: 'm2' }).log).toEqual([]);
  });

  it('logs a shuffle without the result, and none for fewer than two cards', () => {
    const state = run(table({ drawDeck: [data, worf] }), { type: 'shuffle', location: 'drawDeck' });
    const entry = onlyEntry(state);
    expect(logEntryText(entry)).toBe('Shuffled the draw deck');
    expect(JSON.stringify(entry)).not.toContain('Data');
    expect(run(table({ drawDeck: [data] }), { type: 'shuffle', location: 'drawDeck' }).log).toEqual([]);
  });

  it('logs a reorder of the dilemma stack without card names, and none for a drop on itself', () => {
    const start = table({ dilemmaStack: [instance('x1', 'A', 'down'), instance('x2', 'B', 'down')] });
    expect(logEntryText(onlyEntry(run(start, { type: 'reorder', zone: 'dilemmaStack', id: 'x1', overId: 'x2' })))).toBe(
      'Reordered the dilemma stack'
    );
    expect(run(start, { type: 'reorder', zone: 'dilemmaStack', id: 'x1', overId: 'x1' }).log).toEqual([]);
  });

  it('logs only the cards whose stopped flag changed', () => {
    const state = run(table({ core: [data, { ...worf, stopped: true }] }), { type: 'setStopped', ids: ['c1', 'c2'], stopped: true });
    expect(logEntryText(onlyEntry(state))).toBe('Stopped Data');
    expect(run(table({ core: [data] }), { type: 'setStopped', ids: ['c1'], stopped: false }).log).toEqual([]);
  });

  it('logs only the cards whose removed-from-game flag changed (#1564)', () => {
    const start = table({ discard: [data, { ...worf, removedFromGame: true }] });
    const state = run(start, { type: 'setRemovedFromGame', ids: ['c1', 'c2'], removedFromGame: true });
    expect(logEntryText(onlyEntry(state))).toBe('Removed Data from the game');
    expect(logEntryText(onlyEntry(run(start, { type: 'setRemovedFromGame', ids: ['c2'], removedFromGame: false })))).toBe(
      'Returned Worf to the game'
    );
    expect(run(table({ discard: [data] }), { type: 'setRemovedFromGame', ids: ['c1'], removedFromGame: false }).log).toEqual([]);
  });

  it('logs a mission completion, and none for the value it already holds', () => {
    const start = table({ missions: slots([{ mission: excavation }]) });
    const state = run(start, { type: 'setMissionCompleted', missionIndex: 0, completed: true });
    expect(logEntryText(onlyEntry(state))).toBe('Marked Excavation complete');
    expect(run(start, { type: 'setMissionCompleted', missionIndex: 0, completed: false }).log).toEqual([]);
  });

  it('logs a score change, and none for a change clamped to the same score', () => {
    expect(logEntryText(onlyEntry(run(table({ score: 30 }), { type: 'adjustScore', delta: 5 })))).toBe('Score +5 (now 35)');
    expect(logEntryText(onlyEntry(run(table({ score: 30 }), { type: 'adjustScore', delta: -5 })))).toBe('Score -5 (now 25)');
    expect(run(table({ score: 0 }), { type: 'adjustScore', delta: -5 }).log).toEqual([]);
  });

  it('puts the next turn entry and every later entry under the new turn', () => {
    const state = run(table({ hand: [data] }), { type: 'nextTurn' }, { type: 'move', id: 'c1', to: 'core' });
    expect(state.log.map((e) => e.turn)).toEqual([2, 2]);
    expect(logEntryText(state.log[0])).toBe('Started turn 2');
  });

  it('empties the log on reset, resetWithPiles and restore, with no entry of its own', () => {
    const played = run(table({ hand: [data] }), { type: 'move', id: 'c1', to: 'core' });
    expect(played.log).toHaveLength(1);
    expect(gameReducer(played, { type: 'reset', cards: [], missions: [], dilemmas: [] }).log).toEqual([]);
    expect(gameReducer(played, { type: 'resetWithPiles', cards: [], missions: [], dilemmas: [] }).log).toEqual([]);
    const restored = gameReducer(played, { type: 'restore', state: table() });
    expect(restored.log).toEqual([]);
    expect(restored.table).toEqual(table());
  });

  it('takes the log a restore carries, with no undo snapshot (#1400)', () => {
    const saved: LogEntry[] = [{ kind: 'nextTurn', turn: 2 }, { kind: 'score', delta: 5, score: 5, turn: 2 }];
    const restored = gameReducer(initialGameState(table()), { type: 'restore', state: table({ hand: [data] }), log: saved });
    expect(restored.log).toEqual(saved);
    expect(restored.undo).toEqual([]);
    expect(restored.table.hand).toEqual([data]);
  });
});

describe('the text of the game log (#1065)', () => {
  it('joins card names, and counts the unseen ones', () => {
    expect(cardsText(['Data'])).toBe('Data');
    expect(cardsText(['Data', 'Worf', 'Riker'])).toBe('Data, Worf and Riker');
    expect(cardsText([null])).toBe('a card');
    expect(cardsText([null, null])).toBe('2 cards');
    expect(cardsText(['Data', null])).toBe('Data and a card');
  });

  it('renders each place by its name', () => {
    const text = (to: Parameters<typeof logEntryText>[0]) => logEntryText(to);
    expect(
      text({
        kind: 'move',
        turn: 1,
        moves: [
          { cards: ['Data'], from: { kind: 'crew', ship: 'Enterprise' }, to: { kind: 'underMission', mission: 'Excavation' } },
          { cards: ['Worf'], from: { kind: 'brig' }, to: { kind: 'dilemmaPile' }, position: 'bottom' },
        ],
      })
    ).toBe(
      'Moved Data from the crew of Enterprise to the pile under Excavation; Worf from the brig to the bottom of the dilemma pile'
    );
    expect(text({ kind: 'stopped', turn: 1, cards: ['Data', 'Worf'], stopped: false })).toBe('Unstopped Data and Worf');
    expect(text({ kind: 'missionCompleted', turn: 1, mission: 'Excavation', completed: false })).toBe(
      'Marked Excavation not complete'
    );
    expect(text({ kind: 'reorder', turn: 1, zone: 'drawDeck' })).toBe('Reordered the top of the draw deck');
    expect(text({ kind: 'shuffle', turn: 1, place: { kind: 'awayTeam', mission: 'Excavation' } })).toBe(
      'Shuffled the away team at Excavation'
    );
  });

  it('groups the whole log by turn, oldest first', () => {
    const log: LogEntry[] = [
      { kind: 'draw', turn: 1, from: 'drawDeck', to: 'hand' },
      { kind: 'shuffle', turn: 1, place: { kind: 'drawDeck' } },
      { kind: 'nextTurn', turn: 2 },
      { kind: 'score', turn: 2, delta: 5, score: 5 },
    ];
    expect(gameLogText(log)).toBe(
      [
        'Turn 1',
        'Play and Draw Cards',
        '- Drew a card from the draw deck into the hand',
        '- Shuffled the draw deck',
        '',
        'Turn 2',
        'Play and Draw Cards',
        '- Started turn 2',
        '- Score +5 (now 5)',
      ].join('\n')
    );
  });

  it('says so for an empty log', () => {
    expect(gameLogText([])).toBe(EMPTY_LOG_TEXT);
  });
});

describe('gameReducer: undo (#1194)', () => {
  const data = instance('c1', 'Data');
  const worf = instance('c2', 'Worf');
  const riker = instance('c3', 'Riker');
  const moab = instance('m1', 'Moab IV', 'up', 'mission');

  it('goes back to the table from before a move, and drops its entry', () => {
    const start = table({ hand: [data] });
    const moved = run(start, { type: 'nextTurn' }, { type: 'move', id: 'c1', to: 'core' });
    const undone = gameReducer(moved, { type: 'undo' });
    expect(undone.table).toBe(moved.undo[1]);
    expect(undone.table.hand).toEqual([data]);
    expect(undone.table.core).toEqual([]);
    expect(undone.log.map(logEntryText)).toEqual(['Started turn 2']);
    expect(undone.undo).toHaveLength(1);
  });

  it('brings back the order from before a shuffle, and the faces of a shuffled dilemma pile', () => {
    const shuffledDeck = run(table({ drawDeck: [data, worf, riker] }), { type: 'shuffle', location: 'drawDeck' });
    expect(shuffledDeck.table.drawDeck.map((c) => c.id)).toEqual(['c3', 'c2', 'c1']);
    expect(gameReducer(shuffledDeck, { type: 'undo' }).table.drawDeck.map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);

    const pile = [instance('d1', 'Up', 'up', 'dilemma'), instance('d2', 'Down', 'down', 'dilemma')];
    const shuffledPile = run(table({ dilemmaPile: pile }), { type: 'shuffle', location: 'dilemmaPile' });
    expect(shuffledPile.table.dilemmaPile.every((c) => c.face === 'down')).toBe(true);
    expect(gameReducer(shuffledPile, { type: 'undo' }).table.dilemmaPile).toEqual(pile);
  });

  it('undoes a draw that shuffled the dilemma pile, the draw and the shuffle as one step (#1283)', () => {
    const pile = [instance('d1', 'Up', 'up', 'dilemma'), instance('d2', 'Down', 'down', 'dilemma'), instance('d3', 'Low', 'up', 'dilemma')];
    const start = table({ dilemmaPile: pile });
    const drawn = run(start, { type: 'drawCard', from: 'dilemmaPile', to: 'dilemmaHand' });
    // The mocked shuffleArray reverses the pile.
    expect(drawn.table.dilemmaHand.map((c) => c.id)).toEqual(['d3']);
    expect(drawn.table.dilemmaPile.every((c) => c.face === 'down')).toBe(true);
    expect(drawn.log.map(logEntryText)).toEqual([
      'Shuffled the dilemma pile, then drew a dilemma from the dilemma pile into the dilemma hand',
    ]);

    const undone = gameReducer(drawn, { type: 'undo' });
    expect(undone.table).toEqual(start);
    expect(undone.log).toEqual([]);
  });

  it('undoes a download, its moves and its shuffle, as one step', () => {
    const start = table({ drawDeck: [data, worf, riker] });
    const downloaded = run(start, {
      type: 'batch',
      actions: [
        { type: 'move', id: 'c1', to: 'hand' },
        { type: 'shuffle', location: 'drawDeck' },
      ],
    });
    const undone = gameReducer(downloaded, { type: 'undo' });
    expect(undone.table).toBe(start);
    expect(undone.log).toEqual([]);
  });

  it('goes back across the next turn and a whole attempt, one entry at a time', () => {
    const start = table({
      turn: 1,
      missions: slots([{ mission: moab, awayTeam: [{ ...data, stopped: true }] }]),
      dilemmaPile: [instance('d1', 'Dilemma', 'down', 'dilemma')],
    });
    const actions: GameAction[] = [
      { type: 'nextTurn' },
      { type: 'startAttempt', missionIndex: 0, personnel: 1, subtract: 0 },
      { type: 'drawCard', from: 'dilemmaPile', to: 'dilemmaHand', counted: true },
      { type: 'setAttemptPhase', phase: 'face' },
      { type: 'endAttempt' },
    ];
    const states = actions.reduce<GameState[]>((acc, a) => [...acc, gameReducer(acc[acc.length - 1], a)], [initialGameState(start)]);
    expect(states[states.length - 1].log).toHaveLength(actions.length);
    for (let i = states.length - 1; i > 0; i--) {
      const undone = gameReducer(states[i], { type: 'undo' });
      expect(undone.table).toBe(states[i - 1].table);
      expect(undone.log).toEqual(states[i - 1].log);
    }
  });

  it('does nothing with an empty log, nor after a reset or a restore', () => {
    const empty = initialGameState(table({ hand: [data] }));
    expect(gameReducer(empty, { type: 'undo' })).toBe(empty);
    const played = run(table({ hand: [data] }), { type: 'move', id: 'c1', to: 'core' });
    const restored = gameReducer(played, { type: 'restore', state: table() });
    expect(restored.undo).toEqual([]);
    expect(gameReducer(restored, { type: 'undo' })).toBe(restored);
    const reset = gameReducer(played, { type: 'reset', cards: [], missions: [], dilemmas: [] });
    expect(reset.undo).toEqual([]);
  });

  it('after a restore with a log, undoes only the entries made since, and then nothing (#1400)', () => {
    const saved: LogEntry[] = [{ kind: 'nextTurn', turn: 2 }];
    const restored = gameReducer(initialGameState(table()), { type: 'restore', state: table({ hand: [data] }), log: saved });
    expect(gameReducer(restored, { type: 'undo' })).toBe(restored);
    const moved = gameReducer(restored, { type: 'move', id: 'c1', to: 'core' });
    expect(moved.log).toHaveLength(2);
    expect(moved.undo).toHaveLength(1);
    const undone = gameReducer(moved, { type: 'undo' });
    expect(undone.log).toEqual(saved);
    expect(undone.undo).toEqual([]);
    expect(undone.table.hand).toEqual([data]);
    expect(gameReducer(undone, { type: 'undo' })).toBe(undone);
  });

  it('keeps one snapshot per entry, and none for an action that makes no entry', () => {
    const state = run(
      table({ hand: [data, worf], drawDeck: [riker, instance('c4', 'Troi')] }),
      { type: 'move', id: 'c1', to: 'hand' },
      { type: 'move', id: 'c1', to: 'core' },
      { type: 'move', id: 'nope', to: 'core' },
      { type: 'shuffle', location: 'drawDeck' },
      { type: 'drawCard', from: 'drawDeck', to: 'hand' }
    );
    expect(state.log).toHaveLength(3);
    expect(state.undo).toHaveLength(3);
  });

  it('keeps the shuffle order out of the text of the log', () => {
    const state = run(table({ drawDeck: [data, worf, riker] }), { type: 'shuffle', location: 'drawDeck' });
    const text = gameLogText(state.log);
    expect(text).toBe('Turn 1\nPlay and Draw Cards\n- Shuffled the draw deck');
    expect(JSON.stringify(state.log)).not.toMatch(/c1|c2|c3|Data|Worf|Riker/);
  });
});

describe('gameReducer: redo (#1403)', () => {
  const data = instance('c1', 'Data');
  const worf = instance('c2', 'Worf');
  const riker = instance('c3', 'Riker');

  it('puts back the table a move left, and its entry', () => {
    const moved = run(table({ hand: [data] }), { type: 'move', id: 'c1', to: 'core' });
    const undone = gameReducer(moved, { type: 'undo' });
    expect(undone.redo).toHaveLength(1);
    const redone = gameReducer(undone, { type: 'redo' });
    expect(redone.table).toBe(moved.table);
    expect(redone.log).toEqual(moved.log);
    expect(redone.undo).toEqual(moved.undo);
    expect(redone.redo).toEqual([]);
  });

  it('puts back the order of a shuffle, and never shuffles again', () => {
    const shuffled = run(table({ drawDeck: [data, worf, riker] }), { type: 'shuffle', location: 'drawDeck' });
    const undone = gameReducer(shuffled, { type: 'undo' });
    const redone = gameReducer(undone, { type: 'redo' });
    expect(redone.table).toBe(shuffled.table);
    expect(redone.table.drawDeck.map((c) => c.id)).toEqual(['c3', 'c2', 'c1']);
  });

  it('redoes two undos in reverse order, back to the state before the first undo', () => {
    const played = run(table({ hand: [data, worf] }), { type: 'move', id: 'c1', to: 'core' }, { type: 'move', id: 'c2', to: 'brig' });
    const undone = [{ type: 'undo' } as const, { type: 'undo' } as const].reduce(gameReducer, played);
    expect(undone.log).toEqual([]);
    const once = gameReducer(undone, { type: 'redo' });
    expect(once.log.map(logEntryText)).toEqual([logEntryText(played.log[0])]);
    const twice = gameReducer(once, { type: 'redo' });
    expect(twice).toEqual(played);
    expect(twice.table).toBe(played.table);
  });

  it('empties the redo history on a new action, and keeps it on an action that changes nothing', () => {
    const undone = gameReducer(run(table({ hand: [data, worf] }), { type: 'move', id: 'c1', to: 'core' }), { type: 'undo' });
    expect(gameReducer(undone, { type: 'move', id: 'nope', to: 'core' })).toBe(undone);
    const moved = gameReducer(undone, { type: 'move', id: 'c2', to: 'brig' });
    expect(moved.redo).toEqual([]);
    expect(gameReducer(moved, { type: 'redo' })).toBe(moved);
  });

  it('empties the redo history on a table change that makes no entry', () => {
    const undone = gameReducer(run(table({ hand: [data], drawDeck: [worf] }), { type: 'move', id: 'c1', to: 'core' }), { type: 'undo' });
    // A shuffle of one card makes no entry, but it is still a new table.
    const unlogged = gameReducer(undone, { type: 'shuffle', location: 'drawDeck' });
    expect(unlogged.table).not.toBe(undone.table);
    expect(unlogged.log).toEqual(undone.log);
    expect(unlogged.redo).toEqual([]);
  });

  it('does nothing with nothing to redo, and a reset empties the history', () => {
    const empty = initialGameState(table({ hand: [data] }));
    expect(gameReducer(empty, { type: 'redo' })).toBe(empty);
    const undone = gameReducer(run(table({ hand: [data] }), { type: 'move', id: 'c1', to: 'core' }), { type: 'undo' });
    expect(gameReducer(undone, { type: 'reset', cards: [], missions: [], dilemmas: [] }).redo).toEqual([]);
  });
});

describe('the cost of a play and a draw (#1606)', () => {
  const goran = instance('c1', 'Goran', 'up', 'personnel', { cost: '3' });
  const worf = instance('c2', 'Worf', 'up', 'personnel', { cost: '2' });
  const enterprise = instance('s1', 'Enterprise', 'up', 'ship', { cost: '4' });
  const interrupt = instance('i1', 'Lucky Shot', 'up', 'interrupt', { cost: '0' });
  const earth = instance('m1', 'Earth', 'up', 'mission');
  const awayTeam = { zone: 'missionPile', missionIndex: 0, pile: 'awayTeam' } as const;
  const start = (overrides: Partial<TableState> = {}) =>
    table({
      hand: [goran, worf, enterprise, interrupt],
      drawDeck: [instance('d1', 'Secret', 'down'), instance('d2', 'Other', 'down')],
      missions: slots([{ mission: earth }]),
      ...overrides,
    });

  it('logs a play from the hand with its printed cost, and a cost of 0 too', () => {
    const state = run(
      start(),
      { type: 'move', id: 'c1', to: awayTeam },
      { type: 'move', id: 's1', to: { zone: 'shipRow', missionIndex: 0 } },
      { type: 'move', id: 'i1', to: 'core' }
    );
    expect(state.log.map(logEntryText)).toEqual([
      'Played Goran at Earth (cost 3)',
      'Played Enterprise at Earth (cost 4)',
      'Played Lucky Shot to the core (cost 0)',
    ]);
  });

  it('logs a play on a card and into a crew', () => {
    const state = run(
      start({ hand: [goran, worf], missions: slots([{ mission: earth, ships: [enterprise] }]) }),
      { type: 'move', id: 'c1', to: { zone: 'crew', shipId: 's1' } },
      { type: 'move', id: 'c2', to: { zone: 'on', targetId: 'm1' } }
    );
    expect(state.log.map(logEntryText)).toEqual([
      'Played Goran to the crew of Enterprise (cost 3)',
      'Played Worf on Earth (cost 2)',
    ]);
  });

  it('gives a group drag one entry that lists the cost of each card', () => {
    const state = run(start(), {
      type: 'batch',
      actions: [
        { type: 'move', id: 'c1', to: awayTeam },
        { type: 'move', id: 'c2', to: awayTeam },
      ],
    });
    expect(logEntryText(onlyEntry(state))).toBe('Played Goran and Worf at Earth (Goran cost 3; Worf cost 2)');
  });

  it('reads a mixed batch with a verb for each kind of move', () => {
    const state = run(start(), {
      type: 'batch',
      actions: [
        { type: 'move', id: 'c1', to: 'discard' },
        { type: 'move', id: 'c2', to: awayTeam },
      ],
    });
    expect(logEntryText(onlyEntry(state))).toBe('Moved Goran from the hand to the discard pile; played Worf at Earth (cost 2)');
  });

  it('classifies each move of a batch against the table the earlier moves left', () => {
    // The first move takes Goran out of the hand, so the second, from the away team, is no play.
    const action = withShuffleOrders(start(), {
      type: 'batch',
      actions: [
        { type: 'move', id: 'c1', to: awayTeam },
        { type: 'move', id: 'c1', to: 'core' },
      ],
    });
    expect(action.type === 'batch' && action.actions.map((a) => (a.type === 'move' ? a.cost : 'x'))).toEqual([3, undefined]);
  });

  it('charges nothing in orders and discard, nor for a card that did not come from the hand', () => {
    for (const segment of ['orders', 'discard'] as const) {
      const state = run(start({ segment }), { type: 'move', id: 'c1', to: awayTeam }, { type: 'drawCard', from: 'drawDeck', to: 'hand' });
      expect(state.log.map(logEntryText)).toEqual([
        'Moved Goran from the hand to the away team at Earth',
        'Drew a card from the draw deck into the hand',
      ]);
    }
    const fromTable = run(
      start({ hand: [], missions: slots([{ mission: earth, ships: [enterprise], awayTeam: [goran] }]) }),
      { type: 'move', id: 'c1', to: { zone: 'crew', shipId: 's1' } }
    );
    expect(logEntryText(onlyEntry(fromTable))).toBe('Moved Goran from the away team at Earth to the crew of Enterprise');
  });

  it('charges nothing for a move from the hand to the brig or a refused move', () => {
    const state = run(start(), { type: 'move', id: 'c1', to: 'brig' });
    expect(logEntryText(onlyEntry(state))).toBe('Moved Goran from the hand to the brig');
  });

  it("shows the turn's total under its play and draw heading, and undo takes a draw off it", () => {
    const played = run(
      start(),
      { type: 'move', id: 's1', to: { zone: 'shipRow', missionIndex: 0 } },
      { type: 'drawCard', from: 'drawDeck', to: 'hand' }
    );
    expect(segmentCounters(played.log)).toEqual({ cards: 4, draws: 1 });
    expect(gameLogText(played.log)).toBe(
      'Turn 1\nPlay and Draw Cards\n5 counters: 4 on cards, 1 on draws\n- Played Enterprise at Earth (cost 4)\n- Drew a card from the draw deck into the hand (cost 1)'
    );
    const undone = gameReducer(played, { type: 'undo' });
    expect(segmentCounters(undone.log)).toEqual({ cards: 4, draws: 0 });
    expect(gameLogText(undone.log)).toContain('4 counters: 4 on cards, 0 on draws');
  });

  it('keeps each turn apart, and shows no total for a segment that charged nothing', () => {
    const state = run(
      start(),
      { type: 'drawCard', from: 'drawDeck', to: 'hand' },
      { type: 'advanceSegment' },
      { type: 'move', id: 'c1', to: awayTeam },
      { type: 'nextTurn' },
      { type: 'move', id: 'c2', to: 'discard' }
    );
    expect(gameLogText(state.log)).toBe(
      'Turn 1\nPlay and Draw Cards\n1 counter: 0 on cards, 1 on draws\n- Drew a card from the draw deck into the hand (cost 1)\n' +
        'Execute Orders\n- Went to orders\n- Moved Goran from the hand to the away team at Earth\n\n' +
        'Turn 2\nPlay and Draw Cards\n- Started turn 2\n- Moved Worf from the hand to the discard pile'
    );
  });

  it('reads an entry with no cost, or a malformed one, as before', () => {
    const old: LogEntry = { kind: 'move', turn: 1, moves: [{ cards: ['Data'], from: { kind: 'hand' }, to: { kind: 'core' } }] };
    const malformed = { ...old, moves: [{ ...old.moves[0], costs: ['x'] }] } as unknown as LogEntry;
    expect(logEntryText(old)).toBe('Moved Data from the hand to the core');
    expect(logEntryText(malformed)).toBe('Moved Data from the hand to the core');
    expect(segmentCounters([old, malformed])).toBeNull();
  });
});

describe('the corrections of the turn\'s counters (#1607)', () => {
  const goran = instance('c1', 'Goran', 'up', 'personnel', { cost: '3' });
  const worf = instance('c2', 'Worf', 'up', 'personnel', { cost: '2' });
  const enterprise = instance('s1', 'Enterprise', 'up', 'ship', { cost: '4' });
  const earth = instance('m1', 'Earth', 'up', 'mission');
  const awayTeam = { zone: 'missionPile', missionIndex: 0, pile: 'awayTeam' } as const;
  const start = () =>
    table({
      hand: [goran, worf, enterprise],
      drawDeck: [instance('d1', 'Secret', 'down'), instance('d2', 'Other', 'down')],
      missions: slots([{ mission: earth }]),
    });
  const played = () =>
    run(
      start(),
      { type: 'move', id: 's1', to: { zone: 'shipRow', missionIndex: 0 } },
      { type: 'batch', actions: [{ type: 'move', id: 'c1', to: awayTeam }, { type: 'move', id: 'c2', to: awayTeam }] },
      { type: 'drawCard', from: 'drawDeck', to: 'hand' }
    );
  const apply = (state: GameState, ...actions: GameAction[]) =>
    actions.reduce((s, a) => gameReducer(s, withShuffleOrders(s.table, a)), state);

  it('counts the turn\'s charges against a limit of 7', () => {
    const state = played();
    expect(turnCounters(state.log, 1)).toEqual({ spent: 10, limit: 7, grants: [] });
    expect(turnCharges(state.log, 1).map((c) => [c.draw ? 'draw' : c.card, c.cost])).toEqual([
      ['Enterprise', 4],
      ['Goran', 3],
      ['Worf', 2],
      ['draw', 1],
    ]);
  });

  it('corrects a single-card move, and the play then reads the corrected cost', () => {
    const state = apply(played(), { type: 'correctCharge', target: { entry: 0, move: 0, card: 0 }, cost: 0 });
    expect(logEntryText(state.log[3])).toBe('Charged Enterprise 0 counters (was 4)');
    expect(logEntryText(effectiveLog(state.log)[0])).toBe('Played Enterprise at Earth (cost 0)');
    expect(logEntryText(effectiveLog(state.log)[1])).toBe('Played Goran and Worf at Earth (Goran cost 3; Worf cost 2)');
    expect(turnCounters(state.log, 1).spent).toBe(6);
    expect(gameLogText(state.log)).toContain('Played Enterprise at Earth (cost 0)');
    expect(gameLogText(state.log)).toContain('6 counters: 5 on cards, 1 on draws');
  });

  it('corrects one card of a multi-card move, and a draw', () => {
    const state = apply(
      played(),
      { type: 'correctCharge', target: { entry: 1, move: 0, card: 1 }, cost: 3 },
      { type: 'correctCharge', target: { entry: 2 }, cost: 0 }
    );
    const log = effectiveLog(state.log);
    expect(logEntryText(log[1])).toBe('Played Goran and Worf at Earth (Goran cost 3; Worf cost 3)');
    expect(logEntryText(log[2])).toBe('Drew a card from the draw deck into the hand (cost 0)');
    expect(logEntryText(state.log[4])).toBe('Charged a draw 0 counters (was 1)');
    expect(segmentCounters(log.slice(0, 3))).toEqual({ cards: 10, draws: 0 });
  });

  it('applies the last correction of a charge, and floors a charge at 0', () => {
    const state = apply(
      played(),
      { type: 'correctCharge', target: { entry: 0, move: 0, card: 0 }, cost: 2 },
      { type: 'correctCharge', target: { entry: 0, move: 0, card: 0 }, cost: -1 }
    );
    expect(state.log.map(logEntryText).slice(3)).toEqual([
      'Charged Enterprise 2 counters (was 4)',
      'Charged Enterprise 0 counters (was 2)',
    ]);
    // Another minus at 0 changes nothing and makes no entry.
    expect(apply(state, { type: 'correctCharge', target: { entry: 0, move: 0, card: 0 }, cost: -1 })).toBe(state);
  });

  it('makes no entry for a target that names no charge', () => {
    const state = played();
    expect(apply(state, { type: 'correctCharge', target: { entry: 9 }, cost: 0 })).toBe(state);
    expect(apply(state, { type: 'correctCharge', target: { entry: 0, move: 0, card: 5 }, cost: 0 })).toBe(state);
  });

  it('corrects the play and draw total from the orders segment', () => {
    const state = apply(played(), { type: 'advanceSegment' }, { type: 'correctCharge', target: { entry: 0, move: 0, card: 0 }, cost: 1 });
    expect(state.log[4]).toMatchObject({ kind: 'chargeCorrected', segment: 'orders' });
    expect(segmentTotalText('playAndDraw', effectiveLog(state.log).slice(0, 3))).toBe('7 counters: 6 on cards, 1 on draws');
    expect(gameLogText(state.log)).toContain('7 counters: 6 on cards, 1 on draws');
    expect(turnCounters(state.log, 1).spent).toBe(7);
  });

  it('takes back a correction with one undo and the play with a second, and redo puts both back', () => {
    const corrected = apply(played(), { type: 'correctCharge', target: { entry: 0, move: 0, card: 0 }, cost: 0 });
    const once = apply(corrected, { type: 'undo' });
    expect(once.table).toBe(corrected.table);
    expect(turnCounters(once.log, 1).spent).toBe(10);
    const twice = apply(once, { type: 'undo' });
    expect(twice.log).toHaveLength(2);
    const redone = apply(twice, { type: 'redo' }, { type: 'redo' });
    expect(redone.log).toEqual(corrected.log);
    expect(turnCounters(redone.log, 1).spent).toBe(6);
  });

  it('raises and lowers the limit for the turn only, never below 0', () => {
    const state = apply(played(), { type: 'adjustCounterLimit', delta: 1 });
    expect(logEntryText(state.log[3])).toBe("Set this turn's counters to 8");
    expect(turnCounters(state.log, 1)).toEqual({ spent: 10, limit: 8, grants: [] });
    const next = apply(state, { type: 'nextTurn' });
    expect(turnCounters(next.log, 2)).toEqual({ spent: 0, limit: 7, grants: [] });
    let low = next;
    for (let i = 0; i < 7; i++) low = apply(low, { type: 'adjustCounterLimit', delta: -1 });
    expect(turnCounters(low.log, 2).limit).toBe(0);
    expect(apply(low, { type: 'adjustCounterLimit', delta: -1 })).toBe(low);
    expect(apply(state, { type: 'undo' }).log).toHaveLength(3);
  });

  it('loads a saved log with the new kinds', () => {
    const state = apply(
      played(),
      { type: 'correctCharge', target: { entry: 0, move: 0, card: 0 }, cost: 0 },
      { type: 'adjustCounterLimit', delta: 1 }
    );
    const saved = JSON.parse(JSON.stringify(state.log));
    expect(saved.every(isLogEntry)).toBe(true);
    expect(turnCounters(saved, 1)).toEqual({ spent: 6, limit: 8, grants: [] });
  });
});

describe('the cost models in the log (#1654)', () => {
  const nanoprobes = instance('c1', 'Borg Nanoprobes', 'up', 'equipment', { cost: '5' });
  const goran = instance('c2', 'Goran', 'up', 'personnel', { cost: '2' });
  const tricorder = instance('c3', 'Tricorder', 'up', 'equipment', { cost: '1' });
  const drone = instance('p1', 'Annexation Drone', 'up', 'personnel', { species: 'Borg', cost: '3' });
  const ship = { ...instance('s1', 'Enterprise', 'up', 'ship', { cost: '4' }), crew: [drone] };
  const shuttle = instance('d1', 'Shuttle', 'down', 'ship', { cost: '2' });
  const shuttle2 = instance('d2', 'Shuttle', 'down', 'ship', { cost: '2' });
  const earth = instance('m1', 'Earth', 'up', 'mission');
  const awayTeam = { zone: 'missionPile', missionIndex: 0, pile: 'awayTeam' } as const;
  const start = (withDrone = true) =>
    table({
      hand: [nanoprobes, goran, tricorder],
      drawDeck: [shuttle, shuttle2],
      missions: slots([{ mission: earth, ships: withDrone ? [ship] : [{ ...ship, crew: [] }] }]),
    });
  // Each action as the page dispatches it, with the log for the downloads of the turn.
  const play = (state: GameState, ...actions: GameAction[]) =>
    actions.reduce((s, a) => gameReducer(s, withShuffleOrders(s.table, a, s.log)), state);
  const download = (id: string): GameAction => ({ type: 'batch', actions: [{ type: 'move', id, to: 'hand' }, { type: 'shuffle', location: 'drawDeck' }] });

  it('charges Borg Nanoprobes 3 with its source, and names it in the text', () => {
    const state = play(initialGameState(start()), { type: 'move', id: 'c1', to: { zone: 'crew', shipId: 's1' } });
    expect(turnCharges(state.log, 1)).toEqual([
      expect.objectContaining({ card: 'Borg Nanoprobes', cost: 3, source: { title: 'Borg Nanoprobes', reason: 'you command a Borg' } }),
    ]);
    expect(logEntryText(state.log[0])).toBe('Played Borg Nanoprobes to the crew of Enterprise (cost 3, Borg Nanoprobes: you command a Borg)');
    const plain = play(initialGameState(start(false)), { type: 'move', id: 'c1', to: { zone: 'crew', shipId: 's1' } });
    expect(turnCharges(plain.log, 1)[0]).toEqual(expect.objectContaining({ cost: 5 }));
    expect(turnCharges(plain.log, 1)[0].source).toBeUndefined();
  });

  it("takes Goran's choice as one entry with its source, and one undo takes it back", () => {
    const played = play(initialGameState(start()), { type: 'move', id: 'c2', to: awayTeam });
    const [charge] = turnCharges(played.log, 1);
    expect(charge.cost).toBe(2);
    expect(charge.source?.choice).toEqual({ label: 'Discard a card: \u22122', cost: 0 });
    expect(charge.choiceTaken).toBeUndefined();
    const chosen = play(played, { type: 'correctCharge', target: charge.target, cost: charge.source!.choice!.cost!, source: 'Goran' });
    expect(chosen.log).toHaveLength(2);
    expect(logEntryText(chosen.log[1])).toBe('Charged Goran 0 counters (was 2) (Goran)');
    expect(turnCharges(chosen.log, 1)[0]).toEqual(expect.objectContaining({ cost: 0, choiceTaken: true }));
    expect(chosen.table.hand.map((c) => c.id)).toEqual(['c1', 'c3']);
    const undone = play(chosen, { type: 'undo' });
    expect(turnCounters(undone.log, 1).spent).toBe(2);
    expect(turnCharges(undone.log, 1)[0].choiceTaken).toBeUndefined();
  });

  it('plays a downloaded card free once, and a drawn card at its cost', () => {
    const downloaded = play(initialGameState(start()), download('d1'));
    expect(downloadedThisTurn(downloaded.log, 1)).toEqual(['Shuttle']);
    const first = play(downloaded, { type: 'move', id: 'd1', to: { zone: 'shipRow', missionIndex: 0 } });
    expect(turnCharges(first.log, 1)[0]).toEqual(
      expect.objectContaining({ cost: 0, source: { title: 'Downloaded', reason: 'downloaded this turn' } })
    );
    expect(downloadedThisTurn(first.log, 1)).toEqual([]);
    const drawn = play(first, { type: 'drawCard', from: 'drawDeck', to: 'hand' });
    const second = play(drawn, { type: 'move', id: 'd2', to: { zone: 'shipRow', missionIndex: 0 } });
    expect(turnCharges(second.log, 1).map((c) => c.cost)).toEqual([0, 1, 2]);
    expect(turnCharges(second.log, 1)[2].source).toBeUndefined();
    // An undo of the free play opens the download again.
    expect(downloadedThisTurn(play(first, { type: 'undo' }).log, 1)).toEqual(['Shuttle']);
  });

  it('ends a download with a move back to the draw deck, and at the next turn', () => {
    const downloaded = play(initialGameState(start()), download('d1'));
    expect(downloadedThisTurn(play(downloaded, { type: 'move', id: 'd1', to: 'drawDeck' }).log, 1)).toEqual([]);
    const next = play(downloaded, { type: 'nextTurn' });
    expect(downloadedThisTurn(next.log, next.table.turn)).toEqual([]);
  });

  it('reads an entry from before #1654, and a malformed source, as before', () => {
    const old: LogEntry = {
      kind: 'move',
      turn: 1,
      moves: [{ cards: ['Data'], from: { kind: 'hand' }, to: { kind: 'core' }, costs: [3] }],
    };
    expect(logEntryText(old)).toBe('Played Data to the core (cost 3)');
    const malformed = { ...old, moves: [{ ...old.moves[0], sources: [{ title: 3 }] }] } as unknown as LogEntry;
    expect(logEntryText(malformed)).toBe('Played Data to the core (cost 3)');
    const correction: LogEntry = { kind: 'chargeCorrected', target: { entry: 0, move: 0, card: 0 }, card: 'Data', from: 3, to: 2, turn: 1 };
    expect(logEntryText(correction)).toBe('Charged Data 2 counters (was 3)');
  });
});

describe('the cost models of the limit (#1655)', () => {
  const party = instance('e1', 'Surprise Party', 'up', 'event', { cost: '2' });
  const tricia = instance('t1', 'Tricia Jenkins Relaxed Pilot', 'up', 'personnel', { cost: '2' });
  const earth = instance('m1', 'Earth', 'up', 'mission');
  const awayTeam = { zone: 'missionPile', missionIndex: 0, pile: 'awayTeam' } as const;
  const start = () => table({ hand: [party, tricia], missions: slots([{ mission: earth }]) });
  const play = (state: GameState, ...actions: GameAction[]) =>
    actions.reduce((s, a) => gameReducer(s, withShuffleOrders(s.table, a, s.log)), state);
  const counters = (state: GameState) => turnCounters(state.log, state.table.turn, tableLimitGrants(state.table));

  it('grants +1 while Surprise Party is in the core, and none once it leaves', () => {
    const initial = initialGameState(start());
    expect(counters(initial)).toEqual({ spent: 0, limit: 7, grants: [] });
    const played = play(initial, { type: 'move', id: 'e1', to: 'core' });
    expect(counters(played)).toEqual({
      spent: 2,
      limit: 8,
      grants: [{ title: 'Surprise Party', amount: 1, reason: 'in your core' }],
    });
    // The player's change adds to the grant.
    const lowered = play(played, { type: 'adjustCounterLimit', delta: -1 });
    expect(counters(lowered).limit).toBe(7);
    expect(counters(play(lowered, { type: 'undo' })).limit).toBe(8);
    const discarded = play(played, { type: 'move', id: 'e1', to: 'discard' });
    expect(counters(discarded)).toEqual({ spent: 2, limit: 7, grants: [] });
    expect(counters(play(played, { type: 'undo' })).limit).toBe(7);
  });

  it("takes Tricia Jenkins's choice as one counterLimit entry with its source, and one undo takes it back", () => {
    const played = play(initialGameState(start()), { type: 'move', id: 't1', to: awayTeam });
    const [charge] = turnCharges(played.log, 1);
    expect(charge.cost).toBe(2);
    expect(charge.source).toEqual({
      title: 'Tricia Jenkins',
      reason: 'you may spend 5 more counters this turn',
      choice: { label: 'Raise the limit: +5', limit: 5 },
    });
    expect(counters(played).limit).toBe(7);
    const chosen = play(played, { type: 'adjustCounterLimit', delta: 5, source: 'Tricia Jenkins', target: charge.target });
    expect(chosen.log).toHaveLength(2);
    expect(chosen.log[1]).toEqual(expect.objectContaining({ kind: 'counterLimit', delta: 5, limit: 12, source: 'Tricia Jenkins' }));
    expect(logEntryText(chosen.log[1])).toBe("Set this turn's counters to 12 (Tricia Jenkins)");
    expect(counters(chosen)).toEqual({ spent: 2, limit: 12, grants: [] });
    expect(turnCharges(chosen.log, 1)[0].choiceTaken).toBe(true);
    expect(chosen.table).toBe(played.table);
    // A reload keeps the limit and its source.
    const saved = JSON.parse(JSON.stringify(chosen.log));
    expect(saved.every(isLogEntry)).toBe(true);
    expect(turnCounters(saved, 1).limit).toBe(12);
    expect(turnCharges(saved, 1)[0].choiceTaken).toBe(true);
    const undone = play(chosen, { type: 'undo' });
    expect(counters(undone).limit).toBe(7);
    expect(turnCharges(undone.log, 1)[0].choiceTaken).toBeUndefined();
  });

  it('reads a counterLimit entry from before #1655, with no source', () => {
    const old: LogEntry = { kind: 'counterLimit', delta: 1, limit: 8, turn: 1 };
    expect(logEntryText(old)).toBe("Set this turn's counters to 8");
    expect(turnCounterLimit([old], 1)).toBe(8);
  });
});

describe('a pending discount of a cost model (#1656)', () => {
  const sarish = instance('r1', 'Sarish Rez Ministerial Adjutant', 'up', 'personnel', {
    cost: '2',
    affiliation: 'Bajoran',
    icons: '[Stf][DS9]',
  });
  const jadzia = instance('j1', 'Jadzia Dax Problem Solver', 'up', 'personnel', {
    cost: '3',
    affiliation: 'Federation',
    icons: '[Stf][DS9]',
  });
  const ezri = instance('j2', 'Ezri Dax Station Counselor', 'up', 'personnel', {
    cost: '2',
    affiliation: 'Federation',
    icons: '[Stf][DS9]',
  });
  const picard = instance('f1', 'Jean-Luc Picard', 'up', 'personnel', { cost: '3', affiliation: 'Federation', icons: '[Cmd][TNG]' });
  const earth = instance('m1', 'Earth', 'up', 'mission');
  const awayTeam = { zone: 'missionPile', missionIndex: 0, pile: 'awayTeam' } as const;
  const start = () => table({ hand: [sarish, jadzia, ezri, picard], missions: slots([{ mission: earth }]) });
  const play = (state: GameState, ...actions: GameAction[]) =>
    actions.reduce((s, a) => gameReducer(s, withShuffleOrders(s.table, a, s.log)), state);
  const toAway = (id: string): GameAction => ({ type: 'move', id, to: awayTeam });
  const origin = { entry: 0, move: 0, card: 0 };

  it('derives the discount from the log, and the next [Fed][DS9] personnel uses it once', () => {
    const played = play(initialGameState(start()), toAway('r1'));
    expect(pendingDiscountsOf(played.log, 1)).toEqual([
      expect.objectContaining({ title: 'Sarish Rez', label: 'next [Fed][DS9] personnel', amount: 2, origin }),
    ]);
    const discounted = play(played, toAway('j1'));
    expect(turnCharges(discounted.log, 1)[1]).toEqual(
      expect.objectContaining({
        card: 'Jadzia Dax Problem Solver',
        cost: 1,
        source: { title: 'Sarish Rez', reason: '\u22122 on the next [Fed][DS9] personnel', discount: origin },
      })
    );
    expect(logEntryText(discounted.log[1])).toBe(
      'Played Jadzia Dax Problem Solver at Earth (cost 1, Sarish Rez: \u22122 on the next [Fed][DS9] personnel)'
    );
    expect(pendingDiscountsOf(discounted.log, 1)).toEqual([]);
    // Used once: the next [Fed][DS9] personnel pays its printed cost.
    const second = play(discounted, toAway('j2'));
    expect(turnCharges(second.log, 1)[2]).toEqual(expect.objectContaining({ cost: 2 }));
    expect(turnCharges(second.log, 1)[2].source).toBeUndefined();
    // An undo of the discounted play brings the discount back.
    expect(pendingDiscountsOf(play(discounted, { type: 'undo' }).log, 1)).toHaveLength(1);
  });

  it('leaves a used discount used after a correction of the play', () => {
    const discounted = play(initialGameState(start()), toAway('r1'), toAway('j1'));
    const corrected = play(discounted, { type: 'correctCharge', target: turnCharges(discounted.log, 1)[1].target, cost: 3 });
    expect(turnCharges(corrected.log, 1)[1].cost).toBe(3);
    expect(pendingDiscountsOf(corrected.log, 1)).toEqual([]);
    expect(turnCharges(play(corrected, toAway('j2')).log, 1)[2].cost).toBe(2);
  });

  it('does not give the discount to a personnel that is not [Fed][DS9]', () => {
    const state = play(initialGameState(start()), toAway('r1'), toAway('f1'));
    expect(turnCharges(state.log, 1)[1]).toEqual(expect.objectContaining({ cost: 3 }));
    expect(turnCharges(state.log, 1)[1].source).toBeUndefined();
    expect(pendingDiscountsOf(state.log, 1)).toHaveLength(1);
  });

  it('ends the discount with the turn', () => {
    const next = play(initialGameState(start()), toAway('r1'), { type: 'nextTurn' });
    expect(pendingDiscountsOf(next.log, next.table.turn)).toEqual([]);
    const played = play(next, toAway('j1'));
    expect(turnCharges(played.log, played.table.turn)[0]).toEqual(expect.objectContaining({ cost: 3 }));
  });

  it('dismisses the discount in one entry, and one undo brings it back', () => {
    const played = play(initialGameState(start()), toAway('r1'));
    const dismissed = play(played, { type: 'dismissDiscount', target: origin });
    expect(dismissed.log).toHaveLength(2);
    expect(dismissed.log[1]).toEqual(expect.objectContaining({ kind: 'discountDismissed', target: origin, source: 'Sarish Rez' }));
    expect(logEntryText(dismissed.log[1])).toBe('Dismissed the discount of Sarish Rez');
    expect(dismissed.table).toBe(played.table);
    expect(pendingDiscountsOf(dismissed.log, 1)).toEqual([]);
    expect(turnCharges(play(dismissed, toAway('j1')).log, 1)[1].cost).toBe(3);
    // A second dismiss changes nothing.
    expect(play(dismissed, { type: 'dismissDiscount', target: origin })).toBe(dismissed);
    const undone = play(dismissed, { type: 'undo' });
    expect(pendingDiscountsOf(undone.log, 1)).toHaveLength(1);
    // A reload keeps the dismiss and the discount.
    const saved = JSON.parse(JSON.stringify(dismissed.log));
    expect(saved.every(isLogEntry)).toBe(true);
    expect(pendingDiscountsOf(saved, 1)).toEqual([]);
    expect(pendingDiscountsOf(JSON.parse(JSON.stringify(played.log)), 1)).toHaveLength(1);
  });
});
