import { RequirementBranch } from '../requirements';
import { BotPersonnel, Profile, Rand } from '../simulator';

// The model of a dilemma pile for the dilemma bot (#1320, the pilot). The Chula pile of #1282 keeps its
// own `DilemmaId` union and `switch`; this module models any title as an entry of a registry, so the bot
// can play the Championship piles. Nothing on the practice table reads it yet.

/** A personnel as the pile's dilemmas read it: the bot's personnel, and the traits the Chula pile never read. */
export interface PilePersonnel extends BotPersonnel {
  /** Lowercased, for example `['human']`. */
  species: string[];
  /** Lowercased, for example `'federation'`. */
  affiliation: string;
  /** The number of skill dots, `[SD]`: one per skill line, so "2 Treachery" is one dot. */
  skillDots: number;
  hologram: boolean;
  /** The printed skills and attributes, with no gain: what a personnel has while it "cannot use its abilities". */
  printed: Profile;
}

/** The ship of an attempt at a space mission. */
export interface PileShip {
  name: string;
  range: number;
  weapons: number;
  shields: number;
}

/** The facts of the player's side of the table that a dilemma reads. The table has all of them. */
export interface PileTable {
  /** The headquarters missions the player commands. */
  headquarters: number;
  /** The missions the player has completed. */
  completedMissions: number;
  completedSpaceMission: boolean;
  /** The cards in the player's hand. */
  handSize: number;
  /** Whether the player's hand holds a personnel with Cunning 7 or 11 (Royale Casino: Craps). */
  handHasCunning7Or11: boolean;
  /** The most copies of one card in the player's discard pile (Identity Theft). */
  discardCopiesMax: number;
  /** For each of the player's missions, the skills it requires, as indexes of `BOT_SKILLS`. */
  missionSkills: number[][];
  /** The titles of the dilemmas already beneath the attempted mission. */
  underMission: string[];
  /** The turn counter of the table. */
  turn: number;
}

/** The mission an attempt is at. */
export interface PileMission {
  kind: 'planet' | 'space';
  points: number;
  span: number;
  /** A Nebula mission (Alternatives to Fighting). */
  nebula: boolean;
}

/** The input of the pile bot: the `BotAttempt` of the Chula bot, with the facts a Championship pile reads. */
export interface PileAttempt {
  personnel: PilePersonnel[];
  requirements: RequirementBranch[];
  mission: PileMission;
  ship?: PileShip;
  table: PileTable;
}

/** What one play of a stack did. Each count is of personnel. */
export interface PileResult {
  fail: boolean;
  stopped: number;
  killed: number;
  /** Held in the player's core (Hard Time). */
  heldInCore: number;
  /** Moved off the attempt to another mission (Alternatives to Fighting). */
  moved: number;
  /** Placed in the bot's brig, or taken (Secret Identity places one in the discard pile). */
  brig: number;
  returned: number;
  /** The personnel aboard a ship that left the game for a turn (Where No One Has Gone Before). */
  shipLost: number;
  /** The labels of the bot's choices, one entry per dilemma that made a choice. */
  labels: { title: string; label: string }[];
}

/** The weights of #1320: the lasting damage of a result. A stop counts 0. */
export const DAMAGE_WEIGHTS = {
  killed: 1,
  heldInCore: 1,
  moved: 1,
  brig: 1,
  returned: 0.75,
  shipLost: 1,
} as const;

export function lastingDamage(r: Omit<PileResult, 'fail' | 'labels' | 'stopped'>): number {
  return (
    r.killed * DAMAGE_WEIGHTS.killed +
    r.heldInCore * DAMAGE_WEIGHTS.heldInCore +
    r.moved * DAMAGE_WEIGHTS.moved +
    r.brig * DAMAGE_WEIGHTS.brig +
    r.returned * DAMAGE_WEIGHTS.returned +
    r.shipLost * DAMAGE_WEIGHTS.shipLost
  );
}

/** The categories of #1320 for a dilemma that reads the bot's side of the game. */
export type BotSideCategory = '1' | '2' | '3' | '4a' | '4b' | '4c' | '4d' | '4e' | '4f' | '4g' | '5a' | '5b' | '5c' | '5d' | '6' | '7' | '8';

export interface PlayContext {
  attempt: PileAttempt;
  rand: Rand;
  trace?: (line: string) => void;
}

/** A title of the registry. */
export interface DilemmaModel {
  title: string;
  /** `'dual'` goes at either mission. */
  kind: 'planet' | 'space' | 'dual';
  /** The printed cost. */
  printedCost: number;
  /** The cost for this attempt, under the assumptions of #1320. Absent: the printed cost. */
  cost?: (attempt: PileAttempt) => number;
  /** More than one copy can be in one stack. */
  repeatable?: boolean;
  /** Whether the dilemma goes beneath the mission once faced. False when it is placed elsewhere or returns to the pile. */
  goesUnder: boolean;
  /** `'ignore'`: the bot takes it out of its pile when the game starts (#1320). */
  status: 'play' | 'ignore';
  /** The family whose code plays it, for the pilot's report. `'own'` is code of its own. */
  family: string;
  /** Set when the dilemma reads the bot's side of the game. */
  category?: BotSideCategory;
  /** The assumption, in a few words, for the guide of #1484. */
  assumption?: string;
  /** What the pilot does not model yet, in a few words. */
  gap?: string;
  play: (state: import('./play').PlayState) => void;
}

export const costOf = (model: DilemmaModel, attempt: PileAttempt) => (model.cost ? model.cost(attempt) : model.printedCost);
