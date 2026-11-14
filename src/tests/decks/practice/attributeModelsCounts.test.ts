import { readFileSync } from 'fs';
import { join } from 'path';
import { CardInstance, MISSION_SLOTS, MissionSlot } from '../../../app/decks/practice/tableReducer';
import {
  ATTRIBUTE_REGISTRY,
  AttributeTable,
  attributeModelOf,
  personnelAttributesOnTable,
} from '../../../app/decks/practice/attributeModels';
import { botPersonnelOf } from '../../../lib/dilemmaBot/simulator';
import type { BotTableFacts } from '../../../lib/dilemmaBot/gains';
import { cardTitleOf } from '../../../lib/cardTitle';

// The attribute models of #1682: 12 personnel held by one shipped deck, with a count or a table condition.
// The rows follow the card data: lowercased fields, and `originalName` as printed. Every personnel
// here but the titles under test is invented.
let next = 0;
const card = (originalName: string, type: string, extra: Record<string, string> = {}): CardInstance => ({
  id: `card-${++next}`,
  card: { name: originalName.toLowerCase(), originalName, type, imagefile: 'x', ...extra },
  face: 'up',
});

const mission = (name: string) => card(name, 'mission', { points: '35', mission: 'p' });
const personnel = (name: string, extra: Record<string, string> = {}) =>
  card(name, 'personnel', { integrity: '5', cunning: '6', strength: '4', cost: '2', unique: 'n', ...extra });
const ship = (name: string, crew: CardInstance[] = []) => ({ ...card(name, 'ship', { weapons: '7', shields: '6', range: '7' }), crew });

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
// One away team at mission 0, and a ship's crew at mission 1.
const awayTeam = (cards: CardInstance[], crew: CardInstance[] = [], extra: Partial<AttributeTable> = {}) =>
  tableOf(slotsOf([{ mission: mission('Here'), awayTeam: cards }, { mission: mission('There'), ships: [ship('Ship', crew)] }]), extra);

const PRINTED = { integrity: 5, cunning: 6, strength: 4 };
const plus = (n: number) => ({ integrity: 5 + n, cunning: 6 + n, strength: 4 + n });
const of = (table: AttributeTable, p: CardInstance) => personnelAttributesOnTable(table, p);
const off = (table: AttributeTable, p: CardInstance) => personnelAttributesOnTable(table, p, false);

describe('Slar Gorn Slave Master (#1682)', () => {
  const slar = () => personnel('Slar Gorn Slave Master *A', { icons: '[cmd][pa][au]' });
  const au = () => personnel('AU', { icons: '[au]' });

  it('is Cunning +1 and Strength +1 for each other [AU] personnel present, a stopped one too', () => {
    const s = slar();
    const table = awayTeam([s, au(), { ...au(), stopped: true }, personnel('Plain')], [au()]);
    expect(of(table, s)).toEqual({ ...PRINTED, cunning: 8, strength: 6 });
    expect(off(table, s)).toEqual(PRINTED);
  });

  it('gives nothing alone: he is not present with himself', () => {
    const s = slar();
    expect(of(awayTeam([s, personnel('Plain')]), s)).toEqual(PRINTED);
  });
});

describe('Stefan DeSeve Disillusioned Expatriate (#1682)', () => {
  const stefan = () => personnel('Stefan DeSeve Disillusioned Expatriate *VP', { keywords: 'dissident.', affiliation: 'romulan' });

  it('is attributes +1 while present with a Dissident', () => {
    const s = stefan();
    const table = awayTeam([s, personnel('Rebel', { keywords: 'dissident.' })]);
    expect(of(table, s)).toEqual(plus(1));
    expect(off(table, s)).toEqual(PRINTED);
  });

  it('is attributes +1 while present with a [Fed][Cmd] personnel', () => {
    const s = stefan();
    expect(of(awayTeam([s, personnel('Captain', { affiliation: 'federation', icons: '[cmd][tng]' })]), s)).toEqual(plus(1));
  });

  it('gives nothing with a [Fed][Stf] and a Romulan [Cmd] present, or alone', () => {
    const s = stefan();
    const table = awayTeam(
      [s, personnel('Ensign', { affiliation: 'federation', icons: '[stf]' }), personnel('Commander', { affiliation: 'romulan', icons: '[cmd]' })],
      [personnel('Rebel', { keywords: 'dissident.' })]
    );
    expect(of(table, s)).toEqual(PRINTED);
    const alone = stefan();
    expect(of(awayTeam([alone]), alone)).toEqual(PRINTED);
  });
});

