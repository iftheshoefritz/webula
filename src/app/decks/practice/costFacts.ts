// What the cost models read of the practice table (#1654), as a plain `CostFacts`: the printed
// traits of every personnel the player commands (every away team and every ship's crew, at every
// mission, never the brig), the titles of the core, and the hand by title and type. The downloads
// of the turn come from the log (`downloadedThisTurn` in `gameLog.ts`).

import { cardDisplayName } from '../../../lib/cardCount';
import { cardTitleOf } from '../../../lib/cardTitle';
import type { CostFacts } from '../../../lib/costModels/model';
import { partnerTraitsOf } from '../../../lib/dilemmaBot/simulator';
import type { TableState } from './tableReducer';

export function costFactsOf(table: TableState, downloaded: string[]): CostFacts {
  return {
    commanded: table.missions
      .flatMap((s) => [...s.awayTeam, ...s.ships.flatMap((ship) => ship.crew ?? [])])
      .flatMap((c) => (c.card?.type === 'personnel' ? [partnerTraitsOf(c.card)] : [])),
    core: table.core.flatMap((c) => (c.card ? [cardTitleOf(cardDisplayName(c.card))] : [])),
    hand: table.hand.map((c) => ({
      id: c.id,
      title: c.card ? cardTitleOf(cardDisplayName(c.card)) : '',
      type: String(c.card?.type ?? '').toLowerCase(),
    })),
    downloaded,
  };
}
