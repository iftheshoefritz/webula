// The tables of the equivalence tests of the cost rows (#1888): the fixture decks of `resetWithPiles` whose cards
// the cost models read, each dealt twice (its cards at the end of the hand, then in the crew and the core), and
// seeded random tables of the cost-modelled titles among random cards of the card data, with plays of the turn,
// pending discounts, cards placed on the core and, on some, the bot's dilemma pile. `costValuesOf` reads every
// value the cost readers give on a table, in a fixed order. `costEquivalence.json` holds the values the hook
// readers gave on `main` before the rows.
import { deckFromTsv, extractDilemmas, extractDrawDeck, extractMissions } from '../../app/decks/deckBuilderUtils';
import { costFactsOf } from '../../app/decks/practice/costFacts';
import { createCardInstances, initialTableState, tableReducer, type CardInstance, type TableState } from '../../app/decks/practice/tableReducer';
import type { CostFacts, CostTurnPlay, PendingDiscount } from '../../lib/costModels/model';
import {
  COST_REGISTRY,
  coreCostsOf,
  firstTurnGrantsOf,
  limitCapsOf,
  limitGrantsOf,
  missionCostsOf,
  pendingDiscountOf,
  personnelCostsOf,
  turnChoicesOf,
} from '../../lib/costModels/registry';
import { costPlayOf, moveCharge, type CostDestination, type CostPlace } from '../../lib/playCost';
import { cardTitleOf } from '../../lib/cardTitle';
import {
  PRACTICE_60S_TSV,
  PRACTICE_ATTRIBUTES_TSV,
  PRACTICE_BOT_COSTS_TSV,
  PRACTICE_COSTS_TSV,
  PRACTICE_DECK_TSV,
  PRACTICE_DISSIDENT_TSV,
  PRACTICE_DOWNLOADS_TSV,
  PRACTICE_KMTAR_TSV,
  PRACTICE_MISSIONS_TSV,
  PRACTICE_PLAYABLE_TSV,
  PRACTICE_RECALL_TSV,
  PRACTICE_TAIN_TSV,
  PRACTICE_UNIQUE_TSV,
} from '../../lib/practiceDeck';
import { cardData } from './modifierTables';

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

// The cards whose names or keywords the conditions of the models read.
const NAMED = /^(ceti alpha v|for the cause|ferenginar|khan noonien singh|kahless|population 9 billion|u\.s\.s\. voyager)\b/;
const NAMED_KEYWORDS = /demilitarized zone|delphic expanse|commander:|dissident|vedek|alpha|infiltrator|gul|legate|treachery/;

// The titles whose play leaves a pending discount, as the random tables pend them.
const PENDING_TITLES = [
  'Sarish Rez Ministerial Adjutant',
  'Icheb Second Officer',
  'Elizabeth Lense Valedictorian',
  'Shelley',
  'Data Proud Father',
  'Leonard H. McCoy Experienced Advisor',
];

/** A table with its plays of the turn and its pending discounts. */
export interface CostTable {
  table: TableState;
  plays: CostTurnPlay[];
  pending: PendingDiscount[];
}

const instance = (id: string, row: any, extra: Partial<CardInstance> = {}): CardInstance => ({ id, card: row, face: 'up', ...extra });

