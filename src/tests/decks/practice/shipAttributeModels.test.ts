import { readFileSync } from 'fs';
import { join } from 'path';
import { CardInstance, MISSION_SLOTS, MissionSlot } from '../../../app/decks/practice/tableReducer';
import {
  ATTRIBUTE_REGISTRY,
  AttributeTable,
  attributeModelOf,
  shipAttributesOnTable,
} from '../../../app/decks/practice/attributeModels';
import { RANGE_SPAN_REGISTRY, rangeSpanModelOf } from '../../../app/decks/practice/rangeModels';
import { shipRangeOnTable, shipRangesOnTable } from '../../../app/decks/practice/shipRange';
import { botPersonnelOf } from '../../../lib/dilemmaBot/simulator';
import type { BotTableFacts } from '../../../lib/dilemmaBot/gains';
import { cardTitleOf } from '../../../lib/cardTitle';

// The ship clauses of #1671: the ships, and the personnel that change ships, in two or more shipped
// decks. "Attributes" on a ship are Range, Weapons and Shields. The rows follow the card data:
// lowercased fields, and `originalName` as printed. Every card here but the titles under test is invented.
let next = 0;
const card = (originalName: string, type: string, extra: Record<string, string> = {}): CardInstance => ({
  id: `card-${++next}`,
  card: { name: originalName.toLowerCase(), originalName, type, imagefile: 'x', ...extra },
  face: 'up',
});

const mission = (name: string) => card(name, 'mission', { points: '35', mission: 'p' });
const personnel = (name: string, extra: Record<string, string> = {}) =>
  card(name, 'personnel', { integrity: '5', cunning: '6', strength: '4', cost: '2', ...extra });
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

describe('Groumall Inauspicious Command (#1671)', () => {
  const groumall = () => ship('Groumall Inauspicious Command', [], { affiliation: 'cardassian' });

  it('is attributes +2 while a ship is in the discard pile, +2 once for two ships', () => {
    const g = groumall();
    expect(read(withShip(g, { discard: [ship('Wreck')] }), g)).toEqual(plus(2));
    expect(read(withShip(g, { discard: [ship('Wreck'), ship('Hulk')] }), g)).toEqual(plus(2));
    expect(read(withShip(g, { discard: [ship('Wreck')] }), g, false)).toEqual(PRINTED);
  });

  it('is printed with no ship in the discard pile', () => {
    const g = groumall();
    expect(read(withShip(g), g)).toEqual(PRINTED);
    expect(read(withShip(g, { discard: [personnel('Fallen')] }), g)).toEqual(PRINTED);
  });

  it('gives the raised Range to the pill of a moved ship', () => {
    const g = groumall();
    const table = withShip(g, { discard: [ship('Wreck')] });
    expect(shipRangesOnTable(table, { [g.id]: 3 })).toEqual({ [g.id]: 9 });
    expect(shipRangesOnTable(table, { [g.id]: 3 }, false)).toEqual({ [g.id]: 7 });
  });
});

describe('A. G. Robinson Prototype Captain (#1671)', () => {
  const robinson = () => personnel('A. G. Robinson Prototype Captain', { affiliation: 'starfleet', icons: '[cmd][pa]' });

  it('makes every [SF] ship +1 wherever he is commanded, the ship he is aboard once', () => {
    const r = robinson();
    const far = ship('Far', [], { affiliation: 'starfleet' });
    const fed = ship('Fed', [], { affiliation: 'federation' });
    const table = tableOf(slotsOf([{ mission: mission('One'), awayTeam: [r] }, { mission: mission('Two'), ships: [far, fed] }]));
    expect(read(table, far)).toEqual(plus(1));
    expect(read(table, fed)).toEqual(PRINTED);
    expect(read(table, far, false)).toEqual(PRINTED);
    const aboard = ship('Aboard', [robinson()], { affiliation: 'starfleet' });
    expect(read(withShip(aboard), aboard)).toEqual(plus(1));
  });

  it('gives nothing from the hand or the brig', () => {
    const far = ship('Far', [], { affiliation: 'starfleet' });
    expect(read(withShip(far, { hand: [robinson()] }), far)).toEqual(PRINTED);
    expect(read({ ...withShip(far), brig: [robinson()] } as AttributeTable, far)).toEqual(PRINTED);
  });
});

