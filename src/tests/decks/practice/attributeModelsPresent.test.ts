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

// The attribute models of #1681: 12 personnel held by one shipped deck, with a "present" condition.
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

describe('Akorem Laan Revered Poet (#1681)', () => {
  const akorem = () => personnel('Akorem Laan Revered Poet', { affiliation: 'bajoran', icons: '[stf][pa]' });
  const baj = () => personnel('Baj', { affiliation: 'bajoran' });

  it('is attributes +2 while two [Baj] personnel are in the discard pile', () => {
    const a = akorem();
    const table = awayTeam([a], [], { discard: [baj(), baj()] });
    expect(of(table, a)).toEqual(plus(2));
    expect(off(table, a)).toEqual(PRINTED);
  });

  it('gives nothing with one [Baj] personnel and a [Baj] event there', () => {
    const a = akorem();
    const table = awayTeam([a], [], { discard: [baj(), card('Event', 'event', { affiliation: 'bajoran' }), personnel('Fed', { affiliation: 'federation' })] });
    expect(of(table, a)).toEqual(PRINTED);
  });
});

describe('Artim Inspirational Child (#1681)', () => {
  it('gives each unique personnel present attributes +1, himself too, a stopped Artim too', () => {
    const artim = { ...personnel('Artim Inspirational Child', { unique: 'y' }), stopped: true };
    const unique = personnel('Unique', { unique: 'y' });
    const plain = personnel('Plain');
    const aboard = personnel('Aboard', { unique: 'y' });
    const table = awayTeam([artim, unique, plain], [aboard]);
    expect(of(table, unique)).toEqual(plus(1));
    expect(of(table, artim)).toEqual(plus(1));
    expect(of(table, plain)).toEqual(PRINTED);
    expect(of(table, aboard)).toEqual(PRINTED);
    expect(off(table, unique)).toEqual(PRINTED);
  });
});

describe('Bruce Maddox Chair of Robotics (#1681)', () => {
  const maddox = () => personnel('Bruce Maddox Chair of Robotics', { species: 'human' });

  it('is attributes +1 while present with an Android', () => {
    const m = maddox();
    const table = awayTeam([m, personnel('Android', { species: 'android' })]);
    expect(of(table, m)).toEqual(plus(1));
    expect(off(table, m)).toEqual(PRINTED);
  });

  it('gives nothing when the Android is at another mission', () => {
    const m = maddox();
    const table = awayTeam([m, personnel('Human', { species: 'human' })], [personnel('Android', { species: 'android' })]);
    expect(of(table, m)).toEqual(PRINTED);
  });
});

describe('Calisthenics Opponent (#1681)', () => {
  const opponent = () => personnel('Calisthenics Opponent', { skills: 'anthropology geology security' });

  it('is attributes +1 for each Security personnel present, himself included', () => {
    const o = opponent();
    const table = awayTeam([o, personnel('Guard', { skills: 'security 2' }), personnel('Clerk', { skills: 'law' })]);
    expect(of(table, o)).toEqual(plus(2));
    expect(off(table, o)).toEqual(PRINTED);
  });

  it('counts only himself with no other Security personnel present', () => {
    const o = opponent();
    const table = awayTeam([o, personnel('Clerk', { skills: 'law' })], [personnel('Guard', { skills: 'security' })]);
    expect(of(table, o)).toEqual(plus(1));
  });
});

describe("Chief O'Brien (#1681)", () => {
  it('gives each Assassin present attributes +1', () => {
    const chief = personnel("Chief O'Brien", { species: 'hologram' });
    const assassin = personnel('Assassin', { keywords: 'assassin. thief.' });
    const plain = personnel('Plain');
    const aboard = personnel('Aboard', { keywords: 'assassin.' });
    const table = awayTeam([chief, assassin, plain], [aboard]);
    expect(of(table, assassin)).toEqual(plus(1));
    expect(of(table, chief)).toEqual(PRINTED);
    expect(of(table, plain)).toEqual(PRINTED);
    expect(of(table, aboard)).toEqual(PRINTED);
    expect(off(table, assassin)).toEqual(PRINTED);
  });
});

