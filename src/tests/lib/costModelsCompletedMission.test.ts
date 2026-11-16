import { costModelOf } from '../../lib/costModels/registry';
import { CostFacts, CostMission } from '../../lib/costModels/model';
import { moveCharge } from '../../lib/playCost';
import { costFactsOf } from '../../app/decks/practice/costFacts';
import { CardInstance, initialTableState } from '../../app/decks/practice/tableReducer';

// The cost models of the personnel that cost −4 when the player has completed a mission requiring a
// skill (#1694), with invented missions.

const mission = (name: string, requirements: string, completed = true): CostMission => ({
  completed,
  name,
  requirements: requirements.toLowerCase(),
  points: 30,
  type: 'p',
  icons: [],
  quadrant: 'a',
  dilemmasUnder: 0,
});
const facts = (...missions: CostMission[]): CostFacts => ({ commanded: [], core: [], hand: [], missions });

const play = (name: string, cost: number) => ({ name: name.toLowerCase(), originalName: name, type: 'personnel', cost: String(cost) });
const charge = (name: string, cost: number, f: CostFacts) => moveCharge('playAndDraw', 'hand', 'awayTeam', play(name, cost), f);

const TITLES: [string, string, string, string][] = [
  ['Nador Curious Commander', 'Nador', 'Officer', 'Treachery'],
  ['Data Lucasian Chair', 'Data', 'Diplomacy', 'Leadership'],
  ['A. G. Robinson Prototype Captain', 'A. G. Robinson', 'Astrometrics', 'Navigation'],
  ['Gorkon Visionary Chancellor', 'Gorkon', 'Diplomacy', 'Leadership'],
  ['Kathryn Janeway Regretful Leader', 'Kathryn Janeway', 'Engineer', 'Science'],
  ['William Ross "Temporary" Ally', 'William Ross', 'Diplomacy', 'Officer'],
  ['Shakaar Edon First Minister of Bajor', 'Shakaar Edon', 'Anthropology', 'Leadership'],
  ['Brunt Acting Grand Nagus', 'Brunt', 'Acquisition', 'Treachery'],
];

describe('the cost models of a completed mission requiring a skill (#1694)', () => {
  it('holds an ownCost model for each title', () => {
    for (const [title] of TITLES) expect(costModelOf(title)).toMatchObject({ title, family: 'ownCost' });
    expect(costModelOf('Data Lucasian Chair *VP')?.title).toBe('Data Lucasian Chair');
    expect(costModelOf('Data Lucasian Chair *A')?.title).toBe('Data Lucasian Chair');
    expect(costModelOf('William Ross "Temporary" Ally *VP')?.title).toBe('William Ross "Temporary" Ally');
  });

  describe.each(TITLES)('%s', (title, label, first, second) => {
    it(`costs −4 with a completed mission requiring ${first}`, () => {
      expect(charge(title, 4, facts(mission('Moab IV', `${first}, Physics, and Cunning>32`)))).toEqual({
        kind: 'play',
        cost: 0,
        source: { title: label, reason: `you completed Moab IV (requires ${first})` },
      });
    });

    it(`costs −4 with a completed mission requiring ${second} after an "or"`, () => {
      expect(charge(title, 6, facts(mission('Angel I', `Honor, Medical, and (Biology or ${second})`)))).toEqual({
        kind: 'play',
        cost: 2,
        source: { title: label, reason: `you completed Angel I (requires ${second})` },
      });
    });

    it('costs the printed cost when the mission is not completed, or requires neither skill', () => {
      expect(charge(title, 4, facts(mission('Moab IV', first, false)))).toEqual({ kind: 'play', cost: 4 });
      expect(charge(title, 4, facts(mission('Moab IV', 'Honor, Medical, and Cunning>30')))).toEqual({ kind: 'play', cost: 4 });
      expect(charge(title, 4, facts())).toEqual({ kind: 'play', cost: 4 });
    });
  });

  it('names the first completed mission that matches, and skips one that is not completed', () => {
    const f = facts(mission('Moab IV', 'Diplomacy', false), mission('Angel I', 'Honor'), mission('Bilana System', 'Leadership'));
    expect(charge('Data Lucasian Chair *VP', 5, f)).toEqual({
      kind: 'play',
      cost: 1,
      source: { title: 'Data', reason: 'you completed Bilana System (requires Leadership)' },
    });
  });

  it('does not match a skill inside another word', () => {
    expect(charge('Kathryn Janeway Regretful Leader', 4, facts(mission('Moab IV', 'Engineering, Sciences')))).toEqual({ kind: 'play', cost: 4 });
  });
});

describe('costFactsOf missions (#1694)', () => {
  it('builds one entry per mission slot, an empty slot too', () => {
    const inst = (id: string, card: Record<string, string>): CardInstance => ({ id, face: 'up', card: { name: id, ...card } });
    const missions = initialTableState.missions.map((s, i) =>
      i === 0
        ? {
            ...s,
            completed: true,
            mission: inst('m', {
              originalName: 'Invented Planet',
              type: 'mission',
              missiontype: 'p',
              skills: 'diplomacy or leadership, 2 security',
              points: '35',
              affiliation: '[baj][fed]',
              quadrant: 'a',
            }),
            underMission: [inst('d1', { type: 'dilemma' }), inst('d2', { type: 'dilemma' }), inst('e', { type: 'event' })],
          }
        : s
    );
    const result = costFactsOf({ ...initialTableState, missions }).missions;
    expect(result).toHaveLength(initialTableState.missions.length);
    expect(result?.[0]).toEqual({
      completed: true,
      name: 'Invented Planet',
      requirements: 'diplomacy or leadership, 2 security',
      points: 35,
      type: 'p',
      icons: ['[baj]', '[fed]'],
      quadrant: 'a',
      dilemmasUnder: 2,
      regions: [],
      personnel: [],
      ships: [],
    });
    expect(result?.[1]).toEqual({ completed: false, name: '', requirements: '', points: 0, type: '', icons: [], quadrant: '', dilemmasUnder: 0, regions: [], personnel: [], ships: [] });
  });
});
