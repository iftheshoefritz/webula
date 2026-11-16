import { CostFacts, CostModel, CostPlay, CostTurnPlay } from '../model';

// The standing rules (#1703): cards of the core whose text prices the play of another card while they
// stand there. The facts are the table before the move, so the card being played never prices itself.
// Each copy in the core has its effect. "The first … each turn" reads the cards played earlier this turn
// (`CostFacts.plays`), whether or not the rule was in the core then, and whatever they cost.

/** The number of copies of `title` in the core. */
const copiesOf = (title: string, facts: CostFacts): number => facts.core.filter((t) => t === title).length;

/** Whether no card played earlier this turn passes `test`. */
const firstOfTurn = (test: (play: CostTurnPlay) => boolean, facts: CostFacts): boolean =>
  !(facts.plays ?? []).some(test);

const isUniquePersonnel = (play: Pick<CostPlay, 'type' | 'unique'>): boolean => play.type === 'personnel' && !!play.unique;

const isNonTngPersonnel = (play: Pick<CostPlay, 'type' | 'icons'>): boolean =>
  play.type === 'personnel' && !(play.icons ?? []).includes('[tng]');

const times = (n: number): string => (n > 1 ? ` (${n} copies)` : '');

export const STANDING_RULE_MODELS: CostModel[] = [
  // "Plays in your core. The first unique personnel played each turn costs -2."
  {
    title: 'Disadvantage Into Advantage',
    family: 'standingRule',
    costOfPlay: (play, facts) => {
      const n = copiesOf('Disadvantage Into Advantage', facts);
      return n > 0 && isUniquePersonnel(play) && firstOfTurn(isUniquePersonnel, facts)
        ? { cost: play.printed - 2 * n, reason: `first unique personnel this turn${times(n)}` }
        : null;
    },
  },
  // "Plays in your core. When an event is played, it is cost +1." A rule of both players: on this table it
  // raises every event the player plays.
  {
    title: 'Spiteful Strategy',
    family: 'standingRule',
    costOfPlay: (play, facts) => {
      const n = copiesOf('Spiteful Strategy', facts);
      return n > 0 && play.type === 'event' ? { cost: play.printed + n, reason: `+${n} on an event${times(n)}` } : null;
    },
  },
  // "Plays in your core. At the start of each of your turns, place the top card of your deck on this event.
  // The first non-[TNG] personnel you play each turn is cost -2 for each card on this event." The first such
  // personnel takes the discount of the cards on Energize as they stand, none when it has none.
  {
    title: 'Energize',
    family: 'standingRule',
    costOfPlay: (play, facts) => {
      const placed = facts.core.reduce((sum, t, i) => (t === 'Energize' ? sum + (facts.corePlaced?.[i] ?? 0) : sum), 0);
      return placed > 0 && isNonTngPersonnel(play) && firstOfTurn(isNonTngPersonnel, facts)
        ? { cost: play.printed - 2 * placed, reason: `first non-[TNG] personnel this turn, ${placed} ${placed === 1 ? 'card' : 'cards'} on it` }
        : null;
    },
  },
];
