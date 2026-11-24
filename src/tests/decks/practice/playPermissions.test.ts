import { initialTableState, CardInstance, TableState, MISSION_SLOTS } from '../../../app/decks/practice/tableReducer';
import {
  actionWarned,
  entryRuleWarnings,
  gameReducer,
  GameAction,
  initialGameState,
  logEntryText,
  withShuffleOrders,
} from '../../../app/decks/practice/gameLog';
import { drawWarningsOf, isRuleWarning, ruleWarningsIn, ruleWarningsOf, ruleWarningText } from '../../../app/decks/practice/playRules';
import { modifierRowsOf, modifierTitles, rowsByTitle, row } from '../../../lib/modifiers';
import { PERMISSION_ROWS } from '../../../lib/modifiers/titles/permissions';

// Issue #1916: the permissions of the play requirements and of Rule of Acquisition #6's "You cannot spend counters
// to draw cards", warned under "Check uniqueness and limits". The titles are real; their rows here hold only the
// fields the rules read.

const card = (id: string, row: Record<string, unknown>): CardInstance => ({
  id,
  card: { collectorsinfo: id, imagefile: id, unique: 'n', gametext: '', cost: '1', ...row } as CardInstance['card'],
  face: 'up',
});
const named = (id: string, name: string, type: string, extra: Record<string, unknown> = {}) =>
  card(id, { type, name: name.toLowerCase(), originalName: name, ...extra });
const borg = (id: string) => named(id, `Drone ${id}`, 'personnel', { affiliation: 'borg' });
const particle = named('p010', 'Particle 010', 'event');
const rule6 = named('r6', 'Rule of Acquisition #6', 'event', { cost: '0' });
const mission = (id: string, missiontype = 'p') => named(id, `Mission ${id}`, 'mission', { missiontype });

function table(over: Partial<TableState> & { awayTeam?: CardInstance[]; missionCards?: CardInstance[] } = {}): TableState {
  const { awayTeam = [], missionCards, ...rest } = over;
  return {
    ...initialTableState,
    segment: 'playAndDraw',
    missions: Array.from({ length: MISSION_SLOTS }, (_, i) => ({
      mission: missionCards ? (missionCards[i] ?? null) : i < 2 ? mission(`m${i}`) : null,
      ships: [],
      awayTeam: i === 0 ? awayTeam : [],
      underMission: [],
    })),
    drawDeck: [named('d1', 'Deck Card', 'event'), named('d2', 'Deck Card Two', 'event')],
    ...rest,
  };
}

const run = (start: TableState, action: GameAction, checkRules = true) => {
  const chosen = withShuffleOrders(start, action, [], false, checkRules);
  return { state: gameReducer(initialGameState(start), chosen), chosen };
};

describe('the permission rows (#1916)', () => {
  it('are valid rows, one play row a title, and Rule of Acquisition #6 forbids a spend to draw from the core', () => {
    expect(() => rowsByTitle(PERMISSION_ROWS)).not.toThrow();
    expect(modifierTitles(['play']).size).toBe(PERMISSION_ROWS.filter((r) => r.changes.play).length);
    expect(modifierRowsOf('rule of acquisition #6').map((r) => [r.source, Object.keys(r.changes)])).toEqual([
      ['played', ['play']],
      ['core', ['spendToDraw']],
    ]);
  });

  it('still throws for a permission at a place no check reads', () => {
    expect(() => rowsByTitle([row('Bad', 'mission', 'play', { play: 'forbid' })])).toThrow(/a place no evaluator reads/);
    expect(() => rowsByTitle([row('Bad', 'played', 'play', { spendToDraw: 'forbid' })])).toThrow(/a place no evaluator reads/);
  });
});

