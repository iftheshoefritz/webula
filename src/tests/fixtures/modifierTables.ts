// Seeded random tables for the equivalence tests of the modifier rows (#1887): each table holds the cards of
// the attribute, range and span models among random cards of the card data, so their conditions hold on some
// tables and fail on others. `modifierValuesOf` reads every value the public readers give on a table, in a
// fixed order. `modifierEquivalence.json` holds the values the hook readers gave on `main` before the rows.
import { readFileSync } from 'fs';
import { join } from 'path';
import { deckFromTsv, extractDilemmas, extractDrawDeck, extractMissions } from '../../app/decks/deckBuilderUtils';
import {
  createCardInstances,
  initialTableState,
  tableReducer,
  type CardInstance,
  type MissionSlot,
  type TableState,
} from '../../app/decks/practice/tableReducer';
import { personnelAttributesOnTable, shipAttributesOnTable } from '../../app/decks/practice/attributeModels';
import { attributesOnTableOf } from '../../app/decks/practice/attributesOnTable';
import { moveSpanTotal, shipRangeOnTable, shipRangesOnTable } from '../../app/decks/practice/shipRange';
import { cardTitleOf } from '../../lib/cardTitle';
import {
  PRACTICE_60S_TSV,
  PRACTICE_ATTRIBUTES_TSV,
  PRACTICE_COSTS_TSV,
  PRACTICE_DECK_TSV,
  PRACTICE_MISSIONS_TSV,
  PRACTICE_PLAYABLE_TSV,
  PRACTICE_TAIN_TSV,
} from '../../lib/practiceDeck';

