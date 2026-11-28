// Issue #1876: `costFactsOf` is a projection of the table view. The builder of before, copied here as
// `legacyCostFactsOf`, and the projection give deep-equal `CostFacts` on the tables of the fixtures; and every
// shared condition the cost models use reads the same over the table view and over the `CostFacts` adapter.
import { readFileSync } from 'fs';
import { join } from 'path';
import { deckFromTsv, extractDilemmas, extractDrawDeck, extractMissions } from '../../../app/decks/deckBuilderUtils';
import {
  PRACTICE_BOT_COSTS_TSV,
  PRACTICE_COSTS_CORE,
  PRACTICE_COSTS_CREW,
  PRACTICE_COSTS_LATE_HAND,
  PRACTICE_COSTS_TSV,
  PRACTICE_DECK_TSV,
  PRACTICE_DISSIDENT_CORE,
  PRACTICE_DISSIDENT_DRAW_TOP,
  PRACTICE_DISSIDENT_HAND,
  PRACTICE_DISSIDENT_TSV,
  PRACTICE_KMTAR_HAND,
  PRACTICE_KMTAR_TSV,
  PRACTICE_MISSIONS_HAND,
  PRACTICE_MISSIONS_TSV,
  PRACTICE_TAIN_HAND,
  PRACTICE_TAIN_TSV,
} from '../../../lib/practiceDeck';
import { CardInstance, MissionSlot, TableState, createCardInstances, initialTableState, tableReducer } from '../../../app/decks/practice/tableReducer';
import { costFactsOf } from '../../../app/decks/practice/costFacts';
import { tableViewOf } from '../../../app/decks/practice/tableView';
import { costFactsSource } from '../../../lib/costModels/factsSource';
import { requirementTextsOf } from '../../../lib/requirementRules';
import { cardDisplayName } from '../../../lib/cardCount';
import { cardTitleOf, rowCardTitleOf } from '../../../lib/cardTitle';
import { DECK_TOP_FACTS } from '../../../lib/costModels/model';
import type { CommandedTraits, CostCoreCard, CostEventCard, CostFacts, CostMission, CostShip, CostTurnPlay, PendingDiscount } from '../../../lib/costModels/model';
import { partnerTraitsOf } from '../../../lib/dilemmaBot/simulator';
import {
  Condition,
  Selection,
  TableReader,
  commands,
  commandsEach,
  commandsEvents,
  completedMissionRequiring,
  core,
  count,
  firstThisTurn,
  missionAt,
  missions,
  personnel,
} from '../../../lib/tableView';

jest.mock('posthog-js', () => ({ capture: jest.fn() }));

// The builder of before #1876, as it was.
const text = (v: unknown): string => String(v ?? '').toLowerCase();

/** The icons of an affiliation field that is a list of icons, "[fed][sf]"; a sentence gives none (#1696). */
const iconsOf = (affiliation: string): string[] => (/^(\[[a-z0-9]+\])+$/.test(affiliation) ? (affiliation.match(/\[[a-z0-9]+\]/g) ?? []) : []);

/** Every "Region: <name>." clause of a mission's keywords, lowercased (#1696). */
const regionsOf = (keywords: string): string[] => [...keywords.matchAll(/region:\s*([^.;]+)/g)].map((m) => m[1].trim());

const personnelTraitsOf = (cards: CardInstance[]): CommandedTraits[] =>
  cards.flatMap((c) => (c.card?.type === 'personnel' ? [{ ...partnerTraitsOf(c.card), unique: String(c.card.unique ?? '').toLowerCase() === 'y', cardTitle: rowCardTitleOf(c.card) }] : []));

const slotCards = (s: MissionSlot): CardInstance[] => [...s.awayTeam, ...s.ships.flatMap((ship) => ship.crew ?? [])];

