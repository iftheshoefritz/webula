import { readFileSync } from 'fs';
import { join } from 'path';
import { CardInstance, MISSION_SLOTS, MissionSlot } from '../../../app/decks/practice/tableReducer';
import {
  ATTRIBUTE_REGISTRY,
  AttributeTable,
  attributeModelOf,
  personnelAttributesOnTable,
  shipAttributesOnTable,
} from '../../../app/decks/practice/attributeModels';
import { RANGE_SPAN_REGISTRY, rangeSpanModelOf } from '../../../app/decks/practice/rangeModels';
import { shipRangeOnTable } from '../../../app/decks/practice/shipRange';
import { cardTitleOf } from '../../../lib/cardTitle';

// The single-deck ships of #1684. "Attributes" on a ship are Range, Weapons and Shields. The rows
// follow the card data: lowercased fields, and `originalName` as printed. Every card here but the
// titles under test is invented.
let next = 0;
const card = (originalName: string, type: string, extra: Record<string, string> = {}): CardInstance => ({
  id: `card-${++next}`,
  card: { name: originalName.toLowerCase(), originalName, type, imagefile: 'x', ...extra },
  face: 'up',
});

const mission = (name: string, extra: Record<string, string> = {}) => card(name, 'mission', { points: '35', mission: 'p', ...extra });
const personnel = (name: string, extra: Record<string, string> = {}) =>
  card(name, 'personnel', { integrity: '5', cunning: '6', strength: '4', cost: '2', ...extra });
const event = (name: string, keywords: string) => card(name, 'event', { keywords });
const ship = (name: string, crew: CardInstance[] = [], extra: Record<string, string> = {}) => ({
  ...card(name, 'ship', { range: '7', weapons: '7', shields: '6', ...extra }),
  crew,
});

const slotsOf = (slots: Partial<MissionSlot>[]): MissionSlot[] =>
  Array.from({ length: MISSION_SLOTS }, (_, i) => ({
    mission: null,
    ships: [],
    awayTeam: [],
    underMission: [],
    ...slots[i],
  }));

const tableOf = (missions: MissionSlot[], extra: Partial<AttributeTable> = {}): AttributeTable => ({
  missions,
  core: [],
  hand: [],
  discard: [],
  brig: [],
  score: 0,
  ...extra,
});

// A table with `s` on the ship row of the first slot.
const withShip = (s: CardInstance, extra: Partial<AttributeTable> = {}) => tableOf(slotsOf([{ mission: mission('Here'), ships: [s] }]), extra);

// The ship's Range, Weapons and Shields on the table, with the setting on and off.
const read = (table: AttributeTable, s: CardInstance, cardText = true) => ({
  range: shipRangeOnTable(table, s, cardText),
  ...shipAttributesOnTable(table, s, cardText),
});
const PRINTED = { range: 7, weapons: 7, shields: 6 };
const plus = (n: number) => ({ range: 7 + n, weapons: 7 + n, shields: 6 + n });
const crewOf = (n: number, make: () => CardInstance) => Array.from({ length: n }, make);

describe('Bird-of-Prey (#1684)', () => {
  const paRom = (cost = '2') => personnel('Officer', { affiliation: 'romulan', icons: '[pa]', cost });

  it.each([
    [1, 8, 7],
    [3, 10, 9],
    [4, 10, 9],
  ])('with %i [Pa][Rom] personnel aboard is Weapons %i and Shields %i', (n, weapons, shields) => {
    const b = ship('Bird-of-Prey *VP', crewOf(n, () => paRom()));
    expect(read(withShip(b), b)).toEqual({ range: 7, weapons, shields });
    expect(read(withShip(b), b, false)).toEqual(PRINTED);
  });

  it('keeps its Range clause, and counts no [Rom] personnel without [Pa]', () => {
    const b = ship('Bird-of-Prey', [paRom('4'), personnel('Senator', { affiliation: 'romulan', cost: '4' })]);
    expect(read(withShip(b), b)).toEqual({ range: 9, weapons: 8, shields: 7 });
    const none = ship('Bird-of-Prey', [personnel('Senator', { affiliation: 'romulan', cost: '2' })]);
    expect(read(withShip(none), none)).toEqual(PRINTED);
  });
});

