import { CostModel, ModelCost } from '../model';

// The cards whose cost depends on the opponent, or on cards the table does not see (#1695). The table
// models no opponent, and the draws and the reveal these texts name come after the play. Alliance Galor's
// discard reads the player's own draw deck, so it lives in `deckDiscard.ts` (#1744).
// So each gives the printed cost and a choice, and never guesses: a count where the text counts, one
// choice where it does not. Ptol in a bot game is the exception (#1738): the bot's dilemma pile is on
// the table, so the play reveals its top four and counts them.

const MINUS = '−';

/** The cards Ptol reveals from the top of the opponent's dilemma pile (#1738). */
const PTOL_REVEALS = 4;

/** "Cost −`step` for each <what>": the printed cost, and the count of `label`, at most `max`. */
const forEachChosen =
  (step: number, max: number, label: string, reason: string) =>
  (play: { printed: number }): ModelCost => ({
    cost: play.printed,
    reason,
    choice: { label, step, max },
  });

/** "If <what>, cost −`off`": the printed cost, and the choice of −`off`. */
const ifChosen =
  (off: number, label: string, reason: string) =>
  (play: { printed: number }): ModelCost => ({
    cost: play.printed,
    reason,
    choice: { label: `${label}: ${MINUS}${off}`, cost: play.printed - off },
  });

export const OPPONENT_COST_MODELS: CostModel[] = [
  // "This event is cost -2 for each completed mission the opponent on your left commands."
  {
    title: 'Tacking Into the Wind',
    family: 'ownCost',
    playCost: forEachChosen(2, 5, 'Completed missions of the opponent', `${MINUS}2 for each completed mission the opponent commands`),
  },
  // "When you play this personnel, your opponent may draw up to three cards. This personnel is cost -1
  // for each card drawn this way."
  {
    title: 'Rollins Trusted Subordinate',
    label: 'Rollins',
    family: 'ownCost',
    playCost: forEachChosen(1, 3, 'Cards the opponent drew', `${MINUS}1 for each card the opponent draws, up to three`),
  },
  // "When you play this personnel, choose an opponent. For each headquarters mission he or she commands,
  // this personnel is cost -3."
  {
    title: 'Julian Bashir Rebel Captain',
    label: 'Julian Bashir',
    family: 'ownCost',
    playCost: forEachChosen(3, 5, 'Headquarters of the opponent', `${MINUS}3 for each headquarters mission the opponent commands`),
  },
  // "When you play this personnel, choose an opponent. For each headquarters mission he or she commands,
  // this personnel is cost -1."
  {
    title: 'Aaron Conor Born Leader',
    label: 'Aaron Conor',
    family: 'ownCost',
    playCost: forEachChosen(1, 5, 'Headquarters of the opponent', `${MINUS}1 for each headquarters mission the opponent commands`),
  },
  // "When you play this personnel, reveal four cards from the top of an opponent's dilemma pile. This
  // personnel is cost -1 for each dual dilemma revealed."
  // In a bot game the table holds the opponent's dilemma pile (#1738): the play reveals its top four,
  // counts the dual dilemmas and puts the four on the bottom of the pile. Elsewhere the player counts.
  {
    title: 'Ptol',
    family: 'ownCost',
    playCost: (play, facts) => {
      const pile = facts.opponentDilemmaPile;
      if (!pile) return forEachChosen(1, 4, 'Dual dilemmas revealed', `${MINUS}1 for each dual dilemma of four revealed`)(play);
      const revealed = pile.slice(0, PTOL_REVEALS);
      const duals = revealed.filter((c) => c.dilemmaType === 'd').length;
      const cards = revealed.length === 1 ? 'card' : 'cards';
      return {
        cost: Math.max(0, play.printed - duals),
        reason: `${duals} dual ${duals === 1 ? 'dilemma' : 'dilemmas'} of ${revealed.length} ${cards} revealed, put on the bottom of the dilemma pile`,
        ...(revealed.length ? { reveal: { ids: revealed.map((c) => c.id) } } : {}),
      };
    },
  },
  // "When you play this personnel, if an opponent commands a Maneuver event, he is cost -2." Its download
  // is not a cost.
  {
    title: 'Quark Vastly Outnumbered',
    label: 'Quark',
    family: 'ownCost',
    playCost: ifChosen(2, 'Opponent commands a Maneuver event', `${MINUS}2 if the opponent commands a Maneuver event`),
  },
  // "When you play this personnel, she is cost -1 for each opponent that has an event in his or her
  // discard pile." The table has one opponent.
  {
    title: 'Gollek',
    family: 'ownCost',
    playCost: ifChosen(1, 'Event in the opponent’s discard pile', `${MINUS}1 if the opponent has an event in their discard pile`),
  },
  // "When you play this event, if you have a lower score than each of your opponents, it is cost -4."
  {
    title: 'Change of Venue',
    family: 'ownCost',
    playCost: ifChosen(4, 'Your score is lower', `${MINUS}4 if your score is lower than the opponent’s`),
  },
];