/** The personnel at a slot: its away team and every crew of its ship row (#1702), each with its id, title and stopped state (#1713). */
const slotPersonnelOf = (s: MissionSlot): CommandedTraits[] =>
  slotCards(s).flatMap((c) =>
    c.card?.type === 'personnel'
      ? [{ ...personnelTraitsOf([c])[0], id: c.id, title: cardTitleOf(cardDisplayName(c.card)), stopped: !!c.stopped }]
      : []
  );

const costShipOf = (c: CardInstance): CostShip[] =>
  c.card
    ? [
        {
          id: c.id,
          title: cardTitleOf(cardDisplayName(c.card)),
          affiliation: text(c.card.affiliation),
          icons: text(c.card.icons).match(/\[[a-z0-9]+\]/g) ?? [],
        },
      ]
    : [];

function costMissionOf(slot: MissionSlot, requirements: string): CostMission {
  const card = slot.mission?.card;
  const points = Number.parseInt(String(card?.points ?? ''), 10);
  return {
    completed: slot.completed === true,
    name: card ? cardDisplayName(card) : '',
    // The card title, which a card names (#1985).
    ...(card ? { cardTitle: rowCardTitleOf(card) } : {}),
    requirements: card ? requirements : '',
    points: Number.isFinite(points) ? points : 0,
    type: text(card?.missiontype).charAt(0),
    icons: iconsOf(text(card?.affiliation).trim()),
    quadrant: text(card?.quadrant),
    dilemmasUnder: slot.underMission.filter((c) => text(c.card?.type) === 'dilemma').length,
    regions: regionsOf(text(card?.keywords)),
    personnel: slotPersonnelOf(slot),
    ships: slot.ships.flatMap(costShipOf),
    ...(slot.mission?.flipped ? { flipped: true } : {}),
  };
}

const handCardOf = (c: CardInstance) => ({
  id: c.id,
  title: c.card ? cardTitleOf(cardDisplayName(c.card)) : '',
  type: String(c.card?.type ?? '').toLowerCase(),
});

const coreCardOf = (c: CardInstance): CostCoreCard => {
  return {
    id: c.id,
    title: cardTitleOf(cardDisplayName(c.card)),
    type: text(c.card?.type),
    keywords: text(c.card?.keywords)
      .split('.')
      .map((k) => k.trim())
      .filter(Boolean),
    cost: printedCostOf(c),
  };
};

const speciesOf = (card: CardInstance['card'] | null | undefined): string[] =>
  text(card?.species)
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);

const keywordsOf = (c: CardInstance): string[] => [
  ...new Set(
    text(c.card?.keywords)
      .split('.')
      .map((k) => k.trim())
      .filter(Boolean)
  ),
];

/**
 * The events the player commands (#1749): those of the core, and those placed on the mission cards and the
 * ships of every slot. Not the brig, and not an event placed on a card of the core.
 */
const commandedEventsOf = (table: TableState): CardInstance[] =>
  [
    ...table.core,
    ...table.missions.flatMap((s) => [...(s.mission?.placedOn ?? []), ...s.ships.flatMap((ship) => ship.placedOn ?? [])]),
  ].filter((c) => text(c.card?.type) === 'event');

const eventsOf = (table: TableState): CostEventCard[] =>
  commandedEventsOf(table).map((c) => ({ title: cardTitleOf(cardDisplayName(c.card)), keywords: keywordsOf(c) }));

const printedCostOf = (c: CardInstance): number => {
  const cost = Number.parseInt(String(c.card?.cost ?? ''), 10);
  return Number.isFinite(cost) ? cost : 0;
};

/**
 * The printed costs of the cards the player commands (#1768): the unstopped personnel and the equipment of
 * every away team and crew (a stopped personnel meets no "while you command" condition, #1751), every ship of
 * every ship row, and the events of `eventsOf`. Never the brig.
 */
const commandedCostsOf = (table: TableState): number[] =>
  [
    ...table.missions.flatMap((s) =>
      slotCards(s).filter((c) => (c.card?.type === 'personnel' && !c.stopped) || text(c.card?.type) === 'equipment')
    ),
    ...table.missions.flatMap((s) => s.ships.filter((c) => c.card)),
    ...commandedEventsOf(table),
  ].map(printedCostOf);

