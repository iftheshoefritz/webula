import { RequirementBranch } from '../requirements';
import { BotPersonnel, LivePartnerProfile, PlayerChoice, Profile, Rand } from '../simulator';

// The model of a dilemma pile for the dilemma bot (#1320). It models any title as an entry of a registry,
// so the bot can play the Chula pile of #1282 and the Championship piles.

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
  /** The index in `BOT_SKILLS` of its first-listed skill (Accelerated Aging). Absent: none is known. */
  firstSkill?: number;
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
  /** Whether the player has completed a planet mission (The Needs of the Few). Absent: false. */
  completedPlanetMission?: boolean;
  /**
   * The personnel in the player's hand (Know Thy Enemy, Compassionate Interference, Hull Breach, Last
   * Gasp). Absent: the hand holds no personnel.
   */
  hand?: PileHandPersonnel[];
  /** The Persistent dilemmas beneath the attempted mission (Frozen by Fear, Flare of Rage). Absent: 0. */
  persistentUnderMission?: number;
  /** Whether the player commands a completed mission with span 4 or more (Cornered). Absent: false. */
  completedSpan4Mission?: boolean;
  /** Whether the player has a staffed ship at the attempted mission (Galileo Grounded). Absent: false. */
  staffedShipAtMission?: boolean;
  /** The highest Decay number of the events the player commands (Compromised Experiment). Absent: 0. */
  highestDecay?: number;
  /** The Trellium-D the player commands (Elemental Instability). Absent: 0. */
  trelliumD?: number;
}

/** A personnel in the player's hand, as a dilemma that reveals the hand reads it. */
export interface PileHandPersonnel {
  /** The skills it has, as indexes of `BOT_SKILLS`. */
  skills: number[];
  strength: number;
}

/** The mission an attempt is at. */
export interface PileMission {
  kind: 'planet' | 'space';
  points: number;
  span: number;
  /** A Nebula mission (Alternatives to Fighting). */
  nebula: boolean;
}

/** The input of the pile bot: the attempting personnel, the mission, the table, and the copies of Chula: The Game on the mission. */
export interface PileAttempt {
  personnel: PilePersonnel[];
  requirements: RequirementBranch[];
  mission: PileMission;
  ship?: PileShip;
  table: PileTable;
  /** The copies of Chula: The Game already on the mission. Absent: none. */
  gameOnMission?: number;
  /** The player's choice in Chula: Pick One to Save Two. Absent: `'best'`. */
  choice?: PlayerChoice;
  /**
   * The personnel whose partner gains the play settles again before each dilemma (#1357), from
   * `partnerGroupOf`. Absent or empty: the play reads `personnel` as it is.
   */
  livePartners?: LivePartnerProfile[];
  /**
   * The bot's side: the different affiliations, lowercased, of the personnel of the bot deck's `Deck:`
   * section, from `botAffiliationsOf` (Abrasive Allies). Absent: the bot's count is unknown, and the
   * dilemma fires.
   */
  botAffiliations?: string[];
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
  /**
   * When the draw holds a copy, every stack starts with one copy (#1282): Chula: The Game, which costs 0
   * and makes every later Chula dilemma stop one more personnel.
   */
  leads?: boolean;
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
  /** The cost the next dilemma of the stack loses, down to 0 (Peremptory Plea). */
  discountsNext?: (attempt: PileAttempt) => number;
  /** What it adds to the total cost the stack may spend (Entanglement: 3). */
  extraBudget?: number;
  play: (state: import('./play').PlayState) => void;
}

export const costOf = (model: DilemmaModel, attempt: PileAttempt) => (model.cost ? model.cost(attempt) : model.printedCost);

/**
 * The total cost of an ordered stack for an attempt, less the extra budget its titles give: the stack is
 * legal at N when this is N or less. A `discountsNext` title lowers the cost of the title after it.
 */
export function stackCostOf(attempt: PileAttempt, stack: ReadonlyArray<DilemmaModel>): number {
  let total = 0;
  let discount = 0;
  for (const model of stack) {
    total += Math.max(0, costOf(model, attempt) - discount) - (model.extraBudget ?? 0);
    discount = model.discountsNext ? model.discountsNext(attempt) : 0;
  }
  return total;
}
