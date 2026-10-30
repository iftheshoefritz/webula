import { stripVersionSuffix } from '../cardCount';
import { AFFILIATION_ABBREVIATIONS } from '../deckPlayability';
import { BOT_SKILLS, SKILL_INDEX } from './requirements';

// The skills and attributes a personnel gains from its own game text (#1349, #1350, parts 1 and 2 of
// #1340): "while this personnel is facing a dilemma, …" and "while this personnel is attempting a
// mission, …", each perhaps narrowed to a kind of mission, and "while this personnel is present with
// <partner>, …" (#1356, part 3a). The gain is plain data: it crosses into the search Web Worker with
// the `BotAttempt`.

/**
 * When a gain applies. `'facing'`: in every check of a dilemma the personnel faces, and not in the
 * mission-requirements check after the last dilemma. `'attempting'`: in both, for the whole attempt.
 */
export type GainCondition = 'facing' | 'attempting';

/**
 * The kind of mission a gain needs, from "at a [dq] mission", "attempting a space mission" or
 * "attempting a mission worth 50 or more points". Each field set must hold.
 */
export interface MissionCondition {
  /** `'p'` planet or `'s'` space, as `missiontype`. */
  missiontype?: 'p' | 's';
  /** `'a'`, `'d'` or `'g'`, as `quadrant`. */
  quadrant?: 'a' | 'd' | 'g';
  minPoints?: number;
  maxPoints?: number;
}

/** The fields of the attempted mission's row that a `MissionCondition` reads. */
export interface AttemptedMission {
  missiontype?: string | number;
  quadrant?: string | number;
  points?: string | number;
}

/**
 * One test a partner must pass, a conjunction of printed traits: "a [rom] dissident" is the
 * affiliation and the keyword. Each field set must hold.
 */
export interface PartnerTest {
  /** An affiliation as the `affiliation` field reads it, from a bracket token: "[rom]" is "romulan". */
  affiliation?: string;
  /** "non-[na]": the partner's affiliation is not this one. */
  notAffiliation?: string;
  /** Card icons, the bracket tokens that are not an affiliation: "[pa]", "[cmd]", "[maq]". */
  icons?: string[];
  /** Words the partner's keywords or species must each hold: "dissident", "android". */
  traits?: string[];
  /** Skills the partner's base skills must each hold, indexed as `BOT_SKILLS`: "honor". */
  skills?: number[];
  /** A prefix of the partner's lowercased name, from "{odo}". */
  title?: string;
}

/** "present with <partner>": `count` different other personnel, each passing one of `anyOf`. */
export interface PartnerRequirement {
  anyOf: PartnerTest[];
  count: number;
}

/** The printed traits of a personnel that a `PartnerTest` reads: never its gains. */
export interface PartnerTraits {
  /** The lowercased name, title and subtitle together. */
  name: string;
  affiliation: string;
  species: string[];
  keywords: string[];
  icons: string[];
  /** The base skills, indexed as `BOT_SKILLS`. */
  skills: number[];
}