/** The card data, normalised as `parseCardData` does, as `tableRead.test.ts` reads it. */
export const cardData: any[] = (() => {
  const [head, ...rows] = readFileSync(join(process.cwd(), 'public', 'cards_with_processed_columns.txt'), 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\t').map((cell) => cell.replace(/^"|"$/g, '')));
  return rows.map((r) => {
    const row: any = Object.fromEntries(head.map((h, i) => [h.toLowerCase(), (r[i] ?? '').toLowerCase()]));
    row.collectorsinfo = row.collectorsinfo.replace(/(^|[^0-9])0+(\d+)/g, '$1$2');
    row.originalName = r[head.indexOf('Name')];
    row.missiontype = row.type === 'mission' ? row.mission : '';
    if (row.type !== 'dilemma') row.dilemmatype = '';
    return row;
  });
})();

const titleKey = (row: any) => cardTitleOf(String(row.originalName ?? row.name ?? '')).toLowerCase();

// mulberry32: the same tables on every run.
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The cards whose names the conditions of the models read: the missions and ships a text names.
const NAMED = /^(remus|ferenginar|u\.s\.s\. enterprise-d|u\.s\.s\. columbia|columbia)\b/;

/** The seeded table `seed`, from the modelled titles `titles` (lowercased) and random cards of each type. */
export function modifierTable(seed: number, titles: readonly string[]): TableState {
  const random = rng(seed);
  const int = (lo: number, hi: number) => lo + Math.floor(random() * (hi - lo + 1));
  const modelled = new Set(titles);
  const pools = new Map<string, { model: any[]; any: any[] }>();
  for (const row of cardData) {
    const pool = pools.get(row.type) ?? { model: [], any: [] };
    pool.any.push(row);
    const keywords = String(row.keywords ?? '');
    if (modelled.has(titleKey(row)) || NAMED.test(titleKey(row)) || /delphic expanse|neutral zone/.test(keywords)) pool.model.push(row);
    pools.set(row.type, pool);
  }
  let n = 0;
  const pick = (type: string): CardInstance => {
    const pool = pools.get(type)!;
    const list = pool.model.length > 0 && random() < 0.55 ? pool.model : pool.any;
    const row = list[Math.floor(random() * list.length)];
    const c: CardInstance = { id: `m${seed}-${n++}`, card: row, face: 'up' };
    if (random() < 0.2) c.stopped = true;
    return c;
  };
  const some = (type: string, lo: number, hi: number) => Array.from({ length: int(lo, hi) }, () => pick(type));
  const rangeUsed: Record<string, number> = {};
  const missions: MissionSlot[] = Array.from({ length: 5 }, () => {
    const mission = random() < 0.08 ? null : pick('mission');
    if (mission) {
      delete mission.stopped;
      mission.placedOn = some('event', 0, 2);
    }
    const ships = some('ship', 0, 2).map((ship) => {
      delete ship.stopped;
      const crew = [...some('personnel', 0, 7), ...some('equipment', 0, 1)];
      if (crew.length > 0) ship.crew = crew;
      ship.placedOn = some('event', 0, 1);
      if (random() < 0.4) rangeUsed[ship.id] = int(0, 9);
      return ship;
    });
    return {
      mission,
      ships,
      awayTeam: [...some('personnel', 0, 8), ...some('equipment', 0, 2)],
      underMission: random() < 0.3 ? some('dilemma', 0, 5) : [],
      completed: !!mission && random() < 0.35,
    };
  });
  const loose = (types: string[], lo: number, hi: number) =>
    Array.from({ length: int(lo, hi) }, () => {
      const c = pick(types[int(0, types.length - 1)]);
      delete c.stopped;
      return c;
    });
  return {
    missions,
    core: loose(['event'], 0, 5),
    hand: random() < 0.3 ? [] : loose(['personnel', 'ship', 'event', 'equipment'], 1, 8),
    discard: random() < 0.3 ? [] : loose(['personnel', 'ship', 'event'], 1, 6),
    brig: random() < 0.5 ? [] : loose(['personnel'], 1, 2),
    score: int(0, 70),
    rangeUsed,
  } as unknown as TableState;
}

/** Every value the public readers give on `table`, in a fixed order. */
export function modifierValuesOf(table: TableState): unknown {
  const groups = table.missions.flatMap((s) => [...s.awayTeam, ...s.ships.flatMap((ship) => ship.crew ?? [])]);
  const rowShips = table.missions.flatMap((s) => s.ships);
  const offTable = [...table.hand, ...table.brig];
  const people = [...groups, ...offTable].filter((c) => c.card?.type === 'personnel' || c.card?.type === 'equipment');
  const ships = [...rowShips, ...offTable.filter((c) => c.card?.type === 'ship')];
  const p = (on: boolean) => people.map((c) => Object.values(personnelAttributesOnTable(table, c, on)));
  const s = (on: boolean) => ships.map((c) => [...Object.values(shipAttributesOnTable(table, c, on)), shipRangeOnTable(table, c, on)]);
  const span = (on: boolean) =>
    ships.map((ship) => [0, 1, 2, 3, 4].map((i) => [0, 1, 2, 3, 4].map((j) => moveSpanTotal(table.missions, i, j, ship, table.core, on))));
  return {
    personnel: [p(true), p(false)],
    ships: [s(true), s(false)],
    attributesOnTable: attributesOnTableOf(table, true),
    ranges: shipRangesOnTable(table, table.rangeUsed),
    span: [span(true), span(false)],
  };
}

// The fixture decks of `resetWithPiles` whose cards the models read: each TSV's personnel, equipment and ships
// join the crew of the ship at Bilana System, and its events the core, as `?fixture=attributes` deals them.
const FIXTURE_TSVS = {
  attributes: PRACTICE_ATTRIBUTES_TSV,
  costs: PRACTICE_COSTS_TSV,
  tain: PRACTICE_TAIN_TSV,
  '60s': PRACTICE_60S_TSV,
  missions: PRACTICE_MISSIONS_TSV,
  playable: PRACTICE_PLAYABLE_TSV,
};

// The ids of `createCardInstances` count up over the run, so each card gets an id of its place in the table.
function withPlaceIds(table: TableState, prefix: string): TableState {
  let n = 0;
  const re = (c: CardInstance): CardInstance => ({
    ...c,
    id: `${prefix}-${n++}`,
    ...(c.crew ? { crew: c.crew.map(re) } : {}),
    ...(c.placedOn ? { placedOn: c.placedOn.map(re) } : {}),
  });
  return {
    ...table,
    missions: table.missions.map((s) => ({
      ...s,
      mission: s.mission && re(s.mission),
      awayTeam: s.awayTeam.map(re),
      ships: s.ships.map(re),
      underMission: s.underMission.map(re),
    })),
    core: table.core.map(re),
    hand: table.hand.map(re),
    discard: table.discard.map(re),
    brig: table.brig.map(re),
    rangeUsed: {},
  };
}

/** The fixture tables, by name. */
export function fixtureTables(): [string, TableState][] {
  return Object.entries(FIXTURE_TSVS).map(([name, tsv]) => {
    const deck = deckFromTsv(`${PRACTICE_DECK_TSV}\n${tsv}`, cardData);
    const extra = extractDrawDeck(deckFromTsv(tsv, cardData));
    const crew = extra.filter((r: any) => r.type !== 'event' && r.type !== 'mission');
    const core = extra.filter((r: any) => r.type === 'event');
    const names = new Set(extra.map((r: any) => r.originalName));
    const cards = extractDrawDeck(deck).filter((r: any) => !names.has(r.originalName));
    const table = tableReducer(initialTableState, {
      type: 'resetWithPiles',
      cards: createCardInstances([...cards, ...cards.filter((r: any) => r.type === 'personnel')]),
      missions: createCardInstances(extractMissions(deck), 'up'),
      dilemmas: createCardInstances(extractDilemmas(deck)),
      extraHand: [],
      extraCrew: createCardInstances(crew),
      extraCore: createCardInstances(core),
    });
    return [name, withPlaceIds(table, name)];
  });
}
