// What the cost models read of the practice table (#1654), as a plain `CostFacts`: the printed
// traits and the uniqueness of every personnel the player commands (every away team and every ship's crew, at every
// mission, never the brig), the titles of the core, the hand by title and type, and each mission slot
// (#1694). The pending
// discounts of the turn come from the log (`pendingDiscountsOf` in `gameLog.ts`).

import { cardDisplayName } from '../../../lib/cardCount';
import { cardTitleOf } from '../../../lib/cardTitle';
import type { CostFacts, CostMission, PendingDiscount } from '../../../lib/costModels/model';
import { partnerTraitsOf } from '../../../lib/dilemmaBot/simulator';
import type { MissionSlot, TableState } from './tableReducer';

const text = (v: unknown): string => String(v ?? '').toLowerCase();

function costMissionOf(slot: MissionSlot): CostMission {
  const card = slot.mission?.card;
  const points = Number.parseInt(String(card?.points ?? ''), 10);
  return {
    completed: slot.completed === true,
    name: card ? cardDisplayName(card) : '',
    requirements: card ? text(card.skills) : '',
    points: Number.isFinite(points) ? points : 0,
    type: text(card?.missiontype).charAt(0),
    icons: text(card?.affiliation).match(/\[[a-z0-9]+\]/g) ?? [],
    quadrant: text(card?.quadrant),
    dilemmasUnder: slot.underMission.filter((c) => text(c.card?.type) === 'dilemma').length,
  };
}

export function costFactsOf(table: TableState, pending: PendingDiscount[] = []): CostFacts {
  return {
    commanded: table.missions
      .flatMap((s) => [...s.awayTeam, ...s.ships.flatMap((ship) => ship.crew ?? [])])
      .flatMap((c) => (c.card?.type === 'personnel' ? [{ ...partnerTraitsOf(c.card), unique: String(c.card.unique ?? '').toLowerCase() === 'y' }] : [])),
    core: table.core.flatMap((c) => (c.card ? [cardTitleOf(cardDisplayName(c.card))] : [])),
    hand: table.hand.map((c) => ({
      id: c.id,
      title: c.card ? cardTitleOf(cardDisplayName(c.card)) : '',
      type: String(c.card?.type ?? '').toLowerCase(),
    })),
    missions: table.missions.map(costMissionOf),
    pending,
  };
}
