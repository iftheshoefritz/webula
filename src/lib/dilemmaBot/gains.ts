import { stripVersionSuffix } from '../cardCount';
import { BOT_SKILLS, SKILL_INDEX } from './requirements';

// The skills and attributes a personnel gains from its own game text (#1349, #1350, parts 1 and 2 of
// #1340): "while this personnel is facing a dilemma, …" and "while this personnel is attempting a
// mission, …", each perhaps narrowed to a kind of mission. The gain is plain data: it crosses into the
// search Web Worker with the `BotAttempt`.

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

export interface PersonnelGain {
  condition: GainCondition;
  /** Absent: the gain holds at every mission. */
  mission?: MissionCondition;
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
function parseGainClause(clause: string, condition: GainCondition, mission?: MissionCondition): PersonnelGain | null {
  const self = /^(?:he|she|this personnel) (.*)$/.exec(clause.trim());
  if (!self) return null;
  // "… and each cadet present is attributes +1" gives other personnel a gain: drop that part.
  const body = self[1].replace(/\s+and each .*$/, '');
  if (/\byou may\b|\bfor each\b|\blimit\b|\bloses?\b/.test(body)) return null;
  const parts = /^(?:is (.+?)(?: and gains (.+))?|gains (.+))$/.exec(body);
  if (!parts) return null;
  const attrText = parts[1];
  const skillText = parts[2] ?? parts[3];

  const gain: PersonnelGain = {
    condition,
    ...(mission ? { mission } : {}),
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

// "[space |planet |[dq] ]mission[ worth 50 or more points]": the only qualifiers of a mission read.
const MISSION = String.raw`(?:(?:space|planet|\[[adg]q\]) )?mission(?: worth \d+ or (?:more|fewer) points)?`;
const WHILE = new RegExp(
  String.raw`(?:^|[.:]\s*)while (?:this personnel is )?(facing a dilemma(?: at an? ${MISSION})?|attempting an? ${MISSION}),? ([^.]*)`,
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
 * qualifier ("that requires …", "and you have …", "with an event on it", "region: …", "[kli]") gives
 * none: the clause after it does not begin with its subject. Morak's "[dq] mission he gains …" has no
 * comma, so the comma is optional.
 */
export function parseGains(gametext: string): PersonnelGain[] {
  const gains: PersonnelGain[] = [];
  for (const match of gametext.matchAll(WHILE)) {
    const head = match[1];
    const gain = parseGainClause(match[2], head.startsWith('facing') ? 'facing' : 'attempting', missionConditionOf(head));
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

/** The gains of a lowercased card row: its override when it has one, else its parsed game text. */
export function personnelGainsOf(card: { name: string; gametext?: string | number }): PersonnelGain[] {
  return GAIN_OVERRIDES[stripVersionSuffix(card.name)] ?? parseGains(String(card.gametext ?? '').toLowerCase());
}