/** The seeded table `seed`, from the modelled titles `titles` (lowercased) and random cards of each type. */
export function costTable(seed: number, titles: readonly string[]): CostTable {
  const random = rng(seed);
  const int = (lo: number, hi: number) => lo + Math.floor(random() * (hi - lo + 1));
  const modelled = new Set(titles);
  const pools = new Map<string, { model: any[]; any: any[] }>();
  for (const row of cardData) {
    const pool = pools.get(row.type) ?? { model: [], any: [] };
    pool.any.push(row);
    if (modelled.has(titleKey(row)) || NAMED.test(titleKey(row)) || NAMED_KEYWORDS.test(String(row.keywords ?? ''))) pool.model.push(row);
    pools.set(row.type, pool);
  }
  let n = 0;
  const row = (type: string) => {
    const pool = pools.get(type)!;
    const list = pool.model.length > 0 && random() < 0.6 ? pool.model : pool.any;
    return list[Math.floor(random() * list.length)];
  };
  const pick = (type: string, stops = false): CardInstance => {
    const c = instance(`c${seed}-${n++}`, row(type));
    if (stops && random() < 0.2) c.stopped = true;
    return c;
  };
  const some = (type: string, lo: number, hi: number, stops = false) => Array.from({ length: int(lo, hi) }, () => pick(type, stops));
  const loose = (types: string[], lo: number, hi: number) => Array.from({ length: int(lo, hi) }, () => pick(types[int(0, types.length - 1)]));
  const missions = Array.from({ length: 5 }, () => {
    const mission = random() < 0.08 ? null : pick('mission');
    if (mission) {
      mission.placedOn = some('event', 0, 2);
      if (random() < 0.15) mission.flipped = true;
    }
    const ships = some('ship', 0, 2).map((ship) => {
      const crew = [...some('personnel', 0, 6, true), ...some('equipment', 0, 1)];
      if (crew.length > 0) ship.crew = crew;
      ship.placedOn = some('event', 0, 1);
      return ship;
    });
    return {
      mission,
      ships,
      awayTeam: [...some('personnel', 0, 7, true), ...some('equipment', 0, 2)],
      underMission: random() < 0.4 ? some('dilemma', 0, 5) : [],
      completed: !!mission && random() < 0.4,
    };
  });
  const core = loose(['event'], 0, 5).map((c) => (random() < 0.4 ? { ...c, placedOn: loose(['personnel', 'event'], 1, 3) } : c));
  const bot = random() < 0.3;
  const table = {
    ...initialTableState,
    missions,
    core,
    hand: random() < 0.15 ? [] : loose(['personnel', 'ship', 'event', 'equipment', 'interrupt'], 1, 8),
    discard: random() < 0.3 ? [] : loose(['personnel', 'ship', 'event'], 1, 6),
    drawDeck: loose(['personnel', 'ship', 'event', 'equipment'], 0, 6),
    dilemmaPile: some('dilemma', 0, 6),
    brig: random() < 0.5 ? [] : loose(['personnel'], 1, 2),
    score: int(0, 70),
    ...(bot ? { opponent: 'bot' } : {}),
  } as unknown as TableState;
  const plays: CostTurnPlay[] = Array.from({ length: int(0, 3) }, () => {
    const p = costPlayOf(row(['personnel', 'event', 'ship'][int(0, 2)]), undefined);
    return {
      type: p.type,
      unique: !!p.unique,
      icons: p.icons ?? [],
      species: p.species,
      skills: p.skills,
      quadrant: ['a', 'd', 'g', ''][int(0, 3)],
      affiliation: p.affiliation,
    };
  });
  const pending = PENDING_TITLES.filter(() => random() < 0.2).flatMap((title, i) => {
    const d = pendingDiscountOf(title, { entry: i });
    return d ? [random() < 0.2 ? { ...d, fromDrawDeck: true as const } : d] : [];
  });
  return { table, plays, pending };
}

// The fixture decks whose cards the cost models read.
const FIXTURE_TSVS: Record<string, string> = {
  costs: PRACTICE_COSTS_TSV,
  missions: PRACTICE_MISSIONS_TSV,
  '60s': PRACTICE_60S_TSV,
  tain: PRACTICE_TAIN_TSV,
  kmtar: PRACTICE_KMTAR_TSV,
  dissident: PRACTICE_DISSIDENT_TSV,
  playable: PRACTICE_PLAYABLE_TSV,
  unique: PRACTICE_UNIQUE_TSV,
  'bot-costs': PRACTICE_BOT_COSTS_TSV,
  downloads: PRACTICE_DOWNLOADS_TSV,
  recall: PRACTICE_RECALL_TSV,
  attributes: PRACTICE_ATTRIBUTES_TSV,
};