describe('Dominion Battleship (#1684)', () => {
  const of = (species: string) => personnel('Soldier', { affiliation: 'dominion', species });

  it('is +1 for each of Changeling, Jem\'Hadar and Vorta aboard, each species once', () => {
    const all = ship('Dominion Battleship (BP)', [of('changeling'), of("jem'hadar"), of("jem'hadar"), of('vorta')]);
    expect(read(withShip(all), all)).toEqual(plus(3));
    expect(read(withShip(all), all, false)).toEqual(PRINTED);
    const one = ship('Dominion Battleship', [of("jem'hadar"), of("jem'hadar")]);
    expect(read(withShip(one), one)).toEqual(plus(1));
  });

  it('counts no other species', () => {
    const s = ship('Dominion Battleship', [of('cardassian'), of('breen')]);
    expect(read(withShip(s), s)).toEqual(PRINTED);
  });
});

describe('Enterprise Finally Ready to Swim (#1684)', () => {
  const of = (species: string) => personnel('Crewman', { species });

  it('is attributes +2 with three different species aboard', () => {
    const e = ship('Enterprise Finally Ready to Swim *A', [of('human'), of('vulcan'), of('denobulan')]);
    expect(read(withShip(e), e)).toEqual(plus(2));
    expect(read(withShip(e), e, false)).toEqual(PRINTED);
  });

  it('is printed with two species, or a personnel with no species', () => {
    const e = ship('Enterprise Finally Ready to Swim', [of('human'), of('human'), of('vulcan'), of('')]);
    expect(read(withShip(e), e)).toEqual(PRINTED);
  });
});

describe('I.K.S. Chontay On the Hunt (#1684)', () => {
  it('is attributes +1 while a Maneuver event is in the core', () => {
    const c = ship('I.K.S. Chontay On the Hunt', [], { affiliation: 'klingon' });
    expect(read(withShip(c, { core: [event('Strike', 'assault. maneuver.')] }), c)).toEqual(plus(1));
    expect(read(withShip(c, { core: [event('Strike', 'maneuver.')] }), c, false)).toEqual(PRINTED);
  });

  it('is printed with no Maneuver event, or a Maneuver interrupt', () => {
    const c = ship('I.K.S. Chontay On the Hunt', [], { affiliation: 'klingon' });
    expect(read(withShip(c, { core: [event('Plan', 'assault.')] }), c)).toEqual(PRINTED);
    expect(read(withShip(c, { core: [card('Dodge', 'interrupt', { keywords: 'maneuver.' })] }), c)).toEqual(PRINTED);
  });
});

describe("I.K.S. Hegh'ta (#1684)", () => {
  it('is Weapons +2 at a space mission, and printed at a planet mission', () => {
    const h = ship("I.K.S. Hegh'ta", [], { affiliation: 'klingon' });
    const space = tableOf(slotsOf([{ mission: mission('Void', { mission: 's' }), ships: [h] }]));
    expect(read(space, h)).toEqual({ ...PRINTED, weapons: 9 });
    expect(read(space, h, false)).toEqual(PRINTED);
    expect(read(withShip(h), h)).toEqual(PRINTED);
  });
});

describe("I.K.S. Qel'Poh Clandestine Vessel (#1684)", () => {
  it('is attributes +2 while a personnel is in the brig', () => {
    const q = ship("I.K.S. Qel'Poh Clandestine Vessel *A", [], { affiliation: 'klingon' });
    expect(read(withShip(q, { brig: [personnel('Captive')] }), q)).toEqual(plus(2));
    expect(read(withShip(q, { brig: [personnel('Captive')] }), q, false)).toEqual(PRINTED);
  });

  it('is printed with an empty brig, and adds its 40-point Range clause', () => {
    const q = ship("I.K.S. Qel'Poh Clandestine Vessel", [], { affiliation: 'klingon' });
    expect(read(withShip(q), q)).toEqual(PRINTED);
    const table = tableOf(
      slotsOf([{ mission: mission('One', { points: '40' }), ships: [q] }, { mission: mission('Two', { points: '45' }) }]),
      { brig: [personnel('Captive')] }
    );
    expect(read(table, q)).toEqual({ range: 11, weapons: 9, shields: 8 });
  });
});

