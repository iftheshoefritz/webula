import { costModelOf } from '../../lib/costModels/registry';
import { CommandedTraits, CostFacts } from '../../lib/costModels/model';
import { moveCharge } from '../../lib/playCost';
import { partnerTraitsOf, TraitsRow } from '../../lib/dilemmaBot/simulator';
import { costFactsOf } from '../../app/decks/practice/costFacts';
import { CardInstance, initialTableState } from '../../app/decks/practice/tableReducer';

// The cost models of the cards that cost less while the player commands certain personnel (#1693),
// with invented personnel.

const person = (row: Partial<TraitsRow>, unique = false): CommandedTraits => ({
  ...partnerTraitsOf({ name: 'an invented personnel', ...row }),
  unique,
});
const facts = (...commanded: CommandedTraits[]): CostFacts => ({ commanded, core: [], hand: [] });
const times = (n: number, p: CommandedTraits): CommandedTraits[] => Array.from({ length: n }, () => p);

const play = (name: string, cost: number, type = 'personnel') => ({ name: name.toLowerCase(), originalName: name, type, cost: String(cost) });
const charge = (name: string, cost: number, f: CostFacts, type = 'personnel') => moveCharge('playAndDraw', 'hand', 'awayTeam', play(name, cost, type), f);

const traitor = person({ skills: 'Treachery' });
const officer = person({ skills: 'Officer' });
const plain = person({ skills: 'Diplomacy', affiliation: 'federation' });

const TITLES = [
  'Seska Pragmatic Agent',
  'Elim Garak Crafty Underling',
  'Keevan',
  'Lwaxana Troi Extraordinary Ambassador',
  'Lwaxana Troi Extravagant Ambassador',
  'Six of Ten Invalidation Drone',
  'Weyoun "Defective" Clone',
  'Beverly Crusher Battleship Doctor',
  'Jadzia Dax Elder',
  'Paul Mayweather Burdened with Command',
  'Assimilator Rogue Borg Vessel',
  "Rekar Tool of the Tal'Shiar",
  "T'Pol Not a Slave",
];

