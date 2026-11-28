// The delayed triggers (#1835): "If you do this, he is killed at the end of this turn." An attempt ability's use
// (`src/lib/attemptAbilities`) sets one up in its log entry; the row waits for the discard segment of that turn, the
// end of the turn (#1946), and is offered only when an `attemptAbilityUsed` entry of its card's ability `afterAbility`
// earlier in the turn set it up (`pendingTriggersOf`). The offer stands through the discard segment, and the turn
// still ends with it unused. Its use kills the card, still stopped if it was: it goes to the discard pile.

import { ATTEMPT_ABILITIES, killsAtEndOfTurn } from '../../attemptAbilities';
import { trigger, type TriggerRow } from '../model';

export const DELAYED_TRIGGER_ROWS: TriggerRow[] = ATTEMPT_ABILITIES.filter(killsAtEndOfTurn).map((a) => ({
  ...trigger(a.title, 'If you do this, he is killed at the end of this turn.', 'table', { kind: 'turnEnding' }, [], { useCost: { kind: 'killSelf' } }),
  afterAbility: a.index,
}));
