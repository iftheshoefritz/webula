import { stripVersionSuffix } from '../cardCount';
import { BOT_SKILLS, SKILL_INDEX } from './requirements';

// The skills and attributes a personnel gains from its own game text (#1349, part 1 of #1340). This
// part reads one condition, "while this personnel is facing a dilemma, …". The gain is plain data:
// it crosses into the search Web Worker with the `BotAttempt`.

/**
 * When a gain applies. `'facing'`: in every check of a dilemma the personnel faces, and not in the
 * mission-requirements check after the last dilemma. Later parts of #1340 add more conditions.
 */
export type GainCondition = 'facing';

export interface PersonnelGain {
  condition: GainCondition;
  /** The levels gained of each skill, indexed as `BOT_SKILLS`. */
  skills: number[];
  /** The change of Integrity, Cunning, Strength. */
  attrs: [number, number, number];
}

const ATTRIBUTE_WORDS: Record<string, number[]> = {
  attributes: [0, 1, 2],
  integrity: [0],
  cunning: [1],
  strength: [2],
};

const items = (list: string) => list.split(/\s*,\s*(?:and\s+)?|\s+and\s+/).filter(Boolean);

/**
 * The "facing" gain of one clause after "while this personnel is facing a dilemma, ", such as
 * "she is attributes +1 and gains anthropology, 2 engineer and honor". Null for a clause that is not
 * a fixed gain of this personnel: a choice ("you may"), a count ("for each", "limit"), a loss, a
 * condition ("if …"), or a word the bot does not know.
 */
function parseFacingClause(clause: string): PersonnelGain | null {
  const self = /^(?:he|she|this personnel) (.*)$/.exec(clause.trim());
  if (!self) return null;
  // "… and each cadet present is attributes +1" gives other personnel a gain: drop that part.
  const body = self[1].replace(/\s+and each .*$/, '');
  if (/\byou may\b|\bfor each\b|\blimit\b|\bloses?\b/.test(body)) return null;
  const parts = /^(?:is (.+?)(?: and gains (.+))?|gains (.+))$/.exec(body);
  if (!parts) return null;
  const attrText = parts[1];
  const skillText = parts[2] ?? parts[3];

  const gain: PersonnelGain = { condition: 'facing', skills: new Array(BOT_SKILLS.length).fill(0), attrs: [0, 0, 0] };
  for (const item of attrText ? items(attrText) : []) {
    const match = /^([a-z]+) \+(\d+)$/.exec(item);
    const indices = match ? ATTRIBUTE_WORDS[match[1]] : undefined;
    if (!match || !indices) return null;
    for (const i of indices) gain.attrs[i] += Number(match[2]);
  }
  for (const item of skillText ? items(skillText) : []) {
    const match = /^(?:(\d+)\s+)?([a-z]+)$/.exec(item);
    const i = match ? SKILL_INDEX[match[2]] : undefined;
    if (!match || i === undefined) return null;
    gain.skills[i] += match[1] ? Number(match[1]) : 1;
  }
  return gain;
}

/**
 * The gains a lowercased game text gives its own personnel. A facing clause with a qualifier between
 * "a dilemma" and the comma ("at a [dq] mission", "that requires …", "and you have …") gives none.
 */
export function parseGains(gametext: string): PersonnelGain[] {
  const gains: PersonnelGain[] = [];
  const pattern = /(?:^|[.:]\s*)while (?:this personnel is )?facing a dilemma, ([^.]*)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(gametext)) !== null) {
    const gain = parseFacingClause(match[1]);
    if (gain) gains.push(gain);
  }
  return gains;
}

/**
 * The cards the parser reads wrong, keyed by the lowercased name less its version suffix, as
 * `hqPlayability.ts` keys its map. An entry replaces the parsed gains; `[]` means no gain.
 */
export const GAIN_OVERRIDES: Record<string, PersonnelGain[]> = {};

/** The gains of a lowercased card row: its override when it has one, else its parsed game text. */
export function personnelGainsOf(card: { name: string; gametext?: string | number }): PersonnelGain[] {
  return GAIN_OVERRIDES[stripVersionSuffix(card.name)] ?? parseGains(String(card.gametext ?? '').toLowerCase());
}
