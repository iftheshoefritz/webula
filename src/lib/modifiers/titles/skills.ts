// The skill gains (#1836): a card that gives a skill to other personnel, "Each of your Engineer personnel present
// gains Astrometrics." Each row gives its skills to the personnel of the source's group (an equipment's "present"),
// or to the crew of a ship. The dilemma bot reads them (`pileTableInputOf`), under "Apply card text to attributes".
// A personnel's own "this personnel gains …" stays with `parseGains` of `src/lib/dilemmaBot/gains.ts`.

import { row, type ModifierRow } from '../model';

export const SKILL_ROWS: ModifierRow[] = [
  // "Each of your non-unique Science personnel present gains Exobiology, Programming, and Transporters."
  row("Purple Data's Head", 'group', 'group', {
    skills: { gain: ['Exobiology', 'Programming', 'Transporters'], who: { skill: 'science', unique: false } },
  }),
  // "Each of your Engineer personnel present gains Astrometrics."
  row('Engineering PADD', 'group', 'group', { skills: { gain: ['Astrometrics'], who: { skill: 'engineer' } } }),
  // "Each of your Science personnel present gains Archaeology."
  row('Science PADD', 'group', 'group', { skills: { gain: ['Archaeology'], who: { skill: 'science' } } }),
  // "Each of your Officer personnel present gains Diplomacy."
  row('Universal Translator', 'group', 'group', { skills: { gain: ['Diplomacy'], who: { skill: 'officer' } } }),
  // "While at a [GQ] planet mission, each of your Engineer personnel present gain Anthropology and Geology."
  row('Hyperspanner', 'group', 'group', {
    skills: { gain: ['Anthropology', 'Geology'], who: { skill: 'engineer' }, where: (c) => c.slot?.quadrant === 'g' && c.slot.type === 'p' },
  }),
  // "Each Think Tank personnel aboard this ship gains Telepathy."
  row('Think Tank Ship Ivory Tower', 'shipRow', 'crew', { skills: { gain: ['Telepathy'], who: { keyword: 'think tank' } } }),
];
