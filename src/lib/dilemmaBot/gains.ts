import { stripVersionSuffix } from '../cardCount';
import { AFFILIATION_ABBREVIATIONS } from '../deckPlayability';
import { BOT_SKILLS, SKILL_INDEX } from './requirements';

// The skills and attributes a personnel gains from its own game text (#1349, #1350, parts 1 and 2 of
// #1340): "while this personnel is facing a dilemma, …" and "while this personnel is attempting a
// mission, …", each perhaps narrowed to a kind of mission, and "while this personnel is present with
// <partner>, …" (#1356, part 3a), and the heads that read the player's own table: completed missions,
// the discard pile and the core (#1352, part 4), and the loss of every skill "while you command a [bor]
// non-dissident personnel" (#1360). The gain and the loss are plain data: it crosses into the search Web Worker with
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
  /** "non-dissident": words the partner's keywords and species must not hold. */
  notTraits?: string[];
  /** Skills the partner's base skills must each hold, indexed as `BOT_SKILLS`: "honor". */
  skills?: number[];
  /** A prefix of the partner's lowercased name, from "{odo}". */
  title?: string;
  /** The card is a personnel: "personnel" in a test of the discard pile, which holds every type. */
  personnel?: boolean;
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
  /** The card type, for a card of the discard pile (`BotTableFacts`); a `personnel` test reads it. */
  type?: string;
}

/**
 * A condition of a gain on the player's own table (#1352): the number of completed missions (perhaps
 * of one `missiontype`), of the discard pile's cards that pass one of `anyOf`, of the events in the
 * core, or of the personnel the player commands that pass one of `anyOf` (#1360), is at least `min`
 * and at most `max`.
 */
export interface TableCondition {
  count: 'completedMissions' | 'discardPile' | 'coreEvents' | 'commanded';
  missiontype?: 'p' | 's';
  /** `'discardPile'` and `'commanded'`: the tests a counted card passes one of. `[{}]` counts every card. */
  anyOf?: PartnerTest[];
  min?: number;
  max?: number;
}

/**
 * What the table conditions read of the player's table as an attempt starts (#1352), built by the
 * practice table. The dilemma lab has no table and passes none: every table condition then holds.
 */
export interface BotTableFacts {
  /** The `missiontype` of each completed mission. */
  completedMissions: string[];
  /** The printed traits and the type of each card of the discard pile. */
  discardPile: PartnerTraits[];
  /** The number of events in the core. */
  coreEvents: number;
  /**
   * The traits of each personnel the player commands (#1360): every away team and every ship's crew,
   * at every mission. The brig does not count. They are the printed traits, after Sphere 117 (#1363):
   * while its condition holds, a Drone reads Dissident in place of Drone (`asSphere117Dissident`).
   */
  commanded: PartnerTraits[];
}

/** The name of Sphere 117, Renegade Borg Sphere (Unity, 25V051), as `originalName` (#1363). */
export const SPHERE_117 = 'Sphere 117 Renegade Borg Sphere';

/** Whether `card` is a copy of Sphere 117 (#1363). */
export function isSphere117(card: { originalName?: string } | null | undefined): boolean {
  return card?.originalName === SPHERE_117;
}

/**
 * Whether the condition of Sphere 117 holds (#1363), "while each of your missions is a [DQ] mission":
 * the player has a Sphere 117, and at least one mission, each of `quadrants` `d`.
 */
export function sphere117Holds(hasSphere: boolean, quadrants: string[]): boolean {
  return hasSphere && quadrants.length > 0 && quadrants.every((q) => q === 'd');
}

/** `traits` while Sphere 117 holds (#1363): "each {Drone} you own gains Dissident and loses Drone". */
export function asSphere117Dissident(traits: PartnerTraits): PartnerTraits {
  if (!traits.keywords.includes('drone')) return traits;
  const keywords = traits.keywords.filter((k) => k !== 'drone');
  return { ...traits, keywords: keywords.includes('dissident') ? keywords : [...keywords, 'dissident'] };
}

