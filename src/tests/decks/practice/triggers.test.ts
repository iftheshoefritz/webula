import { readFileSync } from 'fs';
import { resolve } from 'path';
import { gameEventsOf } from '../../../app/decks/practice/gameEvents';
import { GameState, gameReducer, initialGameState, isLogEntry, LogEntry, logEntryText } from '../../../app/decks/practice/gameLog';
import { initialTableState, CardInstance, TableState, MISSION_SLOTS } from '../../../app/decks/practice/tableReducer';
import { lastActionEntry, pendingTriggersOf } from '../../../app/decks/practice/triggers';
import { cardTitleOf } from '../../../lib/cardTitle';
import { clausesOf } from '../../../lib/modelCoverage';
import { TRIGGER_ROWS, TRIGGER_TITLES, triggerRowsOf } from '../../../lib/triggers';

// Issue #1903: the game events of a log entry, the trigger registry and the offers derived from the log. With
// invented cards, and the titles of the registry for its rows.

const card = (id: string, row: Record<string, unknown>, extra: Partial<CardInstance> = {}): CardInstance => ({
  id,
  card: { collectorsinfo: id, imagefile: id, ...row } as CardInstance['card'],
  face: 'up',
  ...extra,
});
const person = (id: string, name: string, extra: Record<string, unknown> = {}, instance: Partial<CardInstance> = {}) =>
  card(id, { type: 'personnel', name: name.toLowerCase(), originalName: name, cost: '2', affiliation: 'federation', ...extra }, instance);
const event = (id: string, name: string) => card(id, { type: 'event', name: name.toLowerCase(), originalName: name, cost: '1' });
const mission = (id: string, name: string, quadrant: string, missiontype = 'p') =>
  card(id, { type: 'mission', name: name.toLowerCase(), originalName: name, missiontype, quadrant });
const deckCard = (id: string) => card(id, { type: 'event', name: `card ${id}`, originalName: `Card ${id}`, cost: '1' }, { face: 'down' });

const HQ = mission('hq', 'Home Base', 'a', 'h');
const FAR = mission('far', 'Far Rock', 'g');
const NEAR = mission('near', 'Near Rock', 'a');
const SPACE = mission('space', 'Open Space', 'a', 's');
const ALICE = person('alice', 'Alice');

function table(extra: Partial<TableState> = {}, slots: Partial<TableState['missions'][number]>[] = []): TableState {
  const missions = [HQ, FAR, NEAR, SPACE];
  return {
    ...initialTableState,
    drawDeck: Array.from({ length: 10 }, (_, i) => deckCard(`d${i + 1}`)),
    missions: Array.from({ length: MISSION_SLOTS }, (_, i) => ({
      mission: missions[i] ?? null,
      ships: [],
      awayTeam: [],
      underMission: [],
      ...slots[i],
    })),
    ...extra,
  };
}

const entry = (body: object, extra: Partial<LogEntry> = {}): LogEntry => ({ turn: 1, ...body, ...extra }) as LogEntry;
const kinds = (entries: { kind: string }[]) => entries.map((e) => e.kind);