export interface PersonnelGain {
  condition: GainCondition;
  /** Absent: the gain holds at every mission. */
  mission?: MissionCondition;
  /** Absent: the gain needs no partner. Present: the group step `withPartnerGains` settles it. */
  partner?: PartnerRequirement;
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
 * The gain of one clause after "while this personnel is facing a dilemma, " or "while this personnel
 * is attempting a space mission, ", such as "she is
 * attributes +1 and gains anthropology, 2 engineer and honor". Null for a clause that is not a fixed
 * gain of this personnel: a choice ("you may"), a count ("for each", "limit"), a loss, a condition
 * ("if …"), or a word the bot does not know.
 */
function parseGainClause(
  clause: string,
  condition: GainCondition,
  mission?: MissionCondition,
  partner?: PartnerRequirement,
): PersonnelGain | null {
  // "he and each cadet present gains …": the gain of the others is dropped, and "are" reads as "is".
  const self = /^(?:he|she|this personnel)( and each [^,]*? present)? (.*)$/.exec(clause.trim());
  if (!self) return null;
  // "… and each cadet present is attributes +1" gives other personnel a gain: drop that part.
  const body = (self[1] ? self[2].replace(/^are /, 'is ') : self[2]).replace(/\s+and each .*$/, '');
  if (/\byou may\b|\bfor each\b|\blimit\b|\bloses?\b/.test(body)) return null;
  const parts = /^(?:is (.+?)(?: and gains (.+))?|gains (.+))$/.exec(body);
  if (!parts) return null;
  const attrText = parts[1];
  const skillText = parts[2] ?? parts[3];

  const gain: PersonnelGain = {
    condition,
    ...(mission ? { mission } : {}),
    ...(partner ? { partner } : {}),
    skills: new Array(BOT_SKILLS.length).fill(0),
    attrs: [0, 0, 0],
  };
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
 * The bare words a partner test reads as a keyword or a species. Each is a keyword or a species in the
 * card data; a word that is neither, and no skill, gives no gain.
 */
export const PARTNER_TRAIT_WORDS = new Set([
  'admiral',
  'android',
  'cadet',
  'dissident',
  'founder',
  'gul',
  'human',
  'klingon',
  'maco',
  'thief',
  'vorta',
  'vulcan',
]);

const COUNT_WORDS: Record<string, number> = { a: 1, an: 1, your: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };

/** One alternative of a partner, such as "three [pa] personnel" or "an honor klingon". */
function parsePartnerTest(text: string): { test: PartnerTest; count: number } | null {
  const words = text.trim().split(/\s+/);
  const count = COUNT_WORDS[words[0]];
  if (count !== undefined) words.shift();
  const test: PartnerTest = {};
  const icons: string[] = [];
  const traits: string[] = [];
  const skills: number[] = [];
  for (const word of words) {
    if (word === 'personnel') continue;
    const negated = /^non-(\[[a-z]+\])$/.exec(word);
    if (negated) {
      const affiliation = AFFILIATION_ABBREVIATIONS[negated[1]];
      if (!affiliation || test.notAffiliation) return null;
      test.notAffiliation = affiliation;
      continue;
    }
    if (/^(?:\[[a-z]+\])+$/.test(word)) {
      for (const token of word.match(/\[[a-z]+\]/g)!) {
        const affiliation = AFFILIATION_ABBREVIATIONS[token];
        if (!affiliation) icons.push(token);
        else if (test.affiliation) return null;
        else test.affiliation = affiliation;
      }
      continue;
    }
    // "{odo}" names a title; "{dissident}" names a keyword in braces, as older cards write it.
    const braced = /^\{(.+)\}$/.exec(word);
    if (braced && !PARTNER_TRAIT_WORDS.has(braced[1])) {
      if (test.title) return null;
      test.title = braced[1];
      continue;
    }
    const bare = braced ? braced[1] : word;
    if (SKILL_INDEX[bare] !== undefined) skills.push(SKILL_INDEX[bare]);
    else if (PARTNER_TRAIT_WORDS.has(bare)) traits.push(bare);
    // "three macos", "two vulcans": a plural after a count.
    else if ((count ?? 1) > 1 && bare.endsWith('s') && PARTNER_TRAIT_WORDS.has(bare.slice(0, -1))) traits.push(bare.slice(0, -1));
    // "stopped", "opponent's", "other" and every other word: no gain.
    else return null;
  }
  if (icons.length) test.icons = icons;
  if (traits.length) test.traits = traits;
  if (skills.length) test.skills = skills;
  return Object.keys(test).length ? { test, count: count ?? 1 } : null;
}

/**
 * The partner of "present with <partner>" or "you have <partner> present": one or more alternatives
 * joined by "or", each with the same count. Null for a partner the bot cannot read.
 */
export function parsePartner(text: string): PartnerRequirement | null {
  const alternatives = text.split(/\s+or\s+/).map(parsePartnerTest);
  if (alternatives.some((a) => !a)) return null;
  const count = alternatives[0]!.count;
  if (alternatives.some((a) => a!.count !== count)) return null;
  return { anyOf: alternatives.map((a) => a!.test), count };
}

/** Whether a personnel with `traits` passes `test`. A partner test reads printed traits and base skills only. */
export function passesPartnerTest(test: PartnerTest, traits: PartnerTraits): boolean {
  return (
    (!test.affiliation || traits.affiliation.includes(test.affiliation)) &&
    (!test.notAffiliation || !traits.affiliation.includes(test.notAffiliation)) &&
    (!test.icons || test.icons.every((icon) => traits.icons.includes(icon))) &&
    (!test.traits || test.traits.every((word) => traits.keywords.includes(word) || traits.species.includes(word))) &&
    (!test.skills || test.skills.every((i) => traits.skills[i] > 0)) &&
    (!test.title || traits.name === test.title || traits.name.startsWith(`${test.title} `))
  );
}

// "[space |planet |[dq] ]mission[ worth 50 or more points]": the only qualifiers of a mission read.
const MISSION = String.raw`(?:(?:space|planet|\[[adg]q\]) )?mission(?: worth \d+ or (?:more|fewer) points)?`;
// The heads, in order: facing with a partner (group 2), present with a partner (group 3), facing, and
// attempting. The partner forms come first, so "facing a dilemma" does not take the facing head.
const WHILE = new RegExp(
  String.raw`(?:^|[.:]\s*)while (?:this personnel is )?(facing a dilemma and you have ([^,.]+?) present,|present with ([^,.]+),|facing a dilemma(?: at an? ${MISSION})?|attempting an? ${MISSION}),? ([^.]*)`,
  'g',
);

/** The mission condition of a "while" head such as "attempting a [dq] mission". */
function missionConditionOf(head: string): MissionCondition | undefined {
  const mission: MissionCondition = {};
  const kind = /(space|planet|\[([adg])q\]) mission/.exec(head);
  if (kind?.[1] === 'space') mission.missiontype = 's';
  else if (kind?.[1] === 'planet') mission.missiontype = 'p';
  else if (kind?.[2]) mission.quadrant = kind[2] as MissionCondition['quadrant'];
  const worth = /worth (\d+) or (more|fewer) points/.exec(head);
  if (worth?.[2] === 'more') mission.minPoints = Number(worth[1]);
  else if (worth) mission.maxPoints = Number(worth[1]);
  return Object.keys(mission).length ? mission : undefined;
}

/**
 * The gains a lowercased game text gives its own personnel. A clause whose mission has another
 * qualifier ("that requires …", "with an event on it", "region: …", "[kli]") gives none: the clause
 * after it does not begin with its subject. Morak's "[dq] mission he gains …" has no comma, so the
 * comma is optional. "While … present with <partner>, …" is `'attempting'`, and "while … facing a
 * dilemma and you have <partner> present, …" is `'facing'`, each with its `PartnerRequirement`.
 */
export function parseGains(gametext: string): PersonnelGain[] {
  const gains: PersonnelGain[] = [];
  for (const match of gametext.matchAll(WHILE)) {
    const head = match[1];
    const partnerText = match[2] ?? match[3];
    const partner = partnerText === undefined ? undefined : parsePartner(partnerText);
    if (partner === null) continue;
    const condition = head.startsWith('facing') ? 'facing' : 'attempting';
    const gain = parseGainClause(match[4], condition, partner ? undefined : missionConditionOf(head), partner);
    if (gain) gains.push(gain);
  }
  return gains;
}

/** Whether `gain` holds at `mission`. With no mission, only a gain with no mission condition holds. */
export function gainHoldsAt(gain: PersonnelGain, mission?: AttemptedMission): boolean {
  const need = gain.mission;
  if (!need) return true;
  if (!mission) return false;
  const points = Number(mission.points);
  return (
    (!need.missiontype || mission.missiontype === need.missiontype) &&
    (!need.quadrant || mission.quadrant === need.quadrant) &&
    (need.minPoints === undefined || points >= need.minPoints) &&
    (need.maxPoints === undefined || points <= need.maxPoints)
  );
}

/** The fields of a lowercased mission row that the gains read: the table and the lab both pass these. */
export function attemptedMissionOf(row: AttemptedMission): AttemptedMission {
  return { missiontype: row.missiontype, quadrant: row.quadrant, points: row.points };
}

/**
 * The cards the parser reads wrong, keyed by the lowercased name less its version suffix, as
 * `hqPlayability.ts` keys its map. An entry replaces the parsed gains; `[]` means no gain.
 */
export const GAIN_OVERRIDES: Record<string, PersonnelGain[]> = {};

// Rom, Undercover Spy misspells "Enginner", so the parser rejects his skill list.
const ROM_UNDERCOVER_SPY = parseGains('while this personnel is present with your dissident, he gains astrometrics, engineer, and programming.');
GAIN_OVERRIDES['rom undercover spy'] = ROM_UNDERCOVER_SPY;
GAIN_OVERRIDES['rom undercover spy (ss)'] = ROM_UNDERCOVER_SPY;

/** The gains of a lowercased card row: its override when it has one, else its parsed game text. */
export function personnelGainsOf(card: { name: string; gametext?: string | number }): PersonnelGain[] {
  return GAIN_OVERRIDES[stripVersionSuffix(card.name)] ?? parseGains(String(card.gametext ?? '').toLowerCase());
}
