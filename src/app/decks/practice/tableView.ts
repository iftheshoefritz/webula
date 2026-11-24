// The table view of a `TableState` (#1875): every mission slot with its away team, its ships and their crews,
// the stopped personnel too, the core, the piles, the brig and the events the player commands. The plays and
// the pending discounts of the turn come from the log, so the caller passes them. `costFactsOf` projects the
// cost models' `CostFacts` from it (#1876), and the bot's table input is a projection of it (#1879).

import { requirementTextsOf } from '../../../lib/requirementRules';
import { cardDisplayName } from '../../../lib/cardCount';
import { cardTitleOf } from '../../../lib/cardTitle';
import type { CostTurnPlay, PendingDiscount } from '../../../lib/costModels/model';
import { partnerTraitsOf } from '../../../lib/dilemmaBot/simulator';
import { personnel, regionsOf } from '../../../lib/tableView';
import type { TableView, ViewCard, ViewEvent, ViewMission, ViewPileCard, ViewShip, ViewTableCard } from '../../../lib/tableView';
import type { CardInstance, MissionSlot, TableState } from './tableReducer';

const text = (v: unknown): string => String(v ?? '').toLowerCase();

/** The icons of an affiliation field that is a list of icons, "[fed][sf]"; a sentence gives none (#1696). */
export const iconsOf = (affiliation: string): string[] => (/^(\[[a-z0-9]+\])+$/.test(affiliation) ? (affiliation.match(/\[[a-z0-9]+\]/g) ?? []) : []);

export { regionsOf } from '../../../lib/tableView';

export const keywordsOf = (c: CardInstance): string[] => [
  ...new Set(
    text(c.card?.keywords)
      .split('.')
      .map((k) => k.trim())
      .filter(Boolean)
  ),
];

export const printedCostOf = (c: CardInstance): number => {
  const cost = Number.parseInt(String(c.card?.cost ?? ''), 10);
  return Number.isFinite(cost) ? cost : 0;
};

export const viewCardOf = (c: CardInstance): ViewCard => ({
  id: c.id,
  // A row with no name, as a test's invented card may have, has the title ''.
  title: c.card ? cardTitleOf(cardDisplayName(c.card) ?? '') : '',
  type: text(c.card?.type),
  cost: printedCostOf(c),
  row: c.card,
  placedOn: (c.placedOn ?? []).map(viewCardOf),
  ...(c.named ? { named: c.named } : {}),
});

const pileCardOf = (c: CardInstance): ViewPileCard => ({ ...viewCardOf(c), ...(c.removedFromGame ? { removedFromGame: true } : {}) });

/** A card of an away team, a crew or a ship row with a row; a card with no row is left out. */
const tableCardOf = (c: CardInstance, missionIndex: number, shipId?: string): ViewTableCard[] =>
  c.card
    ? [
        {
          ...partnerTraitsOf(c.card),
          ...viewCardOf(c),
          unique: text(c.card.unique) === 'y',
          stopped: !!c.stopped,
          missionIndex,
          ...(shipId !== undefined ? { shipId } : {}),
        },
      ]
    : [];

/**
 * A card as the modifier evaluators read it (#1887): its view card, with its crew for a ship, so a card off the
 * table, a ship in the hand with no slot, still has one. The evaluators read a card of the table from the view.
 */
export const modifierCardOf = (c: CardInstance): ViewCard & { crew: ViewTableCard[] } => ({
  ...viewCardOf(c),
  crew: (c.crew ?? []).flatMap((p) => tableCardOf(p, -1, c.id)),
});

const shipOf = (c: CardInstance, missionIndex: number): ViewShip[] =>
  tableCardOf(c, missionIndex).map((ship) => ({ ...ship, crew: (c.crew ?? []).flatMap((p) => tableCardOf(p, missionIndex, c.id)) }));

function missionOf(slot: MissionSlot, index: number, requirements: string): ViewMission {
  const card = slot.mission?.card;
  const points = Number.parseInt(String(card?.points ?? ''), 10);
  return {
    index,
    empty: !card,
    completed: slot.completed === true,
    flipped: slot.mission?.flipped === true,
    card: slot.mission ? viewCardOf(slot.mission) : null,
    name: card ? (cardDisplayName(card) ?? '') : '',
    requirements: card ? requirements : '',
    points: Number.isFinite(points) ? points : 0,
    type: text(card?.missiontype).charAt(0),
    icons: iconsOf(text(card?.affiliation).trim()),
    quadrant: text(card?.quadrant),
    regions: regionsOf(text(card?.keywords)),
    underMission: slot.underMission.map(viewCardOf),
    placedOn: (slot.mission?.placedOn ?? []).map(viewCardOf),
    awayTeam: slot.awayTeam.flatMap((c) => tableCardOf(c, index)),
    ships: slot.ships.flatMap((c) => shipOf(c, index)),
  };
}

