// The delayed triggers (#1835): "If you do this, he is killed at the end of this turn." An attempt ability's use
// (`src/lib/attemptAbilities`) sets one up in its log entry; the row waits for the start of the next turn, the end of
// the turn the ability was used in, and is offered only when an `attemptAbilityUsed` entry of its card's ability
// `afterAbility` in the turn before set it up (`pendingTriggersOf`). Its use kills the card: it goes to the discard pile.

import { ATTEMPT_ABILITIES, killsAtEndOfTurn } from '../../attemptAbilities';
import { trigger, type TriggerRow } from '../model';

export const DELAYED_TRIGGER_ROWS: TriggerRow[] = ATTEMPT_ABILITIES.filter(killsAtEndOfTurn).map((a) => ({
  ...trigger(a.title, 'If you do this, he is killed at the end of this turn.', 'table', { kind: 'turnStarted' }, [], { useCost: { kind: 'killSelf' } }),
  afterAbility: a.index,
}));