describe('Elim Garak Federation Agent (#1681)', () => {
  it('gives each Intelligence personnel present attributes +1, in a crew too', () => {
    const garak = personnel('Elim Garak Federation Agent *VAP', { skills: 'anthropology diplomacy programming' });
    const spy = personnel('Spy', { skills: 'intelligence' });
    const plain = personnel('Plain', { skills: 'law' });
    const away = personnel('Away', { skills: 'intelligence' });
    const table = awayTeam([away], [garak, spy, plain]);
    expect(of(table, spy)).toEqual(plus(1));
    expect(of(table, garak)).toEqual(PRINTED);
    expect(of(table, plain)).toEqual(PRINTED);
    expect(of(table, away)).toEqual(PRINTED);
    expect(off(table, spy)).toEqual(PRINTED);
  });
});

describe('Jadzia Dax Sworn Ally (#1681)', () => {
  const jadzia = () => personnel('Jadzia Dax Sworn Ally', { species: 'trill', skills: 'anthropology diplomacy physics science' });

  it('is attributes +1 while present with an Honor Klingon', () => {
    const j = jadzia();
    const table = awayTeam([j, personnel('Worf', { species: 'klingon', skills: 'honor security' })]);
    expect(of(table, j)).toEqual(plus(1));
    expect(off(table, j)).toEqual(PRINTED);
  });

  it('gives nothing with a Klingon without Honor and a Human with Honor', () => {
    const j = jadzia();
    const table = awayTeam([j, personnel('Kor', { species: 'klingon', skills: 'security' }), personnel('Picard', { species: 'human', skills: 'honor' })]);
    expect(of(table, j)).toEqual(PRINTED);
  });
});

describe('Kasidy Yates Conflicted Captain (#1681)', () => {
  const kasidy = () => personnel('Kasidy Yates Conflicted Captain', { icons: '[cmd][maq]', unique: 'y' });
  const maq = () => personnel('Maquis', { icons: '[maq]' });

  it('gives each [Maq] personnel present Strength +2, herself too, while present with four [Maq] personnel', () => {
    const k = kasidy();
    const m = maq();
    const plain = personnel('Plain', { icons: '[stf]' });
    const table = awayTeam([k, m, maq(), maq(), maq(), plain]);
    expect(of(table, m)).toEqual({ ...PRINTED, strength: 6 });
    expect(of(table, k)).toEqual({ ...PRINTED, strength: 6 });
    expect(of(table, plain)).toEqual(PRINTED);
    expect(off(table, m)).toEqual(PRINTED);
  });

  it('gives nothing while present with three [Maq] personnel', () => {
    const k = kasidy();
    const m = maq();
    const table = awayTeam([k, m, maq(), maq()], [maq()]);
    expect(of(table, m)).toEqual(PRINTED);
    expect(of(table, k)).toEqual(PRINTED);
  });
});

describe('Kira Nerys Colonel Kira (#1681)', () => {
  const kira = () => personnel('Kira Nerys Colonel Kira *VP', { affiliation: 'bajoran', unique: 'y' });

  it('gives each other [Baj] personnel present attributes +1 while present with a [Fed] personnel', () => {
    const k = kira();
    const baj = personnel('Baj', { affiliation: 'bajoran' });
    const fed = personnel('Fed', { affiliation: 'federation' });
    const table = awayTeam([k, baj, fed]);
    expect(of(table, baj)).toEqual(plus(1));
    expect(of(table, k)).toEqual(PRINTED);
    expect(of(table, fed)).toEqual(PRINTED);
    expect(off(table, baj)).toEqual(PRINTED);
  });

  it('gives nothing with no [Fed] personnel present', () => {
    const baj = personnel('Baj', { affiliation: 'bajoran' });
    const table = awayTeam([kira(), baj], [personnel('Fed', { affiliation: 'federation' })]);
    expect(of(table, baj)).toEqual(PRINTED);
  });
});

