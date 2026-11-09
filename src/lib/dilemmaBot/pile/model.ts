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
  /** The first-listed skill, as an index of `BOT_SKILLS` (Accelerated Aging). Absent: none is known. */
  firstSkill?: number;
}

/** The ship of an attempt at a space mission. */
export interface PileShip {
  name: string;
  range: number;
  weapons: number;
  shields: number;
  /**
   * The staffing icons, lowercased, such as `['[cmd]', '[stf]', '[stf]']` (Rush Job). Absent:
   * `DEFAULT_STAFFING`, a [Cmd] and four icons in all.
   */
  staffing?: string[];
}

/** The staffing a ship with no `staffing` has: Rush Job then stops one personnel. */
export const DEFAULT_STAFFING = ['[cmd]', '[stf]', '[stf]', '[stf]'];

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
  /** The title of the card with `discardCopiesMax` copies, the first in discard order (Identity Theft's label). Absent: none. */
  discardCopiesTitle?: string;
  /** For each of the player's missions, the skills it requires, as indexes of `BOT_SKILLS`. */
  missionSkills: number[][];
  /** The titles of the dilemmas already beneath the attempted mission. */
  underMission: string[];
  /** The turn counter of the table. */
  turn: number;
  /** The player's score, the table's score counter (Show Trial, Adversarial Trial, Standing Trial, Environmental Contaminants). Absent: 0. */
  score?: number;
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
  /**
   * The highest Decay number among the events the player commands (Compromised Experiment: the bot
   * chooses the event). Absent: 0, no effect.
   */
  eventDecayMax?: number;
  /** The title of the event with `eventDecayMax`, the first in core order (Compromised Experiment's label). Absent: none. */
  eventDecayTitle?: string;
  /** The Trellium-D the player commands (Elemental Instability). Absent: 0. */
  trelliumD?: number;
  /** The highest cost among the cards in the player's hand (Gorgan's label). Absent: unknown. */
  handCostMax?: number;
  /** The titles of the dilemmas placed on the attempted mission (Organ Theft, Pattern Loss). Absent: none. */
  onMission?: string[];
  /** Whether the player commands a headquarters mission in another quadrant (Local Trouble). Absent: false. */
  headquartersOtherQuadrant?: boolean;
  /** Whether the player has a ship at the attempted mission (Revealed, Mr. Tricorder). Absent: true. */
  shipAtMission?: boolean;
  /**
   * The player's draw deck (Reflections): its size, and the events and interrupts in it. Absent: each
   * revealed card is an event or an interrupt one time in three.
   */
  drawDeck?: { size: number; eventsAndInterrupts: number };
  /** The events in the player's core (Zero Hour). Absent: 0. */
  coreEvents?: number;
  /** Whether the player commands a Nebula mission other than the attempted one (Alternatives to Fighting). Absent: true. */
  nebulaMission?: boolean;
  /** The titles of the dilemmas overcome beneath each of the player's missions (Talosian Trial). Absent: none. */
  underPlayerMissions?: string[];
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
  /**
   * The equipment of the attempt, each with its keywords lowercased, for example `['hand weapon']`
   * (Center of Attention, Rogue Borg Ambush). Absent: none.
   */
  equipment?: { name: string; keywords: string[] }[];
  /**
   * The titles of the bot's dilemma pile while the stack is faced (#1518): Vault of Tomorrow takes a
   * dilemma from it, and Outmatched consumes from its top. Absent: unknown, and Outmatched may consume any number.
   */
  botPile?: string[];
  /**
   * The cost the bot may spend on the stack, N, the spend of the attempt (#1555). At each reveal the
   * total cost of the dilemmas revealed so far must stay within it, plus the extra budget of the stack's
   * titles: the dilemma that takes it over, and every one after it, are overcome at once. Absent: no
   * cost rule, every dilemma is faced.
   */
  spend?: number;
  /** The cost of the dilemmas revealed in this attempt before the play starts (#1555). Absent: 0. */
  revealedCost?: number;
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
  /** The dilemmas that returned to the bot's dilemma pile instead of going beneath the mission (#1518). Absent: 0. */
  backToPile?: number;
  /**
   * The dilemmas whose effect placed them somewhere other than beneath the mission in this play (#1534):
   * the core, a ship, off the game. Absent: 0.
   */
  notUnder?: number;
  /**
   * The dilemmas that fetch a dilemma (Vault of Tomorrow, Talosian Trial) that fetched nothing in this play
   * (#1555): no candidate, or none that helps. Absent: 0.
   */
  fetchedNothing?: number;
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

