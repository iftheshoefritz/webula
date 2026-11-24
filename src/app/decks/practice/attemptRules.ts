// The rules an attempt breaks as it begins (#1917, part 3 of #1890): the `attempt` permission rows of the modifier
// kind (`src/lib/modifiers/titles/permissions.ts`). A ship on a ship row whose crew "cannot attempt missions"
// (Delta Flyer Innovative Vessel) warns when that ship attempts, and a core card that sets the fewest personnel an
// attempt may begin with (They're Still Coming Through!) warns when the attempt has fewer. Like every play rule they
// only warn, under the setting "Check uniqueness and limits": `withShuffleOrders` stamps them on `startAttempt` and
// `botAttempt`, the attempt's log entry keeps them, and the popup shows them. Start still starts the attempt.
import { cardTitleOf } from '../../../lib/cardTitle';
import { cardDisplayName } from '../../../lib/cardCount';
import { modifierRowsOf } from '../../../lib/modifiers';
import { rowTitleKey } from '../../../lib/modifiers/words';
import type { RuleWarning } from './playRules';
import type { TableState } from './tableReducer';

/** The attempt as the rules read it: its slot, its ship at a space mission, and the personnel the popup counted. */
export interface AttemptRuleInput {
  missionIndex: number;
  shipId?: string;
  personnel: number;
}

const titleOf = (card: any): string => cardTitleOf(cardDisplayName(card ?? {}) ?? '');

/** The warnings of the attempt `attempt` on `table`, each title once, the attempting ship's first, then the core's. */
export function attemptWarningsOf(table: TableState, attempt: AttemptRuleInput): RuleWarning[] {
  const warnings: RuleWarning[] = [];
  const seen = new Set<string>();
  const warn = (title: string, condition: string) => {
    if (seen.has(title)) return;
    seen.add(title);
    warnings.push({ rule: 'attempt', title, condition });
  };
  const ship = attempt.shipId ? table.missions[attempt.missionIndex]?.ships.find((s) => s.id === attempt.shipId) : undefined;
  if (ship) {
    for (const r of modifierRowsOf(rowTitleKey(ship.card))) {
      if (r.source === 'shipRow' && r.target === 'crew' && r.changes.attempt === 'forbid') warn(titleOf(ship.card), r.words ?? '');
    }
  }
  for (const c of table.core) {
    for (const r of modifierRowsOf(rowTitleKey(c.card))) {
      if (r.source !== 'core' || r.target !== 'attempting' || r.changes.attempt !== 'forbid' || !r.minAttempting) continue;
      if (attempt.personnel < r.minAttempting) warn(titleOf(c.card), r.words ?? '');
    }
  }
  return warnings;
}