describe('I.K.S. Vorn Ship of Traitors (#1684)', () => {
  const traitor = (extra: Partial<CardInstance> = {}) => ({
    ...personnel('Traitor', { affiliation: 'klingon', skills: 'treachery security' }),
    ...extra,
  });

  it('is attributes +2, and each Treachery personnel at its mission +1, with three [Kli] Treachery aboard', () => {
    const crew = [traitor(), traitor({ stopped: true }), traitor()];
    const v = ship('I.K.S. Vorn Ship of Traitors', crew, { affiliation: 'klingon' });
    const spy = personnel('Spy', { affiliation: 'romulan', skills: 'treachery' });
    const honest = personnel('Honest', { affiliation: 'klingon', skills: 'honor' });
    const far = personnel('Far', { skills: 'treachery' });
    const table = tableOf(slotsOf([{ mission: mission('Here'), ships: [v], awayTeam: [spy, honest] }, { mission: mission('There'), awayTeam: [far] }]));
    expect(read(table, v)).toEqual(plus(2));
    expect(personnelAttributesOnTable(table, crew[0])).toEqual({ integrity: 6, cunning: 7, strength: 5 });
    expect(personnelAttributesOnTable(table, spy)).toEqual({ integrity: 6, cunning: 7, strength: 5 });
    expect(personnelAttributesOnTable(table, honest)).toEqual({ integrity: 5, cunning: 6, strength: 4 });
    expect(personnelAttributesOnTable(table, far)).toEqual({ integrity: 5, cunning: 6, strength: 4 });
    expect(read(table, v, false)).toEqual(PRINTED);
    expect(personnelAttributesOnTable(table, spy, false)).toEqual({ integrity: 5, cunning: 6, strength: 4 });
  });

  it('gives nothing with two [Kli] Treachery aboard, or a non-[Kli] third', () => {
    const crew = [traitor(), traitor(), personnel('Spy', { affiliation: 'romulan', skills: 'treachery' })];
    const v = ship('I.K.S. Vorn Ship of Traitors', crew, { affiliation: 'klingon' });
    const table = withShip(v);
    expect(read(table, v)).toEqual(PRINTED);
    expect(personnelAttributesOnTable(table, crew[0])).toEqual({ integrity: 5, cunning: 6, strength: 4 });
  });
});

describe('I.S.S. Enterprise Terran Flagship (#1684)', () => {
  it('is Range +2 with no cards in the hand, Weapons and Shields printed', () => {
    const e = ship('I.S.S. Enterprise Terran Flagship *A', [], { affiliation: 'starfleet' });
    expect(read(withShip(e), e)).toEqual({ ...PRINTED, range: 9 });
    expect(read(withShip(e), e, false)).toEqual(PRINTED);
    expect(read(withShip(e, { hand: [personnel('Held')] }), e)).toEqual(PRINTED);
  });
});

describe("Te'nari Resistance Flagship (#1684)", () => {
  const fighter = () => personnel('Fighter', { affiliation: 'bajoran', species: 'bajoran', keywords: 'bajoran resistance.' });

  it('is attributes +2 with three Bajoran Resistance personnel aboard', () => {
    const t = ship("Te'nari Resistance Flagship", crewOf(3, fighter), { affiliation: 'bajoran' });
    expect(read(withShip(t), t)).toEqual(plus(2));
    expect(read(withShip(t), t, false)).toEqual(PRINTED);
  });

  it('is printed with two, or a Bajoran without the keyword', () => {
    const t = ship("Te'nari Resistance Flagship", [fighter(), fighter(), personnel('Vedek', { affiliation: 'bajoran', keywords: 'vedek.' })]);
    expect(read(withShip(t), t)).toEqual(PRINTED);
  });
});

describe('U.S.S. Ganges One of the First (#1684)', () => {
  const ds9 = () => personnel('Officer', { affiliation: 'federation', icons: '[ds9]' });

  it.each([
    [2, 2],
    [5, 5],
    [7, 5],
  ])('with %i [DS9] personnel aboard is attributes +%i', (n, gain) => {
    const g = ship('U.S.S. Ganges One of the First (BP)', crewOf(n, ds9));
    expect(read(withShip(g), g)).toEqual(plus(gain));
    expect(read(withShip(g), g, false)).toEqual(PRINTED);
  });

  it('keeps its Range -3 with more than seven aboard, and counts no [TNG] personnel', () => {
    const g = ship('U.S.S. Ganges One of the First', crewOf(8, ds9));
    expect(read(withShip(g), g)).toEqual({ range: 9, weapons: 12, shields: 11 });
    const tng = ship('U.S.S. Ganges One of the First', [personnel('Officer', { icons: '[tng]' })]);
    expect(read(withShip(tng), tng)).toEqual(PRINTED);
  });
});

