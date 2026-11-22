import { cardTitleOf } from '../../cardTitle';
import { Condition, commands, commandsEach, commandsEvents, count, personnel, Selection } from '../../tableView';
import { costFactsSource, minusWhen } from '../factsSource';
import { CommandedTraits, CostFacts, CostModel, ModelCost } from '../model';

// The cards that cost less while the player commands certain personnel (#1693). The facts are the
// table before the move, so the card being played never counts itself. The conditions are the shared ones
// of `src/lib/tableView.ts` (#1876), read over the facts; "command" counts the unstopped personnel only (#1751).

export type Test = (p: CommandedTraits) => boolean;

export const both = (...tests: Test[]): Test => (p) => tests.every((t) => t(p));
export const species = (s: string): Test => (p) => p.species.includes(s);

/** The unstopped personnel the player commands that pass `q`. */
export const commandedPersonnel = (q: Omit<Extract<Selection, { of: 'personnel' }>, 'of' | 'unstopped'> = {}): Selection => ({
  of: 'personnel',
  unstopped: true,
  ...q,
});

/** "Cost −1 for each <what> you command", at most −`limit`: the count of `selection`, with the words of `condition`. */
const minusEach =
  (selection: Selection, condition: Condition, limit = Infinity) =>
  (play: { printed: number }, facts: CostFacts): ModelCost | null => {
    const source = costFactsSource(facts);
    return condition.holds(source)
      ? { cost: play.printed - Math.min(count(source, selection), limit), reason: condition.text(source) }
      : null;
  };

/** "Cost −1 for each <what> personnel you command" (`commandsEach`). */
const minusPerCommanded = (selection: Selection, what: string, limit?: number) => minusEach(selection, commandsEach(selection, what, { limit }), limit);

/** "Cost −1 for each <keyword> event you command" (#1749, `commandsEvents`). */
const minusPerEvent = (keyword: string, what: string) => minusEach({ of: 'events', keyword }, commandsEvents({ keyword, what }));

