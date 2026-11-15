import { costModelOf } from '../../lib/costModels/registry';
import { CostFacts, CostMission } from '../../lib/costModels/model';
import { moveCharge } from '../../lib/playCost';
import { costFactsOf } from '../../app/decks/practice/costFacts';
import { CardInstance, initialTableState } from '../../app/decks/practice/tableReducer';

// The cost models that count the player's missions, or the dilemmas beneath them (#1696), with
// invented missions.

const mission = (over: Partial<CostMission> = {}): CostMission => ({
  completed: false,
  name: 'Invented Mission',
  requirements: '',
  points: 30,
  type: 'p',
  icons: [],
  quadrant: 'a',
  dilemmasUnder: 0,
  regions: [],
  ...over,
});
const planet = (over: Partial<CostMission> = {}) => mission({ type: 'p', ...over });
const space = (over: Partial<CostMission> = {}) => mission({ type: 's', ...over });
const hq = () => mission({ type: 'h', name: 'Invented Headquarters' });
const empty = () => mission({ type: '', name: '', points: 0, quadrant: '' });
const facts = (...missions: CostMission[]): CostFacts => ({ commanded: [], core: [], hand: [], missions });

const play = (name: string, type: string, cost: number) => ({ name: name.toLowerCase(), originalName: name, type, cost: String(cost) });
const charge = (name: string, type: string, cost: number, f: CostFacts) => moveCharge('playAndDraw', 'hand', 'core', play(name, type, cost), f);

const TITLES = [
  'Accumulated Knowledge',
  'Mitchell',
  'Mortimer Harren Reclusive Genius',
  'Tal Celes Imprecise Analyst',
  'William Telfer Misguided Hypochondriac',
  'Tom Paris Competitive Pilot',
  'Thirst for Knowledge',
  'Danica Erickson Well Read',
  'Trellium-D',
  'U.S.S. Enterprise-A Olive Branch',
];