describe('Wesley Crusher Battleship Helmsman (#1671)', () => {
  const wesley = () => personnel('Wesley Crusher Battleship Helmsman', { affiliation: 'federation', icons: '[stf][tng][au]', cost: '4' });

  it('makes his ship +1 while another [TNG] personnel with a cost of 4 or more is aboard', () => {
    const s = ship('Ship', [wesley(), personnel('Officer', { icons: '[tng]', cost: '4' })]);
    expect(read(withShip(s), s)).toEqual(plus(1));
    expect(read(withShip(s), s, false)).toEqual(PRINTED);
  });

  it('gives nothing alone, with a cost-3 [TNG] personnel, with a [TN] one, or in an away team', () => {
    const alone = ship('Alone', [wesley()]);
    expect(read(withShip(alone), alone)).toEqual(PRINTED);
    const cheap = ship('Cheap', [wesley(), personnel('Ensign', { icons: '[tng]', cost: '3' })]);
    expect(read(withShip(cheap), cheap)).toEqual(PRINTED);
    const tn = ship('TN', [wesley(), personnel('Officer', { icons: '[tn]', cost: '5' })]);
    expect(read(withShip(tn), tn)).toEqual(PRINTED);
    const empty = ship('Empty');
    const table = tableOf(slotsOf([{ mission: mission('Here'), awayTeam: [wesley(), personnel('Officer', { icons: '[tng]', cost: '4' })], ships: [empty] }]));
    expect(read(table, empty)).toEqual(PRINTED);
  });
});

describe('Erika Hernandez Comparable Captain (#1671)', () => {
  const erika = () => personnel('Erika Hernandez Comparable Captain', { affiliation: 'starfleet' });

  it('makes the Columbia she is aboard +2, in every version', () => {
    for (const name of ['Columbia The Second Warp Five Ship', 'Columbia The Second Warp Five Ship *VP']) {
      const c = ship(name, [erika()], { affiliation: 'starfleet' });
      expect(read(withShip(c), c)).toEqual(plus(2));
      expect(read(withShip(c), c, false)).toEqual(PRINTED);
    }
  });

  it('gives nothing aboard another ship', () => {
    const other = ship('Enterprise', [erika()], { affiliation: 'starfleet' });
    expect(read(withShip(other), other)).toEqual(PRINTED);
  });
});

describe('Geordi La Forge Resolute Presence (#1671)', () => {
  const geordi = () => personnel('Geordi La Forge Resolute Presence', { affiliation: 'federation' });

  it('makes a Galaxy Class ship he is aboard Weapons +2 and Shields +2, its Range printed', () => {
    const g = ship('Galaxy', [geordi()], { class: 'galaxy class' });
    expect(read(withShip(g), g)).toEqual({ range: 7, weapons: 9, shields: 8 });
    expect(read(withShip(g), g, false)).toEqual(PRINTED);
  });

  it('gives nothing aboard another class', () => {
    const s = ship('Sovereign', [geordi()], { class: 'sovereign class' });
    expect(read(withShip(s), s)).toEqual(PRINTED);
  });
});

describe('I.K.S. Rotarran Ship of Tears (#1671)', () => {
  const honor = () => personnel('Warrior', { species: 'klingon', skills: '2 honor leadership' });

  it.each([
    [0, 7],
    [2, 9],
    [4, 10],
  ])('with %i Honor Klingons aboard is Weapons %i, Range and Shields printed', (n, weapons) => {
    const r = ship('I.K.S. Rotarran Ship of Tears *VP', Array.from({ length: n }, honor));
    expect(read(withShip(r), r)).toEqual({ ...PRINTED, weapons });
    expect(read(withShip(r), r, false)).toEqual(PRINTED);
  });

  it('does not count a Klingon without Honor, or an Honor personnel of another species', () => {
    const r = ship('I.K.S. Rotarran Ship of Tears', [personnel('Klingon', { species: 'klingon' }), personnel('Human', { species: 'human', skills: 'honor' })]);
    expect(read(withShip(r), r)).toEqual(PRINTED);
  });
});

describe('Keldon Advanced (#1671)', () => {
  it('is attributes +2 while a [Car] Intelligence personnel is aboard, a stopped one too', () => {
    const k = ship('Keldon Advanced', [{ ...personnel('Agent', { affiliation: 'cardassian', skills: 'intelligence' }), stopped: true }]);
    expect(read(withShip(k), k)).toEqual(plus(2));
    expect(read(withShip(k), k, false)).toEqual(PRINTED);
  });

  it('gives nothing for a [Car] personnel without Intelligence, or a non-[Car] Intelligence personnel', () => {
    const k = ship('Keldon Advanced', [
      personnel('Gul', { affiliation: 'cardassian', skills: 'leadership' }),
      personnel('Spy', { affiliation: 'romulan', skills: 'intelligence' }),
    ]);
    expect(read(withShip(k), k)).toEqual(PRINTED);
  });
});

