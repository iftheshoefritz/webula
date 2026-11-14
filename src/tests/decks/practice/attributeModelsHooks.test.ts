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
import { botPersonnelOf } from '../../../lib/dilemmaBot/simulator';
import type { BotTableFacts } from '../../../lib/dilemmaBot/gains';
import { cardTitleOf } from '../../../lib/cardTitle';

// The attribute models of #1683: 9 cards held by one shipped deck, that need a hook or a reading of
// their own. The rows follow the card data: lowercased fields, and `originalName` as printed. Every
// card here but the titles under test is invented.
let next = 0;
const card = (originalName: string, type: string, extra: Record<string, string> = {}): CardInstance => ({
  id: `card-${++next}`,
  card: { name: originalName.toLowerCase(), originalName, type, imagefile: 'x', ...extra },
  face: 'up',
});

const mission = (name: string) => card(name, 'mission', { points: '35', mission: 'p' });
const personnel = (name: string, extra: Record<string, string> = {}) =>
  card(name, 'personnel', { integrity: '5', cunning: '6', strength: '4', cost: '2', unique: 'n', ...extra });
const equipment = (name: string, extra: Record<string, string> = {}) => card(name, 'equipment', extra);
const event = (name: string, extra: Record<string, string> = {}) => card(name, 'event', extra);
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
// One away team at mission 0, and a ship's crew at mission 1.
const awayTeam = (cards: CardInstance[], crew: CardInstance[] = [], extra: Partial<AttributeTable> = {}) =>
  tableOf(slotsOf([{ mission: mission('Here'), awayTeam: cards }, { mission: mission('There'), ships: [ship('Ship', crew)] }]), extra);
// A table with `s` on the ship row of the first slot.
const withShip = (s: CardInstance, extra: Partial<AttributeTable> = {}) => tableOf(slotsOf([{ mission: mission('Here'), ships: [s] }]), extra);

const PRINTED = { integrity: 5, cunning: 6, strength: 4 };
const plus = (n: number) => ({ integrity: 5 + n, cunning: 6 + n, strength: 4 + n });
const of = (table: AttributeTable, p: CardInstance) => personnelAttributesOnTable(table, p);
const off = (table: AttributeTable, p: CardInstance) => personnelAttributesOnTable(table, p, false);

// The ship's Range, Weapons and Shields on the table, with the setting on and off.
const read = (table: AttributeTable, s: CardInstance, cardText = true) => ({
  range: shipRangeOnTable(table, s, cardText),
  ...shipAttributesOnTable(table, s, cardText),
});
const SHIP_PRINTED = { range: 7, weapons: 7, shields: 6 };
const shipPlus = (n: number) => ({ range: 7 + n, weapons: 7 + n, shields: 6 + n });

describe('The Sword of Kahless (#1683)', () => {
  const SWORD = { integrity: 3, cunning: 7, strength: 6 };

  it('changes each Klingon and each Honor personnel of its own group, a Klingon with Honor once', () => {
    const klingon = personnel('Warrior', { species: 'klingon' });
    const honor = personnel('Officer', { skills: 'honor' });
    const both = personnel('Hero', { species: 'klingon', skills: 'honor security' });
    const plain = personnel('Plain');
    const table = awayTeam([equipment('The Sword of Kahless (R2)', { keywords: 'artifact. hand weapon.' }), klingon, honor, both, plain]);
    expect(of(table, klingon)).toEqual(SWORD);
    expect(of(table, honor)).toEqual(SWORD);
    expect(of(table, both)).toEqual(SWORD);
    expect(of(table, plain)).toEqual(PRINTED);
    expect(off(table, klingon)).toEqual(PRINTED);
  });

  it('changes no personnel of another group', () => {
    const elsewhere = personnel('Warrior', { species: 'klingon' });
    const table = awayTeam([equipment('The Sword of Kahless')], [elsewhere]);
    expect(of(table, elsewhere)).toEqual(PRINTED);
  });
});

describe("Miles O'Brien Ill-Equipped Storyteller (#1683)", () => {
  const miles = () => personnel("Miles O'Brien Ill-Equipped Storyteller", { affiliation: 'bajoran' });

  it('is Integrity +2 while equipped with an Orb', () => {
    const m = miles();
    const table = awayTeam([m, equipment('Orb', { keywords: 'artifact. orb.' })]);
    expect(of(table, m)).toEqual({ ...PRINTED, integrity: 7 });
    expect(off(table, m)).toEqual(PRINTED);
  });

  it('gives nothing with another equipment, or an Orb in another group', () => {
    const m = miles();
    expect(of(awayTeam([m, equipment('Tool', { keywords: 'artifact.' })], [equipment('Orb', { keywords: 'orb.' })]), m)).toEqual(PRINTED);
  });
});