describe('U.S.S. Valiant Red Squad Training Ship (#1684)', () => {
  const cadet = () => personnel('Cadet', { affiliation: 'federation', keywords: 'cadet.' });

  it.each([
    [1, 1],
    [4, 4],
    [5, 4],
  ])('with %i Cadets aboard is attributes +%i', (n, gain) => {
    const v = ship('U.S.S. Valiant Red Squad Training Ship *VP', crewOf(n, cadet));
    expect(read(withShip(v), v)).toEqual(plus(gain));
    expect(read(withShip(v), v, false)).toEqual(PRINTED);
  });

  it('is printed with no Cadet aboard', () => {
    const v = ship('U.S.S. Valiant Red Squad Training Ship', [personnel('Officer', { keywords: 'commander: uss valiant.' })]);
    expect(read(withShip(v), v)).toEqual(PRINTED);
  });
});

describe('Vidiian Interceptor (#1684)', () => {
  it('is Weapons +1 and Range -1 for each completed mission, Shields printed', () => {
    const v = ship('Vidiian Interceptor', [], { range: '10', weapons: '8', shields: '7' });
    const table = tableOf(slotsOf([{ mission: mission('One'), ships: [v], completed: true }, { mission: mission('Two'), completed: true }]));
    expect(read(table, v)).toEqual({ range: 8, weapons: 10, shields: 7 });
    expect(read(table, v, false)).toEqual({ range: 10, weapons: 8, shields: 7 });
    expect(read(withShip(v), v)).toEqual({ range: 10, weapons: 8, shields: 7 });
  });
});

// The rows are read by hand, normalised as `parseCardData` does: Jest does not load the real d3.
const data = (() => {
  const [head, ...rows] = readFileSync(join(process.cwd(), 'public', 'cards_with_processed_columns.txt'), 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\t').map((cell) => cell.replace(/^"|"$/g, '')));
  return rows.map((r) => {
    const row: any = Object.fromEntries(head.map((h, i) => [h.toLowerCase(), (r[i] ?? '').toLowerCase()]));
    row.originalName = r[head.indexOf('Name')];
    return row;
  });
})();

describe('the registries of the single-deck ships (#1684)', () => {
  const BOTH = [
    'Bird-of-Prey',
    'Dominion Battleship',
    'Enterprise Finally Ready to Swim',
    'I.K.S. Chontay On the Hunt',
    "I.K.S. Qel'Poh Clandestine Vessel",
    'I.K.S. Vorn Ship of Traitors',
    "Te'nari Resistance Flagship",
    'U.S.S. Ganges One of the First',
    'U.S.S. Valiant Red Squad Training Ship',
    'Vidiian Interceptor',
  ];
  const ATTRIBUTES_ONLY = ["I.K.S. Hegh'ta"];
  const RANGE_ONLY = ['I.S.S. Enterprise Terran Flagship'];

  it.each([...BOTH, ...ATTRIBUTES_ONLY, ...RANGE_ONLY])('maps every version of %s in the card data to its models', (title) => {
    const rows = data.filter((row) => cardTitleOf(row.originalName) === title);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const c = { id: 'x', card: row, face: 'up' as const };
      if (RANGE_ONLY.includes(title)) expect(attributeModelOf(c)).toBeUndefined();
      else expect(attributeModelOf(c)?.title).toBe(title);
      if (ATTRIBUTES_ONLY.includes(title)) expect(rangeSpanModelOf(c)).toBeUndefined();
      else expect(rangeSpanModelOf(c)?.title).toBe(title);
    }
  });

  it('keys each title once in each registry', () => {
    expect(ATTRIBUTE_REGISTRY.size).toBe(new Set([...ATTRIBUTE_REGISTRY.values()].map((m) => m.title)).size);
    expect(RANGE_SPAN_REGISTRY.size).toBe(new Set([...RANGE_SPAN_REGISTRY.values()].map((m) => m.title)).size);
  });
});
