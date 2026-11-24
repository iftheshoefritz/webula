import { initialTableState, CardInstance, TableState, MISSION_SLOTS } from '../../../app/decks/practice/tableReducer';
import { gameReducer, GameAction, initialGameState, logEntryText, withShuffleOrders } from '../../../app/decks/practice/gameLog';
import { isRuleWarning, ruleWarningsIn, ruleWarningsOf, ruleWarningText } from '../../../app/decks/practice/playRules';
import { attemptWarningsOf } from '../../../app/decks/practice/attemptRules';
import { playPlacesOf } from '../../../app/decks/practice/playPlaces';
import { modifierRowsOf } from '../../../lib/modifiers';

// Issue #1917: the play place of Anij, Artim and Sojef, and the attempt rules of Delta Flyer Innovative Vessel and
// They're Still Coming Through!, warned under "Check uniqueness and limits". The titles are real; their rows here
// hold only the fields the rules read.

const card = (id: string, row: Record<string, unknown>): CardInstance => ({
  id,
  card: { collectorsinfo: id, imagefile: id, unique: 'n', gametext: '', cost: '1', ...row } as CardInstance['card'],
  face: 'up',
});
const named = (id: string, name: string, type: string, extra: Record<string, unknown> = {}) =>
  card(id, { type, name: name.toLowerCase(), originalName: name, ...extra });
const person = (id: string) => named(id, `Crewman ${id}`, 'personnel');
const anij = named('anij', 'Anij Guiding Light', 'personnel');
const baku = named('baku', "Ba'ku Planet Collect Metaphasic Particles", 'mission', { missiontype: 'p' });
const other = named('m1', 'Moab IV', 'mission', { missiontype: 'p' });
const space = named('m2', 'Bilana System', 'mission', { missiontype: 's' });
const flyer = named('flyer', 'Delta Flyer Innovative Vessel', 'ship');
const voyager = named('voy', 'U.S.S. Voyager', 'ship');
const coming = named('tsct', "They're Still Coming Through!", 'event');

function table(over: Partial<TableState> = {}, ships: CardInstance[] = []): TableState {
  const missionCards = [other, baku, space];
  return {
    ...initialTableState,
    segment: 'playAndDraw',
    hand: [anij],
    missions: Array.from({ length: MISSION_SLOTS }, (_, i) => ({
      mission: missionCards[i] ?? null,
      ships: i === 2 ? ships.map((s) => ({ ...s, crew: [person(`c-${s.id}-1`), person(`c-${s.id}-2`)] })) : [],
      awayTeam: [person(`a${i}`)],
      underMission: [],
    })),
    ...over,
  };
}

describe('the rows of #1917', () => {
  it('are valid rows', () => {
    expect(modifierRowsOf('anij guiding light').map((r) => [r.source, r.changes, r.playTo])).toEqual([['played', { playPlace: 'forbid' }, "Ba'ku Planet"]]);
    expect(modifierRowsOf('delta flyer innovative vessel').map((r) => [r.source, r.target])).toEqual([['shipRow', 'crew']]);
    expect(modifierRowsOf("they're still coming through!").map((r) => [r.source, r.target])).toEqual([
      ['played', 'play'],
      ['core', 'attempting'],
    ]);
  });
});