describe("Humanity's Worst Enemy (#1683)", () => {
  const enemy = () => event("Humanity's Worst Enemy", { keywords: 'decay: 2. paranoia.' });

  it('makes each [SF] Dissident personnel Cunning +1 and Strength +1 while it is in the core', () => {
    const dissident = personnel('Rebel', { affiliation: 'starfleet', keywords: 'dissident.' });
    const table = awayTeam([dissident], [], { core: [enemy()] });
    expect(of(table, dissident)).toEqual({ ...PRINTED, cunning: 7, strength: 5 });
    expect(off(table, dissident)).toEqual(PRINTED);
  });

  it('gives nothing to a [SF] personnel who is no Dissident, a Dissident of another affiliation, or with no event in the core', () => {
    const sf = personnel('Officer', { affiliation: 'starfleet' });
    const other = personnel('Rebel', { affiliation: 'romulan', keywords: 'dissident.' });
    const table = awayTeam([sf, other], [], { core: [enemy()] });
    expect(of(table, sf)).toEqual(PRINTED);
    expect(of(table, other)).toEqual(PRINTED);
    const dissident = personnel('Rebel', { affiliation: 'starfleet', keywords: 'dissident.' });
    expect(of(awayTeam([dissident]), dissident)).toEqual(PRINTED);
  });
});

describe('Exceed Engine Output (#1683)', () => {
  it('makes the ship it is placed on Weapons -2 and Shields -2, its Range as printed', () => {
    const s = { ...ship('Ship'), placedOn: [event('Exceed Engine Output *A', { keywords: 'maneuver. pursuit.' })] };
    expect(read(withShip(s), s)).toEqual({ range: 7, weapons: 5, shields: 4 });
    expect(read(withShip(s), s, false)).toEqual(SHIP_PRINTED);
  });

  it('changes nothing from the core', () => {
    const s = ship('Ship');
    expect(read(withShip(s, { core: [event('Exceed Engine Output')] }), s)).toEqual(SHIP_PRINTED);
  });
});

describe('Morgan Bateson Confident Commander (#1683)', () => {
  const morgan = () => personnel('Morgan Bateson Confident Commander', { affiliation: 'federation' });

  it('is attributes +1 while no Temporal event is in the core or placed on the table', () => {
    const m = morgan();
    const table = awayTeam([m], [], { core: [event('Plain Event', { keywords: 'maneuver.' })] });
    expect(of(table, m)).toEqual(plus(1));
    expect(off(table, m)).toEqual(PRINTED);
  });

  it('gives nothing with a Temporal event in the core, on a mission or on a ship', () => {
    const m = morgan();
    const temporal = () => event('Time Event', { keywords: 'temporal.' });
    expect(of(awayTeam([m], [], { core: [temporal()] }), m)).toEqual(PRINTED);
    const onMission = tableOf(slotsOf([{ mission: { ...mission('Here'), placedOn: [temporal()] }, awayTeam: [m] }]));
    expect(of(onMission, m)).toEqual(PRINTED);
    const onShip = tableOf(slotsOf([{ mission: mission('Here'), awayTeam: [m], ships: [{ ...ship('Ship'), placedOn: [temporal()] }] }]));
    expect(of(onShip, m)).toEqual(PRINTED);
  });

  it('is attributes +1 with a Temporal card that is no event', () => {
    const m = morgan();
    const dilemma = card('Time Dilemma', 'dilemma', { keywords: 'temporal.' });
    expect(of(tableOf(slotsOf([{ mission: { ...mission('Here'), placedOn: [dilemma] }, awayTeam: [m] }])), m)).toEqual(plus(1));
  });
});

describe('Quark True Ferengi (#1683)', () => {
  const quark = () => personnel('Quark True Ferengi *VP', { affiliation: 'ferengi' });
  const rule = (name: string) => event(name, { keywords: 'rule.' });

  it('is Cunning +1 for each Rule in the core with a different title', () => {
    const q = quark();
    const table = awayTeam([q], [], { core: [rule('Rule A'), rule('Rule A'), rule('Rule B'), event('Other')] });
    expect(of(table, q)).toEqual({ ...PRINTED, cunning: 8 });
    expect(off(table, q)).toEqual(PRINTED);
  });

  it('gives nothing with no Rule in the core', () => {
    const q = quark();
    expect(of(awayTeam([q], [], { hand: [rule('Rule A')] }), q)).toEqual(PRINTED);
  });
});