describe('the cost models of commanded personnel (#1693)', () => {
  it('holds an ownCost model for each title, by its name with a version suffix too', () => {
    for (const title of TITLES) expect(costModelOf(title)).toMatchObject({ title, family: 'ownCost' });
    expect(costModelOf('Keevan (SS)')?.title).toBe('Keevan');
    expect(costModelOf('Seska Pragmatic Agent (FOW)')?.title).toBe('Seska Pragmatic Agent');
    expect(costModelOf('Elim Garak Crafty Underling *A')?.title).toBe('Elim Garak Crafty Underling');
    expect(costModelOf('Keevan Conniving Liar')).toBeUndefined();
  });

  it('charges Seska −1 for each Treachery personnel', () => {
    expect(charge('Seska Pragmatic Agent', 6, facts(plain))).toEqual({ kind: 'play', cost: 6 });
    expect(charge('Seska Pragmatic Agent', 6, facts(traitor))).toEqual({
      kind: 'play',
      cost: 5,
      source: { title: 'Seska', reason: 'you command 1 Treachery personnel' },
    });
    expect(charge('Seska Pragmatic Agent', 6, facts(traitor, plain, traitor))).toEqual({
      kind: 'play',
      cost: 4,
      source: { title: 'Seska', reason: 'you command 2 Treachery personnel' },
    });
  });

  it('charges Elim Garak −1 while a Treachery personnel is commanded, once', () => {
    expect(charge('Elim Garak Crafty Underling', 4, facts(plain))).toEqual({ kind: 'play', cost: 4 });
    expect(charge('Elim Garak Crafty Underling', 4, facts(traitor, traitor))).toEqual({
      kind: 'play',
      cost: 3,
      source: { title: 'Elim Garak', reason: 'you command a Treachery personnel' },
    });
  });

  it('charges Keevan −1 only for a Ferengi who is an Engineer', () => {
    const ferengi = person({ species: 'Ferengi', skills: 'Acquisition' });
    const engineer = person({ species: 'Human', skills: 'Engineer' });
    expect(charge('Keevan', 2, facts(ferengi, engineer), 'equipment')).toEqual({ kind: 'play', cost: 2 });
    expect(charge('Keevan (SS)', 2, facts(person({ species: 'Ferengi', skills: 'Engineer' })), 'equipment')).toEqual({
      kind: 'play',
      cost: 1,
      source: { title: 'Keevan', reason: 'you command a Ferengi Engineer personnel' },
    });
  });

  it('charges Lwaxana Troi Extraordinary Ambassador −1 for each non-[Fed] personnel, never below 0', () => {
    const name = 'Lwaxana Troi Extraordinary Ambassador';
    const romulan = person({ affiliation: 'romulan' });
    expect(charge(name, 3, facts(plain, plain))).toEqual({ kind: 'play', cost: 3 });
    expect(charge(name, 3, facts(plain, romulan))).toEqual({ kind: 'play', cost: 2, source: { title: name, reason: 'you command 1 non-[Fed] personnel' } });
    expect(charge(name, 3, facts(...times(5, romulan)))).toEqual({ kind: 'play', cost: 0, source: { title: name, reason: 'you command 5 non-[Fed] personnel' } });
  });

  it('charges Lwaxana Troi Extravagant Ambassador −5 at three [Fed] personnel', () => {
    const name = 'Lwaxana Troi Extravagant Ambassador';
    expect(charge(name, 6, facts(plain, plain))).toEqual({ kind: 'play', cost: 6 });
    expect(charge(name, 6, facts(plain, plain, plain))).toEqual({ kind: 'play', cost: 1, source: { title: name, reason: 'you command 3 [Fed] personnel' } });
  });

  it('charges Six of Ten −1 while a unique personnel is commanded', () => {
    expect(charge('Six of Ten Invalidation Drone', 4, facts(plain))).toEqual({ kind: 'play', cost: 4 });
    expect(charge('Six of Ten Invalidation Drone', 4, facts(plain, person({}, true)))).toEqual({
      kind: 'play',
      cost: 3,
      source: { title: 'Six of Ten', reason: 'you command a unique personnel' },
    });
  });

  it('charges Weyoun −1 while a Law personnel is commanded', () => {
    expect(charge('Weyoun "Defective" Clone', 4, facts(officer))).toEqual({ kind: 'play', cost: 4 });
    expect(charge('Weyoun "Defective" Clone', 4, facts(person({ skills: '2 Law' })))).toEqual({
      kind: 'play',
      cost: 3,
      source: { title: 'Weyoun', reason: 'you command a Law personnel' },
    });
  });

  it('charges Beverly Crusher −1 only for one personnel with [AU], [TNG] and Officer', () => {
    const name = 'Beverly Crusher Battleship Doctor';
    const au = person({ icons: '[AU]', skills: 'Officer' });
    const tng = person({ icons: '[TNG]', skills: 'Medical' });
    expect(charge(name, 4, facts(au, tng))).toEqual({ kind: 'play', cost: 4 });
    expect(charge(name, 4, facts(person({ icons: '[AU][TNG]', skills: 'Officer' })))).toEqual({
      kind: 'play',
      cost: 3,
      source: { title: 'Beverly Crusher', reason: 'you command an [AU][TNG] Officer personnel' },
    });
  });

  it('charges Jadzia Dax Elder −1 for each Vedek', () => {
    const vedek = person({ keywords: 'Vedek' });
    expect(charge('Jadzia Dax Elder', 4, facts(plain))).toEqual({ kind: 'play', cost: 4 });
    expect(charge('Jadzia Dax Elder', 4, facts(vedek))).toEqual({ kind: 'play', cost: 3, source: { title: 'Jadzia Dax', reason: 'you command 1 Vedek' } });
    expect(charge('Jadzia Dax Elder', 4, facts(vedek, vedek))).toEqual({ kind: 'play', cost: 2, source: { title: 'Jadzia Dax', reason: 'you command 2 Vedek' } });
  });

  it('charges Paul Mayweather −3 at three [SF] Dissident personnel, both on each', () => {
    const name = 'Paul Mayweather Burdened with Command';
    const dissident = person({ affiliation: 'starfleet', keywords: 'Dissident' });
    const sf = person({ affiliation: 'starfleet' });
    expect(charge(name, 6, facts(dissident, dissident, sf))).toEqual({ kind: 'play', cost: 6 });
    expect(charge(name, 6, facts(dissident, dissident, dissident))).toEqual({
      kind: 'play',
      cost: 3,
      source: { title: 'Paul Mayweather', reason: 'you command 3 [SF] Dissident personnel' },
    });
  });

  it('charges Assimilator −1 for each Borg, at most −5', () => {
    const name = 'Assimilator Rogue Borg Vessel';
    const borg = person({ species: 'Borg' });
    const ship = (f: CostFacts) => charge(name, 7, f, 'ship');
    expect(ship(facts(plain))).toEqual({ kind: 'play', cost: 7 });
    expect(ship(facts(borg))).toEqual({ kind: 'play', cost: 6, source: { title: 'Assimilator', reason: 'you command 1 Borg' } });
    expect(ship(facts(...times(5, borg)))).toEqual({ kind: 'play', cost: 2, source: { title: 'Assimilator', reason: 'you command 5 Borg' } });
    expect(ship(facts(...times(7, borg)))).toEqual({ kind: 'play', cost: 2, source: { title: 'Assimilator', reason: 'you command 7 Borg (limit 5)' } });
  });

  it('charges Rekar −1 while an Intelligence personnel is commanded', () => {
    expect(charge("Rekar Tool of the Tal'Shiar", 4, facts(officer))).toEqual({ kind: 'play', cost: 4 });
    expect(charge("Rekar Tool of the Tal'Shiar", 4, facts(person({ skills: 'Intelligence' })))).toEqual({
      kind: 'play',
      cost: 3,
      source: { title: 'Rekar', reason: 'you command an Intelligence personnel' },
    });
  });

  it("charges T'Pol −1 while an Officer personnel is commanded", () => {
    expect(charge("T'Pol Not a Slave *A", 4, facts(traitor))).toEqual({ kind: 'play', cost: 4 });
    expect(charge("T'Pol Not a Slave", 4, facts(officer))).toEqual({
      kind: 'play',
      cost: 3,
      source: { title: "T'Pol", reason: 'you command an Officer personnel' },
    });
  });
});

describe('costFactsOf (#1693)', () => {
  it('fills the uniqueness of each commanded personnel from its card row', () => {
    const inst = (id: string, unique: string): CardInstance => ({
      id,
      face: 'up',
      card: { name: `invented ${id}`, type: 'personnel', unique, affiliation: 'federation' },
    });
    const missions = initialTableState.missions.map((s, i) => (i === 0 ? { ...s, awayTeam: [inst('a', 'y'), inst('b', 'n')] } : s));
    const commanded = costFactsOf({ ...initialTableState, missions }).commanded;
    expect(commanded.map((p) => p.unique)).toEqual([true, false]);
  });
});
