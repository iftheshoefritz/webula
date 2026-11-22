import { core, personnel } from '../../tableView';
import { costFactsSource } from '../factsSource';
import { CostFacts, CostModel, CostPlay } from '../model';

// The cards on the table that a player may use to change the cost of another card's play (#1713): the use
// belongs to the card on the table, not to the played card's chip. Each copy that stands where its text
// says offers one use per play. The facts are the table before the move, so the played card never serves
// itself.

/** The ids of the unstopped personnel titled `title` at the play's destination mission: its away team and its crews. */
const idsAtDestination = (title: string, play: CostPlay, facts: CostFacts): string[] =>
  play.missionIndex === undefined
    ? []
    : personnel(costFactsSource(facts), { unstopped: true, at: play.missionIndex, where: (p) => p.title === title && !!p.id }).map((p) => p.id!);

/** The ids of the copies of `title` in the core. */
const coreIds = (title: string, facts: CostFacts): string[] =>
  core(costFactsSource(facts), { title }).flatMap((c) => (c.id ? [c.id] : []));

const isStarfleet = (affiliation: string): boolean => affiliation.includes('starfleet') || affiliation.includes('[sf]');

export const TABLE_USE_MODELS: CostModel[] = [
  // "Plays in your core. When you play a Dissident personnel, you may reveal the top card of your deck. If it
  // is a Dissident, you may play him or her at cost -3." (#1763) A play of a Dissident personnel offers a
  // reveal of the top card while the draw deck has one; a revealed Dissident personnel then plays from the
  // draw deck at −3 (`pendingDiscountsOf`), the one play from the draw deck the table charges.
  {
    title: 'The New Resistance',
    family: 'standingRule',
    usesForPlay: (play, facts) =>
      play.type === 'personnel' && (play.keywords ?? []).includes('dissident') && (facts.drawDeckTop ?? []).length > 0
        ? // One offer per play, however many copies are there: the first copy's.
          coreIds('The New Resistance', facts).slice(0, 1).map((id) => ({ id, amount: 0, effect: 'revealTop' as const }))
        : [],
  },
  // "Plays in your core. When you are about to play a Q event or a Temporal event, you may destroy this
  // event to play that event at cost -3."
  {
    title: 'Delivery Boy',
    family: 'standingRule',
    usesForPlay: (play, facts) =>
      play.type === 'event' && (play.keywords ?? []).some((k) => k === 'q' || k === 'temporal')
        ? coreIds('Delivery Boy', facts).map((id) => ({ id, amount: 3, effect: 'destroy' as const }))
        : [],
  },
  // "When you play a non-Human [SF] personnel at this mission, you may stop this personnel to make that
  // personnel cost -2."
  {
    title: 'Nathan Samuels Earth Minister',
    label: 'Nathan Samuels',
    family: 'standingRule',
    usesForPlay: (play, facts) =>
      play.type === 'personnel' && isStarfleet(play.affiliation ?? '') && !(play.species ?? []).includes('human')
        ? idsAtDestination('Nathan Samuels Earth Minister', play, facts).map((id) => ({ id, amount: 2, effect: 'stop' as const }))
        : [],
  },
  // "When you play an [AU][TNG] card at this mission, you may stop this personnel to make that card cost -2."
  {
    title: 'Guinan Battleship Bartender',
    label: 'Guinan',
    family: 'standingRule',
    usesForPlay: (play, facts) =>
      (play.icons ?? []).includes('[au]') && (play.icons ?? []).includes('[tng]')
        ? idsAtDestination('Guinan Battleship Bartender', play, facts).map((id) => ({ id, amount: 2, effect: 'stop' as const }))
        : [],
  },
];
