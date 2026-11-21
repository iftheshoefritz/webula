import { CostFacts, CostMission, CostModel } from '../model';
import { cardTitleOf } from '../../cardTitle';
import { SKILLS } from '../../missionRequirements';
import { missionRequires } from './completedMission';

// The cards that change the counters the player may spend this turn, batch 11 (#1704). A "may" is a
// choice, as Tricia Jenkins's is; a text that acts at the start of the turn offers a choice of the turn
// in the counters list (`turnChoices`), and one that caps the limit caps it (`limitCap`). The rest of each
// text, the points lost, the card destroyed or taken, stays by hand.

/**
 * Whether the player commands a personnel of title `title`, lowercased, stopped or not, never in the brig. It
 * tests that the personnel's own ability is on the table, not an "if you command" condition, so it reads
 * `missions[].personnel`, which keeps the stopped personnel `commanded` leaves out (#1751).
 */
const commands = (title: string, facts: CostFacts): boolean =>
  (facts.missions ?? []).some((m) => (m.personnel ?? []).some((p) => cardTitleOf(p.name) === title));

/** The number of unique Borg personnel the player commands, each name once. */
const uniqueBorgOf = (facts: CostFacts): number =>
  new Set(facts.commanded.filter((p) => p.unique && p.species.includes('borg')).map((p) => cardTitleOf(p.name))).size;

/**
 * Whether a skill is named in the requirements of two different missions (#1755), on either side of an
 * "or", as `missionRequires` reads it: "Honor or Law" and "Law" share Law. Attributes are no skills.
 */
export const missionsShareSkill = (missions: CostMission[]): boolean =>
  SKILLS.some((skill) => missions.filter((m) => missionRequires(m, skill)).length >= 2);

export const COUNTER_LIMIT_MODELS: CostModel[] = [
  // Ledos (#1755): "At the start of your first turn, if you command fewer than two headquarters missions and
  // none of your missions require the same skill, spend an additional 5 counters that turn." Decided once,
  // at the Draw 7 tap, and kept on the opening hand's log entry.
  {
    title: 'Ledos Preserve Isolated Culture',
    label: 'Ledos',
    family: 'limit',
    firstTurnGrant: (facts) => {
      const missions = (facts.missions ?? []).filter((m) => m.name);
      if (!missions.some((m) => cardTitleOf(m.name) === 'Ledos Preserve Isolated Culture')) return null;
      if (missions.filter((m) => m.type === 'h').length >= 2) return null;
      if (missionsShareSkill(missions)) return null;
      return { amount: 5, reason: 'fewer than two headquarters, and no two missions require the same skill' };
    },
  },
  // "Plays in your core. Each player cannot spend more than seven counters during their Play and Draw Cards
  // segments." While it is in the core, the turn's limit is never above 7, whatever the grants and raises.
  {
    title: 'Code of the Ushaan',
    family: 'limit',
    limitCap: (facts) => (facts.core.includes('Code of the Ushaan') ? { amount: 7, reason: 'in your core' } : null),
  },
  // Blue Skies (#1826): "To play this event, you must command three [Rom] Dissidents or three [TNG] Dissidents.
  // Plays in your core. You cannot spend more than seven counters during your turn. At the end of an opponent's
  // Play and Draw Cards segment, if they spent eight or more counters, score 5 points." The counters count in
  // play and draw only, so "during your turn" caps the same limit as Code of the Ushaan. The condition of play
  // is not checked, and the points wait for the opponent's counters (#1758).
  {
    title: 'Blue Skies',
    family: 'limit',
    limitCap: (facts) => (facts.core.includes('Blue Skies') ? { amount: 7, reason: 'in your core' } : null),
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
