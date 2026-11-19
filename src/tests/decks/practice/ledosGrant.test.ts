// Ledos (#1755): 5 more counters on the first turn, decided at the Draw 7 tap and kept on its log entry.
import { tableReducer, initialTableState, CardInstance, TableState } from '../../../app/decks/practice/tableReducer';
import { GameState, gameReducer, initialGameState, logEntryText, turnCounters } from '../../../app/decks/practice/gameLog';
import { limitPartsText } from '../../../app/decks/practice/TurnCounters';
import { firstTurnGrantsOf } from '../../../lib/costModels/registry';
import { missionsShareSkill } from '../../../lib/costModels/titles/counterLimit';
import type { CostFacts, CostMission } from '../../../lib/costModels/model';

const LEDOS = 'Ledos Preserve Isolated Culture';

const instance = (id: string): CardInstance => ({
  id,
  card: { name: `card ${id}`, originalName: `Card ${id}`, type: 'personnel' },
  face: 'down',
});
const mission = (id: string, name: string, skills: string, missiontype = 'P'): CardInstance => ({
  id,
  card: { name: name.toLowerCase(), originalName: name, type: 'mission', missiontype, skills },
  face: 'up',
});

const LEDOS_MISSION = mission('m0', LEDOS, 'Anthropology, Exobiology, Honor, and Cunning>32');
const others = [
  mission('m1', 'Invented Outpost', 'Leadership, Medical, and Cunning>30'),
  mission('m2', 'Invented Nebula', 'Astrometrics and Physics', 'S'),
  mission('m3', 'Invented World', 'Diplomacy or Law'),
  mission('m4', 'Invented Headquarters', '', 'H'),
];

const newGame = (missions: CardInstance[]): GameState =>
  initialGameState(
    tableReducer(initialTableState, {
      type: 'reset',
      cards: Array.from({ length: 10 }, (_, i) => instance(`c${i}`)),
      missions,
      dilemmas: [],
    })
  );

const draw7 = (game: GameState) => gameReducer(game, { type: 'drawOpeningHand' });
const counters = (game: GameState) => turnCounters(game.log, game.table.turn);

describe('the Ledos model (#1755)', () => {
  const m = (name: string, requirements: string, type = 'p'): CostMission =>
    ({ name, requirements: requirements.toLowerCase(), type, completed: false, points: 30, icons: [], quadrant: '', dilemmasUnder: 0 }) as CostMission;
  const facts = (missions: CostMission[]) => ({ missions }) as unknown as CostFacts;

  it('grants 5 with fewer than two headquarters and no skill shared', () => {
    expect(firstTurnGrantsOf(facts([m(LEDOS, 'Anthropology, Honor, and Cunning>32'), m('A', 'Law and Cunning>30'), m('HQ', '', 'h')]))).toEqual([
      { title: 'Ledos', amount: 5, reason: 'fewer than two headquarters, and no two missions require the same skill' },
    ]);
  });

  it('grants nothing with two headquarters, a shared skill, or no Ledos', () => {
    expect(firstTurnGrantsOf(facts([m(LEDOS, 'Anthropology'), m('HQ1', '', 'h'), m('HQ2', '', 'h')]))).toEqual([]);
    expect(firstTurnGrantsOf(facts([m(LEDOS, 'Honor or Law'), m('A', 'Law')]))).toEqual([]);
    expect(firstTurnGrantsOf(facts([m('A', 'Law'), m('B', 'Honor')]))).toEqual([]);
  });

  it('reads a skill on either side of an "or", and no attribute or filler word as a skill', () => {
    expect(missionsShareSkill([m('A', 'Honor or Law'), m('B', 'Law')])).toBe(true);
    expect(missionsShareSkill([m('A', 'Honor and Cunning>32'), m('B', 'Law and Cunning>30')])).toBe(false);
  });
});

describe('the grant at the Draw 7 tap (#1755)', () => {
  it('keeps the grant on the opening hand entry: a limit of 12, and the parts read "7 + 5 Ledos"', () => {
    const game = draw7(newGame([LEDOS_MISSION, ...others]));
    const entry = game.log[game.log.length - 1];
    expect(entry).toMatchObject({ kind: 'openingHand', grants: [{ title: 'Ledos', amount: 5 }] });
    expect(logEntryText(entry)).toBe('Drew the opening hand (7 cards); Ledos +5 counters this turn');
    expect(counters(game).limit).toBe(12);
    expect(limitPartsText(counters(game))).toBe('7 + 5 Ledos');
  });

  it('records no grant when a condition fails at the tap', () => {
    const twoHq = draw7(newGame([LEDOS_MISSION, others[0], mission('h2', 'Other HQ', '', 'H'), others[3]]));
    expect(twoHq.log[twoHq.log.length - 1]).not.toHaveProperty('grants');
    expect(counters(twoHq).limit).toBe(7);
    const shared = draw7(newGame([LEDOS_MISSION, mission('m5', 'Invented Ruins', 'Honor or Archaeology')]));
    expect(counters(shared).limit).toBe(7);
    expect(counters(draw7(newGame(others))).limit).toBe(7);
  });

  it('keeps the grant through a later change to the missions in turn 1', () => {
    const game = draw7(newGame([LEDOS_MISSION, ...others]));
    const table: TableState = { ...game.table, missions: game.table.missions.map((s, i) => (i === 0 ? { ...s, mission: null } : s)) };
    expect(turnCounters(game.log, table.turn).limit).toBe(12);
  });

  it('is gone on turn 2, and an undo of the tap takes it back', () => {
    const game = draw7(newGame([LEDOS_MISSION, ...others]));
    const next = gameReducer(game, { type: 'nextTurn' });
    expect(next.table.turn).toBe(2);
    expect(counters(next).limit).toBe(7);
    expect(counters(gameReducer(game, { type: 'undo' })).limit).toBe(7);
  });

  it('counts a change of the limit in turn 1 against 12', () => {
    const raised = gameReducer(draw7(newGame([LEDOS_MISSION, ...others])), { type: 'adjustCounterLimit', delta: 1 });
    expect(raised.log[raised.log.length - 1]).toMatchObject({ kind: 'counterLimit', limit: 13 });
    expect(counters(raised).limit).toBe(13);
  });
});