const eventOf = (c: CardInstance, place: ViewEvent['place'], missionIndex?: number, shipId?: string): ViewEvent[] =>
  text(c.card?.type) === 'event'
    ? [
        {
          ...viewCardOf(c),
          keywords: keywordsOf(c),
          place,
          ...(missionIndex !== undefined ? { missionIndex } : {}),
          ...(shipId !== undefined ? { shipId } : {}),
        },
      ]
    : [];

/**
 * The events the player commands (#1749): the core's, then those
 * placed on the mission cards and the ships of every slot. Not the brig, and not an event placed on a core card.
 */
const eventsOf = (table: Pick<TableState, 'core' | 'missions'>): ViewEvent[] => [
  ...table.core.flatMap((c) => eventOf(c, 'core')),
  ...table.missions.flatMap((s, i) => [
    ...(s.mission?.placedOn ?? []).flatMap((c) => eventOf(c, 'missionCard', i)),
    ...s.ships.flatMap((ship) => (ship.placedOn ?? []).flatMap((c) => eventOf(c, 'ship', i, ship.id))),
  ]),
];

/**
 * What a table view is built from (#1878): the slots, the core, the hand, the discard pile and the brig, the rest of
 * a `TableState` optional. The range and attribute readers take such a part of the table.
 */
export type TableViewInput = Pick<TableState, 'missions' | 'core' | 'hand' | 'discard' | 'brig'> &
  Partial<Pick<TableState, 'drawDeck' | 'dilemmaPile' | 'score' | 'turn' | 'segment' | 'opponent' | 'botPile' | 'rangeUsed' | 'attempt'>>;

/** The table view of a part of the table: the piles it lacks are empty, its turn 1 in play and draw, its score 0. */
export function tableViewOfInput(table: TableViewInput, pending: PendingDiscount[] = [], plays: CostTurnPlay[] = []): TableView {
  // The requirements as the cards in play change them (#1828, Crescent Nebula), as the bot reads them.
  // A card of the core with a requirement row adds its recorded choice (#1837, Renewal Scroll).
  const core = (table.core ?? []).map(viewCardOf);
  const requirements = requirementTextsOf(
    table.missions.map((m) => m.mission?.card),
    core
  );
  return {
    missions: table.missions.map((slot, i) => missionOf(slot, i, text(requirements[i]))),
    core,
    hand: (table.hand ?? []).map(pileCardOf),
    discard: (table.discard ?? []).map(pileCardOf),
    drawDeck: (table.drawDeck ?? []).map(pileCardOf),
    dilemmaPile: (table.dilemmaPile ?? []).map(pileCardOf),
    dilemmaPileIsBot: table.opponent === 'bot',
    brig: (table.brig ?? []).map(viewCardOf),
    events: eventsOf({ core: table.core ?? [], missions: table.missions }),
    score: table.score ?? 0,
    turn: table.turn ?? 1,
    segment: table.segment ?? 'playAndDraw',
    rangeUsed: table.rangeUsed ?? {},
    ...(table.botPile ? { botPile: table.botPile } : {}),
    // The changes an ability made for the rest of the attempt (#1835).
    ...(table.attempt?.timed?.length ? { timed: table.attempt.timed } : {}),
    plays,
    pending,
  };
}

export function tableViewOf(table: TableState, pending: PendingDiscount[] = [], plays: CostTurnPlay[] = []): TableView {
  return tableViewOfInput(table, pending, plays);
}

/**
 * What the range, span and attribute models read (#1878): the table view, and the card instances of its slots by
 * id (the mission cards, the away teams, the ships, the crews and the core), so a model handed a view entry gets
 * its `CardInstance`. `awayTeam` gives a slot's away team as instances.
 * It belongs to the practice table; `TableView` holds no practice-table type.
 */
export interface TableRead {
  view: TableView;
  instance: (id: string) => CardInstance | undefined;
  awayTeam: (missionIndex: number) => CardInstance[];
}

/** The reader of `table`, its view built once. */
export function tableReadOf(table: TableViewInput): TableRead {
  const byId = new Map<string, CardInstance>();
  const add = (c: CardInstance) => {
    if (!byId.has(c.id)) byId.set(c.id, c);
  };
  for (const slot of table.missions) {
    if (slot.mission) add(slot.mission);
    slot.awayTeam.forEach(add);
    for (const ship of slot.ships) {
      add(ship);
      (ship.crew ?? []).forEach(add);
    }
  }
  (table.core ?? []).forEach(add);
  return {
    view: tableViewOfInput(table),
    instance: (id) => byId.get(id),
    awayTeam: (i) => table.missions[i]?.awayTeam ?? [],
  };
}

/**
 * The personnel the player commands, stopped ones too, as instances (#1878): `personnel` of the view with
 * `unstopped: false`, in its order, every away team and then each crew, slot by slot; never the brig.
 */
export function commandedPersonnel(missions: MissionSlot[]): CardInstance[] {
  const read = tableReadOf({ missions, core: [], hand: [], discard: [], brig: [] });
  return personnel(read.view, { unstopped: false }).flatMap((p) => read.instance(p.id) ?? []);
}
