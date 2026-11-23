// The trigger rows the bot of a bot game uses from the `Deck:` section of its pile (#1906, source `botDeck`). The
// bot decides them where it acts; they are never offered to the player, and a game by hand reads none.

import { trigger, type TriggerRow } from '../model';

export const UNEXPECTED_DIFFICULTIES = 'Unexpected Difficulties';

export const BOT_TRIGGER_ROWS: TriggerRow[] = [
  // "Plays in your core. When you have drawn dilemmas, you may destroy this event to return them to your dilemma pile
  // and draw an equal number of dilemmas." The bot uses it once a game, from its deck with no card on the table, when
  // it drew 4 or more and no stack can fail the attempt (`botRedraws`), and returns them to the bottom, face up.
  trigger(
    UNEXPECTED_DIFFICULTIES,
    'When you have drawn dilemmas, you may destroy this event to return them to your dilemma pile and draw an equal number of dilemmas.',
    'botDeck',
    { kind: 'dilemmasDrawn', where: (event) => event.bot === true },
    [{ kind: 'botRedrawDilemmas' }],
    { may: true, useCost: { kind: 'destroySelf' } }
  ),
];
