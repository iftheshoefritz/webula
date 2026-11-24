// The permission rows (#1916, part 2 of #1890): "To play this …, you must command …", read on a play of the card
// itself (the source place `played` of #1888), and Rule of Acquisition #6's "You cannot spend counters to draw cards",
// read on a charged draw while it is in the core. A permission only warns, under the setting "Check uniqueness and
// limits" (`ruleWarningsOf` in `playRules.ts`); it never refuses. The rows read the player's table only.

import { AFFILIATION_ABBREVIATIONS } from '../../missionRequirements';
import { commands, commandsCardTitled, commandsNone, type Condition, type PersonnelQuery } from '../../tableView';
import { type ModifierRow, row } from '../model';

const COUNT_WORDS = ['', 'a', 'two', 'three', 'four', 'five', 'six'];

// The affiliation of a bracket token, "[bor]" is "borg"; any other token is an icon.
const AFFILIATIONS: Record<string, string> = Object.fromEntries(Object.entries(AFFILIATION_ABBREVIATIONS).map(([a, token]) => [token, a]));

/** The personnel of the icons `icons` as the card text writes them, "[Pa][Kli]": one affiliation and one icon at most. */
function iconQuery(icons: string): PersonnelQuery {
  const q: PersonnelQuery = { unstopped: true };
  for (const token of icons.toLowerCase().match(/\[[a-z0-9]+\]/g) ?? []) {
    const affiliation = AFFILIATIONS[token];
    if (affiliation ? q.affiliation : q.icon) throw new Error(`"${icons}" names two affiliations or two icons`);
    if (affiliation) q.affiliation = affiliation;
    else q.icon = token;
  }
  return q;
}

/** "You must command `n` `icons` personnel": the requirement of a play, in the words of the card. */
export const mustCommandPersonnel = (n: number, icons: string): Condition =>
  commands({ of: 'personnel', ...iconQuery(icons) }, `${icons} personnel`, { min: n, text: `you must command ${COUNT_WORDS[n]} ${icons} personnel` });

/** The row of a play requirement: the play of the card `title` breaks the rule unless `condition` holds. */
const toPlay = (title: string, condition: Condition): ModifierRow => row(title, 'played', 'play', { play: 'forbid' }, { condition });

const byIcons = (n: number, icons: string, titles: string[]): ModifierRow[] => titles.map((t) => toPlay(t, mustCommandPersonnel(n, icons)));

const NO_HEADQUARTERS = { of: 'missions', headquarters: true } as const;

export const PERMISSION_ROWS: ModifierRow[] = [
  ...byIcons(3, '[Bor]', ['Particle 010', 'Strength in Numbers', 'Quintessence', 'Unimatrix Zero']),
  ...byIcons(3, '[TNG]', ['Disadvantage Into Advantage', 'New Life', 'VIP Welcome']),
  ...byIcons(3, '[Baj]', ['Jean-Luc Picard Compassionate Advocate']),
  ...byIcons(3, '[Vid]', ['Face Off']),
  ...byIcons(3, '[Fer]', ['Rule of Acquisition #6', 'Rule of Acquisition #76']),
  ...byIcons(3, '[Car]', ['Cardassian Protectorate']),
  ...byIcons(3, '[AU]', ['Defiant Mirror Warship', "I.S.S. Avenger Admiral's Ship", 'I.S.S. Enterprise Terran Flagship']),
  ...byIcons(3, '[Rom]', ['Getting Under Your Skin', 'Power Shift']),
  ...byIcons(3, '[SF]', ['Preeminent Precision', 'Straight and Steady']),
  ...byIcons(3, '[Dom]', ['Spiteful Strategy']),
  ...byIcons(3, '[AU][SF]', ['Watch Dog']),
  ...byIcons(4, '[AU][SF]', ['Starship Defiant Ripe for the Taking']),
  ...byIcons(4, '[TOS]', ['U.S.S. Constitution', 'U.S.S. Constellation Dead Hulk', 'U.S.S. Enterprise Beautiful Lady', "U.S.S. Exeter Fleet's Finest"]),
  ...byIcons(6, '[TOS]', ['Coordinated Counterattack']),
  ...byIcons(6, '[DS9]', ['Holding Cell', 'Defensive Upgrades']),
  ...byIcons(6, '[SF]', ['Noble Intentions']),
  ...byIcons(2, '[Fed][Maq]', ['Biogenic Weapon']),
  ...byIcons(2, '[Pa][Kli]', ['D-7 Battlecruiser']),
  toPlay('Delta Flyer Rebuilt "Hot Rod"', commands({ of: 'missions', type: 's' }, 'space missions', { min: 4, text: 'you must command four space missions' })),
  toPlay('Finding Our Way', commandsNone(NO_HEADQUARTERS, { text: 'you must not command a headquarters mission' })),
  toPlay('To Rule in Hell', commandsNone(NO_HEADQUARTERS, { text: 'you cannot command a headquarters mission' })),
  toPlay("They're Still Coming Through!", commandsCardTitled('To Rule in Hell', { text: 'you must command {To Rule in Hell}' })),
  toPlay('Deal With the Count Man', commands({ of: 'personnel', unstopped: true, keyword: 'thief' }, 'a Thief', { text: 'you must command a Thief' })),
  // "You cannot spend counters to draw cards." A charged draw from the draw deck in play and draw warns while it is in
  // the core; an uncharged draw, Draw 7 or a card's own draw, does not.
  row('Rule of Acquisition #6', 'core', 'turnLimit', { spendToDraw: 'forbid' }),
];