describe('the cost models that count missions (#1696)', () => {
  it('holds an ownCost model for each title', () => {
    for (const title of TITLES) expect(costModelOf(title)).toMatchObject({ title, family: 'ownCost' });
    expect(costModelOf('Trellium-D *VP')?.title).toBe('Trellium-D');
    expect(costModelOf('Tom Paris Best Pilot You Could Have')).toBeUndefined();
  });

  describe('Accumulated Knowledge', () => {
    it('costs −1 for each dilemma beneath the [SF] missions, and not beneath the others', () => {
      const f = facts(planet({ icons: ['[sf]'], dilemmasUnder: 2 }), space({ icons: ['[fed]', '[sf]'], dilemmasUnder: 3 }), planet({ icons: ['[fed]'], dilemmasUnder: 4 }));
      expect(charge('Accumulated Knowledge', 'event', 8, f)).toEqual({
        kind: 'play',
        cost: 3,
        source: { title: 'Accumulated Knowledge', reason: '5 dilemmas beneath your [SF] missions' },
      });
    });

    it('costs the printed cost with no dilemma beneath an [SF] mission', () => {
      expect(charge('Accumulated Knowledge', 'event', 8, facts(planet({ icons: ['[sf]'] }), planet({ dilemmasUnder: 3 })))).toEqual({ kind: 'play', cost: 8 });
    });
  });

  describe.each([
    ['Mitchell', 'Mitchell'],
    ['Mortimer Harren Reclusive Genius', 'Mortimer Harren'],
    ['Tal Celes Imprecise Analyst', 'Tal Celes'],
    ['William Telfer Misguided Hypochondriac', 'William Telfer'],
  ])('%s', (title, label) => {
    it('costs +2 for each planet mission', () => {
      expect(charge(title, 'personnel', 1, facts(planet(), space(), planet(), hq()))).toEqual({
        kind: 'play',
        cost: 5,
        source: { title: label, reason: 'you command 2 planet missions' },
      });
      expect(charge(title, 'personnel', 1, facts(planet(), space()))).toEqual({
        kind: 'play',
        cost: 3,
        source: { title: label, reason: 'you command 1 planet mission' },
      });
    });

    it('costs the printed cost with only space missions and a headquarters', () => {
      expect(charge(title, 'personnel', 1, facts(space(), hq(), empty()))).toEqual({ kind: 'play', cost: 1 });
    });
  });

  describe('Tom Paris Competitive Pilot', () => {
    it('costs −3 with four space missions', () => {
      expect(charge('Tom Paris Competitive Pilot', 'personnel', 4, facts(hq(), space(), space(), space(), space()))).toEqual({
        kind: 'play',
        cost: 1,
        source: { title: 'Tom Paris', reason: 'you command 4 space missions' },
      });
    });

    it('costs the printed cost with three', () => {
      expect(charge('Tom Paris Competitive Pilot', 'personnel', 4, facts(hq(), space(), space(), space(), planet()))).toEqual({ kind: 'play', cost: 4 });
    });
  });

  describe('Thirst for Knowledge', () => {
    it('costs −1 for each space mission, not a headquarters or an empty slot', () => {
      expect(charge('Thirst for Knowledge', 'event', 5, facts(hq(), space(), space(), space(), empty()))).toEqual({
        kind: 'play',
        cost: 2,
        source: { title: 'Thirst for Knowledge', reason: 'you command 3 space missions' },
      });
    });

    it('costs the printed cost with no space mission', () => {
      expect(charge('Thirst for Knowledge', 'event', 5, facts(hq(), planet()))).toEqual({ kind: 'play', cost: 5 });
    });

    it('never costs below 0', () => {
      expect(charge('Thirst for Knowledge', 'event', 3, facts(space(), space(), space(), space(), space()))).toMatchObject({ kind: 'play', cost: 0 });
    });
  });

  describe('Danica Erickson Well Read', () => {
    it('takes the [SF] mission with the most dilemmas beneath it, and names it', () => {
      const f = facts(
        planet({ name: 'Invented Alpha', icons: ['[sf]'], dilemmasUnder: 1 }),
        planet({ name: 'Invented Beta', icons: ['[sf]'], dilemmasUnder: 4 }),
        planet({ name: 'Invented Gamma', icons: ['[fed]'], dilemmasUnder: 6 })
      );
      expect(charge('Danica Erickson Well Read', 'personnel', 4, f)).toEqual({
        kind: 'play',
        cost: 0,
        source: { title: 'Danica Erickson', reason: '4 dilemmas beneath Invented Beta' },
      });
    });

    it('names the first [SF] mission on a tie', () => {
      const f = facts(planet({ name: 'Invented Alpha', icons: ['[sf]'], dilemmasUnder: 1 }), space({ name: 'Invented Beta', icons: ['[sf]'], dilemmasUnder: 1 }));
      expect(charge('Danica Erickson Well Read', 'personnel', 4, f)).toEqual({
        kind: 'play',
        cost: 3,
        source: { title: 'Danica Erickson', reason: '1 dilemma beneath Invented Alpha' },
      });
    });

    it('costs the printed cost with no dilemma beneath an [SF] mission', () => {
      expect(charge('Danica Erickson Well Read', 'personnel', 4, facts(planet({ icons: ['[sf]'] }), planet({ dilemmasUnder: 2 })))).toEqual({ kind: 'play', cost: 4 });
    });
  });

  describe('Trellium-D', () => {
    it('costs −1 for each Delphic Expanse mission, one with two regions once', () => {
      const f = facts(planet({ regions: ['delphic expanse'] }), space({ regions: ['invented reach', 'delphic expanse'] }), planet({ regions: ['sector 001'] }));
      expect(charge('Trellium-D *VP', 'equipment', 2, f)).toEqual({
        kind: 'play',
        cost: 0,
        source: { title: 'Trellium-D', reason: 'you command 2 Delphic Expanse missions' },
      });
    });

    it('costs the printed cost with missions of another region', () => {
      expect(charge('Trellium-D', 'equipment', 2, facts(planet({ regions: ['sector 001'] }), planet()))).toEqual({ kind: 'play', cost: 2 });
    });
  });

  describe('U.S.S. Enterprise-A Olive Branch', () => {
    it('costs −1 for each [Kli] mission', () => {
      expect(charge('U.S.S. Enterprise-A Olive Branch', 'ship', 7, facts(planet({ icons: ['[fed]', '[kli]'] }), space({ icons: ['[kli]'] }), planet({ icons: ['[fed]'] })))).toEqual({
        kind: 'play',
        cost: 5,
        source: { title: 'U.S.S. Enterprise-A', reason: 'you command 2 [Kli] missions' },
      });
    });

    it('costs the printed cost with no [Kli] mission', () => {
      expect(charge('U.S.S. Enterprise-A Olive Branch', 'ship', 7, facts(planet({ icons: ['[fed]'] })))).toEqual({ kind: 'play', cost: 7 });
    });
  });
});

describe('costFactsOf icons and regions (#1696)', () => {
  const inst = (id: string, card: Record<string, string>): CardInstance => ({ id, face: 'up', card: { name: id, type: 'mission', ...card } });
  const factsWith = (...cards: Record<string, string>[]) =>
    costFactsOf({ ...initialTableState, missions: initialTableState.missions.map((s, i) => (cards[i] ? { ...s, mission: inst(`m${i}`, cards[i]) } : s)) });

  it('gives no icons for an affiliation sentence, so an "except [Kli]" mission is no [Kli] mission', () => {
    const f = factsWith(
      { missiontype: 'p', affiliation: 'any affiliation (except [kli]) may attempt this mission.' },
      { missiontype: 's', affiliation: '[fed][kli]' }
    );
    expect(f.missions?.[0].icons).toEqual([]);
    expect(f.missions?.[1].icons).toEqual(['[fed]', '[kli]']);
    expect(charge('U.S.S. Enterprise-A Olive Branch', 'ship', 7, f)).toEqual({
      kind: 'play',
      cost: 6,
      source: { title: 'U.S.S. Enterprise-A', reason: 'you command 1 [Kli] mission' },
    });
  });

  it('parses every region of the keywords', () => {
    const f = factsWith({ missiontype: 'p', keywords: 'region: bajor system. region: cardassia system.' }, { missiontype: 's', keywords: 'region: delphic expanse.' });
    expect(f.missions?.[0].regions).toEqual(['bajor system', 'cardassia system']);
    expect(f.missions?.[1].regions).toEqual(['delphic expanse']);
    expect(f.missions?.[2].regions).toEqual([]);
  });
});
