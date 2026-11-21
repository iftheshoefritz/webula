import { tableReducer, initialTableState, CardInstance, TableState, MISSION_SLOTS } from '../../../app/decks/practice/tableReducer';
import { botResolveOf, pileTableInputOf } from '../../../app/decks/practice/attempt';
import { GameState, gameReducer, initialGameState, logEntryText } from '../../../app/decks/practice/gameLog';
import {
  ROADBLOCK_TITLE,
  nameableCardTitles,
  namedAtMission,
  roadblockReturnOf,
  roadblockToNameOf,
} from '../../../app/decks/practice/selfReplicatingRoadblock';
import { fromSavedGame, toSavedGame } from '../../../app/decks/practice/savedGame';
import { modelOf } from '../../../lib/dilemmaBot/pile/registry';
import { pileAttemptOf } from '../../../lib/dilemmaBot/pile/tableAttempt';
import { playPileStack } from '../../../lib/dilemmaBot/pile/play';
import { DeckList } from '../../../types';

// Issue #1789: Self-Replicating Roadblock names a dilemma when it is placed on a mission card, and the
// dilemma bot reads the named dilemma. The personnel and the mission are invented.

const card = (id: string, row: Record<string, unknown>, extra: Partial<CardInstance> = {}): CardInstance => ({
  id,
  card: { collectorsinfo: id, imagefile: id, ...row } as CardInstance['card'],
  face: 'up',
  ...extra,
});
const person = (id: string, name: string) =>
  card(id, { type: 'personnel', name: name.toLowerCase(), originalName: name, skills: 'Physics', integrity: 5, cunning: 5, strength: 5, cost: '2' });
const dilemma = (id: string, title: string, cost = '2') =>
  card(id, { type: 'dilemma', name: title.toLowerCase(), originalName: title, cost }, { face: 'down' });
const roadblock = (id = 'rb') =>
  card(id, { type: 'event', name: ROADBLOCK_TITLE.toLowerCase(), originalName: ROADBLOCK_TITLE, cost: '2' });
const mission = card('m0', { type: 'mission', name: 'test mission', originalName: 'Test Mission', missiontype: 'p', skills: 'Physics', points: 35, span: 3 });

// Racial Tension: a dilemma of the registry, cost 2.
const NAMED = 'Racial Tension';

function table({ hand = [roadblock()], placed = [] as CardInstance[], stack = [] as CardInstance[], attempt = false } = {}): TableState {
  const crew = [person('p1', 'Alpha'), person('p2', 'Beta'), person('p3', 'Gamma')];
  return {
    ...initialTableState,
    opponent: 'bot',
    hand,
    missions: Array.from({ length: MISSION_SLOTS }, (_, i) => ({
      mission: i === 0 ? { ...mission, ...(placed.length ? { placedOn: placed } : {}) } : null,
      ships: [],
      awayTeam: i === 0 ? crew : [],
      underMission: [],
    })),
    dilemmaStack: stack,
    ...(attempt
      ? {
          attempt: {
            missionIndex: 0,
            personnel: crew.length,
            subtract: 0,
            draw: 9,
            spend: 9,
            phase: 'face' as const,
            drawn: 0,
            botDraw: 9,
            botSpend: 9,
            botStack: stack.map((c) => c.id),
            botRevealed: [],
          },
        }
      : {}),
  };
}

const place = (game: GameState): GameState => gameReducer(game, { type: 'move', id: 'rb', to: { zone: 'on', targetId: 'm0' } });