describe('Sarajevo Starfleet Vessel (#1671)', () => {
  it('is attributes +1 while a Transporters personnel is aboard, and printed with none', () => {
    const s = ship('Sarajevo Starfleet Vessel', [personnel('Chief', { skills: 'engineer transporters' })]);
    expect(read(withShip(s), s)).toEqual(plus(1));
    expect(read(withShip(s), s, false)).toEqual(PRINTED);
    const none = ship('Sarajevo Starfleet Vessel', [personnel('Pilot', { skills: 'navigation' })]);
    expect(read(withShip(none), none)).toEqual(PRINTED);
  });
});

describe('Vedek Assembly Transport (#1671)', () => {
  const vedek = (keywords: string) => personnel('Cleric', { affiliation: 'bajoran', keywords });

  it('is +1 for each of Kai, Prylar and Vedek aboard, each keyword once', () => {
    const two = ship('Vedek Assembly Transport (BP)', [vedek('vedek.'), vedek('kai.')]);
    expect(read(withShip(two), two)).toEqual(plus(2));
    const same = ship('Vedek Assembly Transport', [vedek('vedek.'), vedek('vedek.')]);
    expect(read(withShip(same), same)).toEqual(plus(1));
    expect(read(withShip(same), same, false)).toEqual(PRINTED);
    const none = ship('Vedek Assembly Transport', [vedek('')]);
    expect(read(withShip(none), none)).toEqual(PRINTED);
  });
});

describe('Vidiian Cruiser (#1671)', () => {
  it('is Weapons +1 and Range -1 for each completed mission, Shields printed', () => {
    const v = ship('Vidiian Cruiser', [], { range: '10', weapons: '9', shields: '8' });
    const table = tableOf(
      slotsOf([{ mission: mission('One'), ships: [v], completed: true }, { mission: mission('Two'), completed: true }, { mission: mission('Three') }])
    );
    expect(read(table, v)).toEqual({ range: 8, weapons: 11, shields: 8 });
    expect(read(table, v, false)).toEqual({ range: 10, weapons: 9, shields: 8 });
    expect(read(withShip(v), v)).toEqual({ range: 10, weapons: 9, shields: 8 });
  });
});

describe('a ship off the ship rows (#1671)', () => {
  it('reads its printed Weapons and Shields', () => {
    const k = ship('Keldon Advanced', [personnel('Agent', { affiliation: 'cardassian', skills: 'intelligence' })]);
    const table = tableOf(slotsOf([{ mission: mission('Here') }]), { hand: [k] });
    expect(shipAttributesOnTable(table, k)).toEqual({ weapons: 7, shields: 6 });
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

describe('the registries of the ship clauses (#1671)', () => {
  const RANGE_TITLES = [
    'Groumall Inauspicious Command',
    'A. G. Robinson Prototype Captain',
    'Wesley Crusher Battleship Helmsman',
    'Erika Hernandez Comparable Captain',
    'Keldon Advanced',
    'Sarajevo Starfleet Vessel',
    'Vedek Assembly Transport',
    'Vidiian Cruiser',
  ];
  const TITLES = [...RANGE_TITLES, 'Geordi La Forge Resolute Presence', 'I.K.S. Rotarran Ship of Tears'];

  it.each(TITLES)('maps every version of %s in the card data to its models', (title) => {
    const rows = data.filter((row) => cardTitleOf(row.originalName) === title);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const c = { id: 'x', card: row, face: 'up' as const };
      expect(attributeModelOf(c)?.title).toBe(title);
      if (RANGE_TITLES.includes(title)) expect(rangeSpanModelOf(c)?.title).toBe(title);
      else expect(rangeSpanModelOf(c)).toBeUndefined();
    }
  });

  it('keys each title once in each registry', () => {
    expect(ATTRIBUTE_REGISTRY.size).toBe(new Set([...ATTRIBUTE_REGISTRY.values()].map((m) => m.title)).size);
    expect(RANGE_SPAN_REGISTRY.size).toBe(new Set([...RANGE_SPAN_REGISTRY.values()].map((m) => m.title)).size);
  });
});

describe('the dilemma bot reads no attribute change on Wesley Crusher and Erika Hernandez (#1671)', () => {
  const facts: BotTableFacts = { completedMissions: [], discardPile: [], coreEvents: 0, commanded: [] };
  const row = (name: string) => data.find((r) => r.originalName === name);

  it.each(['Wesley Crusher Battleship Helmsman', 'Erika Hernandez Comparable Captain'])('%s keeps its printed attributes', (name) => {
    const r = row(name);
    expect(botPersonnelOf(r, undefined, facts).attrs).toEqual([Number(r.integrity), Number(r.cunning), Number(r.strength)]);
  });
});