export interface PersonnelGain {
  condition: GainCondition;
  /** Absent: the gain holds at every mission. */
  mission?: MissionCondition;
  /** Absent: the gain needs no partner. Present: the group step `withPartnerGains` settles it. */
  partner?: PartnerRequirement;
  /** Absent: the gain needs nothing of the table. Present: it holds while `tableConditionHolds`. */
  table?: TableCondition;
  /** The levels gained of each skill, indexed as `BOT_SKILLS`. */
  skills: number[];
  /** The change of Integrity, Cunning, Strength. */
  attrs: [number, number, number];
  /** The gain is the "next ability" of a `SkillLoss`: it is lost with the skills while the loss holds. */
  nextAbility?: true;
}

/**
 * "While you command a [bor] non-dissident personnel, this personnel loses all of his skills and his
 * next ability" (#1360): while `table` holds, every skill of the personnel is 0 in both profiles, and,
 * with `nextAbility`, the gains marked `nextAbility` do not count. The printed skills of its
 * `PartnerTraits` stay.
 */
export interface SkillLoss {
  table: TableCondition;
  nextAbility: boolean;
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

const COUNT_WORDS: Record<string, number> = { a: 1, an: 1, your: 1, two: 2, three: 3, four: 4, five: 5, six: 6, ten: 10 };

/**
 * One alternative of a partner, such as "three [pa] personnel" or "an honor klingon". `inPile`: a test
 * of the discard pile's cards, where "personnel" is a test of the type, "cards" means any card, and
 * "ten or more" is a count.
 */
function parsePartnerTest(text: string, inPile = false): { test: PartnerTest; count: number } | null {
  const words = (inPile ? text.trim().replace(/^(six|ten) or more /, '$1 ') : text.trim()).split(/\s+/);
  const count = COUNT_WORDS[words[0]];
  if (count !== undefined) words.shift();
  const test: PartnerTest = {};
  const icons: string[] = [];
  const traits: string[] = [];
  const skills: number[] = [];
  for (const word of words) {
    if (inPile && word === 'personnel') test.personnel = true;
    if (word === 'personnel' || (inPile && /^cards?$/.test(word))) continue;
    const notTrait = /^non-([a-z]+)$/.exec(word);
    if (notTrait && PARTNER_TRAIT_WORDS.has(notTrait[1])) {
      (test.notTraits ??= []).push(notTrait[1]);
      continue;
    }
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
  return inPile || Object.keys(test).length ? { test, count: count ?? 1 } : null;
}

/**
 * The partner of "present with <partner>" or "you have <partner> present": one or more alternatives
 * joined by "or", each with the same count. Null for a partner the bot cannot read.
 */
export function parsePartner(text: string, inPile = false): PartnerRequirement | null {
  const alternatives = text.split(/\s+or\s+(?!more\b)/).map((t) => parsePartnerTest(t, inPile));
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
    (!test.notTraits || !test.notTraits.some((word) => traits.keywords.includes(word) || traits.species.includes(word))) &&
    (!test.skills || test.skills.every((i) => traits.skills[i] > 0)) &&
    (!test.title || traits.name === test.title || traits.name.startsWith(`${test.title} `)) &&
    (!test.personnel || traits.type === 'personnel')
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

// Any "while <head>, <clause>": `tableConditionOf` keeps the heads that read the player's own table.
const TABLE_WHILE = /(?:^|[.:]\s*)while ([^,.]+), ([^.]*)/g;

const COMPLETED_COUNTS: Record<string, Pick<TableCondition, 'min' | 'max'>> = {
  a: { min: 1 },
  an: { min: 1 },
  two: { min: 2 },
  'fewer than two': { max: 1 },
};

/**
 * The table condition of a "while" head (#1352), or null for a head that does not read the player's
 * own table, or reads it in a way the bot does not know: "you (do not) command a completed (space)
 * mission", "two completed space missions", "fewer than two completed missions", "you have <cards> in
 * your discard pile", "<cards> is/are in your discard pile", "you command an event in your core". A
 * head that compares with an opponent ("than each of your opponents", "each player") is not one.
 */
function tableConditionOf(head: string): TableCondition | null {
  const completed = /^you (do not )?command (.+?) completed (?:(space|planet) )?missions?$/.exec(head);
  if (completed) {
    const counts = COMPLETED_COUNTS[completed[2]];
    if (!counts || (completed[1] && counts.min !== 1)) return null;
    return {
      count: 'completedMissions',
      ...(completed[3] ? { missiontype: completed[3] === 'space' ? 's' : 'p' } : {}),
      ...(completed[1] ? { max: 0 } : counts),
    };
  }
  if (head === 'you command an event in your core') return { count: 'coreEvents', min: 1 };
  const discard = /^(?:you have )?(.+?) (?:is |are )?in your discard pile$/.exec(head);
  const cards = discard && parsePartner(discard[1], true);
  return cards ? { count: 'discardPile', anyOf: cards.anyOf, min: cards.count } : null;
}

/** Whether `condition` holds on the table of `facts`. With no facts, the dilemma lab's case, it holds. */
export function tableConditionHolds(condition: TableCondition, facts?: BotTableFacts): boolean {
  if (!facts) return true;
  const n =
    condition.count === 'completedMissions'
      ? facts.completedMissions.filter((t) => !condition.missiontype || t === condition.missiontype).length
      : condition.count === 'discardPile'
        ? facts.discardPile.filter((card) => condition.anyOf!.some((test) => passesPartnerTest(test, card))).length
        : condition.count === 'commanded'
          ? facts.commanded.filter((card) => condition.anyOf!.some((test) => passesPartnerTest(test, card))).length
          : facts.coreEvents;
  return (condition.min === undefined || n >= condition.min) && (condition.max === undefined || n <= condition.max);
}

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

// "While you command a [bor] non-dissident personnel, this personnel loses all of his skills[ and his
// next ability]" (#1360). It ends before the sentence's period, so the next match starts at it.
const LOSS =
  /while you command (an? [^,.]+? personnel), this personnel loses all of (?:his|her) skills( and (?:his|her) next ability)?(?=\.|$)/;

/**
 * The gains a lowercased game text gives its own personnel. A clause whose mission has another
 * qualifier ("that requires …", "with an event on it", "region: …", "[kli]") gives none: the clause
 * after it does not begin with its subject. Morak's "[dq] mission he gains …" has no comma, so the
 * comma is optional. "While … present with <partner>, …" is `'attempting'`, and "while … facing a
 * dilemma and you have <partner> present, …" is `'facing'`, each with its `PartnerRequirement`. A head
 * on the player's own table (`tableConditionOf`) gives an `'attempting'` gain with its `TableCondition`.
 */
export function parseGains(gametext: string): PersonnelGain[] {
  const gains: PersonnelGain[] = [];
  // The sentence after a loss's own is its "next ability": a gain that starts there is marked. A match
  // starts at the period before its "while", which is the end of the loss's sentence.
  const loss = LOSS.exec(gametext);
  const next = loss?.[2] ? loss.index + loss[0].length : -1;
  const nextEnd = next < 0 ? -1 : gametext.indexOf('.', next + 1);
  const mark = (gain: PersonnelGain, index: number): PersonnelGain =>
    next >= 0 && index >= next && (nextEnd < 0 || index < nextEnd) ? { ...gain, nextAbility: true } : gain;
  for (const match of gametext.matchAll(WHILE)) {
    const head = match[1];
    const partnerText = match[2] ?? match[3];
    const partner = partnerText === undefined ? undefined : parsePartner(partnerText);
    if (partner === null) continue;
    const condition = head.startsWith('facing') ? 'facing' : 'attempting';
    const gain = parseGainClause(match[4], condition, partner ? undefined : missionConditionOf(head), partner);
    if (gain) gains.push(mark(gain, match.index));
  }
  // A table gain is `'attempting'`: nothing in a play changes the table, so it holds for the whole attempt.
  for (const match of gametext.matchAll(TABLE_WHILE)) {
    const table = tableConditionOf(match[1]);
    const gain = table && parseGainClause(match[2], 'attempting');
    if (gain) gains.push(mark({ ...gain, table }, match.index));
  }
  return gains;
}

/** The loss of a lowercased game text, or null. */
export function parseSkillLoss(gametext: string): SkillLoss | null {
  const match = LOSS.exec(gametext);
  const personnel = match && parsePartner(match[1]);
  if (!personnel) return null;
  return { table: { count: 'commanded', anyOf: personnel.anyOf, min: personnel.count }, nextAbility: Boolean(match![2]) };
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

/** The skill loss of a lowercased card row (#1360), or null. Its gains of the next ability carry `nextAbility`. */
export function personnelLossOf(card: { name: string; gametext?: string | number }): SkillLoss | null {
  return parseSkillLoss(String(card.gametext ?? '').toLowerCase());
}