describe('the game events of a log entry (#1903)', () => {
  it('reads a play of a move, with its instance and traits, and none of a plain move', () => {
    const t = table({}, [{ awayTeam: [ALICE] }]);
    const play = entry({
      kind: 'move',
      moves: [
        {
          cards: ['Alice'],
          from: { kind: 'hand' },
          to: { kind: 'awayTeam', mission: 'Home Base' },
          costs: [2],
          plays: [{ type: 'personnel', unique: false, icons: [], keywords: [], affiliation: 'federation', species: [], skills: [] }],
        },
      ],
    });
    expect(gameEventsOf(play, t)).toEqual([
      {
        kind: 'played',
        card: { id: 'alice', name: 'Alice' },
        type: 'personnel',
        traits: expect.objectContaining({ type: 'personnel' }),
        place: 'awayTeam',
        missionIndex: 0,
      },
    ]);
    // A move from before #1703 has no `plays`: the play still counts, with no traits.
    const old = entry({ kind: 'move', moves: [{ cards: ['Alice'], from: { kind: 'hand' }, to: { kind: 'awayTeam', mission: 'Home Base' }, costs: [2] }] });
    expect(gameEventsOf(old, t)).toEqual([{ kind: 'played', card: { id: 'alice', name: 'Alice' }, type: 'personnel', place: 'awayTeam', missionIndex: 0 }]);
    const drag = entry({ kind: 'move', moves: [{ cards: ['Alice'], from: { kind: 'hand' }, to: { kind: 'awayTeam', mission: 'Home Base' } }] });
    expect(gameEventsOf(drag, t)).toEqual([]);
  });

  it('reads a draw, a dilemma draw and the opening hand, which starts the first turn', () => {
    const t = table();
    expect(gameEventsOf(entry({ kind: 'draw', from: 'drawDeck', to: 'hand' }), t)).toEqual([{ kind: 'drew', count: 1 }]);
    expect(gameEventsOf(entry({ kind: 'draw', from: 'dilemmaPile', to: 'dilemmaHand' }), t)).toEqual([{ kind: 'dilemmasDrawn', count: 1 }]);
    expect(gameEventsOf(entry({ kind: 'openingHand', count: 7 }), t)).toEqual([
      { kind: 'turnStarted', turn: 1, first: true },
      { kind: 'segmentStarted', segment: 'playAndDraw' },
      { kind: 'drew', count: 7, opening: true },
    ]);
  });

  it('reads the start of an attempt, and the bot draw of a bot attempt', () => {
    const bob = person('bob', 'Bob', {}, { stopped: true });
    const t = table({ attempt: { missionIndex: 1, personnel: 1, subtract: 0, phase: 'face', drawn: 0, draw: 1, spend: 1 } }, [{}, { awayTeam: [ALICE, bob] }]);
    // An entry from before #1759 has no draw or spend.
    expect(gameEventsOf(entry({ kind: 'attemptStarted', mission: 'Far Rock', personnel: 1, subtract: 0 }), t)).toEqual([
      { kind: 'attemptStarted', missionIndex: 1, personnel: ['alice'] },
    ]);
    expect(gameEventsOf(entry({ kind: 'botAttempt', mission: 'Far Rock', personnel: 1, subtract: 0, drew: 4, stacked: 2 }), t)).toEqual([
      { kind: 'attemptStarted', missionIndex: 1, personnel: ['alice'], bot: true },
      { kind: 'dilemmasDrawn', count: 4, bot: true },
    ]);
    // After the attempt ended, the slot of the mission's name and no personnel.
    expect(gameEventsOf(entry({ kind: 'attemptStarted', mission: 'Far Rock', personnel: 1, subtract: 0 }), table())).toEqual([
      { kind: 'attemptStarted', missionIndex: 1, personnel: [] },
    ]);
  });

  it('reads a completion with its slot and the personnel involved, and none of an undone completion', () => {
    const t = table({}, [{}, { awayTeam: [ALICE], involved: ['alice'], completed: true }]);
    expect(gameEventsOf(entry({ kind: 'missionCompleted', mission: 'Far Rock', completed: true }), t)).toEqual([
      { kind: 'missionCompleted', missionIndex: 1, quadrant: 'g', type: 'p', requirements: '', involved: ['alice'] },
    ]);
    expect(gameEventsOf(entry({ kind: 'missionCompleted', mission: 'Far Rock', completed: false }), t)).toEqual([]);
  });

  it('reads the reveal of the facing stack top with its kept picks, and no other flip', () => {
    const dilemma = card('dil', { type: 'dilemma', name: 'pit', originalName: 'Pit', dilemmatype: 'p' });
    const t = table({
      dilemmaStack: [dilemma],
      attempt: {
        missionIndex: 1,
        personnel: 1,
        subtract: 0,
        phase: 'face',
        drawn: 0,
        draw: 1,
        spend: 1,
        revealSnapshot: { dilemmaId: 'dil', personnel: [{ id: 'alice', stopped: false }], picks: [['alice']] },
      },
    });
    expect(gameEventsOf(entry({ kind: 'flip', cards: [{ name: 'Pit', face: 'up' }] }), t)).toEqual([
      { kind: 'dilemmaRevealed', dilemma: { id: 'dil', name: 'Pit' }, dilemmaType: 'p', picks: [['alice']] },
    ]);
    expect(gameEventsOf(entry({ kind: 'flip', cards: [{ name: 'Pit', face: 'up' }] }), { ...t, attempt: { ...t.attempt!, phase: 'choose' } })).toEqual([]);
    expect(gameEventsOf(entry({ kind: 'flip', cards: [{ name: 'Other', face: 'up' }] }), t)).toEqual([]);
  });

  it("reads a dilemma's Resolve: only its kill op is a kill", () => {
    const bob = person('bob', 'Bob', {}, { stopped: true });
    const carl = person('carl', 'Carl');
    const t = table({ discard: [carl], botBrig: [person('dee', 'Dee')] }, [{ awayTeam: [bob] }]);
    const resolved = entry({
      kind: 'dilemmaResolved',
      dilemma: 'Pit',
      ops: [
        { op: 'stop', cards: ['Bob'] },
        { op: 'kill', cards: ['Carl'] },
        { op: 'brig', cards: ['Dee'] },
        { op: 'remove', cards: ['Eve'] },
      ],
    });
    expect(gameEventsOf(resolved, t)).toEqual([
      { kind: 'dilemmaResolved', dilemma: { name: 'Pit' } },
      { kind: 'stopped', cards: [{ id: 'bob', name: 'Bob' }], byDilemma: true },
      { kind: 'killed', cards: [{ id: 'carl', name: 'Carl' }], byDilemma: true },
      { kind: 'brigged', cards: [{ id: 'dee', name: 'Dee' }], byDilemma: true },
    ]);
    // A drag of a personnel to the discard pile is no kill.
    expect(gameEventsOf(entry({ kind: 'move', moves: [{ cards: ['Carl'], from: { kind: 'awayTeam', mission: 'Home Base' }, to: { kind: 'discard' } }] }), t)).toEqual([]);
  });

  it('reads a stop by hand, and no unstop', () => {
    const t = table({}, [{ awayTeam: [person('bob', 'Bob', {}, { stopped: true })] }]);
    expect(gameEventsOf(entry({ kind: 'stopped', cards: ['Bob'], stopped: true }), t)).toEqual([{ kind: 'stopped', cards: [{ id: 'bob', name: 'Bob' }], byDilemma: false }]);
    expect(gameEventsOf(entry({ kind: 'stopped', cards: ['Bob'], stopped: false }), t)).toEqual([]);
  });

  it('reads the segments and the turns, and an entry from before #1605 as play and draw', () => {
    const t = table();
    const orders = entry({ kind: 'segment', to: 'orders' }, { segment: 'orders' });
    expect(gameEventsOf(orders, t, entry({ kind: 'draw', from: 'drawDeck', to: 'hand' }))).toEqual([
      { kind: 'segmentEnded', segment: 'playAndDraw' },
      { kind: 'segmentStarted', segment: 'orders' },
    ]);
    expect(gameEventsOf(entry({ kind: 'nextTurn' }, { turn: 2 }), t, orders)).toEqual([
      { kind: 'segmentEnded', segment: 'orders' },
      { kind: 'turnStarted', turn: 2 },
      { kind: 'segmentStarted', segment: 'playAndDraw' },
    ]);
    // The discard segment ends the turn (#1946), once.
    const discard = entry({ kind: 'segment', to: 'discard' }, { segment: 'discard' });
    expect(gameEventsOf(discard, t, orders)).toEqual([
      { kind: 'segmentEnded', segment: 'orders' },
      { kind: 'segmentStarted', segment: 'discard' },
      { kind: 'turnEnding', turn: 1 },
    ]);
    expect(gameEventsOf(entry({ kind: 'score', delta: 5, score: 5 }, { segment: 'discard' }), t, discard)).toEqual([]);
    // An attempt started in play and draw moves the turn to orders.
    expect(kinds(gameEventsOf(entry({ kind: 'attemptStarted', mission: 'Far Rock', personnel: 1, subtract: 0 }, { segment: 'orders' }), t, entry({ kind: 'draw', from: 'drawDeck', to: 'hand' })))).toEqual([
      'attemptStarted',
      'segmentEnded',
      'segmentStarted',
    ]);
    expect(gameEventsOf(entry({ kind: 'draw', from: 'drawDeck', to: 'hand' }), t, entry({ kind: 'score', delta: 5, score: 5 }))).toEqual([{ kind: 'drew', count: 1 }]);
  });
});

