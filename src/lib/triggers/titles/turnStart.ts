// The trigger rows of the start of the player's turn (#1904): "At the start of your turn, you may download …".

import { discardFromHand, discardTopByDownloadedCost, download, shuffle } from '../../effectSteps';
import { trigger, type TriggerRow } from '../model';

const COST_4_OR_MORE = [{ costAtLeast: 4 }];

export const TURN_START_TRIGGER_ROWS: TriggerRow[] = [
  // "To play this event, you must command three [Bor] personnel. Plays in your core. At the start of your turn, you
  // may download a [Bor] personnel or [Bor] ship. When you do this, discard cards from the top of your deck equal to
  // the cost of that card."
  trigger(
    'Quintessence',
    'At the start of your turn, you may download a [Bor] personnel or [Bor] ship.',
    'core',
    { kind: 'turnStarted' },
    [
      download(1, 'a [Bor] personnel or [Bor] ship', [
        { types: ['personnel'], icons: ['[bor]'] },
        { types: ['ship'], icons: ['[bor]'] },
      ]),
      shuffle(),
      discardTopByDownloadedCost(),
    ],
    { may: true }
  ),
  // "When you play this personnel, if you command a unique personnel, he is cost -1. At the start of each of your
  // turns, you may discard a card from hand that has a cost of 4 or more to download a card that has a cost of 4 or
  // more." The discard is the cost of the download: with no such card in hand, the player skips.
  trigger(
    'Six of Ten Invalidation Drone',
    'At the start of each of your turns, you may discard a card from hand that has a cost of 4 or more to download a card that has a cost of 4 or more.',
    'table',
    { kind: 'turnStarted' },
    [discardFromHand(1, true, COST_4_OR_MORE), download(1, 'a card that has a cost of 4 or more', COST_4_OR_MORE), shuffle()],
    { may: true }
  ),
];
