import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { attemptMissionRules } from '../../../app/decks/practice/attemptMissions';
import { attemptMissionRulesOf } from '../../../app/decks/practice/attempt';
import { completionBatch, completionEffectOf, scoreActions, scoreHolds } from '../../../app/decks/practice/completionEffects';
import { CompletionEffectPanel } from '../../../app/decks/practice/CompletionEffectPanel';
import { gameReducer, initialGameState, logEntryText } from '../../../app/decks/practice/gameLog';
import { CardInstance, initialTableState, MISSION_SLOTS, MissionSlot, TableAction, TableState } from '../../../app/decks/practice/tableReducer';

// The mission rows of #1908 that fit the triggers and steps of today: Alpha 5 Approach on every attempt, and the
// completions that score under a condition. Every mission row is invented but its title; every other card is
// invented.

let next = 0;
const inst = (card: any, more: Partial<CardInstance> = {}): CardInstance => ({ id: `c${++next}`, card, face: 'up', ...more });
const mission = (title: string, missiontype = 'p') => inst({ name: title.toLowerCase(), originalName: title, type: 'mission', missiontype });
const person = (name: string, extra: Record<string, string> = {}, more: Partial<CardInstance> = {}) =>
  inst({ name, originalName: name, type: 'personnel', affiliation: 'federation', cost: '2', skills: '', ...extra }, more);
const slotsOf = (slots: Partial<MissionSlot>[]): MissionSlot[] =>
  Array.from({ length: MISSION_SLOTS }, (_, i) => ({ mission: null, ships: [], awayTeam: [], underMission: [], ...slots[i] }));
const tableOf = (slots: Partial<MissionSlot>[]): TableState => ({ ...initialTableState, missions: slotsOf(slots) });
// A slot whose away team completed it.
const completedBy = (title: string, awayTeam: CardInstance[], missiontype = 'p'): Partial<MissionSlot> => ({
  mission: mission(title, missiontype),
  awayTeam,
  involved: awayTeam.map((c) => c.id),
});
const holds = (table: TableState, i = 0) => scoreHolds(table, i, completionEffectOf(table, i)!);

describe('Alpha 5 Approach Transport Crash Survivor (#1908)', () => {
  const ALPHA = mission('Alpha 5 Approach Transport Crash Survivor', 's');
  const OTHER = mission('Invented Planet');
  const team = (n: number) => Array.from({ length: n }, (_, i) => person(`p${i}`));

  it('adds draw +6 and spend +6 to an attempt anywhere with five or fewer unstopped personnel', () => {
    const place = { underMission: [], drawDeck: [], missions: [ALPHA.card, OTHER.card] };
    expect(attemptMissionRules(OTHER.card, team(5), place).auto).toEqual({ source: 'Alpha 5 Approach', draw: 6, spend: 6 });
    expect(attemptMissionRules(OTHER.card, team(6), place).auto).toBeUndefined();
    // A stopped personnel does not count.
    expect(attemptMissionRules(OTHER.card, [...team(5), person('s', {}, { stopped: true })], place).auto).toBeDefined();
    // Not in the player's slots: no change.
    expect(attemptMissionRules(OTHER.card, team(5)).auto).toBeUndefined();
  });

  it('joins the attempted mission’s own change', () => {
    const nebula = mission('Class 9 Nebula Bypass Disputed Region', 's');
    const place = { underMission: [], drawDeck: [], missions: [ALPHA.card, nebula.card] };
    expect(attemptMissionRules(nebula.card, team(3), place).auto).toEqual({ source: 'Class 9 Nebula, Alpha 5 Approach', draw: 5, spend: 5 });
  });

  it('reads the slots of the table', () => {
    const table = tableOf([{ mission: ALPHA }, { mission: OTHER, awayTeam: team(4) }]);
    expect(attemptMissionRulesOf(table, { kind: 'awayTeam', missionIndex: 1 }).auto).toEqual({ source: 'Alpha 5 Approach', draw: 6, spend: 6 });
  });
});

