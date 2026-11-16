import { CommandedTraits, CostFacts, CostModel, CostPlay } from '../model';

// The cards on the table that a player may use to change the cost of another card's play (#1713): the use
// belongs to the card on the table, not to the played card's chip. Each copy that stands where its text
// says offers one use per play. The facts are the table before the move, so the played card never serves
// itself.

/** The unstopped personnel titled `title` at the play's destination mission: its away team and its crews. */
const unstoppedAtDestination = (title: string, play: CostPlay, facts: CostFacts): CommandedTraits[] =>
  play.missionIndex === undefined
    ? []
    : (facts.missions?.[play.missionIndex]?.personnel ?? []).filter((p) => p.title === title && !p.stopped && !!p.id);

const isStarfleet = (affiliation: string): boolean => affiliation.includes('starfleet') || affiliation.includes('[sf]');

export const TABLE_USE_MODELS: CostModel[] = [
  // "Plays in your core. When you are about to play a Q event or a Temporal event, you may destroy this
  // event to play that event at cost -3."
  {
    title: 'Delivery Boy',
    family: 'standingRule',
    usesForPlay: (play, facts) =>
      play.type === 'event' && (play.keywords ?? []).some((k) => k === 'q' || k === 'temporal')
        ? (facts.coreCards ?? []).flatMap((c) => (c.title === 'Delivery Boy' && c.id ? [{ id: c.id, amount: 3, effect: 'destroy' as const }] : []))
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
        ? unstoppedAtDestination('Nathan Samuels Earth Minister', play, facts).map((p) => ({ id: p.id!, amount: 2, effect: 'stop' as const }))
        : [],
  },
  // "When you play an [AU][TNG] card at this mission, you may stop this personnel to make that card cost -2."
  {
    title: 'Guinan Battleship Bartender',
    label: 'Guinan',
    family: 'standingRule',
    usesForPlay: (play, facts) =>
      (play.icons ?? []).includes('[au]') && (play.icons ?? []).includes('[tng]')
        ? unstoppedAtDestination('Guinan Battleship Bartender', play, facts).map((p) => ({ id: p.id!, amount: 2, effect: 'stop' as const }))
        : [],
  },
];