describe('Korax Instigator (#1681)', () => {
  const korax = () => personnel('Korax Instigator', { affiliation: 'klingon', icons: '[cmd][pa]', unique: 'y' });

  it('is Strength +1 for each other [Pa][Kli] personnel present', () => {
    const k = korax();
    const pakli = () => personnel('Pa Klingon', { affiliation: 'klingon', icons: '[pa]' });
    const table = awayTeam([k, pakli(), pakli(), personnel('Kli', { affiliation: 'klingon' }), personnel('Pa', { affiliation: 'bajoran', icons: '[pa]' })]);
    expect(of(table, k)).toEqual({ ...PRINTED, strength: 6 });
    expect(off(table, k)).toEqual(PRINTED);
  });

  it('gives nothing alone: he is not present with himself', () => {
    const k = korax();
    expect(of(awayTeam([k]), k)).toEqual(PRINTED);
  });
});

describe('Quark Little Green Man (#1681)', () => {
  const quark = () => personnel('Quark Little Green Man *VP', { affiliation: 'ferengi', icons: '[cmd][ds9]', unique: 'y' });

  it('is attributes +1 while present with a [Pa] personnel, a stopped one too', () => {
    const q = quark();
    const table = awayTeam([q, { ...personnel('Pa', { icons: '[pa]' }), stopped: true }]);
    expect(of(table, q)).toEqual(plus(1));
    expect(off(table, q)).toEqual(PRINTED);
  });

  it('gives nothing with no [Pa] personnel present', () => {
    const q = quark();
    const table = awayTeam([q, personnel('Plain', { icons: '[stf]' })], [personnel('Pa', { icons: '[pa]' })]);
    expect(of(table, q)).toEqual(PRINTED);
  });
});

describe("S'rrel (#1681)", () => {
  const srrel = () => personnel("S'rrel", { skills: 'diplomacy intelligence officer programming' });

  it('is Integrity +2 with an Honor personnel present and Strength +2 with a Treachery personnel present', () => {
    const s = srrel();
    const honor = awayTeam([s, personnel('Honor', { skills: 'honor' })]);
    expect(of(honor, s)).toEqual({ ...PRINTED, integrity: 7 });
    const s2 = srrel();
    const both = awayTeam([s2, personnel('Honor', { skills: 'honor' }), personnel('Treachery', { skills: 'treachery' })]);
    expect(of(both, s2)).toEqual({ ...PRINTED, integrity: 7, strength: 6 });
    expect(off(both, s2)).toEqual(PRINTED);
  });

  it('gives nothing with neither present', () => {
    const s = srrel();
    const table = awayTeam([s, personnel('Plain', { skills: 'law' })], [personnel('Honor', { skills: 'honor treachery' })]);
    expect(of(table, s)).toEqual(PRINTED);
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
  'Akorem Laan Revered Poet',
  'Artim Inspirational Child',
  'Bruce Maddox Chair of Robotics',
  'Calisthenics Opponent',
  "Chief O'Brien",
  'Elim Garak Federation Agent',
  'Jadzia Dax Sworn Ally',
  'Kasidy Yates Conflicted Captain',
  'Kira Nerys Colonel Kira',
  'Korax Instigator',
  'Quark Little Green Man',
  "S'rrel",
];

describe('the registry of attribute models (#1681)', () => {
  it.each(TITLES)('maps every version of %s in the card data to its model', (title) => {
    const rows = data.filter((row) => cardTitleOf(row.originalName) === title);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(attributeModelOf({ id: 'x', card: row, face: 'up' })?.title).toBe(title);
  });
});

describe('the dilemma bot counts the attribute clauses of #1681 once', () => {
  const facts: BotTableFacts = { completedMissions: [], discardPile: [], coreEvents: 0, commanded: [], attributeTitles: [...ATTRIBUTE_REGISTRY.keys()] };

  it.each(TITLES)('gives %s no attribute change from its parsed gains', (title) => {
    for (const row of data.filter((r) => cardTitleOf(r.originalName) === title)) {
      const bot = botPersonnelOf(row, undefined, facts);
      expect(bot.attrs).toEqual([Number(row.integrity) || 0, Number(row.cunning) || 0, Number(row.strength) || 0]);
      for (const gain of bot.partnerGains ?? []) expect(gain.attrs).toEqual([0, 0, 0]);
    }
  });
});
