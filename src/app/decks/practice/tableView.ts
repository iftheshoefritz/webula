// The table view of a `TableState` (#1875), beside `costFactsOf`: every mission slot with its away team, its
// ships and their crews, the stopped personnel too, the core, the piles, the brig and the events the player
// commands. The plays and the pending discounts of the turn come from the log, so the caller passes them, as
// it does to `costFactsOf`. No reader reads the view yet (#1862).

import { requirementTextsOf } from '../../../lib/requirementRules';
import { cardDisplayName } from '../../../lib/cardCount';
import { cardTitleOf } from '../../../lib/cardTitle';
import type { CostTurnPlay, PendingDiscount } from '../../../lib/costModels/model';
import { partnerTraitsOf } from '../../../lib/dilemmaBot/simulator';
import type { TableView, ViewCard, ViewEvent, ViewMission, ViewPileCard, ViewShip, ViewTableCard } from '../../../lib/tableView';
import { iconsOf, keywordsOf, printedCostOf, regionsOf } from './costFacts';
import type { CardInstance, MissionSlot, TableState } from './tableReducer';

const text = (v: unknown): string => String(v ?? '').toLowerCase();

const viewCardOf = (c: CardInstance): ViewCard => ({
  id: c.id,
  title: c.card ? cardTitleOf(cardDisplayName(c.card)) : '',
  type: text(c.card?.type),
  cost: printedCostOf(c),
  row: c.card,
  placedOn: (c.placedOn ?? []).map(viewCardOf),
});

const pileCardOf = (c: CardInstance): ViewPileCard => ({ ...viewCardOf(c), ...(c.removedFromGame ? { removedFromGame: true } : {}) });

/** A card of an away team, a crew or a ship row with a row; a card with no row is left out, as `costFactsOf` does. */
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
    name: card ? cardDisplayName(card) : '',
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
 * The events the player commands, as `commandedEventsOf` of `costFacts.ts` (#1749): the core's, then those
 * placed on the mission cards and the ships of every slot. Not the brig, and not an event placed on a core card.
 */
const eventsOf = (table: TableState): ViewEvent[] => [
  ...table.core.flatMap((c) => eventOf(c, 'core')),
  ...table.missions.flatMap((s, i) => [
    ...(s.mission?.placedOn ?? []).flatMap((c) => eventOf(c, 'missionCard', i)),
    ...s.ships.flatMap((ship) => (ship.placedOn ?? []).flatMap((c) => eventOf(c, 'ship', i, ship.id))),
  ]),
];

export function tableViewOf(table: TableState, pending: PendingDiscount[] = [], plays: CostTurnPlay[] = []): TableView {
  // The requirements as the cards in play change them (#1828, Crescent Nebula), as `costFactsOf` reads them.
  const requirements = requirementTextsOf(table.missions.map((m) => m.mission?.card));
  return {
    missions: table.missions.map((slot, i) => missionOf(slot, i, text(requirements[i]))),
    core: table.core.map(viewCardOf),
    hand: table.hand.map(pileCardOf),
    discard: table.discard.map(pileCardOf),
    drawDeck: table.drawDeck.map(pileCardOf),
    dilemmaPile: table.dilemmaPile.map(pileCardOf),
    dilemmaPileIsBot: table.opponent === 'bot',
    brig: table.brig.map(viewCardOf),
    events: eventsOf(table),
    score: table.score,
    turn: table.turn,
    segment: table.segment,
    rangeUsed: table.rangeUsed ?? {},
    ...(table.botPile ? { botPile: table.botPile } : {}),
    plays,
    pending,
  };
}