describe('Tahna Los Voice of the Kohn-Ma (#1682)', () => {
  const tahna = () => personnel('Tahna Los Voice of the Kohn-Ma', { species: 'bajoran', affiliation: 'bajoran' });
  const human = () => personnel('Human', { species: 'human' });

  it('is Integrity -1 and Strength +1 for each non-Bajoran present', () => {
    const t = tahna();
    const table = awayTeam([t, human(), human(), personnel('Bajoran', { species: 'bajoran' })]);
    expect(of(table, t)).toEqual({ ...PRINTED, integrity: 3, strength: 6 });
    expect(off(table, t)).toEqual(PRINTED);
  });

  it('stops at the limit of -3/+3', () => {
    const three = tahna();
    expect(of(awayTeam([three, human(), human(), human()]), three)).toEqual({ ...PRINTED, integrity: 2, strength: 7 });
    const four = tahna();
    expect(of(awayTeam([four, human(), human(), human(), human()]), four)).toEqual({ ...PRINTED, integrity: 2, strength: 7 });
  });

  it('gives nothing with only Bajorans present', () => {
    const t = tahna();
    expect(of(awayTeam([t, personnel('Bajoran', { species: 'bajoran' })], [human()]), t)).toEqual(PRINTED);
  });
});

describe('Worf Defiant Commander (#1682)', () => {
  it('gives each personnel present with a cost of 4 or more attributes +1, himself too', () => {
    const worf = personnel('Worf Defiant Commander (SS)', { cost: '4' });
    const four = personnel('Four', { cost: '4' });
    const three = personnel('Three', { cost: '3' });
    const aboard = personnel('Aboard', { cost: '5' });
    const table = awayTeam([worf, four, three], [aboard]);
    expect(of(table, worf)).toEqual(plus(1));
    expect(of(table, four)).toEqual(plus(1));
    expect(of(table, three)).toEqual(PRINTED);
    expect(of(table, aboard)).toEqual(PRINTED);
    expect(off(table, four)).toEqual(PRINTED);
  });
});

describe('Olamu (#1682)', () => {
  const olamu = () => personnel('Olamu', { affiliation: 'non-aligned' });
  const baj = () => personnel('Baj', { affiliation: 'bajoran' });

  it('is attributes +1 while you command three [Baj] personnel, anywhere', () => {
    const o = olamu();
    const table = awayTeam([o, baj()], [baj(), baj()]);
    expect(of(table, o)).toEqual(plus(1));
    expect(off(table, o)).toEqual(PRINTED);
  });

  it('gives nothing with two [Baj] personnel and one in the discard pile', () => {
    const o = olamu();
    expect(of(awayTeam([o, baj()], [baj()], { discard: [baj()] }), o)).toEqual(PRINTED);
  });
});

describe('Nirata (#1682)', () => {
  const nirata = () => personnel('Nirata', { affiliation: 'vidiian', species: 'vidiian' });

  it('is Integrity +1 and Cunning +1 for each incomplete non-headquarters mission you command', () => {
    const n = nirata();
    const table = tableOf(
      slotsOf([
        { mission: mission('Here'), awayTeam: [n] },
        { mission: mission('There') },
        { mission: mission('Done'), completed: true },
        { mission: card('Home', 'mission', { mission: 'h' }) },
      ])
    );
    expect(of(table, n)).toEqual({ ...PRINTED, integrity: 7, cunning: 8 });
    expect(off(table, n)).toEqual(PRINTED);
  });

  it('gives nothing with every mission completed or a headquarters', () => {
    const n = nirata();
    const table = tableOf(slotsOf([{ mission: card('Home', 'mission', { mission: 'h' }), awayTeam: [n] }, { mission: mission('Done'), completed: true }]));
    expect(of(table, n)).toEqual(PRINTED);
  });
});