describe('the trigger registry (#1903)', () => {
  const rows = readFileSync(resolve(process.cwd(), 'public/cards_with_processed_columns.txt'), 'utf8').split('\n').slice(1);
  const cards = new Map(rows.map((r) => r.split('\t').map((c) => c.replace(/^"|"$/g, ''))).map((c) => [cardTitleOf(c[0] ?? ''), { type: c[6] ?? '', text: c[26] ?? '' }]));

  it('quotes a trigger clause of the card data for every row', () => {
    for (const row of TRIGGER_ROWS) {
      const data = cards.get(row.title);
      expect([row.title, data !== undefined]).toEqual([row.title, true]);
      // A delayed trigger (#1835) quotes the sentence of the ability that sets it up, a clause of another concern.
      if (row.afterAbility !== undefined) {
        expect([row.title, data!.text.includes(row.text)]).toEqual([row.title, true]);
        continue;
      }
      const triggers = clausesOf({ name: row.title, type: data!.type, gametext: data!.text }).filter((c) => c.concern === 'trigger' || c.concern === 'interrupt');
      expect([row.title, triggers.some((c) => c.text.endsWith(row.text))]).toEqual([row.title, true]);
    }
  });

  it('finds the rows of a title, version suffix and all, and lists each title once', () => {
    expect(triggerRowsOf('Distant Exploration *VP').map((r) => r.title)).toEqual(['Distant Exploration']);
    expect(triggerRowsOf('Distant')).toEqual([]);
    expect(new Set(TRIGGER_TITLES).size).toBe(TRIGGER_TITLES.length);
  });
});

