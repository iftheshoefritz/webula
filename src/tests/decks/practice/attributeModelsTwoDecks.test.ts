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

// The attribute models of #1670: the 12 personnel held by exactly two shipped decks. The rows follow
// the card data: lowercased fields, and `originalName` as printed. Every personnel here but the titles
// under test is invented.
let next = 0;
const card = (originalName: string, type: string, extra: Record<string, string> = {}): CardInstance => ({
  id: `card-${++next}`,
  card: { name: originalName.toLowerCase(), originalName, type, imagefile: 'x', ...extra },
  face: 'up',
});

const mission = (name: string, extra: Record<string, string> = {}) => card(name, 'mission', { points: '35', mission: 'p', ...extra });
const space = (name: string, extra: Record<string, string> = {}) => mission(name, { mission: 's', ...extra });
const personnel = (name: string, extra: Record<string, string> = {}) =>
  card(name, 'personnel', { integrity: '5', cunning: '6', strength: '4', cost: '2', unique: 'y', ...extra });
const ship = (name: string, crew: CardInstance[] = [], extra: Record<string, string> = {}) => ({
  ...card(name, 'ship', { weapons: '7', shields: '6', range: '7', ...extra }),
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

const PRINTED = { integrity: 5, cunning: 6, strength: 4 };
const plus = (n: number) => ({ integrity: 5 + n, cunning: 6 + n, strength: 4 + n });
const of = (table: AttributeTable, p: CardInstance) => personnelAttributesOnTable(table, p);
const off = (table: AttributeTable, p: CardInstance) => personnelAttributesOnTable(table, p, false);
const filler = (n: number) => Array.from({ length: n }, () => card('Filler', 'event'));
const completed = (m: CardInstance) => ({ mission: m, completed: true });

describe.each([
  ['Bareil Antos Esteemed Vedek *VP', 'integrity'],
  ['Shakaar Edon Resistance Leader', 'strength'],
] as const)('%s (#1670)', (title, attribute) => {
  const source = () => personnel(title, { affiliation: 'bajoran' });

  it(`gives each other [Baj] personnel present ${attribute} +1, not himself, a stopped source too`, () => {
    const s = { ...source(), stopped: true };
    const baj = personnel('Baj', { affiliation: 'bajoran' });
    const fed = personnel('Fed', { affiliation: 'federation' });
    const aboard = personnel('Aboard', { affiliation: 'bajoran' });
    const table = tableOf(slotsOf([{ mission: mission('Here'), awayTeam: [s, baj, fed], ships: [ship('Ship', [aboard])] }]));
    expect(of(table, baj)).toEqual({ ...PRINTED, [attribute]: PRINTED[attribute] + 1 });
    expect(of(table, s)).toEqual(PRINTED);
    expect(of(table, fed)).toEqual(PRINTED);
    expect(of(table, aboard)).toEqual(PRINTED);
    expect(off(table, baj)).toEqual(PRINTED);
  });
});

describe('Beverly Crusher Encouraging Commander (#1670)', () => {
  const beverly = () => personnel('Beverly Crusher Encouraging Commander', { icons: '[cmd][tng]' });
  const ensign = () => personnel('Ensign', { icons: '[stf][tng]', unique: 'n' });

  it('gives each non-unique [TNG] personnel aboard her U.S.S. Enterprise-D attributes +1', () => {
    const b = beverly();
    const e = ensign();
    const uniqueTng = personnel('Unique', { icons: '[stf][tng]' });
    const plain = personnel('Plain', { icons: '[stf]', unique: 'n' });
    const table = tableOf(slotsOf([{ mission: mission('Here'), ships: [ship('U.S.S. Enterprise-D Explorer *', [b, e, uniqueTng, plain])] }]));
    expect(of(table, e)).toEqual(plus(1));
    expect(of(table, uniqueTng)).toEqual(PRINTED);
    expect(of(table, plain)).toEqual(PRINTED);
    expect(of(table, b)).toEqual(PRINTED);
    expect(off(table, e)).toEqual(PRINTED);
  });

  it('gives nothing in an away team or aboard another ship', () => {
    const e = ensign();
    const away = tableOf(slotsOf([{ mission: mission('Here'), awayTeam: [beverly(), e] }]));
    expect(of(away, e)).toEqual(PRINTED);
    const f = ensign();
    const other = tableOf(slotsOf([{ mission: mission('Here'), ships: [ship('U.S.S. Enterprise-E', [beverly(), f])] }]));
    expect(of(other, f)).toEqual(PRINTED);
  });
});

describe('Dukat Pah-Wraith Puppet (#1670)', () => {
  it('is Cunning +4 and Strength +4 while the discard pile is empty', () => {
    const d = personnel('Dukat Pah-Wraith Puppet *A');
    const missions = slotsOf([{ mission: mission('Here'), awayTeam: [d] }]);
    expect(of(tableOf(missions), d)).toEqual({ integrity: 5, cunning: 10, strength: 8 });
    expect(of(tableOf(missions, { discard: filler(1) }), d)).toEqual(PRINTED);
    expect(off(tableOf(missions), d)).toEqual(PRINTED);
  });
});

describe('Emanuel Stevens (#1670)', () => {
  const emanuel = () => personnel('Emanuel Stevens', { affiliation: 'starfleet', keywords: 'dissident.' });
  const dissident = (extra: Record<string, string> = {}) => personnel('Dissident', { affiliation: 'starfleet', keywords: 'dissident.', ...extra });

  it('is attributes +1 while present with a stopped [SF] Dissident personnel', () => {
    const e = emanuel();
    const table = tableOf(slotsOf([{ mission: mission('Here'), awayTeam: [e, { ...dissident(), stopped: true }] }]));
    expect(of(table, e)).toEqual(plus(1));
    expect(off(table, e)).toEqual(PRINTED);
  });

  it('gives nothing with the partner not stopped, not [SF], or in another group, nor alone and stopped', () => {
    const e = emanuel();
    expect(of(tableOf(slotsOf([{ mission: mission('Here'), awayTeam: [e, dissident()] }])), e)).toEqual(PRINTED);
    const notSf = { ...dissident({ affiliation: 'bajoran' }), stopped: true };
    expect(of(tableOf(slotsOf([{ mission: mission('Here'), awayTeam: [e, notSf] }])), e)).toEqual(PRINTED);
    const elsewhere = { ...dissident(), stopped: true };
    expect(of(tableOf(slotsOf([{ mission: mission('Here'), awayTeam: [e], ships: [ship('Ship', [elsewhere])] }])), e)).toEqual(PRINTED);
    const alone = { ...emanuel(), stopped: true };
    expect(of(tableOf(slotsOf([{ mission: mission('Here'), awayTeam: [alone] }])), alone)).toEqual(PRINTED);
  });
});

describe('Martinez (#1670)', () => {
  it('is attributes +1 while the score is 40 or more', () => {
    const m = personnel('Martinez', { unique: 'n' });
    const missions = slotsOf([{ mission: mission('Here'), awayTeam: [m] }]);
    expect(of(tableOf(missions, { score: 39 }), m)).toEqual(PRINTED);
    expect(of(tableOf(missions, { score: 40 }), m)).toEqual(plus(1));
    expect(off(tableOf(missions, { score: 40 }), m)).toEqual(PRINTED);
  });
});

describe('Motura Eminent Sculptor (#1670)', () => {
  it('is attributes +1 while you command fewer than two completed missions', () => {
    const m = personnel('Motura Eminent Sculptor');
    const here = { mission: mission('Here'), awayTeam: [m] };
    expect(of(tableOf(slotsOf([here])), m)).toEqual(plus(1));
    expect(of(tableOf(slotsOf([here, completed(mission('A'))])), m)).toEqual(plus(1));
    const two = tableOf(slotsOf([here, completed(mission('A')), completed(space('B'))]));
    expect(of(two, m)).toEqual(PRINTED);
    expect(off(tableOf(slotsOf([here])), m)).toEqual(PRINTED);
  });
});

describe('Nadia Myers (#1670)', () => {
  it('is attributes +2 while you command two completed space missions', () => {
    const n = personnel('Nadia Myers', { unique: 'n' });
    const here = { mission: mission('Here'), awayTeam: [n] };
    expect(of(tableOf(slotsOf([here, completed(space('A'))])), n)).toEqual(PRINTED);
    const two = tableOf(slotsOf([here, completed(space('A')), completed(space('B'))]));
    expect(of(two, n)).toEqual(plus(2));
    expect(of(tableOf(slotsOf([here, completed(space('A')), completed(mission('B'))])), n)).toEqual(PRINTED);
    expect(off(two, n)).toEqual(PRINTED);
  });
});

describe('Neelix Valued Guide (#1670)', () => {
  it('is attributes +1 for each completed space mission, and none for a planet mission', () => {
    const n = personnel('Neelix Valued Guide *VP');
    const here = { mission: mission('Here'), awayTeam: [n] };
    expect(of(tableOf(slotsOf([here, completed(mission('P'))])), n)).toEqual(PRINTED);
    expect(of(tableOf(slotsOf([here, completed(space('A'))])), n)).toEqual(plus(1));
    const three = tableOf(slotsOf([here, completed(space('A')), completed(space('B')), completed(space('C'))]));
    expect(of(three, n)).toEqual(plus(3));
    expect(off(three, n)).toEqual(PRINTED);
  });
});

describe('Nog Bar Owner (#1670)', () => {
  it('is attributes +3 while you have six or more cards in hand', () => {
    const n = personnel('Nog Bar Owner');
    const missions = slotsOf([{ mission: mission('Here'), awayTeam: [n] }]);
    expect(of(tableOf(missions, { hand: filler(5) }), n)).toEqual(PRINTED);
    expect(of(tableOf(missions, { hand: filler(6) }), n)).toEqual(plus(3));
    expect(off(tableOf(missions, { hand: filler(6) }), n)).toEqual(PRINTED);
  });
});

describe('Odo Curzon Odo (#1670)', () => {
  const discarded = (skills: string) => personnel('Gone', { skills });

  it('is Cunning +1 per Diplomacy and Strength +1 per Security personnel in the discard pile, each limit +4', () => {
    const o = personnel('Odo Curzon Odo');
    const missions = slotsOf([{ mission: mission('Here'), awayTeam: [o] }]);
    const some = tableOf(missions, { discard: [discarded('diplomacy'), discarded('2 diplomacy'), discarded('security'), card('Talk', 'event', { skills: 'diplomacy' })] });
    expect(of(some, o)).toEqual({ integrity: 5, cunning: 8, strength: 5 });
    const many = tableOf(missions, { discard: Array.from({ length: 6 }, () => discarded('diplomacy')) });
    expect(of(many, o)).toEqual({ integrity: 5, cunning: 10, strength: 4 });
    expect(of(tableOf(missions), o)).toEqual(PRINTED);
    expect(off(some, o)).toEqual(PRINTED);
  });
});

describe('Travis Mayweather Damaged Navigator (#1670)', () => {
  const travis = () => personnel('Travis Mayweather Damaged Navigator', { affiliation: 'starfleet' });
  const delphic = () => space('Vokau Belt Investigate Derelict', { keywords: 'region: delphic expanse.' });

  it('is attributes +1 at a Region: Delphic Expanse mission with an [SF] ship of more than 5 Range left', () => {
    const t = travis();
    const nx = ship('Enterprise', [t], { affiliation: 'starfleet' });
    const table = tableOf(slotsOf([{ mission: delphic(), ships: [nx] }]), { rangeUsed: { [nx.id]: 1 } });
    expect(of(table, t)).toEqual(plus(1));
    expect(off(table, t)).toEqual(PRINTED);
  });

  it('gives nothing with 5 Range left, a non-[SF] ship, or at a mission outside the region', () => {
    const t = travis();
    const nx = ship('Enterprise', [t], { affiliation: 'starfleet' });
    expect(of(tableOf(slotsOf([{ mission: delphic(), ships: [nx] }]), { rangeUsed: { [nx.id]: 2 } }), t)).toEqual(PRINTED);
    const u = travis();
    const xindi = ship('Xindi', [], { affiliation: 'xindi' });
    expect(of(tableOf(slotsOf([{ mission: delphic(), awayTeam: [u], ships: [xindi] }])), u)).toEqual(PRINTED);
    const v = travis();
    const elsewhere = ship('Enterprise', [v], { affiliation: 'starfleet' });
    expect(of(tableOf(slotsOf([{ mission: space('Elsewhere'), ships: [elsewhere] }])), v)).toEqual(PRINTED);
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

describe('the registry of attribute models (#1670)', () => {
  const TITLES = [
    'Bareil Antos Esteemed Vedek',
    'Beverly Crusher Encouraging Commander',
    'Dukat Pah-Wraith Puppet',
    'Emanuel Stevens',
    'Martinez',
    'Motura Eminent Sculptor',
    'Nadia Myers',
    'Neelix Valued Guide',
    'Nog Bar Owner',
    'Odo Curzon Odo',
    'Shakaar Edon Resistance Leader',
    'Travis Mayweather Damaged Navigator',
  ];

  it.each(TITLES)('maps every version of %s in the card data to its model', (title) => {
    const rows = data.filter((row) => cardTitleOf(row.originalName) === title);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(attributeModelOf({ id: 'x', card: row, face: 'up' })?.title).toBe(title);
  });
});

describe('the dilemma bot counts Motura and Nadia Myers once (#1670)', () => {
  const facts: BotTableFacts = { completedMissions: ['s', 's'], discardPile: [], coreEvents: 0, commanded: [], attributeTitles: [...ATTRIBUTE_REGISTRY.keys()] };
  const row = (name: string) => data.find((r) => r.originalName === name);

  it.each(['Motura Eminent Sculptor', 'Nadia Myers'])('drops the parsed attributes of %s only while the table reads them', (name) => {
    const printed = [Number(row(name).integrity), Number(row(name).cunning), Number(row(name).strength)];
    const parsedFacts = { ...facts, completedMissions: name === 'Nadia Myers' ? ['s', 's'] : [] };
    expect(botPersonnelOf(row(name), undefined, { ...parsedFacts, attributeTitles: undefined }).attrs).not.toEqual(printed);
    expect(botPersonnelOf(row(name), undefined, parsedFacts).attrs).toEqual(printed);
  });

  it('keeps Nadia Myers\'s Navigation', () => {
    const navigation = (f: BotTableFacts) => botPersonnelOf(row('Nadia Myers'), undefined, f).skills;
    expect(navigation(facts)).toEqual(navigation({ ...facts, attributeTitles: undefined }));
    expect(navigation(facts)).not.toEqual(navigation({ ...facts, completedMissions: [] }));
  });
});