describe('Tog Lecherous DaiMon (#1683)', () => {
  const tog = () => personnel('Tog Lecherous DaiMon', { affiliation: 'ferengi' });
  const under = (n: number) => Array.from({ length: n }, () => card('Dilemma', 'dilemma'));
  const tableWith = (t: CardInstance, name: string, n: number) =>
    tableOf(slotsOf([{ mission: mission('Here'), awayTeam: [t] }, { mission: mission(name), underMission: under(n) }]));

  it('is attributes +1 with four cards beneath Ferenginar', () => {
    const t = tog();
    expect(of(tableWith(t, 'Ferenginar Financial Hub', 4), t)).toEqual(plus(1));
    expect(off(tableWith(t, 'Ferenginar Financial Hub', 4), t)).toEqual(PRINTED);
  });

  it('gives nothing with three cards beneath Ferenginar, or four beneath another mission', () => {
    const t = tog();
    expect(of(tableWith(t, 'Ferenginar Financial Hub', 3), t)).toEqual(PRINTED);
    expect(of(tableWith(t, 'Elsewhere', 4), t)).toEqual(PRINTED);
  });
});

describe('Nog Defiant Captain (#1683)', () => {
  const nog = () => personnel('Nog Defiant Captain (SS)', { affiliation: 'federation', icons: '[cmd][ds9][fut]' });
  const fut = () => personnel('Future', { icons: '[fut]' });

  it('makes his [DS9] ship attributes +1 for each [Fut] personnel aboard, himself too', () => {
    const s = ship('Ship', [nog(), fut(), personnel('Plain')], { icons: '[ds9]' });
    expect(read(withShip(s), s)).toEqual(shipPlus(2));
    expect(read(withShip(s), s, false)).toEqual(SHIP_PRINTED);
  });

  it('stops at +4', () => {
    const s = ship('Ship', [nog(), fut(), fut(), fut(), fut(), fut()], { icons: '[ds9]' });
    expect(read(withShip(s), s)).toEqual(shipPlus(4));
  });

  it('gives nothing aboard a ship that is not [DS9]', () => {
    const s = ship('Ship', [nog(), fut()], { icons: '[tng]' });
    expect(read(withShip(s), s)).toEqual(SHIP_PRINTED);
  });
});

describe('Jasad (#1683)', () => {
  const jasad = () => personnel('Jasad', { affiliation: 'cardassian', keywords: 'gul.' });
  const capture = (name: string) => event(name, { keywords: 'capture.' });
  const punishment = (name: string) => event(name, { keywords: 'punishment.' });

  it('makes his [Car] ship attributes +1 for each different Capture card and each different Punishment card', () => {
    const s = { ...ship('Ship', [jasad()], { affiliation: 'cardassian' }), placedOn: [punishment('Punish B')] };
    const table = tableOf(
      slotsOf([{ mission: { ...mission('Here'), placedOn: [capture('Capture C')] }, ships: [s] }]),
      { core: [capture('Capture A'), capture('Capture A'), punishment('Punish A'), event('Both', { keywords: 'capture. punishment.' })] }
    );
    // Captures A, C and Both; Punishments A, B and Both.
    expect(read(table, s)).toEqual(shipPlus(6));
    expect(read(table, s, false)).toEqual(SHIP_PRINTED);
  });

  it('gives nothing aboard a ship that is not [Car], or with no Capture or Punishment card', () => {
    const fed = ship('Ship', [jasad()], { affiliation: 'federation' });
    expect(read(withShip(fed, { core: [capture('Capture A')] }), fed)).toEqual(SHIP_PRINTED);
    const car = ship('Ship', [jasad()], { affiliation: 'cardassian' });
    expect(read(withShip(car, { hand: [capture('Capture A')] }), car)).toEqual(SHIP_PRINTED);
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

const RANGE_TITLES = ['Nog Defiant Captain', 'Jasad'];
const TITLES = [
  'The Sword of Kahless',
  "Miles O'Brien Ill-Equipped Storyteller",
  "Humanity's Worst Enemy",
  'Exceed Engine Output',
  'Morgan Bateson Confident Commander',
  'Quark True Ferengi',
  'Tog Lecherous DaiMon',
  ...RANGE_TITLES,
];

describe('the registries of attribute models (#1683)', () => {
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

describe('the dilemma bot counts the attribute clauses of #1683 once', () => {
  const facts: BotTableFacts = { completedMissions: [], discardPile: [], coreEvents: 0, commanded: [], attributeTitles: [...ATTRIBUTE_REGISTRY.keys()] };
  const PERSONNEL = TITLES.filter((title) => data.some((r) => cardTitleOf(r.originalName) === title && r.type === 'personnel'));

  it.each(PERSONNEL)('gives %s no attribute change from its parsed gains', (title) => {
    for (const row of data.filter((r) => cardTitleOf(r.originalName) === title)) {
      const bot = botPersonnelOf(row, undefined, facts);
      expect(bot.attrs).toEqual([Number(row.integrity) || 0, Number(row.cunning) || 0, Number(row.strength) || 0]);
      for (const gain of bot.partnerGains ?? []) expect(gain.attrs).toEqual([0, 0, 0]);
    }
  });
});