describe('a play place (#1917)', () => {
  const at = (missionIndex: number) => ({ zone: 'missionPile' as const, missionIndex, pile: 'awayTeam' as const });

  it("lists the Ba'ku Planet slot as Anij's place, and no headquarters", () => {
    const hq = named('hq', 'Earth Cradle of the Federation', 'mission', { missiontype: 'h' });
    const withHq = table();
    withHq.missions[3] = { ...withHq.missions[3], mission: hq };
    const places = playPlacesOf({ ...anij.card, affiliation: 'non-aligned' }, withHq)!;
    expect([...places.awayTeams]).toEqual([1]);
    expect([...places.shipRows]).toEqual([]);
    expect([...playPlacesOf(anij.card, table({ missions: table().missions.map((s, i) => (i === 1 ? { ...s, mission: null } : s)) }))!.awayTeams]).toEqual([]);
  });

  it("warns of a play anywhere but Ba'ku Planet, and of none there or with no play", () => {
    const t = table();
    const warnings = ruleWarningsOf(t, anij, at(0), true);
    expect(warnings).toEqual([{ rule: 'playPlace', title: 'Anij Guiding Light', condition: "this personnel may (and must) play to {Ba'ku Planet}" }]);
    expect(ruleWarningText(warnings[0])).toBe("Anij Guiding Light: this personnel may (and must) play to {Ba'ku Planet}");
    expect(ruleWarningsOf(t, anij, at(1), true)).toEqual([]);
    expect(ruleWarningsOf(t, anij, at(0), false)).toEqual([]);
    expect(ruleWarningsOf(t, anij, 'core', true).map((w) => w.rule)).toEqual(['playPlace']);
  });

  it('stamps the warning on a charged play only with the setting on, and the entry ends with it', () => {
    const move: GameAction = { type: 'move', id: 'anij', to: at(0) };
    const on = withShuffleOrders(table(), move, [], false, true);
    expect(on.type === 'move' && on.ruleWarnings?.map((w) => w.rule)).toEqual(['playPlace']);
    const off = withShuffleOrders(table(), move, [], false, false);
    expect(off.type === 'move' && off.ruleWarnings).toBeUndefined();
    const game = gameReducer(initialGameState(table()), on);
    expect(logEntryText(game.log.at(-1)!)).toMatch(/; Anij Guiding Light: this personnel may \(and must\) play to \{Ba'ku Planet\}$/);
  });
});

describe('the attempt rules (#1917)', () => {
  it("warns for the crew of Delta Flyer Innovative Vessel, and not for another ship's", () => {
    const t = table({}, [flyer, voyager]);
    expect(attemptWarningsOf(t, { missionIndex: 2, shipId: 'flyer', personnel: 2 })).toEqual([
      { rule: 'attempt', title: 'Delta Flyer Innovative Vessel', condition: 'personnel aboard this ship cannot attempt missions' },
    ]);
    expect(attemptWarningsOf(t, { missionIndex: 2, shipId: 'voy', personnel: 2 })).toEqual([]);
    expect(attemptWarningsOf(t, { missionIndex: 0, personnel: 1 })).toEqual([]);
  });

  it("warns for an attempt of five with They're Still Coming Through! in the core, not of six, and not with it in the hand", () => {
    const t = table({ core: [coming] });
    expect(attemptWarningsOf(t, { missionIndex: 0, personnel: 5 })).toEqual([
      { rule: 'attempt', title: "They're Still Coming Through!", condition: 'you cannot begin a mission attempt with fewer than six personnel' },
    ]);
    expect(attemptWarningsOf(t, { missionIndex: 0, personnel: 6 })).toEqual([]);
    expect(attemptWarningsOf(table({ hand: [coming] }), { missionIndex: 0, personnel: 5 })).toEqual([]);
    expect(attemptWarningsOf(table({ core: [coming, { ...coming, id: 'tsct2' }] }), { missionIndex: 0, personnel: 5 })).toHaveLength(1);
  });

  it('stamps startAttempt only with the setting on; the entry ends with the warning; one undo takes back the attempt', () => {
    const t = table({ core: [coming] });
    const start: GameAction = { type: 'startAttempt', missionIndex: 0, personnel: 5, subtract: 0 };
    const off = withShuffleOrders(t, start, [], false, false);
    expect(off.type === 'startAttempt' && off.ruleWarnings).toBeUndefined();
    const on = withShuffleOrders(t, start, [], false, true);
    expect(on.type === 'startAttempt' && on.ruleWarnings?.map((w) => w.rule)).toEqual(['attempt']);
    const game = gameReducer(initialGameState(t), on);
    expect(game.table.attempt?.missionIndex).toBe(0);
    expect(logEntryText(game.log.at(-1)!)).toMatch(/draw\/spend 5; They're Still Coming Through!: you cannot begin a mission attempt with fewer than six personnel$/);
    const undone = gameReducer(game, { type: 'undo' });
    expect(undone.table.attempt).toBeUndefined();
    expect(undone.log).toHaveLength(0);
  });

  it('stamps a bot attempt too, and its entry ends with the warning', () => {
    const t = table({ opponent: 'bot', dilemmaPile: [] }, [flyer]);
    const bot: GameAction = { type: 'botAttempt', missionIndex: 2, shipId: 'flyer', personnel: 2, subtract: 0, botDraw: 2, botSpend: 2, pile: [], drawn: [], stack: [], random: false };
    const on = withShuffleOrders(t, bot, [], false, true);
    expect(on.type === 'botAttempt' && on.ruleWarnings?.map((w) => w.title)).toEqual(['Delta Flyer Innovative Vessel']);
    const game = gameReducer(initialGameState(t), on);
    expect(logEntryText(game.log.at(-1)!)).toMatch(/; Delta Flyer Innovative Vessel: personnel aboard this ship cannot attempt missions$/);
  });
});

describe('saves of the new warnings (#1917)', () => {
  it('reads the new kinds and drops a malformed one', () => {
    const good = { rule: 'attempt', title: 'X', condition: 'y' };
    expect(isRuleWarning(good)).toBe(true);
    expect(isRuleWarning({ rule: 'playPlace', title: 'X', condition: 'y' })).toBe(true);
    expect(ruleWarningsIn([good, { rule: 'attempt', title: 'X' }, { rule: 'playPlace', title: 'X', condition: '' }])).toEqual([good]);
  });
});
