// What the cost models read of the practice table (#1654), as a plain `CostFacts`: the printed
// traits and the uniqueness of every personnel the player commands (every away team and every ship's crew, at every
// mission, never the brig), the titles of the core, the hand by title and type, and each mission slot
// (#1694) with its personnel and ships (#1702), the discard pile, the ships of the ship rows and the
// score (#1700), and the cards placed on each core card (#1703). The plays of the turn (#1703) and the pending
// discounts of the turn come from the log (`pendingDiscountsOf` in `gameLog.ts`).

import { cardDisplayName } from '../../../lib/cardCount';
import { cardTitleOf } from '../../../lib/cardTitle';
import type { CommandedTraits, CostCoreCard, CostFacts, CostMission, CostShip, CostTurnPlay, PendingDiscount } from '../../../lib/costModels/model';
import { partnerTraitsOf } from '../../../lib/dilemmaBot/simulator';
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

function costMissionOf(slot: MissionSlot): CostMission {
  const card = slot.mission?.card;
  const points = Number.parseInt(String(card?.points ?? ''), 10);
  return {
    completed: slot.completed === true,
    name: card ? cardDisplayName(card) : '',
    requirements: card ? text(card.skills) : '',
    points: Number.isFinite(points) ? points : 0,
    type: text(card?.missiontype).charAt(0),
    icons: iconsOf(text(card?.affiliation).trim()),
    quadrant: text(card?.quadrant),
    dilemmasUnder: slot.underMission.filter((c) => text(c.card?.type) === 'dilemma').length,
    regions: regionsOf(text(card?.keywords)),
    personnel: slotPersonnelOf(slot),
    ships: slot.ships.flatMap(costShipOf),
  };
}

const handCardOf = (c: CardInstance) => ({
  id: c.id,
  title: c.card ? cardTitleOf(cardDisplayName(c.card)) : '',
  type: String(c.card?.type ?? '').toLowerCase(),
});

const coreCardOf = (c: CardInstance): CostCoreCard => {
  const cost = Number.parseInt(String(c.card?.cost ?? ''), 10);
  return {
    id: c.id,
    title: cardTitleOf(cardDisplayName(c.card)),
    type: text(c.card?.type),
    keywords: text(c.card?.keywords)
      .split('.')
      .map((k) => k.trim())
      .filter(Boolean),
    cost: Number.isFinite(cost) ? cost : 0,
  };
};

/** The traits of a played card that a standing rule tests (#1703). */
export const turnPlayOf = (card: CardInstance['card'] | null | undefined): CostTurnPlay => ({
  type: text(card?.type),
  unique: text(card?.unique) === 'y',
  icons: text(card?.icons).match(/\[[a-z0-9]+\]/g) ?? [],
});

// `plays` are the cards played earlier this turn (#1703), from the log.
export function costFactsOf(table: TableState, pending: PendingDiscount[] = [], plays: CostTurnPlay[] = []): CostFacts {
  const core = table.core.filter((c) => c.card);
  return {
    commanded: table.missions.flatMap((s) => personnelTraitsOf(slotCards(s))),
    core: core.map((c) => cardTitleOf(cardDisplayName(c.card))),
    coreCards: core.map(coreCardOf),
    corePlaced: core.map((c) => c.placedOn?.length ?? 0),
    hand: table.hand.map(handCardOf),
    discard: table.discard.filter((c) => !c.removedFromGame).map(handCardOf),
    ships: table.missions.flatMap((s) => s.ships.flatMap((c) => (c.card ? [cardTitleOf(cardDisplayName(c.card))] : []))),
    score: table.score,
    missions: table.missions.map(costMissionOf),
    pending,
    plays,
  };
}
