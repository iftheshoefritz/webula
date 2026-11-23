import { commands } from '../../tableView';
import { CostFacts, CostModel, CostPlay, ModelCost } from '../model';
import { ownWhen, withRows } from '../rows';
import { commandedPersonnel } from './commanded';

// The cards that change their own cost (#1654).

const MINUS = '−';

/**
 * "You may discard an equipment or event card from hand to make this personnel cost -2": the printed
 * cost, and the choice while the hand holds such a card other than the one played (Goran, Kes, #1700).
 */
export const discardEquipmentOrEventCost = (play: CostPlay, facts: CostFacts): ModelCost | null =>
  facts.hand.some((c) => c.id !== play.id && (c.type === 'equipment' || c.type === 'event'))
    ? {
        cost: play.printed,
        reason: 'you may discard an equipment or event',
        choice: { label: `Discard a card: ${MINUS}2`, cost: play.printed - 2 },
      }
    : null;

export const OWN_COST_MODELS: CostModel[] = [
  // "When you play this equipment, if you command a Borg personnel, it is cost -2." The table checks it.
  withRows({ title: 'Borg Nanoprobes', family: 'ownCost' }, ownWhen(commands(commandedPersonnel({ species: 'borg' }), 'a Borg'), 2)),
  // "When you play this personnel, you may discard an equipment or event card from hand to make this
  // personnel cost -2." A "may": the printed cost, and the choice while the hand holds such a card.
  {
    title: 'Goran',
    family: 'ownCost',
    playCost: discardEquipmentOrEventCost,
  },
];
