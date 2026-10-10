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

const run = (start: TableState, ...actions: GameAction[]): GameState =>
  actions.reduce(gameReducer, initialGameState(start));

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
    expect(entry).toEqual({ kind: 'draw', from: 'drawDeck', to: 'hand', turn: 1 });
    expect(logEntryText(entry)).toBe('Drew a card from the draw deck into the hand');
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
    const state = run(table({ hand: [data] }), { type: 'move', id: 'c1', to: 'core' });
    expect(logEntryText(onlyEntry(state))).toBe('Moved Data from the hand to the core');
  });

  it('names the mission of an away team, and the slot number of a slot with no mission card', () => {
    const state = run(
      table({ hand: [data, worf], missions: slots([{ mission: excavation }]) }),
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
      'Moved Data from the core to the away team at Excavation; Enterprise from the core to the ships at Excavation'
    );
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
    const state = run(table({ hand: [data], core: [instance('e1', 'Event', 'up', 'event')] }), {
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
        '- Drew a card from the draw deck into the hand',
        '- Shuffled the draw deck',
        '',
        'Turn 2',
        '- Started turn 2',
        '- Score +5 (now 5)',
      ].join('\n')
    );
  });

  it('says so for an empty log', () => {
    expect(gameLogText([])).toBe(EMPTY_LOG_TEXT);
  });
});
