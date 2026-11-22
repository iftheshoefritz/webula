import { core, firstThisTurn } from '../../tableView';
import { costFactsSource } from '../factsSource';
import { CostModel, CostPlay } from '../model';

// The standing rules (#1703): cards of the core whose text prices the play of another card while they
// stand there. The facts are the table before the move, so the card being played never prices itself.
// Each copy in the core has its effect. "The first … each turn" reads the cards played earlier this turn
// (`CostFacts.plays`), whether or not the rule was in the core then, and whatever they cost.

const isUniquePersonnel = (play: Pick<CostPlay, 'type' | 'unique'>): boolean => play.type === 'personnel' && !!play.unique;

const isNonTngPersonnel = (play: Pick<CostPlay, 'type' | 'icons'>): boolean =>
  play.type === 'personnel' && !(play.icons ?? []).includes('[tng]');

const times = (n: number): string => (n > 1 ? ` (${n} copies)` : '');

const firstUniquePersonnel = firstThisTurn(isUniquePersonnel, 'unique personnel');
const firstNonTngPersonnel = firstThisTurn(isNonTngPersonnel, 'non-[TNG] personnel');

export const STANDING_RULE_MODELS: CostModel[] = [
  // "Plays in your core. The first unique personnel played each turn costs -2."
  {
    title: 'Disadvantage Into Advantage',
    family: 'standingRule',
    costOfPlay: (play, facts) => {
      const source = costFactsSource(facts);
      const n = core(source, { title: 'Disadvantage Into Advantage' }).length;
      return n > 0 && isUniquePersonnel(play) && firstUniquePersonnel.holds(source)
        ? { cost: play.printed - 2 * n, reason: `${firstUniquePersonnel.text(source)}${times(n)}` }
        : null;
    },
  },
  // "Plays in your core. When an event is played, it is cost +1." A rule of both players: on this table it
  // raises every event the player plays.
  {
    title: 'Spiteful Strategy',
    family: 'standingRule',
    costOfPlay: (play, facts) => {
      const n = core(costFactsSource(facts), { title: 'Spiteful Strategy' }).length;
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
      const source = costFactsSource(facts);
      const placed = core(source, { title: 'Energize' }).reduce((sum, c) => sum + c.placed, 0);
      return placed > 0 && isNonTngPersonnel(play) && firstNonTngPersonnel.holds(source)
        ? {
            cost: play.printed - 2 * placed,
            reason: `${firstNonTngPersonnel.text(source)}, ${placed} ${placed === 1 ? 'card' : 'cards'} on it`,
          }
        : null;
    },
  },
];
