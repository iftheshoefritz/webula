import { costModelOf } from '../../lib/costModels/registry';
import { CommandedTraits, CostFacts } from '../../lib/costModels/model';
import { moveCharge } from '../../lib/playCost';
import { partnerTraitsOf, TraitsRow } from '../../lib/dilemmaBot/simulator';
import { costFactsOf } from '../../app/decks/practice/costFacts';
import { CardInstance, initialTableState } from '../../app/decks/practice/tableReducer';

// The cost models of the personnel that cost less while the player commands a named group (#1701):
// two [Pa] Klingons, or Khan Noonien Singh. The personnel are invented, the traits real.

const person = (row: Partial<TraitsRow>): CommandedTraits => ({ ...partnerTraitsOf({ name: 'an invented personnel', ...row }), unique: false });
const facts = (...commanded: CommandedTraits[]): CostFacts => ({ commanded, core: [], hand: [] });

const play = (name: string, cost: number) => ({ name: name.toLowerCase(), originalName: name, type: 'personnel', cost: String(cost) });
const charge = (name: string, cost: number, f: CostFacts) => moveCharge('playAndDraw', 'hand', 'awayTeam', play(name, cost), f);

const paKlingon = person({ species: 'Klingon', icons: '[Cmd][Pa]', affiliation: 'klingon' });
const klingon = person({ species: 'Klingon', icons: '[Cmd]', affiliation: 'klingon' });
const paHuman = person({ species: 'Human', icons: '[Stf][Pa]', affiliation: 'klingon' });
const khan = person({ name: 'Khan Noonien Singh Invented Subtitle', species: 'Human', icons: '[Cmd][Pa]' });

// Each title with its label, its printed cost and its reduction.
const KLINGON_TITLES: [string, string, number, number][] = [
  ['Kang Vigilant Commander', 'Kang', 4, 2],
  ['Khod Conniving Captain', 'Khod', 3, 2],
  ['Koloth Ingratiating Captain', 'Koloth', 4, 2],
  ['Kor Courageous Governor', 'Kor', 4, 2],
  ['Kras Merciless Officer', 'Kras', 3, 2],
  ['Korax Instigator', 'Korax', 2, 1],
  ["Ro'suv", "Ro'suv", 3, 1],
];
const KHAN_TITLES = ['Rodriguez', 'Kati', 'McPherson', 'Otto'];

describe('the cost models of a named group (#1701)', () => {
  it('holds an ownCost model for each title, by its name with a version suffix too', () => {
    for (const title of [...KLINGON_TITLES.map(([t]) => t), ...KHAN_TITLES]) expect(costModelOf(title)).toMatchObject({ title, family: 'ownCost' });
    for (const title of ['Kang Vigilant Commander', 'Koloth Ingratiating Captain', 'Kor Courageous Governor']) {
      expect(costModelOf(`${title} *A`)?.title).toBe(title);
    }
    expect(costModelOf('Kang Honored Warrior')).toBeUndefined();
    expect(costModelOf('Kor Dahar Master')).toBeUndefined();
  });

  it.each(KLINGON_TITLES)('charges %s less at two [Pa] Klingons, each both', (title, label, printed, off) => {
    expect(charge(title, printed, facts(paKlingon))).toEqual({ kind: 'play', cost: printed });
    expect(charge(title, printed, facts(paKlingon, klingon, paHuman))).toEqual({ kind: 'play', cost: printed });
    expect(charge(title, printed, facts(paKlingon, paKlingon))).toEqual({
      kind: 'play',
      cost: printed - off,
      source: { title: label, reason: 'you command 2 [Pa] Klingons' },
    });
    expect(charge(title, printed, facts(paKlingon, paKlingon, paKlingon))).toEqual({
      kind: 'play',
      cost: printed - off,
      source: { title: label, reason: 'you command 3 [Pa] Klingons' },
    });
  });

  it.each(KHAN_TITLES)('charges %s −2 while a Khan Noonien Singh is commanded', (title) => {
    expect(charge(title, 4, facts(paHuman))).toEqual({ kind: 'play', cost: 4 });
    expect(charge(title, 4, facts(person({ name: 'An Invented Khan Follower' }), person({ name: 'Khan Noonien Singhzzz' })))).toEqual({
      kind: 'play',
      cost: 4,
    });
    expect(charge(title, 4, facts(paHuman, khan))).toEqual({ kind: 'play', cost: 2, source: { title, reason: 'you command Khan Noonien Singh' } });
    expect(charge(title, 4, facts(khan, khan))).toEqual({ kind: 'play', cost: 2, source: { title, reason: 'you command Khan Noonien Singh' } });
  });

  it('counts the [Pa] Klingons the player commands, never the brig', () => {
    const inst = (id: string): CardInstance => ({
      id,
      face: 'up',
      card: { name: `invented ${id}`, type: 'personnel', species: 'Klingon', icons: '[Cmd][Pa]', affiliation: 'klingon' },
    });
    const missions = initialTableState.missions.map((s, i) => (i === 0 ? { ...s, awayTeam: [inst('a')] } : s));
    const table = { ...initialTableState, missions, brig: [inst('b')] };
    expect(charge('Korax Instigator', 2, costFactsOf(table))).toEqual({ kind: 'play', cost: 2 });
    const two = { ...table, missions: missions.map((s, i) => (i === 0 ? { ...s, awayTeam: [inst('a'), inst('c')] } : s)) };
    expect(charge('Korax Instigator', 2, costFactsOf(two))).toEqual({
      kind: 'play',
      cost: 1,
      source: { title: 'Korax', reason: 'you command 2 [Pa] Klingons' },
    });
  });
});