/** The fixture tables, by name: each deck with its own cards in the hand, then in the crew and the core. */
export function costFixtureTables(): [string, CostTable][] {
  const base = new Set(extractDrawDeck(deckFromTsv(PRACTICE_DECK_TSV, cardData)).map((r: any) => r.originalName));
  return Object.entries(FIXTURE_TSVS).flatMap(([name, tsv]) => {
    const whole = tsv.startsWith(PRACTICE_DECK_TSV.split('\n')[0]);
    const deck = whole ? deckFromTsv(tsv, cardData) : { ...deckFromTsv(PRACTICE_DECK_TSV, cardData), ...deckFromTsv(tsv, cardData) };
    const extra = extractDrawDeck(deckFromTsv(tsv, cardData)).filter((r: any) => !base.has(r.originalName));
    const names = new Set(extra.map((r: any) => r.originalName));
    const cards = extractDrawDeck(deck).filter((r: any) => !names.has(r.originalName));
    const deal = (where: 'hand' | 'table'): CostTable => {
      let n = 0;
      const ids = (rows: any[]) => rows.map((r) => instance(`${name}-${where}-x${n++}`, r));
      const table = tableReducer(initialTableState, {
        type: 'resetWithPiles',
        cards: createCardInstances(cards),
        missions: createCardInstances(extractMissions(deck), 'up'),
        dilemmas: createCardInstances(extractDilemmas(deck)),
        extraHand: where === 'hand' ? ids(extra) : [],
        extraCrew: where === 'table' ? ids(extra.filter((r: any) => r.type !== 'event')) : [],
        extraCore: where === 'table' ? ids(extra.filter((r: any) => r.type === 'event')) : [],
      });
      const placed = withPlaceIds(table, `${name}-${where}`);
      return { table: name === 'bot-costs' ? { ...placed, opponent: 'bot' } : placed, plays: [], pending: [] };
    };
    return [[`${name} (hand)`, deal('hand')], [`${name} (table)`, deal('table')]] as [string, CostTable][];
  });
}

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
    drawDeck: table.drawDeck.map(re),
    dilemmaPile: table.dilemmaPile.map(re),
    brig: table.brig.map(re),
  };
}

// Every place a card of the table can be played to, as the page names it.
function destinationsOf(table: TableState): [CostPlace, CostDestination][] {
  return [
    ['core', {}],
    ['resolving', {}],
    ...table.missions.flatMap((slot, i): [CostPlace, CostDestination][] => [
      ['awayTeam', { missionIndex: i }],
      ['shipRow', { missionIndex: i }],
      ['on', { onMissionIndex: i }],
      ...slot.ships.map((ship): [CostPlace, CostDestination] => ['crew', { missionIndex: i, shipId: ship.id }]),
    ]),
  ];
}

const plain = (v: unknown) => JSON.parse(JSON.stringify(v ?? null));

/** Every value the cost readers give on `t`, in a fixed order. */
export function costValuesOf({ table, plays, pending }: CostTable): unknown {
  const facts: CostFacts = costFactsOf(table, pending, plays);
  const dests = destinationsOf(table);
  const from: [CostPlace, CardInstance[]][] = [
    ['hand', table.hand],
    ['discard', table.discard],
    ['drawDeck', table.drawDeck.slice(0, 5)],
  ];
  const charges = from.map(([place, cards]) =>
    cards.map((c) => dests.map(([to, dest]) => plain(moveCharge('playAndDraw', place, to, c.card, facts, c.id, dest))))
  );
  const readers = table.hand.map((c) =>
    dests.map(([, dest]) => {
      const play = costPlayOf(c.card, c.id, dest);
      return plain([coreCostsOf(play, facts), missionCostsOf(play, facts), personnelCostsOf(play, facts)]);
    })
  );
  const handPlays = [...table.hand, ...table.drawDeck].map((c) => costPlayOf(c.card, c.id));
  const discounts = [...COST_REGISTRY.keys()].flatMap((title) => {
    const d = pendingDiscountOf(title, { entry: 3, move: 1 });
    return d ? [[d.title, d.label, d.amount, d.origin, handPlays.map((p) => d.applies(p))]] : [];
  });
  return {
    charges,
    readers,
    limits: plain([limitGrantsOf(facts), limitCapsOf(facts), firstTurnGrantsOf(facts), turnChoicesOf(facts)]),
    discounts,
  };
}