export function lastingDamage(r: Omit<PileResult, 'fail' | 'labels' | 'stopped' | 'backToPile' | 'notUnder' | 'fetchedNothing'>): number {
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

/** What a verb of a personnel result records (#1579): `ks` index `attempt.personnel`. */
export type PersonnelOp = 'stop' | 'kill' | 'remove' | 'brig' | 'holdInCore' | 'move' | 'returnToHand';

/**
 * One effect of a play, in play order (#1579). `title` is the dilemma being faced; `why`, when given, is
 * what fired it, such as Chula: The Game before a Chula dilemma, or Overwhelmed.
 */
export type PlayEffect = { title: string; why?: string } & (
  | { op: PersonnelOp; ks: number[] }
  /** Every personnel aboard, stopped ones too, and the count of `PileResult` it filled. */
  | { op: 'loseShip'; ks: number[]; count: 'shipLost' | 'moved' }
  | { op: 'returnsToPile' }
  | { op: 'notPlacedUnder'; where: string }
  /** The title put on top of the stack, or null when the fetch fetched nothing. */
  | { op: 'addBestOnTop'; added: string | null }
  | { op: 'endStack' }
  | { op: 'label'; label: string }
  /**
   * A random selection (#1588): `count` asked, from `pool`, and the `ks` it picked. `order` marks a
   * selection of the whole pool as a random order, whose use depends on the roll (Chula: The Precipice).
   */
  | { op: 'select'; count: number; pool: number[]; ks: number[]; order?: true }
  /**
   * A call of `playerChooses` (#1593): `count` asked, from the live candidates `pool`, and the `ks` it
   * returned. With no `pool`, a choice the player makes in the play's place that is not a choice of
   * personnel (`playerChoice`, Chula: Pick One to Save Two), which the table cannot make (#1588).
   */
  | { op: 'playerChooses'; count?: number; pool?: number[]; ks?: number[] }
  /** A roll of the random function outside `select` (#1588), such as the cards Reflections reveals. */
  | { op: 'roll' }
);

export interface PlayContext {
  attempt: PileAttempt;
  rand: Rand;
  trace?: (line: string) => void;
  /** The effect recorder (#1579): absent, a play records nothing. The search and the label never set it. */
  effects?: (effect: PlayEffect) => void;
  /**
   * The picks a random `select` of the first dilemma of the stack returns in place of its roll (#1588),
   * from the `count` it asks and its `pool`. Absent: every select rolls. A fork, and the select of
   * Chula: The Game, never take it. The search and the label never set it.
   */
  picks?: (count: number, pool: number[]) => number[];
  /**
   * The player's choice (#1593): the indexes a `playerChooses` call of the first dilemma's own play returns
   * in place of the model's pick, from the `count` it asks and its live candidates `pool`. Absent: the model
   * picks. A fork never takes it. The search and the label never set it.
   */
  chooses?: (count: number, pool: number[]) => number[];
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
  /**
   * Whether the dilemma goes beneath the mission once faced. False only when it never does, whatever the
   * play: it is placed elsewhere or returns to the pile every time. A dilemma that goes elsewhere only when
   * its effect fires keeps `true`, and its play records it with `notPlacedUnder()` or `returnsToPile()` (#1534).
   */
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
  /**
   * Its random selection is the pool of a later choice of the player (#1594): A Pattern of Lies, and
   * `anyOfThree(…, 'player')`. The table rolls the selection when it reveals the card and keeps it, so
   * the player chooses from the same set after a reload.
   */
  rollsBeforeChoice?: true;
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
    const step = revealCostOf(attempt, model, discount);
    total += step.cost - (model.extraBudget ?? 0);
    discount = step.discount;
  }
  return total;
}

/**
 * One reveal of the cost arithmetic (#1555), shared by `stackCostOf` and the play so the two cannot
 * drift: what `model` costs when revealed after a title that gave `discount`, down to 0, and the discount
 * it gives the next.
 */
export function revealCostOf(attempt: PileAttempt, model: DilemmaModel, discount: number): { cost: number; discount: number } {
  return {
    cost: Math.max(0, costOf(model, attempt) - discount),
    discount: model.discountsNext ? model.discountsNext(attempt) : 0,
  };
}
