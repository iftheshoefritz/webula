// Issue #1665: with the setting "Apply card text to attributes" on (#1668), the dilemma bot reads the
// attributes on the table, the attribute models of #1664 added to the printed values; off, the printed
// values. The `botAttempt` action freezes the setting on the attempt. Every card here is invented but
// the titles of the attribute models and of the dilemma.
import { tableReducer, initialTableState, CardInstance, TableState, MISSION_SLOTS, MissionSlot } from '../../../app/decks/practice/tableReducer';
import { botResolveOf, pileTableInputOf } from '../../../app/decks/practice/attempt';
import { pileAttemptOf } from '../../../lib/dilemmaBot/pile/tableAttempt';
import { toSavedGame, fromSavedGame } from '../../../app/decks/practice/savedGame';
import { DeckList } from '../../../types';

const card = (id: string, row: Record<string, unknown>, extra: Partial<CardInstance> = {}): CardInstance => ({
  id,
  card: { collectorsinfo: id, imagefile: id, ...row } as CardInstance['card'],
  face: 'up',
  ...extra,
});
const person = (id: string, name: string, row: Record<string, unknown> = {}) =>
  card(id, { type: 'personnel', name: name.toLowerCase(), originalName: name, skills: 'Physics', integrity: 5, cunning: 5, strength: 5, cost: 2, ...row });
const event = (id: string, title: string) => card(id, { type: 'event', name: title.toLowerCase(), originalName: title });
const dilemma = (id: string, title: string) => card(id, { type: 'dilemma', name: title.toLowerCase(), originalName: title }, { face: 'down' });

const tableOf = (slot0: Partial<MissionSlot>, rest: Partial<TableState> = {}): TableState => ({
  ...initialTableState,
  opponent: 'bot',
  missions: Array.from({ length: MISSION_SLOTS }, (_, i) => ({
    mission: null,
    ships: [],
    awayTeam: [],
    underMission: [],
    ...(i === 0 ? slot0 : {}),
  })),
  ...rest,
});

describe('the attributes on the table in the pile attempt (#1665)', () => {
  const planet = card('card-1', { type: 'mission', name: 'moab iv', originalName: 'Moab IV', missiontype: 'p', skills: 'Physics', points: 35 });
  const tn = person('card-2', 'Tenn', { icons: '[TN]' });
  const tng = person('card-3', 'Other', { icons: '[TNG]' });
  const table = tableOf({ mission: planet, awayTeam: [tn, tng] }, { core: [event('card-9', 'Dark Dissension')] });

  it('gives a [TN] personnel Integrity −1 and Cunning +1 with Dark Dissension in the core and the setting on', () => {
    const { attempt } = pileAttemptOf(pileTableInputOf(table, 0, undefined, true));
    const [p, q] = attempt.personnel;
    expect(p.attrs).toEqual([4, 6, 5]);
    expect(p.printed.attrs).toEqual([4, 6, 5]);
    expect(p.requirementProfile?.attrs ?? p.attrs).toEqual([4, 6, 5]);
    expect(q.attrs).toEqual([5, 5, 5]);
  });

  it('gives the printed values with the setting off', () => {
    const { attempt } = pileAttemptOf(pileTableInputOf(table, 0, undefined, false));
    expect(attempt.personnel.map((p) => p.attrs)).toEqual([[5, 5, 5], [5, 5, 5]]);
    expect(pileTableInputOf(table, 0)).toEqual(pileTableInputOf(table, 0, undefined, false));
  });

  it('gives a [TN] ship Weapons +1 and Shields −1 at a space mission', () => {
    const space = card('card-1', { type: 'mission', name: 'bilana', originalName: 'Bilana', missiontype: 's', skills: 'Physics', points: 35 });
    const ship = { ...card('card-5', { type: 'ship', name: 'ship', originalName: 'Ship', icons: '[TN]', range: 7, weapons: 6, shields: 6 }), crew: [tn] };
    const t = tableOf({ mission: space, ships: [ship] }, { core: [event('card-9', 'Dark Dissension')] });
    expect(pileAttemptOf(pileTableInputOf(t, 0, 'card-5', true)).attempt.ship).toMatchObject({ range: 7, weapons: 7, shields: 5 });
    expect(pileAttemptOf(pileTableInputOf(t, 0, 'card-5', false)).attempt.ship).toMatchObject({ range: 7, weapons: 6, shields: 6 });
  });
});

describe('a check one point of Cunning short, with U.S.S. Enterprise-J (#1665)', () => {
  // An Old Debt: "unless Biology, Physics, and Cunning>32", or a random Leadership personnel is killed.
  // The three have Cunning 11, 11 and 10, 32 in all, one short; +1 each on a mission worth 40 passes.
  const crew = [
    person('card-2', 'Alpha', { skills: 'Biology', cunning: 11 }),
    person('card-3', 'Beta', { skills: 'Physics', cunning: 11 }),
    person('card-4', 'Gamma', { skills: 'Leadership', cunning: 10 }),
  ];
  const mission = {
    ...card('card-1', { type: 'mission', name: 'forty', originalName: 'Forty', missiontype: 'p', skills: 'Physics', points: 40 }),
    placedOn: [event('card-8', 'U.S.S. Enterprise-J')],
  };
  const pile = [dilemma('card-6', 'An Old Debt'), dilemma('card-7', 'Wall of Fire')];
  const started = (cardText: boolean): TableState =>
    tableReducer(tableOf({ mission, awayTeam: crew }, { dilemmaPile: pile }), {
      type: 'botAttempt',
      missionIndex: 0,
      personnel: 3,
      subtract: 0,
      botDraw: 2,
      botSpend: 9,
      pile: [],
      drawn: ['card-6', 'card-7'],
      stack: ['card-6', 'card-7'],
      random: false,
      ...(cardText ? { cardText: true as const } : {}),
    });
  const revealed = (t: TableState) => tableReducer(t, { type: 'flip', id: 'card-6', picks: [['card-4']] });

  it('freezes the setting on the attempt', () => {
    expect(started(true).attempt?.cardText).toBe(true);
    expect(started(false).attempt).not.toHaveProperty('cardText');
  });

  it('passes with the setting on, and fails with it off', () => {
    const on = botResolveOf(revealed(started(true)));
    const off = botResolveOf(revealed(started(false)));
    if (!on.resolvable || !off.resolvable) throw new Error('no Resolve');
    expect(on.changes).toEqual([]);
    expect(on.preview).toMatch(/^No effect/);
    expect(off.changes).toEqual([{ op: 'kill', ids: ['card-4'] }]);
  });

  it('round-trips the frozen setting through a save, and a save without it restores off', () => {
    const deck = { mission: { count: 1, row: { collectorsinfo: '1M1', name: 'Mission', type: 'mission', missiontype: 'p' } } } as unknown as DeckList;
    const dealt = tableOf({ mission: { id: 'card-1', card: { ...deck.mission.row }, face: 'up' } });
    const restoreWith = (attempt: Record<string, unknown>) => {
      const save = toSavedGame(dealt, deck, 'builder');
      return fromSavedGame(JSON.stringify({ ...save, table: { ...save.table, attempt } }), deck)!.table.attempt;
    };
    const base = { missionIndex: 0, personnel: 3, subtract: 0, phase: 'face', drawn: 2, botDraw: 2, botSpend: 9 };
    expect(restoreWith({ ...base, cardText: true })?.cardText).toBe(true);
    expect(restoreWith(base)).toBeDefined();
    expect(restoreWith(base)).not.toHaveProperty('cardText');
    expect(restoreWith({ ...base, cardText: 'yes' })).toBeUndefined();
  });
});
