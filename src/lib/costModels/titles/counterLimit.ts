import { CostFacts, CostModel } from '../model';
import { cardTitleOf } from '../../cardTitle';

// The cards that change the counters the player may spend this turn, batch 11 (#1704). A "may" is a
// choice, as Tricia Jenkins's is; a text that acts at the start of the turn offers a choice of the turn
// in the counters list (`turnChoices`), and one that caps the limit caps it (`limitCap`). The rest of each
// text, the points lost, the card destroyed or taken, stays by hand.

/** Whether the player commands a personnel of title `title`, lowercased. */
const commands = (title: string, facts: CostFacts): boolean => facts.commanded.some((p) => cardTitleOf(p.name) === title);

/** The number of unique Borg personnel the player commands, each name once. */
const uniqueBorgOf = (facts: CostFacts): number =>
  new Set(facts.commanded.filter((p) => p.unique && p.species.includes('borg')).map((p) => cardTitleOf(p.name))).size;

export const COUNTER_LIMIT_MODELS: CostModel[] = [
  // "Plays in your core. Each player cannot spend more than seven counters during their Play and Draw Cards
  // segments." While it is in the core, the turn's limit is never above 7, whatever the grants and raises.
  {
    title: 'Code of the Ushaan',
    family: 'limit',
    limitCap: (facts) => (facts.core.includes('Code of the Ushaan') ? { amount: 7, reason: 'in your core' } : null),
  },
  // "Lose 5 points to spend 7 additional counters this turn. Destroy this event." The printed cost, and the
  // choice of +7. The points and the destroy stay by hand.
  {
    title: 'At What Cost?',
    family: 'limit',
    playCost: (play) => ({
      cost: play.printed,
      reason: 'you may lose 5 points to spend 7 more counters this turn',
      choice: { label: 'Raise the limit: +7', limit: 7 },
    }),
  },
  // "At the start of each of your turns, you may take an equipment from beneath your {Ferenginar} and place it
  // in your discard pile to spend 4 additional counters this turn." A choice of the turn while Gaila is
  // commanded and Ferenginar is one of the missions. The table puts no equipment beneath a mission, so the
  // equipment is the player's word.
  {
    title: 'Gaila Arms Dealer',
    label: 'Gaila',
    family: 'limit',
    turnChoices: (facts) =>
      commands('gaila arms dealer', facts) &&
      (facts.missions ?? []).some((m) => cardTitleOf(m.name) === 'Ferenginar Financial Hub')
        ? [{ label: 'Equipment from Ferenginar: +4', limit: 4 }]
        : [],
  },
  // "At the start of each of your turns, you may destroy one of your Rule events to spend additional counters
  // this turn equal to that event's cost." A choice of the turn per Rule event in the core, while Par Lenor
  // is commanded, at the event's printed cost; one of them a turn. The destroy stays by hand.
  {
    title: 'Par Lenor Lascivious Emissary',
    label: 'Par Lenor',
    family: 'limit',
    turnChoices: (facts) =>
      commands('par lenor lascivious emissary', facts)
        ? (facts.coreCards ?? []).flatMap((c) =>
            c.type === 'event' && c.keywords.includes('rule') && c.cost > 0 ? [{ label: `Destroy ${c.title}: +${c.cost}`, limit: c.cost }] : []
          )
        : [],
  },
  // "When you play this ship, if each of your non-headquarters missions is a [GQ] mission, you may spend 5
  // additional counters this turn." The card data marks a [GQ] mission by its quadrant, "G". An empty slot
  // does not count, and a table with no non-headquarters mission meets the text.
  {
    title: 'U.S.S. Defiant Repurposed Warship',
    label: 'U.S.S. Defiant',
    family: 'limit',
    playCost: (play, facts) =>
      (facts.missions ?? []).every((m) => m.type === '' || m.type === 'h' || m.quadrant === 'g')
        ? {
            cost: play.printed,
            reason: 'each of your non-headquarters missions is a [GQ] mission',
            choice: { label: 'Raise the limit: +5', limit: 5 },
          }
        : null,
  },
  // "When you play this event, for each unique Borg personnel you command, this event is cost -1. Plays in
  // your core. You may spend an additional counter each turn." −1 per unique Borg commanded, each name once,
  // and +1 to the limit while a copy is in the core. The play requirement and the [AU] stay by hand.
  {
    title: 'Unimatrix Zero',
    family: 'limit',
    playCost: (play, facts) => {
      const n = uniqueBorgOf(facts);
      return n > 0 ? { cost: play.printed - n, reason: `you command ${n} unique Borg` } : null;
    },
    limitGrant: (facts) => (facts.core.includes('Unimatrix Zero') ? { amount: 1, reason: 'in your core' } : null),
  },
];
