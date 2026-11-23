// The trigger rows of the personnel (#1903): "When this personnel is …".

import { discardFromHand } from '../../effectSteps';
import { trigger, type TriggerRow } from '../model';

export const PERSONNEL_TRIGGER_ROWS: TriggerRow[] = [
  // "When you play this personnel, you may draw a card. When this personnel is killed, you must discard a card from
  // hand." Only a dilemma Resolve's kill is a kill.
  trigger('Li Nalas Legend of Bajor', 'When this personnel is killed, you must discard a card from hand.', 'self', { kind: 'killed', self: true }, [
    discardFromHand(1),
  ]),
];