describe('the completions that score under a condition (#1908)', () => {
  it("Ba'ku Planet: scores 5 when no personnel completing it has Treachery, the opponents' 5 not checked", () => {
    const title = "Ba'ku Planet Safeguard Civilization";
    const clean = tableOf([completedBy(title, [person('a', { skills: 'diplomacy 2 honor' })])]);
    expect(completionEffectOf(clean, 0)).toMatchObject({ kind: 'score', points: 5, notChecked: "each opponent's 5 points" });
    expect(holds(clean)).toBe(true);
    expect(holds(tableOf([completedBy(title, [person('a', { skills: 'diplomacy treachery' })])]))).toBe(false);
    // A stopped personnel was not involved.
    const stopped = person('t', { skills: 'treachery' }, { stopped: true });
    expect(holds(tableOf([{ ...completedBy(title, [person('a'), stopped]), involved: [] }]))).toBe(false);
  });

  it("Earth Humanity's Home: scores 10 on the player's first completed space mission", () => {
    const earth = { mission: mission("Earth Humanity's Home", 'h') };
    const space = completedBy('Invented Space Mission', [person('a')], 's');
    const first = tableOf([space, earth]);
    const effect = completionEffectOf(first, 0)!;
    expect(effect).toMatchObject({ title: "Earth Humanity's Home", kind: 'score', points: 10, watches: { missionType: 's' } });
    expect(scoreHolds(first, 0, effect)).toBe(true);
    const second = tableOf([space, earth, { mission: mission('Another Space Mission', 's'), completed: true }]);
    expect(scoreHolds(second, 0, completionEffectOf(second, 0)!)).toBe(false);
    // A completed planet mission does not count, and a planet mission's completion does not fire it.
    const planet = tableOf([space, earth, { mission: mission('Invented Planet'), completed: true }]);
    expect(scoreHolds(planet, 0, completionEffectOf(planet, 0)!)).toBe(true);
    expect(completionEffectOf(tableOf([completedBy('Invented Planet', [person('a')]), earth]), 0)).toBeUndefined();
    // Without Earth in a slot, nothing.
    expect(completionEffectOf(tableOf([space]), 0)).toBeUndefined();
  });

  it('Ocampa System, Moab IV, Idran System and Lapideas System: the skills of the personnel completing it', () => {
    const at = (title: string, skills: string[]) => tableOf([completedBy(title, skills.map((s, i) => person(`p${i}`, { skills: s })))]);
    expect(holds(at('Ocampa System Salvage Debris', ['archaeology']))).toBe(true);
    expect(holds(at('Ocampa System Salvage Debris', ['engineer', 'engineer']))).toBe(true);
    expect(holds(at('Ocampa System Salvage Debris', ['engineer medical']))).toBe(false);
    expect(holds(at('Moab IV Avert Danger', ['2 physics']))).toBe(true);
    expect(holds(at('Moab IV Avert Danger', ['physics', 'science']))).toBe(false);
    expect(holds(at('Idran System Survey Star System', ['treachery']))).toBe(true);
    expect(holds(at('Idran System Survey Star System', ['honor']))).toBe(false);
    expect(holds(at('Lapideas System Geological Survey', ['geology', 'acquisition 2 geology']))).toBe(true);
    expect(holds(at('Lapideas System Geological Survey', ['geology', 'acquisition']))).toBe(false);
  });

  it('Ilari, Valt Minor and Near Marva IV: the personnel here', () => {
    const at = (title: string, team: CardInstance[]) => tableOf([completedBy(title, team)]);
    const kli = (extra: Record<string, string> = {}, more: Partial<CardInstance> = {}) => person('k', { affiliation: 'klingon', ...extra }, more);
    expect(holds(at('Ilari Oust Warlord', [kli(), kli()]))).toBe(true);
    // A stopped personnel here counts.
    expect(holds(at('Ilari Oust Warlord', [kli(), person('f', {}, { stopped: true })]))).toBe(false);
    expect(holds(at('Valt Minor Brute Force', [kli(), kli()]))).toBe(true);
    expect(holds(at('Valt Minor Brute Force', [kli(), person('f')]))).toBe(false);
    const maq = () => person('m', { icons: '[maq]' });
    expect(holds(at('Near Marva IV Elude Federation Forces', [maq(), maq(), maq(), maq()]))).toBe(true);
    expect(holds(at('Near Marva IV Elude Federation Forces', [maq(), maq(), maq(), person('f')]))).toBe(false);
    // A crew at the mission is here too.
    const ship = inst({ name: 'ship', type: 'ship' }, { crew: [maq(), maq()] });
    const crewed = tableOf([{ ...completedBy('Near Marva IV Elude Federation Forces', [maq(), maq()], 's'), ships: [ship] }]);
    expect(holds(crewed)).toBe(true);
  });

  it('Volan III: scores only while no other mission is completed', () => {
    const volan = completedBy('Volan III Investigate Maquis Activity', [person('a')]);
    expect(holds(tableOf([volan]))).toBe(true);
    expect(holds(tableOf([volan, { mission: mission('Invented Planet'), completed: true }]))).toBe(false);
  });

  it('shows the condition line and scores the points in one entry', () => {
    const table = tableOf([completedBy('Moab IV Avert Danger', [person('a', { skills: '2 science' })])]);
    const effect = completionEffectOf(table, 0)!;
    const actions: TableAction[][] = [];
    render(<CompletionEffectPanel table={table} missionIndex={0} effect={effect} onComplete={(a) => actions.push(a)} onClose={() => {}} />);
    expect(screen.getByTestId('completion-effect-condition').textContent).toBe(
      'Condition met: the personnel completing it have 2 Physics or 2 Science.'
    );
    fireEvent.click(screen.getByTestId('completion-effect-confirm'));
    expect(actions).toEqual([scoreActions(effect)]);
    const after = gameReducer(initialGameState(table), completionBatch(0, actions[0]));
    expect(after.table.score).toBe(5);
    expect(after.log).toHaveLength(1);
    expect(logEntryText(after.log[0])).toBe('Marked Moab IV Avert Danger complete, and scored 5 points');
  });

  it('disables the score when the condition does not hold, and names what is not checked', () => {
    const table = tableOf([completedBy("Ba'ku Planet Safeguard Civilization", [person('a', { skills: 'treachery' })])]);
    render(<CompletionEffectPanel table={table} missionIndex={0} effect={completionEffectOf(table, 0)!} onComplete={() => {}} onClose={() => {}} />);
    expect(screen.getByTestId('completion-effect-condition').getAttribute('data-met')).toBe('false');
    expect(screen.getByTestId('completion-effect-not-checked').textContent).toBe("Not checked: each opponent's 5 points.");
    expect((screen.getByTestId('completion-effect-confirm') as HTMLButtonElement).disabled).toBe(true);
  });
});
