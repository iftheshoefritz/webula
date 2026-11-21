// What the cost models read of the practice table (#1654), as a plain `CostFacts`: the printed
// traits and the uniqueness of every unstopped personnel the player commands (every away team and every ship's crew,
// at every mission, never the brig; a stopped personnel meets no "you command" condition, #1751), the titles of the core, the hand by title and type, and each mission slot
// (#1694) with its personnel and ships (#1702), the discard pile, the ships of the ship rows and the
// score (#1700), and the cards placed on each core card (#1703). The plays of the turn (#1703) and the pending
// discounts of the turn come from the log (`pendingDiscountsOf` in `gameLog.ts`).

import { requirementTextsOf } from '../../../lib/requirementRules';
import { cardDisplayName } from '../../../lib/cardCount';
import { cardTitleOf } from '../../../lib/cardTitle';
import { DECK_TOP_FACTS } from '../../../lib/costModels/model';
import type { CommandedTraits, CostCoreCard, CostEventCard, CostFacts, CostMission, CostShip, CostTurnPlay, PendingDiscount } from '../../../lib/costModels/model';
import { partnerTraitsOf } from '../../../lib/dilemmaBot/simulator';
import { skillWordsOf } from '../../../lib/playCost';
import type { CardInstance, MissionSlot, TableState } from './tableReducer';

const text = (v: unknown): string => String(v ?? '').toLowerCase();

/** The icons of an affiliation field that is a list of icons, "[fed][sf]"; a sentence gives none (#1696). */
const iconsOf = (affiliation: string): string[] => (/^(\[[a-z0-9]+\])+$/.test(affiliation) ? (affiliation.match(/\[[a-z0-9]+\]/g) ?? []) : []);

/** Every "Region: <name>." clause of a mission's keywords, lowercased (#1696). */
const regionsOf = (keywords: string): string[] => [...keywords.matchAll(/region:\s*([^.;]+)/g)].map((m) => m[1].trim());

const personnelTraitsOf = (cards: CardInstance[]): CommandedTraits[] =>
  cards.flatMap((c) => (c.card?.type === 'personnel' ? [{ ...partnerTraitsOf(c.card), unique: String(c.card.unique ?? '').toLowerCase() === 'y' }] : []));

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

/**
 * The traits of a played card that a standing rule (#1703) or a mission (#1752) tests: its species, its
 * skills, and `quadrant`, that of the mission slot it landed at, absent for a play to no slot.
 */
export const turnPlayOf = (card: CardInstance['card'] | null | undefined, quadrant?: string): CostTurnPlay => ({
  type: text(card?.type),
  unique: text(card?.unique) === 'y',
  icons: text(card?.icons).match(/\[[a-z0-9]+\]/g) ?? [],
  species: speciesOf(card),
  skills: skillWordsOf(card?.skills),
  ...(text(card?.affiliation) ? { affiliation: text(card?.affiliation) } : {}),
  ...(quadrant ? { quadrant } : {}),
});

/** The quadrant of the mission at slot `missionIndex`, lowercased, or undefined. */
export const slotQuadrantOf = (table: TableState, missionIndex: number | undefined): string | undefined =>
  missionIndex === undefined ? undefined : text(table.missions[missionIndex]?.mission?.card?.quadrant) || undefined;

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
export function costFactsOf(table: TableState, pending: PendingDiscount[] = [], plays: CostTurnPlay[] = []): CostFacts {
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