describe('naming a card with Self-Replicating Roadblock (#1789)', () => {
  it('asks for a name once the event is placed on a mission card', () => {
    const start = initialGameState(table());
    expect(roadblockToNameOf(start.table, start.log)).toBeNull();
    const placed = place(start);
    expect(roadblockToNameOf(placed.table, placed.log)).toEqual({ id: 'rb', missionIndex: 0 });
  });

  it('amends the placement with the name, so one undo takes back both', () => {
    const placed = place(initialGameState(table()));
    const named = gameReducer(placed, { type: 'setNamed', id: 'rb', named: NAMED });
    expect(named.log).toHaveLength(1);
    expect(logEntryText(named.log[0])).toMatch(new RegExp(`, naming ${NAMED}$`));
    expect(named.table.missions[0].mission!.placedOn![0].named).toBe(NAMED);
    expect(roadblockToNameOf(named.table, named.log)).toBeNull();
    const undone = gameReducer(named, { type: 'undo' });
    expect(undone.log).toHaveLength(0);
    expect(undone.table.hand.map((c) => c.id)).toEqual(['rb']);
    expect(undone.table.hand[0].named).toBeUndefined();
  });

  it('logs a name changed later as an entry of its own', () => {
    const named = gameReducer(place(initialGameState(table())), { type: 'setNamed', id: 'rb', named: NAMED });
    const changed = gameReducer(named, { type: 'setNamed', id: 'rb', named: 'Wavefront' });
    expect(changed.log).toHaveLength(2);
    expect(logEntryText(changed.log[1])).toBe(`${ROADBLOCK_TITLE} on Test Mission named Wavefront`);
    expect(gameReducer(changed, { type: 'undo' }).table.missions[0].mission!.placedOn![0].named).toBe(NAMED);
  });

  it('clears the name when the card moves', () => {
    const named = gameReducer(place(initialGameState(table())), { type: 'setNamed', id: 'rb', named: NAMED });
    const moved = gameReducer(named, { type: 'move', id: 'rb', to: 'hand' });
    expect(moved.table.hand.find((c) => c.id === 'rb')!.named).toBeUndefined();
  });

  it('keeps the name in the save', () => {
    const named = gameReducer(place(initialGameState(table())), { type: 'setNamed', id: 'rb', named: NAMED });
    const deck: DeckList = Object.fromEntries(
      [roadblock(), mission, person('p1', 'Alpha'), person('p2', 'Beta'), person('p3', 'Gamma')].map((c) => [c.card.collectorsinfo, { count: 1, row: c.card }])
    );
    const json = JSON.stringify(toSavedGame(named.table, deck, 'builder', undefined, undefined, named.log));
    const restored = fromSavedGame(json, deck);
    expect(restored?.table.missions[0].mission?.placedOn?.[0].named).toBe(NAMED);
    expect(logEntryText(restored!.log[0])).toMatch(new RegExp(`, naming ${NAMED}$`));
  });

  it('lists the bot pile first, then every dilemma, then every event', () => {
    const all = [dilemma('a', 'Wavefront').card, dilemma('b', NAMED).card, roadblock().card];
    expect(nameableCardTitles([NAMED], all)).toEqual([NAMED, 'Wavefront', ROADBLOCK_TITLE]);
  });
});

describe('the bot reads the named dilemma (#1789)', () => {
  const placed = [{ ...roadblock(), named: NAMED }];

  it('hands the bot the titles named at the attempted mission', () => {
    const t = table({ placed, hand: [] });
    expect(namedAtMission(t, 0)).toEqual([NAMED]);
    expect(pileAttemptOf(pileTableInputOf(t, 0)).attempt.table.returnedHere).toEqual([NAMED]);
  });

  it('plays a named dilemma as returning to the pile with no effect', () => {
    const { attempt } = pileAttemptOf(pileTableInputOf(table({ placed, hand: [] }), 0));
    const model = modelOf(NAMED)!;
    const result = playPileStack(attempt, [model], () => 0);
    expect(result.backToPile).toBe(1);
    expect(result.stopped).toBe(0);
  });

  it('returns the revealed named dilemma to the bottom of the dilemma pile', () => {
    const t = tableReducer(table({ placed, hand: [], stack: [dilemma('d1', NAMED), dilemma('d2', 'Wavefront')], attempt: true }), { type: 'flip', id: 'd1' });
    expect(roadblockReturnOf(t)).toBe(ROADBLOCK_TITLE);
    const r = botResolveOf(t);
    expect(r).toMatchObject({
      resolvable: true,
      preview: `Named by ${ROADBLOCK_TITLE}: no effect; returns to the dilemma pile`,
      changes: [],
      returned: ROADBLOCK_TITLE,
      move: { to: 'dilemmaPile', position: 'bottom' },
    });
    if (!r.resolvable) throw new Error();
    const game = gameReducer(initialGameState(t), {
      type: 'resolveDilemma',
      dilemmaId: 'd1',
      dilemma: NAMED,
      changes: r.changes,
      notes: r.notes,
      move: r.move!,
      returned: r.returned!,
    });
    expect(game.table.dilemmaPile.map((c) => [c.id, c.face])).toEqual([['d1', 'up']]);
    expect(logEntryText(game.log[0])).toMatch(new RegExp(`^Resolved ${NAMED}: named by ${ROADBLOCK_TITLE}, no effect; it returns to the dilemma pile$`));
  });

  it('does not return a dilemma of another title', () => {
    const t = tableReducer(table({ placed, hand: [], stack: [dilemma('d2', 'Wavefront')], attempt: true }), { type: 'flip', id: 'd2' });
    expect(roadblockReturnOf(t)).toBeNull();
  });
});