// `plays` are the cards played earlier this turn (#1703), from the log.
function legacyCostFactsOf(table: TableState, pending: PendingDiscount[] = [], plays: CostTurnPlay[] = []): CostFacts {
  const core = table.core.filter((c) => c.card);
  return {
    // A stopped personnel is still commanded, but meets no "if/while/for each … you command" condition (#1751).
    commanded: table.missions.flatMap((s) => personnelTraitsOf(slotCards(s).filter((c) => !c.stopped))),
    core: core.map((c) => cardTitleOf(cardDisplayName(c.card))),
    coreCards: core.map(coreCardOf),
    corePlaced: core.map((c) => c.placedOn?.length ?? 0),
    hand: table.hand.map(handCardOf),
    discard: table.discard.filter((c) => !c.removedFromGame).map(handCardOf),
    ships: table.missions.flatMap((s) => s.ships.flatMap((c) => (c.card ? [cardTitleOf(cardDisplayName(c.card))] : []))),
    score: table.score,
    // The requirements as the cards in play change them (#1828, Crescent Nebula), as the bot reads them.
    missions: requirementTextsOf(table.missions.map((m) => m.mission?.card)).map((r, i) => costMissionOf(table.missions[i], text(r))),
    pending,
    plays,
    events: eventsOf(table),
    commandedCosts: commandedCostsOf(table),
    drawDeckTop: table.drawDeck.slice(0, DECK_TOP_FACTS).map((c) => ({ id: c.id, type: text(c.card?.type), species: speciesOf(c.card) })),
    // The bot's dilemma pile is the opponent's (#1738); in a game with no bot the pile is the player's own.
    ...(table.opponent === 'bot'
      ? { opponentDilemmaPile: table.dilemmaPile.map((c) => ({ id: c.id, dilemmaType: text(c.card?.dilemmatype) })) }
      : {}),
  };
}