const complete = (game: GameState, missionIndex: number): GameState => gameReducer(game, { type: 'setMissionCompleted', missionIndex, completed: true });
const offered = (game: GameState) => pendingTriggersOf(game).map((o) => `${o.name}@${o.target.source}`);
const DISTANT = event('dx', 'Distant Exploration');

describe('the trigger offers (#1903)', () => {
  it('offers Distant Exploration for a completion in another quadrant, and none in its own', () => {
    const game = initialGameState(table({}, [{ mission: { ...HQ, placedOn: [DISTANT] } }]));
    expect(offered(complete(game, 1))).toEqual(['Distant Exploration@dx']);
    expect(pendingTriggersOf(complete(game, 1))[0].target).toEqual({ entry: 0, source: 'dx', row: 0, event: 0 });
    expect(offered(complete(game, 2))).toEqual([]);
  });

  it('offers only while the source card is in its place', () => {
    expect(offered(complete(initialGameState(table()), 1))).toEqual([]);
    // In the core, not on a mission card.
    expect(offered(complete(initialGameState(table({ core: [DISTANT] })), 1))).toEqual([]);
  });

  it('drops an offer after any other action, and keeps it past an entry addressed to it', () => {
    const done = complete(initialGameState(table({}, [{ mission: { ...HQ, placedOn: [DISTANT] } }])), 1);
    expect(offered(gameReducer(done, { type: 'drawCard', from: 'drawDeck', to: 'hand' }))).toEqual([]);
    const corrected = { ...done, log: [...done.log, entry({ kind: 'chargeCorrected', target: { entry: 0 }, from: 1, to: 0 })] };
    expect(lastActionEntry(corrected.log)).toBe(0);
    expect(offered(corrected)).toEqual(['Distant Exploration@dx']);
    const later = { ...done, log: [...done.log, entry({ kind: 'score', delta: 1, score: 1 }), entry({ kind: 'chargeCorrected', target: { entry: 0 }, from: 1, to: 0 })] };
    expect(lastActionEntry(later.log)).toBe(-1);
  });

  it('drops an offer with a taken or skipped record, and keeps the offers of other sources', () => {
    const other = event('dx2', 'Distant Exploration');
    const done = complete(initialGameState(table({}, [{ mission: { ...HQ, placedOn: [DISTANT, other] } }])), 1);
    expect(offered(done)).toEqual(['Distant Exploration@dx', 'Distant Exploration@dx2']);
    const skipped = entry({ kind: 'triggerSkipped', target: { entry: 0, source: 'dx', row: 0, event: 0 }, card: 'Distant Exploration' });
    expect(isLogEntry(skipped)).toBe(true);
    expect(logEntryText(skipped)).toBe('Skipped Distant Exploration');
    expect(offered({ ...done, log: [...done.log, skipped] })).toEqual(['Distant Exploration@dx2']);
    const used = entry({ kind: 'triggerUsed', target: { entry: 0, source: 'dx2', row: 0, event: 0 }, card: 'Distant Exploration', effect: { steps: [{ step: 'score', points: 5 }] } });
    expect(logEntryText(used)).toBe('Distant Exploration: scored 5 points');
    expect(offered({ ...done, log: [...done.log, skipped, used] })).toEqual([]);
  });

  it('waits while an event resolves', () => {
    const done = complete(initialGameState(table({}, [{ mission: { ...HQ, placedOn: [DISTANT] } }])), 1);
    expect(offered({ ...done, table: { ...done.table, resolving: event('ev', 'Some Event') } })).toEqual([]);
  });

  it('offers Mission Accomplished only while its condition holds at the completed mission', () => {
    const accomplished = event('ma', 'Mission Accomplished');
    const ship = card('ship', { type: 'ship', name: 'u.s.s. brave', originalName: 'U.S.S. Brave', cost: '3' });
    const captain = person('cap', 'Captain', { keywords: 'Commander: U.S.S. Brave.' });
    const crewed = (crew: CardInstance[]) =>
      complete(initialGameState(table({ core: [accomplished] }, [{}, {}, {}, { ships: [{ ...ship, crew }] }])), 3);
    expect(offered(crewed([captain]))).toEqual(['Mission Accomplished@ma']);
    expect(offered(crewed([person('ens', 'Ensign')]))).toEqual([]);
    expect(offered(complete(initialGameState(table({ core: [accomplished] })), 1))).toEqual([]);
  });

  it("offers Li Nalas's row when a dilemma's Resolve kills him, never for a drag to the discard pile", () => {
    const li = person('li', 'Li Nalas Legend of Bajor');
    const killed = initialGameState(table({ discard: [li] }));
    const resolved = { ...killed, log: [entry({ kind: 'dilemmaResolved', dilemma: 'Pit', ops: [{ op: 'kill', cards: ['Li Nalas Legend of Bajor'] }] })] };
    expect(offered(resolved)).toEqual(['Li Nalas Legend of Bajor@li']);
    expect(pendingTriggersOf(resolved)[0].row.may).toBe(false);
    const dragged = {
      ...killed,
      log: [entry({ kind: 'move', moves: [{ cards: ['Li Nalas Legend of Bajor'], from: { kind: 'awayTeam', mission: 'Home Base' }, to: { kind: 'discard' } }] })],
    };
    expect(offered(dragged)).toEqual([]);
  });
});
