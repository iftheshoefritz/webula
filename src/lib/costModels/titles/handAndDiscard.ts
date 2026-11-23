import { CostChange } from '../../modifiers/model';
import { CostModel, CostPlay, ModelCost } from '../model';
import { own, withRows } from '../rows';
import { discardEquipmentOrEventCost } from './ownCost';

// The cards whose cost reads the discard pile or the hand, or a "may" the player decides (#1700). None
// moves a card or changes the score: the player discards, loses points or lets the opponent act by hand.

const MINUS = '−';

/** "For each event in your discard pile, he is cost -1." */
const forEachEventInDiscard: CostChange = ({ play, facts }) => {
  const n = (facts.discard ?? []).filter((c) => c.type === 'event').length;
  return n > 0 ? { cost: play.printed - n, reason: `${n} event${n === 1 ? '' : 's'} in your discard pile` } : null;
};

/** A "may" that the table cannot check: the printed cost, and the choice of −`off`. */
const mayChoice =
  (off: number, label: string, reason: string) =>
  (play: CostPlay): ModelCost => ({
    cost: play.printed,
    reason,
    choice: { label: `${label}: ${MINUS}${off}`, cost: play.printed - off },
  });

export const HAND_AND_DISCARD_MODELS: CostModel[] = [
  // "Reveal your hand. If you do not command a ship and you do not reveal a ship from hand, this event is
  // cost -3." A ship of any ship row is commanded; the played card is not in the hand it reveals.
  withRows(
    { title: 'Christening', family: 'ownCost' },
    own(({ play, facts }) =>
      (facts.ships ?? []).length === 0 && !facts.hand.some((c) => c.id !== play.id && c.type === 'ship')
        ? { cost: play.printed - 3, reason: 'no ship on the table or in hand' }
        : null
    )
  ),
  // "For each event in your discard pile, he is cost -1."
  withRows({ title: 'Treyam Militia Soldier', label: 'Treyam', family: 'ownCost' }, own(forEachEventInDiscard)),
  withRows({ title: 'Kulan Militia Soldier', label: 'Kulan', family: 'ownCost' }, own(forEachEventInDiscard)),
  // "When you play this personnel, you may discard an equipment or event card from hand to make this
  // personnel cost -2." As Goran.
  { title: 'Kes Experienced Ocampa', label: 'Kes', family: 'ownCost', playCost: discardEquipmentOrEventCost },
  // "When you play this personnel, you may lose 5 points to make his cost -3." Only while the score is
  // at least 5, since a score never goes below 0. The player lowers the score with the score counter.
  {
    title: 'Thompson',
    family: 'ownCost',
    playCost: (play, facts) => ((facts.score ?? 0) >= 5 ? mayChoice(3, 'Lose 5 points', 'you may lose 5 points')(play) : null),
  },
  // "When you play this ship, you may discard any number of cards from hand. This ship is cost -1 for each
  // card discarded this way." The requirement of three [AU] personnel is no cost.
  {
    title: 'Defiant Mirror Warship',
    label: 'Defiant',
    family: 'ownCost',
    playCost: (play, facts) => {
      const max = facts.hand.filter((c) => c.id !== play.id).length;
      return max > 0
        ? { cost: play.printed, reason: `you may discard cards from hand, ${MINUS}1 each`, choice: { label: 'Cards discarded from hand', step: 1, max } }
        : null;
    },
  },
  // "When you play this personnel, you may choose an opponent to draw a card to make him cost -1."
  { title: 'Gonik', family: 'ownCost', playCost: mayChoice(1, 'Opponent draws a card', 'you may have an opponent draw a card') },
  // "When you play this personnel, you may choose a personnel in an opponent's discard pile they do not
  // command to make this personnel cost -2." The table models no opponent's discard pile.
  {
    title: 'Woteln',
    family: 'ownCost',
    playCost: mayChoice(2, 'Choose a personnel in the opponent’s discard pile', 'you may choose a personnel in an opponent’s discard pile'),
  },
];