describe('a play requirement (#1916)', () => {
  const core = 'core' as const;

  it('warns of a play of Particle 010 with no Borg, in the words of its condition', () => {
    const t = table({ hand: [particle] });
    const warnings = ruleWarningsOf(t, particle, core, true);
    expect(warnings).toEqual([{ rule: 'playRequirement', title: 'Particle 010', condition: 'you must command three [Bor] personnel' }]);
    expect(ruleWarningText(warnings[0])).toBe('Particle 010: you must command three [Bor] personnel');
  });

  it('warns of none with three unstopped [Bor] personnel, and of one with a third stopped', () => {
    expect(ruleWarningsOf(table({ hand: [particle], awayTeam: [borg('b1'), borg('b2'), borg('b3')] }), particle, core, true)).toEqual([]);
    const stopped = { ...borg('b3'), stopped: true };
    expect(ruleWarningsOf(table({ hand: [particle], awayTeam: [borg('b1'), borg('b2'), stopped] }), particle, core, true)).toHaveLength(1);
  });

  it('warns of nothing for a move that is no play', () => {
    expect(ruleWarningsOf(table({ hand: [particle] }), particle, core, false)).toEqual([]);
  });

  it('reads an affiliation and an icon together, space missions, a negated condition, a title in play and a keyword', () => {
    const t = table({ hand: [], missionCards: [mission('h', 'h'), mission('s1', 's')] });
    const warn = (c: CardInstance, at: TableState = t) => ruleWarningsOf(at, c, core, true).map(ruleWarningText);
    const d7 = named('d7', 'D-7 Battlecruiser', 'ship');
    expect(warn(d7)).toEqual(['D-7 Battlecruiser: you must command two [Pa][Kli] personnel']);
    const kli = (id: string, icons: string) => named(id, `K ${id}`, 'personnel', { affiliation: 'klingon', icons });
    expect(warn(d7, table({ awayTeam: [kli('k1', '[pa]'), kli('k2', '[cmd][pa]')] }))).toEqual([]);
    expect(warn(d7, table({ awayTeam: [kli('k1', '[pa]'), kli('k2', '[cmd]')] }))).toHaveLength(1);
    expect(warn(named('df', 'Delta Flyer Rebuilt "Hot Rod"', 'ship'))).toEqual(['Delta Flyer Rebuilt "Hot Rod": you must command four space missions']);
    expect(warn(named('fw', 'Finding Our Way', 'event'))).toEqual(['Finding Our Way: you must not command a headquarters mission']);
    expect(warn(named('fw', 'Finding Our Way', 'event'), table())).toEqual([]);
    expect(warn(named('rh', 'To Rule in Hell', 'event'))).toEqual(['To Rule in Hell: you cannot command a headquarters mission']);
    const coming = named('tc', "They're Still Coming Through!", 'event');
    expect(warn(coming)).toEqual(["They're Still Coming Through!: you must command {To Rule in Hell}"]);
    const hell = named('rh', 'To Rule in Hell', 'event');
    expect(warn(coming, table({ missionCards: [{ ...mission('m0'), placedOn: [hell] }] }))).toEqual([]);
    const count = named('cm', 'Deal With the Count Man', 'event');
    expect(warn(count)).toEqual(['Deal With the Count Man: you must command a Thief']);
    const thief = named('th', 'Thief', 'personnel', { keywords: 'Commander: Fortune. Thief.' });
    expect(warn(count, table({ awayTeam: [thief] }))).toEqual([]);
  });

  it('stamps the warning on a play with the setting on, names it in the entry, and records nothing with it off', () => {
    const t = table({ hand: [particle] });
    const { state, chosen } = run(t, { type: 'move', id: 'p010', to: 'core' });
    expect(actionWarned(chosen)).toBe(true);
    expect(entryRuleWarnings(state.log[0]).map((w) => w.rule)).toEqual(['playRequirement']);
    expect(logEntryText(state.log[0])).toMatch(/; Particle 010: you must command three \[Bor\] personnel$/);
    const off = run(t, { type: 'move', id: 'p010', to: 'core' }, false);
    expect(actionWarned(off.chosen)).toBe(false);
    expect(entryRuleWarnings(off.state.log[0])).toEqual([]);
  });
});

describe('a spend of counters to draw (#1916)', () => {
  const draw: GameAction = { type: 'drawCard', from: 'drawDeck', to: 'hand' };

  it('warns of a charged draw while Rule of Acquisition #6 is in the core, each title once', () => {
    const t = table({ core: [rule6, { ...rule6, id: 'r6b' }] });
    expect(drawWarningsOf(t)).toEqual([{ rule: 'spendToDraw', title: 'Rule of Acquisition #6', condition: 'you cannot spend counters to draw cards' }]);
    const { state, chosen } = run(t, draw);
    expect(actionWarned(chosen)).toBe(true);
    expect(entryRuleWarnings(state.log[0])).toEqual(drawWarningsOf(t));
    expect(logEntryText(state.log[0])).toBe(
      'Drew a card from the draw deck into the hand (cost 1); Rule of Acquisition #6: you cannot spend counters to draw cards'
    );
  });

  it('warns of no draw with it elsewhere, of no uncharged draw, of no Draw 7, and of nothing with the setting off', () => {
    expect(actionWarned(run(table({ hand: [rule6] }), draw).chosen)).toBe(false);
    expect(actionWarned(run(table({ core: [rule6], segment: 'orders' }), draw).chosen)).toBe(false);
    expect(actionWarned(run(table({ core: [rule6] }), draw, false).chosen)).toBe(false);
    const opening = run({ ...table({ core: [rule6] }), openingHand: 'pending' }, { type: 'drawOpeningHand' });
    expect(entryRuleWarnings(opening.state.log[0])).toEqual([]);
  });
});

describe('the saved warnings (#1916)', () => {
  it('reads the old kinds as before and drops a malformed new one', () => {
    const old = [{ rule: 'unique', title: 'Data' }, { rule: 'limitPerShip', title: 'Inspiring Leader', place: 'Galor' }];
    expect(ruleWarningsIn(old)).toEqual(old);
    expect(ruleWarningText(old[0] as never)).toBe('Unique: Data is already in play');
    expect(isRuleWarning({ rule: 'playRequirement', title: 'Particle 010' })).toBe(false);
    expect(isRuleWarning({ rule: 'spendToDraw', title: 'Rule of Acquisition #6', condition: 3 })).toBe(false);
    expect(isRuleWarning({ rule: 'playRequirement', title: 'Particle 010', condition: 'you must command three [Bor] personnel' })).toBe(true);
  });
});
