// The table view of a `TableState` (#1875): every mission slot with its away team, its ships and their crews,
// the stopped personnel too, the core, the piles, the brig and the events the player commands. The plays and
// the pending discounts of the turn come from the log, so the caller passes them. `costFactsOf` projects the
// cost models' `CostFacts` from it (#1876), and the bot's table input is a projection of it (#1879).

import { requirementTextsOf } from '../../../lib/requirementRules';
import { cardDisplayName } from '../../../lib/cardCount';
import { cardTitleOf } from '../../../lib/cardTitle';
import type { CostTurnPlay, PendingDiscount } from '../../../lib/costModels/model';
import { partnerTraitsOf } from '../../../lib/dilemmaBot/simulator';
import type { TableView, ViewCard, ViewEvent, ViewMission, ViewPileCard, ViewShip, ViewTableCard } from '../../../lib/tableView';
import type { CardInstance, MissionSlot, TableState } from './tableReducer';

const text = (v: unknown): string => String(v ?? '').toLowerCase();

/** The icons of an affiliation field that is a list of icons, "[fed][sf]"; a sentence gives none (#1696). */
export const iconsOf = (affiliation: string): string[] => (/^(\[[a-z0-9]+\])+$/.test(affiliation) ? (affiliation.match(/\[[a-z0-9]+\]/g) ?? []) : []);

/** Every "Region: <name>." clause of a mission's keywords, lowercased (#1696). */
export const regionsOf = (keywords: string): string[] => [...keywords.matchAll(/region:\s*([^.;]+)/g)].map((m) => m[1].trim());

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

const viewCardOf = (c: CardInstance): ViewCard => ({
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
const eventsOf = (table: TableState): ViewEvent[] => [
  ...table.core.flatMap((c) => eventOf(c, 'core')),
  ...table.missions.flatMap((s, i) => [
    ...(s.mission?.placedOn ?? []).flatMap((c) => eventOf(c, 'missionCard', i)),
    ...s.ships.flatMap((ship) => (ship.placedOn ?? []).flatMap((c) => eventOf(c, 'ship', i, ship.id))),
  ]),
];

export function tableViewOf(table: TableState, pending: PendingDiscount[] = [], plays: CostTurnPlay[] = []): TableView {
  // The requirements as the cards in play change them (#1828, Crescent Nebula), as the bot reads them.
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
