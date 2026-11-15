import { SKILL_INDEX } from '../../dilemmaBot/requirements';
import { CommandedTraits, CostFacts, CostModel, ModelCost } from '../model';

// The cards that cost less while the player commands certain personnel (#1693). The facts are the
// table before the move, so the card being played never counts itself.

export type Test = (p: CommandedTraits) => boolean;

const has = (skill: string): Test => (p) => (p.skills[SKILL_INDEX[skill]] ?? 0) > 0;
export const both = (...tests: Test[]): Test => (p) => tests.every((t) => t(p));
export const species = (s: string): Test => (p) => p.species.includes(s);
const keyword = (k: string): Test => (p) => p.keywords.includes(k);
const affiliation = (a: string): Test => (p) => p.affiliation === a;

const countOf = (facts: CostFacts, test: Test): number => facts.commanded.filter(test).length;

/** "If you command <at least `min`> <what> personnel, cost −`off`." */
export function ifCommand(min: number, test: Test, off: number, what: string): (play: { printed: number }, facts: CostFacts) => ModelCost | null {
  return (play, facts) => {
    const n = countOf(facts, test);
    if (n < min) return null;
    return { cost: play.printed - off, reason: min === 1 ? `you command ${what}` : `you command ${n} ${what}` };
  };
}

/** "Cost −1 for each <what> you command", at most −`limit`. */
function forEach(test: Test, what: string, limit = Infinity): (play: { printed: number }, facts: CostFacts) => ModelCost | null {
  return (play, facts) => {
    const n = countOf(facts, test);
    if (n === 0) return null;
    return {
      cost: play.printed - Math.min(n, limit),
      reason: `you command ${n} ${what}${Number.isFinite(limit) && n > limit ? ` (limit ${limit})` : ''}`,
    };
  };
}

export const COMMANDED_MODELS: CostModel[] = [
  // "When you play this personnel, she is cost -1 for each Treachery personnel you command."
  { title: 'Seska Pragmatic Agent', label: 'Seska', family: 'ownCost', playCost: forEach(has('treachery'), 'Treachery personnel') },
  // "When you play this personnel, if you command a Treachery personnel, he is cost -1."
  {
    title: 'Elim Garak Crafty Underling',
    label: 'Elim Garak',
    family: 'ownCost',
    playCost: ifCommand(1, has('treachery'), 1, 'a Treachery personnel'),
  },
  // "When you play this equipment, if you command a Ferengi Engineer personnel, it is cost -1."
  { title: 'Keevan', family: 'ownCost', playCost: ifCommand(1, both(species('ferengi'), has('engineer')), 1, 'a Ferengi Engineer personnel') },
  // "When you play this personnel, she is cost -1 for each non-[Fed] personnel you command."
  {
    title: 'Lwaxana Troi Extraordinary Ambassador',
    family: 'ownCost',
    playCost: forEach((p) => p.affiliation !== 'federation', 'non-[Fed] personnel'),
  },
  // "When you play this personnel, if you command three [Fed] personnel, she is cost -5."
  {
    title: 'Lwaxana Troi Extravagant Ambassador',
    family: 'ownCost',
    playCost: ifCommand(3, affiliation('federation'), 5, '[Fed] personnel'),
  },
  // "When you play this personnel, if you command a unique personnel, she is cost -1."
  { title: 'Six of Ten Invalidation Drone', label: 'Six of Ten', family: 'ownCost', playCost: ifCommand(1, (p) => p.unique === true, 1, 'a unique personnel') },
  // "When you play this personnel, if you command a Law personnel, he is cost -1."
  { title: 'Weyoun "Defective" Clone', label: 'Weyoun', family: 'ownCost', playCost: ifCommand(1, has('law'), 1, 'a Law personnel') },
  // "When you play this personnel, if you command an [AU][TNG] Officer personnel, she is cost -1."
  {
    title: 'Beverly Crusher Battleship Doctor',
    label: 'Beverly Crusher',
    family: 'ownCost',
    playCost: ifCommand(1, both((p) => p.icons.includes('[au]') && p.icons.includes('[tng]'), has('officer')), 1, 'an [AU][TNG] Officer personnel'),
  },
  // "When you play this personnel, for each Vedek you command, she is cost -1."
  { title: 'Jadzia Dax Elder', label: 'Jadzia Dax', family: 'ownCost', playCost: forEach(keyword('vedek'), 'Vedek') },
  // "When you play this personnel, if you command three [SF] Dissident personnel, he is cost -3."
  {
    title: 'Paul Mayweather Burdened with Command',
    label: 'Paul Mayweather',
    family: 'ownCost',
    playCost: ifCommand(3, both(affiliation('starfleet'), keyword('dissident')), 3, '[SF] Dissident personnel'),
  },
  // "When you play this ship, it is cost -1 for each Borg you command (limit 5)."
  { title: 'Assimilator Rogue Borg Vessel', label: 'Assimilator', family: 'ownCost', playCost: forEach(species('borg'), 'Borg', 5) },
  // "When you play this personnel, if you command an Intelligence personnel, he is cost -1."
  { title: "Rekar Tool of the Tal'Shiar", label: 'Rekar', family: 'ownCost', playCost: ifCommand(1, has('intelligence'), 1, 'an Intelligence personnel') },
  // "When you play this personnel, if you command an Officer personnel, this personnel is cost -1."
  { title: "T'Pol Not a Slave", label: "T'Pol", family: 'ownCost', playCost: ifCommand(1, has('officer'), 1, 'an Officer personnel') },
];