describe('Norah Satie Starfleet Investigator (#1682)', () => {
  const norah = () => personnel('Norah Satie Starfleet Investigator');

  it('is attributes +1 for each mission you have completed', () => {
    const n = norah();
    const table = tableOf(
      slotsOf([{ mission: mission('Here'), awayTeam: [n] }, { mission: mission('One'), completed: true }, { mission: mission('Two'), completed: true }])
    );
    expect(of(table, n)).toEqual(plus(2));
    expect(off(table, n)).toEqual(PRINTED);
  });

  it('gives nothing with no mission completed', () => {
    const n = norah();
    expect(of(awayTeam([n]), n)).toEqual(PRINTED);
  });
});

describe("Hoshi Sato Captain's Woman (#1682)", () => {
  const hoshi = () => personnel("Hoshi Sato Captain's Woman", { skills: 'anthropology programming 2 treachery' });

  it('gives herself and each Leadership personnel present attributes +1 while the hand is empty', () => {
    const h = hoshi();
    const leader = personnel('Leader', { skills: 'leadership officer' });
    const plain = personnel('Plain', { skills: 'law' });
    const aboard = personnel('Aboard', { skills: 'leadership' });
    const table = awayTeam([h, leader, plain], [aboard]);
    expect(of(table, h)).toEqual(plus(1));
    expect(of(table, leader)).toEqual(plus(1));
    expect(of(table, plain)).toEqual(PRINTED);
    expect(of(table, aboard)).toEqual(PRINTED);
    expect(off(table, leader)).toEqual(PRINTED);
  });

  it('gives nothing with one card in hand', () => {
    const h = hoshi();
    const leader = personnel('Leader', { skills: 'leadership' });
    const table = awayTeam([h, leader], [], { hand: [card('Event', 'event')] });
    expect(of(table, h)).toEqual(PRINTED);
    expect(of(table, leader)).toEqual(PRINTED);
  });

  it('gives a Hoshi with Leadership +1 once', () => {
    const h = personnel("Hoshi Sato Captain's Woman", { skills: 'leadership' });
    expect(of(awayTeam([h]), h)).toEqual(plus(1));
  });
});

describe('Malcolm Reed Enthusiastic Major (#1682)', () => {
  const reed = () => personnel('Malcolm Reed Enthusiastic Major', { keywords: 'maco.' });
  const maco = () => personnel('Maco', { keywords: 'maco.' });

  it('is attributes +1 while your MACO is present and the hand is empty', () => {
    const r = reed();
    const table = awayTeam([r, maco()]);
    expect(of(table, r)).toEqual(plus(1));
    expect(off(table, r)).toEqual(PRINTED);
  });

  it('gives nothing with a card in hand, or with the MACO elsewhere', () => {
    const r = reed();
    expect(of(awayTeam([r, maco()], [], { hand: [card('Event', 'event')] }), r)).toEqual(PRINTED);
    const r2 = reed();
    expect(of(awayTeam([r2], [maco()]), r2)).toEqual(PRINTED);
  });
});

describe("T'Pol Not a Slave (#1682)", () => {
  it('is attributes +1 while the hand is empty, and nothing with a card in hand', () => {
    const t = personnel("T'Pol Not a Slave *A");
    expect(of(awayTeam([t]), t)).toEqual(plus(1));
    expect(off(awayTeam([t]), t)).toEqual(PRINTED);
    expect(of(awayTeam([t], [], { hand: [card('Event', 'event')] }), t)).toEqual(PRINTED);
  });
});

