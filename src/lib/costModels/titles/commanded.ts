import { Condition, commands, commandsEach, commandsEvents, Selection } from '../../tableView';
import { CommandedTraits, CostModel } from '../model';
import { CostRowSpec, countedCost, onLimit, own, ownWhen, withRows } from '../rows';

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

/** "Cost −1 for each <what> you command", at most −`limit`: the count of `selection`, while `condition` holds. */
const minusEach = (selection: Selection, condition: Condition, limit?: number): CostRowSpec =>
  own(countedCost(selection, -1, limit === undefined ? undefined : -limit), { condition });

/** "Cost −1 for each <what> personnel you command" (`commandsEach`), the limit, its magnitude, given once. */
const minusPerCommanded = (selection: Selection, what: string, limit?: number) => minusEach(selection, commandsEach(selection, what, { limit }), limit);

/** "Cost −1 for each <keyword> event you command" (#1749, `commandsEvents`). */
const minusPerEvent = (keyword: string, what: string) => minusEach({ of: 'events', keyword }, commandsEvents({ keyword, what }));

export const COMMANDED_MODELS: CostModel[] = [
  // "When you play this personnel, she is cost -1 for each Treachery personnel you command."
  withRows({ title: 'Seska Pragmatic Agent', label: 'Seska', family: 'ownCost' }, minusPerCommanded(commandedPersonnel({ skill: 'treachery' }), 'Treachery personnel')),
  // "When you play this personnel, if you command a Treachery personnel, he is cost -1."
  withRows({ title: 'Elim Garak Crafty Underling', label: 'Elim Garak', family: 'ownCost' }, ownWhen(commands(commandedPersonnel({ skill: 'treachery' }), 'a Treachery personnel'), 1)),
  // "When you play this equipment, if you command a Ferengi Engineer personnel, it is cost -1."
  withRows({ title: 'Keevan', family: 'ownCost' }, ownWhen(commands(commandedPersonnel({ species: 'ferengi', skill: 'engineer' }), 'a Ferengi Engineer personnel'), 1)),
  // "When you play this personnel, she is cost -1 for each non-[Fed] personnel you command."
  withRows({ title: 'Lwaxana Troi Extraordinary Ambassador', family: 'ownCost' }, minusPerCommanded(commandedPersonnel({ where: (p) => p.affiliation !== 'federation' }), 'non-[Fed] personnel')),
  // "When you play this personnel, if you command three [Fed] personnel, she is cost -5."
  withRows({ title: 'Lwaxana Troi Extravagant Ambassador', family: 'ownCost' }, ownWhen(commands(commandedPersonnel({ affiliation: 'federation' }), '[Fed] personnel', { min: 3 }), 5)),
  // "When you play this personnel, if you command a unique personnel, she is cost -1."
  withRows({ title: 'Six of Ten Invalidation Drone', label: 'Six of Ten', family: 'ownCost' }, ownWhen(commands(commandedPersonnel({ where: (p) => p.unique === true }), 'a unique personnel'), 1)),
  // "When you play this personnel, if you command a Law personnel, he is cost -1."
  withRows({ title: 'Weyoun "Defective" Clone', label: 'Weyoun', family: 'ownCost' }, ownWhen(commands(commandedPersonnel({ skill: 'law' }), 'a Law personnel'), 1)),
  // "When you play this personnel, if you command an [AU][TNG] Officer personnel, she is cost -1."
  withRows({ title: 'Beverly Crusher Battleship Doctor', label: 'Beverly Crusher', family: 'ownCost' }, ownWhen(
    commands(commandedPersonnel({ skill: 'officer', where: (p) => p.icons.includes('[au]') && p.icons.includes('[tng]') }), 'an [AU][TNG] Officer personnel'),
    1
  )),
  // "When you play this personnel, for each Vedek you command, she is cost -1."
  withRows({ title: 'Jadzia Dax Elder', label: 'Jadzia Dax', family: 'ownCost' }, minusPerCommanded(commandedPersonnel({ keyword: 'vedek' }), 'Vedek')),
  // "When you play this personnel, if you command three [SF] Dissident personnel, he is cost -3."
  withRows({ title: 'Paul Mayweather Burdened with Command', label: 'Paul Mayweather', family: 'ownCost' }, ownWhen(commands(commandedPersonnel({ affiliation: 'starfleet', keyword: 'dissident' }), '[SF] Dissident personnel', { min: 3 }), 3)),
  // "When you play this ship, it is cost -1 for each Borg you command (limit 5)."
  withRows({ title: 'Assimilator Rogue Borg Vessel', label: 'Assimilator', family: 'ownCost' }, minusPerCommanded(commandedPersonnel({ species: 'borg' }), 'Borg', 5)),
  // "When you play this personnel, if you command an Intelligence personnel, he is cost -1."
  withRows({ title: "Rekar Tool of the Tal'Shiar", label: 'Rekar', family: 'ownCost' }, ownWhen(commands(commandedPersonnel({ skill: 'intelligence' }), 'an Intelligence personnel'), 1)),
  // "When you play this personnel, if you command an Officer personnel, this personnel is cost -1."
  withRows({ title: "T'Pol Not a Slave", label: "T'Pol", family: 'ownCost' }, ownWhen(commands(commandedPersonnel({ skill: 'officer' }), 'an Officer personnel'), 1)),
  // "When you play this personnel, if you command an Anthropology personnel, he is cost -2." (#1749)
  withRows({ title: 'Bareil Antos Petty Thief', label: 'Bareil Antos', family: 'ownCost' }, ownWhen(commands(commandedPersonnel({ skill: 'anthropology' }), 'an Anthropology personnel'), 2)),
  // "When you play this personnel, if you command a Vorta, this personnel is cost -1."
  withRows({ title: 'Deyos Ruthless Administrator', label: 'Deyos', family: 'ownCost' }, ownWhen(commands(commandedPersonnel({ species: 'vorta' }), 'a Vorta'), 1)),
  // "When you play this personnel, if you command an Acquisition personnel, he is cost -3. While you command
  // four cards that have a cost of four or more, you may spend an additional counter each turn." The grant
  // (#1768) is read from the table as it stands, while Gint is unstopped and commanded, he counting himself.
  withRows(
    { title: 'Gint The First Grand Nagus', label: 'Gint', family: 'ownCost' },
    ownWhen(commands(commandedPersonnel({ skill: 'acquisition' }), 'an Acquisition personnel'), 3),
    onLimit('unstopped', {
      grant: ({ facts }) => {
        const n = (facts.commandedCosts ?? []).filter((cost) => cost >= 4).length;
        return n >= 4 ? { amount: 1, reason: `you command ${n} cards of cost 4 or more` } : null;
      },
    })
  ),
  // "When you play this personnel, if you command an Honor personnel, she is cost -1."
  withRows({ title: 'Grilka Glorious Lady', label: 'Grilka', family: 'ownCost' }, ownWhen(commands(commandedPersonnel({ skill: 'honor' }), 'an Honor personnel'), 1)),
  // "When you play this personnel, if you command three events, he is cost -1."
  withRows({ title: 'Gowron Celebrated Leader', label: 'Gowron', family: 'ownCost' }, ownWhen(commandsEvents({ min: 3 }), 1)),
  // "When you play this personnel, if you command a [Pa] card, she is cost -1." An unstopped personnel or a ship
  // with the icon (#1749).
  withRows({ title: 'Tasha Yar Requesting a Transfer', label: 'Tasha Yar', family: 'ownCost' }, ownWhen(commands([commandedPersonnel({ icon: '[pa]' }), { of: 'ships', icon: '[pa]' }], 'a [Pa] card'), 1)),
  // "When you play this personnel, for each Assault event you command, he is cost -1."
  withRows({ title: 'Jorem', family: 'ownCost' }, minusPerEvent('assault', 'Assault')),
  // "When you play this personnel, for each Maneuver event you command, he is cost -1."
  withRows({ title: 'Mullen', family: 'ownCost' }, minusPerEvent('maneuver', 'Maneuver')),
  // "When you play this personnel, for each Punishment event you command, he is cost -1."
  withRows({ title: 'Nerot', family: 'ownCost' }, minusPerEvent('punishment', 'Punishment')),
  // "When you play this ship, for each Alpha Jem'Hadar you command, this ship is cost -1."
  withRows({ title: "Subek'somac Alpha Attack Ship", label: "Subek'somac", family: 'ownCost' }, minusPerCommanded(commandedPersonnel({ keyword: 'alpha', species: "jem'hadar" }), "Alpha Jem'Hadar")),
];