export const COMMANDED_MODELS: CostModel[] = [
  // "When you play this personnel, she is cost -1 for each Treachery personnel you command."
  { title: 'Seska Pragmatic Agent', label: 'Seska', family: 'ownCost', playCost: minusPerCommanded(commandedPersonnel({ skill: 'treachery' }), 'Treachery personnel') },
  // "When you play this personnel, if you command a Treachery personnel, he is cost -1."
  {
    title: 'Elim Garak Crafty Underling',
    label: 'Elim Garak',
    family: 'ownCost',
    playCost: minusWhen(commands(commandedPersonnel({ skill: 'treachery' }), 'a Treachery personnel'), 1),
  },
  // "When you play this equipment, if you command a Ferengi Engineer personnel, it is cost -1."
  { title: 'Keevan', family: 'ownCost', playCost: minusWhen(commands(commandedPersonnel({ species: 'ferengi', skill: 'engineer' }), 'a Ferengi Engineer personnel'), 1) },
  // "When you play this personnel, she is cost -1 for each non-[Fed] personnel you command."
  {
    title: 'Lwaxana Troi Extraordinary Ambassador',
    family: 'ownCost',
    playCost: minusPerCommanded(commandedPersonnel({ where: (p) => p.affiliation !== 'federation' }), 'non-[Fed] personnel'),
  },
  // "When you play this personnel, if you command three [Fed] personnel, she is cost -5."
  {
    title: 'Lwaxana Troi Extravagant Ambassador',
    family: 'ownCost',
    playCost: minusWhen(commands(commandedPersonnel({ affiliation: 'federation' }), '[Fed] personnel', { min: 3 }), 5),
  },
  // "When you play this personnel, if you command a unique personnel, she is cost -1."
  { title: 'Six of Ten Invalidation Drone', label: 'Six of Ten', family: 'ownCost', playCost: minusWhen(commands(commandedPersonnel({ where: (p) => p.unique === true }), 'a unique personnel'), 1) },
  // "When you play this personnel, if you command a Law personnel, he is cost -1."
  { title: 'Weyoun "Defective" Clone', label: 'Weyoun', family: 'ownCost', playCost: minusWhen(commands(commandedPersonnel({ skill: 'law' }), 'a Law personnel'), 1) },
  // "When you play this personnel, if you command an [AU][TNG] Officer personnel, she is cost -1."
  {
    title: 'Beverly Crusher Battleship Doctor',
    label: 'Beverly Crusher',
    family: 'ownCost',
    playCost: minusWhen(
      commands(commandedPersonnel({ skill: 'officer', where: (p) => p.icons.includes('[au]') && p.icons.includes('[tng]') }), 'an [AU][TNG] Officer personnel'),
      1
    ),
  },
  // "When you play this personnel, for each Vedek you command, she is cost -1."
  { title: 'Jadzia Dax Elder', label: 'Jadzia Dax', family: 'ownCost', playCost: minusPerCommanded(commandedPersonnel({ keyword: 'vedek' }), 'Vedek') },
  // "When you play this personnel, if you command three [SF] Dissident personnel, he is cost -3."
  {
    title: 'Paul Mayweather Burdened with Command',
    label: 'Paul Mayweather',
    family: 'ownCost',
    playCost: minusWhen(commands(commandedPersonnel({ affiliation: 'starfleet', keyword: 'dissident' }), '[SF] Dissident personnel', { min: 3 }), 3),
  },
  // "When you play this ship, it is cost -1 for each Borg you command (limit 5)."
  { title: 'Assimilator Rogue Borg Vessel', label: 'Assimilator', family: 'ownCost', playCost: minusPerCommanded(commandedPersonnel({ species: 'borg' }), 'Borg', 5) },
  // "When you play this personnel, if you command an Intelligence personnel, he is cost -1."
  { title: "Rekar Tool of the Tal'Shiar", label: 'Rekar', family: 'ownCost', playCost: minusWhen(commands(commandedPersonnel({ skill: 'intelligence' }), 'an Intelligence personnel'), 1) },
  // "When you play this personnel, if you command an Officer personnel, this personnel is cost -1."
  { title: "T'Pol Not a Slave", label: "T'Pol", family: 'ownCost', playCost: minusWhen(commands(commandedPersonnel({ skill: 'officer' }), 'an Officer personnel'), 1) },
  // "When you play this personnel, if you command an Anthropology personnel, he is cost -2." (#1749)
  { title: 'Bareil Antos Petty Thief', label: 'Bareil Antos', family: 'ownCost', playCost: minusWhen(commands(commandedPersonnel({ skill: 'anthropology' }), 'an Anthropology personnel'), 2) },
  // "When you play this personnel, if you command a Vorta, this personnel is cost -1."
  { title: 'Deyos Ruthless Administrator', label: 'Deyos', family: 'ownCost', playCost: minusWhen(commands(commandedPersonnel({ species: 'vorta' }), 'a Vorta'), 1) },
  // "When you play this personnel, if you command an Acquisition personnel, he is cost -3. While you command
  // four cards that have a cost of four or more, you may spend an additional counter each turn." The grant
  // (#1768) is read from the table as it stands, while Gint is unstopped and commanded, he counting himself.
  {
    title: 'Gint The First Grand Nagus',
    label: 'Gint',
    family: 'ownCost',
    playCost: minusWhen(commands(commandedPersonnel({ skill: 'acquisition' }), 'an Acquisition personnel'), 3),
    limitGrant: (facts) => {
      if (personnel(costFactsSource(facts), { unstopped: true, where: (p) => cardTitleOf(p.name) === 'gint the first grand nagus' }).length === 0) return null;
      const n = (facts.commandedCosts ?? []).filter((cost) => cost >= 4).length;
      return n >= 4 ? { amount: 1, reason: `you command ${n} cards of cost 4 or more` } : null;
    },
  },
  // "When you play this personnel, if you command an Honor personnel, she is cost -1."
  { title: 'Grilka Glorious Lady', label: 'Grilka', family: 'ownCost', playCost: minusWhen(commands(commandedPersonnel({ skill: 'honor' }), 'an Honor personnel'), 1) },
  // "When you play this personnel, if you command three events, he is cost -1."
  {
    title: 'Gowron Celebrated Leader',
    label: 'Gowron',
    family: 'ownCost',
    playCost: minusWhen(commandsEvents({ min: 3 }), 1),
  },
  // "When you play this personnel, if you command a [Pa] card, she is cost -1."
  {
    title: 'Tasha Yar Requesting a Transfer',
    label: 'Tasha Yar',
    family: 'ownCost',
    // An unstopped personnel or a ship with the icon (#1749).
    playCost: minusWhen(commands([commandedPersonnel({ icon: '[pa]' }), { of: 'ships', icon: '[pa]' }], 'a [Pa] card'), 1),
  },
  // "When you play this personnel, for each Assault event you command, he is cost -1."
  { title: 'Jorem', family: 'ownCost', playCost: minusPerEvent('assault', 'Assault') },
  // "When you play this personnel, for each Maneuver event you command, he is cost -1."
  { title: 'Mullen', family: 'ownCost', playCost: minusPerEvent('maneuver', 'Maneuver') },
  // "When you play this personnel, for each Punishment event you command, he is cost -1."
  { title: 'Nerot', family: 'ownCost', playCost: minusPerEvent('punishment', 'Punishment') },
  // "When you play this ship, for each Alpha Jem'Hadar you command, this ship is cost -1."
  {
    title: "Subek'somac Alpha Attack Ship",
    label: "Subek'somac",
    family: 'ownCost',
    playCost: minusPerCommanded(commandedPersonnel({ keyword: 'alpha', species: "jem'hadar" }), "Alpha Jem'Hadar"),
  },
];