// The rows are read by hand, normalised as `parseCardData` does, as `tableView.test.ts` does.
const data = (() => {
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

interface Extras {
  hand?: any[];
  crew?: any[];
  core?: any[];
  drawTop?: any[];
  opponent?: 'bot';
}

/** The fixture deal of `deckTsv` with `extras`, as the page deals `?fixture=piles` and its variants. */
function deal(deckTsv: string, extras: Extras = {}): TableState {
  const deck = deckFromTsv(deckTsv, data);
  const extra = new Set(
    [...(extras.hand ?? []), ...(extras.crew ?? []), ...(extras.core ?? []), ...(extras.drawTop ?? [])].map((r) => r.originalName)
  );
  const cards = extractDrawDeck(deck).filter((r: any) => !extra.has(r.originalName));
  return tableReducer(initialTableState, {
    type: 'resetWithPiles',
    cards: createCardInstances([...cards, ...cards.filter((r: any) => r.type === 'personnel')]),
    missions: createCardInstances(extractMissions(deck), 'up'),
    dilemmas: createCardInstances(extractDilemmas(deck)),
    ...(extras.opponent ? { opponent: extras.opponent } : {}),
    extraHand: createCardInstances(extras.hand ?? []),
    extraCrew: createCardInstances(extras.crew ?? []),
    extraCore: createCardInstances(extras.core ?? []),
    extraDrawTop: createCardInstances(extras.drawTop ?? []),
  });
}

const rowsOf = (tsv: string): any[] => extractDrawDeck(deckFromTsv(tsv, data));
const named = (rows: any[], ...names: string[]) => names.flatMap((name) => rows.filter((r) => r.originalName === name));

function costsTable(): TableState {
  const rows = rowsOf(PRACTICE_COSTS_TSV);
  const crew = (r: any) => r.originalName === PRACTICE_COSTS_CREW;
  const inCore = (r: any) => r.originalName === PRACTICE_COSTS_CORE;
  const late = (r: any) => PRACTICE_COSTS_LATE_HAND.includes(r.originalName);
  return deal(`${PRACTICE_DECK_TSV}\n${PRACTICE_COSTS_TSV}`, {
    crew: rows.filter(crew),
    core: rows.filter(inCore),
    hand: [...rows.filter((r) => !crew(r) && !inCore(r) && !late(r)), ...named(rows, ...PRACTICE_COSTS_LATE_HAND)],
  });
}

const TABLES: [string, () => TableState][] = [
  ['costs', costsTable],
  ['tain', () => deal(PRACTICE_TAIN_TSV, { hand: named(rowsOf(PRACTICE_TAIN_TSV), ...PRACTICE_TAIN_HAND) })],
  ['missions', () => deal(PRACTICE_MISSIONS_TSV, { hand: named(rowsOf(PRACTICE_MISSIONS_TSV), PRACTICE_MISSIONS_HAND) })],
  ['kmtar', () => deal(PRACTICE_KMTAR_TSV, { hand: named(rowsOf(PRACTICE_KMTAR_TSV), PRACTICE_KMTAR_HAND) })],
  [
    'dissident',
    () => {
      const rows = rowsOf(PRACTICE_DISSIDENT_TSV);
      return deal(`${PRACTICE_DECK_TSV}\n${PRACTICE_DISSIDENT_TSV}`, {
        core: named(rows, PRACTICE_DISSIDENT_CORE),
        hand: named(rows, PRACTICE_DISSIDENT_HAND),
        drawTop: named(rows, PRACTICE_DISSIDENT_DRAW_TOP),
      });
    },
  ],
  ['bot-costs', () => deal(`${PRACTICE_DECK_TSV}\n${PRACTICE_BOT_COSTS_TSV}`, { hand: rowsOf(PRACTICE_BOT_COSTS_TSV), opponent: 'bot' })],
];

/**
 * `table` with the traps of a projection: the first personnel of slot 0 stopped, a core card with no row, slot 1
 * completed and flipped, an event of the core placed on slot 0's mission card, and the first card of the discard
 * pile removed from the game.
 */
function withTraps(table: TableState): TableState {
  const slot0 = table.missions[0];
  const first = slot0.awayTeam.find((c) => c.card?.type === 'personnel');
  const awayTeam = slot0.awayTeam.map((c) => (c.id === first?.id ? { ...c, stopped: true } : c));
  const event = table.core.find((c) => c.card?.type === 'event');
  const rowless: CardInstance = { id: 'rowless-core', card: undefined as any, face: 'up' } as CardInstance;
  const missionsOf = table.missions.map((s, i): MissionSlot => {
    if (i === 0) return { ...s, awayTeam, mission: s.mission && event ? { ...s.mission, placedOn: [...(s.mission.placedOn ?? []), event] } : s.mission };
    if (i === 1) return { ...s, completed: true, mission: s.mission ? { ...s.mission, flipped: true } : s.mission };
    return s;
  });
  const discard = table.discard.length > 0 ? table.discard : table.hand.slice(0, 2);
  return {
    ...table,
    missions: missionsOf,
    core: [...table.core.filter((c) => c.id !== event?.id), rowless],
    discard: discard.map((c, i) => (i === 0 ? { ...c, removedFromGame: true } : c)),
  };
}

const PENDING: PendingDiscount[] = [];
const PLAYS: CostTurnPlay[] = [
  { type: 'personnel', unique: true, icons: ['[tng]'], species: ['android'], skills: ['diplomacy'], quadrant: 'd', affiliation: 'vidiian' },
];

describe('costFactsOf is a projection of the table view (#1876)', () => {
  it.each(TABLES)('gives the CostFacts of the builder of before on the %s table', (_, table) => {
    const t = table();
    expect(costFactsOf(t)).toEqual(legacyCostFactsOf(t));
    expect(costFactsOf(t, PENDING, PLAYS)).toEqual(legacyCostFactsOf(t, PENDING, PLAYS));
  });

  it.each(TABLES)('gives them on the %s table with a stopped personnel, a row-less core card and the other traps', (_, table) => {
    const t = withTraps(table());
    expect(t.core.some((c) => !c.card)).toBe(true);
    expect(costFactsOf(t, PENDING, PLAYS)).toEqual(legacyCostFactsOf(t, PENDING, PLAYS));
  });

  it('deals opponentDilemmaPile only in the bot game', () => {
    expect(costFactsOf(TABLES[5][1]()).opponentDilemmaPile?.length).toBeGreaterThan(0);
    expect(costFactsOf(TABLES[0][1]())).not.toHaveProperty('opponentDilemmaPile');
  });
});

// Every shared condition and selector the cost models use, as they use them.
const p = (q: Omit<Extract<Selection, { of: 'personnel' }>, 'of' | 'unstopped'>): Selection => ({ of: 'personnel', unstopped: true, ...q });
const CONDITIONS: [string, Condition][] = [
  ['a Borg', commands(p({ species: 'borg' }), 'a Borg')],
  ['3 [Fed]', commands(p({ affiliation: 'federation' }), '[Fed] personnel', { min: 3 })],
  ['a unique', commands(p({ where: (x) => x.unique === true }), 'a unique personnel')],
  ['a [Pa] card', commands([p({ icon: '[pa]' }), { of: 'ships', icon: '[pa]' }], 'a [Pa] card')],
  ['an [SF] ship', commands({ of: 'ships', affiliation: 'starfleet' }, 'a ship')],
  ['each Borg', commandsEach(p({ species: 'borg' }), 'Borg', { limit: 5 })],
  ['each Treachery', commandsEach(p({ skill: 'treachery' }), 'Treachery personnel')],
  ['each non-[Fed]', commandsEach(p({ where: (x) => x.affiliation !== 'federation' }), 'non-[Fed] personnel')],
  ['3 events', commandsEvents({ min: 3 })],
  ['an Assault event', commandsEvents({ keyword: 'assault', what: 'Assault' })],
  ['completed Diplomacy', completedMissionRequiring(['Diplomacy', 'Leadership'])],
  ['first Android', firstThisTurn((x) => (x.species ?? []).includes('android'), 'Android')],
  ['first unique', firstThisTurn((x) => x.type === 'personnel' && x.unique, 'unique personnel')],
];

const SELECTIONS: [string, (r: TableReader) => unknown][] = [
  ['unstopped commanded', (r) => count(r, { of: 'personnel', unstopped: true })],
  ['unstopped at each slot', (r) => [0, 1, 2, 3, 4].map((at) => personnel(r, { unstopped: true, at }).map((x) => x.id))],
  ['every personnel at each slot', (r) => [0, 1, 2, 3, 4].map((at) => personnel(r, { unstopped: false, at }).map((x) => x.id))],
  ['titled, stopped or not', (r) => personnel(r, { unstopped: false }).map((x) => cardTitleOf(x.name))],
  ['the core', (r) => core(r).filter((c) => c.title).map((c) => [c.title, c.placed, c.id ?? null])],
  ['each slot', (r) => [0, 1, 2, 3, 4].map((i) => [missionAt(r, i)?.completed, missionAt(r, i)?.flipped ?? false, missionAt(r, i)?.quadrant])],
  ['the missions', (r) => missions(r).map((m) => [m.index, m.name, m.regions])],
  ['the events', (r) => count(r, { of: 'events' })],
];

describe('the CostFacts adapter reads as the table view (#1876)', () => {
  it.each(TABLES)('every shared condition holds and reads the same on the %s table', (_, table) => {
    for (const t of [table(), withTraps(table())]) {
      for (const plays of [[], PLAYS]) {
        const view = tableViewOf(t, [], plays);
        const facts = costFactsSource(costFactsOf(t, [], plays));
        for (const [name, c] of CONDITIONS) {
          expect([name, c.holds(facts), c.text(facts)]).toEqual([name, c.holds(view), c.text(view)]);
        }
        for (const [name, s] of SELECTIONS) {
          expect([name, s(facts)]).toEqual([name, s(view)]);
        }
      }
    }
  });
});