describe('Jonathan Archer Defiant Commander (#1682)', () => {
  const archer = () => personnel('Jonathan Archer Defiant Commander', { affiliation: 'starfleet', icons: '[cmd][pa][au]' });
  const auSf = () => personnel('AU SF', { affiliation: 'starfleet', icons: '[au]' });
  const auShip = (crew: CardInstance[]) => ({ ...ship('Defiant', crew), card: { ...ship('Defiant').card, affiliation: 'starfleet', icons: '[au]' } });

  it('gives each [AU][SF] personnel present Cunning +1 while the hand is empty, himself too', () => {
    const a = archer();
    const member = auSf();
    const sf = personnel('SF', { affiliation: 'starfleet' });
    const au = personnel('AU', { affiliation: 'klingon', icons: '[au]' });
    const table = awayTeam([a, member, sf, au]);
    expect(of(table, a)).toEqual({ ...PRINTED, cunning: 7 });
    expect(of(table, member)).toEqual({ ...PRINTED, cunning: 7 });
    expect(of(table, sf)).toEqual(PRINTED);
    expect(of(table, au)).toEqual(PRINTED);
    expect(off(table, member)).toEqual(PRINTED);
  });

  it('adds Integrity +1 aboard an [AU][SF] ship, and none aboard another ship', () => {
    const a = archer();
    const member = auSf();
    const aboard = tableOf(slotsOf([{ mission: mission('Here'), ships: [auShip([a, member])] }]));
    expect(of(aboard, member)).toEqual({ ...PRINTED, integrity: 6, cunning: 7 });
    const b = archer();
    const other = auSf();
    const plainShip = tableOf(slotsOf([{ mission: mission('Here'), ships: [ship('Ship', [b, other])] }]));
    expect(of(plainShip, other)).toEqual({ ...PRINTED, cunning: 7 });
  });

  it('gives nothing with a card in hand', () => {
    const a = archer();
    const member = auSf();
    expect(of(awayTeam([a, member], [], { hand: [card('Event', 'event')] }), member)).toEqual(PRINTED);
  });
});

describe('Garvey (#1682)', () => {
  const hand = (n: number) => Array.from({ length: n }, () => card('Event', 'event'));

  it('is attributes +1 with four cards in hand, and nothing with three', () => {
    const g = personnel('Garvey');
    expect(of(awayTeam([g], [], { hand: hand(4) }), g)).toEqual(plus(1));
    expect(off(awayTeam([g], [], { hand: hand(4) }), g)).toEqual(PRINTED);
    expect(of(awayTeam([g], [], { hand: hand(3) }), g)).toEqual(PRINTED);
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

const TITLES = [
  'Slar Gorn Slave Master',
  'Stefan DeSeve Disillusioned Expatriate',
  'Tahna Los Voice of the Kohn-Ma',
  'Worf Defiant Commander',
  'Olamu',
  'Nirata',
  'Norah Satie Starfleet Investigator',
  "Hoshi Sato Captain's Woman",
  'Malcolm Reed Enthusiastic Major',
  "T'Pol Not a Slave",
  'Jonathan Archer Defiant Commander',
  'Garvey',
];

describe('the registry of attribute models (#1682)', () => {
  it.each(TITLES)('maps every version of %s in the card data to its model', (title) => {
    const rows = data.filter((row) => cardTitleOf(row.originalName) === title);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(attributeModelOf({ id: 'x', card: row, face: 'up' })?.title).toBe(title);
  });
});

describe('the dilemma bot counts the attribute clauses of #1682 once', () => {
  const facts: BotTableFacts = { completedMissions: [], discardPile: [], coreEvents: 0, commanded: [], attributeTitles: [...ATTRIBUTE_REGISTRY.keys()] };

  it.each(TITLES)('gives %s no attribute change from its parsed gains', (title) => {
    for (const row of data.filter((r) => cardTitleOf(r.originalName) === title)) {
      const bot = botPersonnelOf(row, undefined, facts);
      expect(bot.attrs).toEqual([Number(row.integrity) || 0, Number(row.cunning) || 0, Number(row.strength) || 0]);
      for (const gain of bot.partnerGains ?? []) expect(gain.attrs).toEqual([0, 0, 0]);
    }
  });
});
