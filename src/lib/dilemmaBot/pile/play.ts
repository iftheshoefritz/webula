import { BOT_SKILLS, RequirementBranch, RequirementPersonnel } from '../requirements';
import { Rand, requirementProfileOf } from '../simulator';
import { DilemmaModel, PileAttempt, PilePersonnel, PileResult, PlayContext } from './model';

// The state of one play of a stack (#1320, the pilot). A family of the registry acts on it through
// these verbs: select, stop, kill, place in the brig, ask the player or the bot to choose, test skills.

export type Attr = 0 | 1 | 2;
export const ATTR_NAMES = ['Integrity', 'Cunning', 'Strength'] as const;

/** The profiles each play reads, built once per attempt: `chooseStack` plays one attempt up to 250,000 times. */
const PROFILES = new WeakMap<PileAttempt, { requirement: RequirementPersonnel[]; printed: RequirementPersonnel[] }>();
function profilesOf(attempt: PileAttempt) {
  let profiles = PROFILES.get(attempt);
  if (!profiles) {
    profiles = { requirement: attempt.personnel.map(requirementProfileOf), printed: attempt.personnel.map((p) => p.printed) };
    PROFILES.set(attempt, profiles);
  }
  return profiles;
}

export class PlayState {
  readonly attempt: PileAttempt;
  readonly group: PilePersonnel[];
  readonly rand: Rand;
  readonly trace?: (line: string) => void;
  /** 1 while the personnel is unstopped and still in the attempt. */
  readonly alive: Uint8Array;
  /**
   * 1 while the personnel is still at the mission, stopped or not: a stop clears `alive` only, every
   * other result both. A lost ship takes every personnel aboard, the stopped ones too.
   */
  readonly present: Uint8Array;
  live: number;
  readonly result: PileResult;
  /** The requirements of the mission: Insurrection changes them. */
  requirements: RequirementBranch[];
  /** "Your personnel cannot use their abilities" (Dereliction of Duty): every profile is the printed one. */
  abilitiesOff = false;
  /** The skills no personnel can use while facing a dilemma (Harsh Conditions). */
  readonly blockedSkills = new Set<number>();
  /** The titles of the stack faced so far, this one included. */
  readonly faced: string[] = [];
  /** The title of the dilemma being faced. */
  current = '';
  /** The drawn dilemmas the stack does not hold: what the bot could consume (Outmatched). */
  readonly notInStack: number;
  private readonly requirementProfiles: RequirementPersonnel[];
  private readonly printedProfiles: RequirementPersonnel[];
  /** Buffers the requirement checks reuse, so a play allocates no array per check. */
  private readonly skillSums = new Array<number>(BOT_SKILLS.length).fill(0);
  private readonly attrSums = [0, 0, 0];

  constructor(context: PlayContext, notInStack = 0) {
    this.attempt = context.attempt;
    this.group = context.attempt.personnel;
    this.rand = context.rand;
    this.trace = context.trace;
    this.alive = new Uint8Array(this.group.length).fill(1);
    this.present = new Uint8Array(this.group.length).fill(1);
    this.live = this.group.length;
    this.requirements = context.attempt.requirements;
    this.notInStack = notInStack;
    const profiles = profilesOf(context.attempt);
    this.requirementProfiles = profiles.requirement;
    this.printedProfiles = profiles.printed;
    this.result = { fail: false, stopped: 0, killed: 0, heldInCore: 0, moved: 0, brig: 0, returned: 0, shipLost: 0, labels: [] };
  }

  name(k: number) {
    return this.group[k].name;
  }

  /** The unstopped personnel, in group order. */
  unstopped(): number[] {
    const out: number[] = [];
    for (let k = 0; k < this.group.length; k++) if (this.alive[k]) out.push(k);
    return out;
  }

  /** The level of skill `i` of personnel `k` while facing a dilemma. */
  skill(k: number, i: number): number {
    if (this.blockedSkills.has(i)) return 0;
    const p = this.group[k];
    return (this.abilitiesOff ? p.printed : p).skills[i];
  }

  attr(k: number, a: Attr): number {
    const p = this.group[k];
    return (this.abilitiesOff ? p.printed : p).attrs[a];
  }

  hasSkill(k: number, ...skills: number[]): boolean {
    return skills.some((i) => this.skill(k, i) > 0);
  }

  /** Do the unstopped personnel meet one branch, as a dilemma reads them? */
  has(branches: RequirementBranch[]): boolean {
    const skills = this.skillSums.fill(0);
    const attrs = this.attrSums.fill(0);
    for (let k = 0; k < this.group.length; k++) {
      if (!this.alive[k]) continue;
      for (let i = 0; i < skills.length; i++) skills[i] += this.skill(k, i);
      for (let a = 0; a < 3; a++) attrs[a] += this.attr(k, a as Attr);
    }
    return meets(branches, skills, attrs);
  }

  totalAttr(a: Attr): number {
    return this.unstopped().reduce((s, k) => s + this.attr(k, a), 0);
  }

  /** Would the unstopped personnel, less `without`, meet the mission requirements? */
  meetsWithout(without: number[] = []): boolean {
    // The profiles the check after the last dilemma reads: the printed ones once abilities are off.
    const profiles = this.abilitiesOff ? this.printedProfiles : this.requirementProfiles;
    const skills = this.skillSums.fill(0);
    const attrs = this.attrSums.fill(0);
    for (let k = 0; k < profiles.length; k++) {
      if (!this.alive[k] || without.includes(k)) continue;
      const p = profiles[k];
      for (let i = 0; i < skills.length; i++) skills[i] += p.skills[i];
      for (let a = 0; a < 3; a++) attrs[a] += p.attrs[a];
    }
    return meets(this.requirements, skills, attrs);
  }

  /** Up to `count` different unstopped personnel, in a random order, from `pool` or the whole group. */
  select(count: number, pool: number[] = this.unstopped()): number[] {
    const out = pool.slice();
    const take = Math.min(count, out.length);
    for (let i = 0; i < take; i++) {
      const j = i + Math.floor(this.rand() * (out.length - i));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out.slice(0, take);
  }

  private remove(ks: number[], what: keyof Omit<PileResult, 'fail' | 'labels'>, verb: string) {
    const done: number[] = [];
    for (const k of ks) {
      if (!this.alive[k]) continue;
      this.alive[k] = 0;
      if (what !== 'stopped') this.present[k] = 0;
      this.live--;
      this.result[what]++;
      done.push(k);
    }
    if (done.length) this.trace?.(`  ${verb} ${done.map((k) => this.name(k)).join(', ')}`);
  }

  stop(ks: number[]) {
    this.remove(ks, 'stopped', 'stops');
  }
  stopAll() {
    this.stop(this.unstopped());
  }
  kill(ks: number[]) {
    this.remove(ks, 'killed', 'kills');
  }
  brig(ks: number[]) {
    this.remove(ks, 'brig', 'places in the bot\'s brig');
  }
  holdInCore(ks: number[]) {
    this.remove(ks, 'heldInCore', 'holds in the core');
  }
  move(ks: number[]) {
    this.remove(ks, 'moved', 'moves off the attempt');
  }
  returnToHand(ks: number[]) {
    this.remove(ks, 'returned', 'returns to the hand');
  }
  /** The ship leaves with every personnel aboard, stopped or not: at a space mission, the whole attempting group. */
  loseShip() {
    const aboard: number[] = [];
    for (let k = 0; k < this.group.length; k++) {
      if (!this.present[k]) continue;
      aboard.push(k);
      this.present[k] = 0;
      if (this.alive[k]) {
        this.alive[k] = 0;
        this.live--;
      }
    }
    this.result.shipLost += aboard.length;
    if (aboard.length) this.trace?.(`  the ship leaves with ${aboard.map((k) => this.name(k)).join(', ')}`);
  }

  label(text: string) {
    this.result.labels.push({ title: this.current, label: text });
    this.trace?.(`  label: ${text}`);
  }

  /**
   * The player's choice of `count` personnel from `candidates` for a bad result: the ones whose loss
   * keeps the mission requirements met, then any, as `bestPickOne` of the Chula bot does.
   */
  playerChooses(candidates: number[], count = 1): number[] {
    const chosen: number[] = [];
    const pool = candidates.filter((k) => this.alive[k]);
    while (chosen.length < count && pool.length) {
      let pick = pool.findIndex((k) => this.meetsWithout([...chosen, k]));
      if (pick < 0) pick = pool.reduce((best, k, i) => (this.value(k) < this.value(pool[best]) ? i : best), 0);
      chosen.push(pool[pick]);
      pool.splice(pick, 1);
    }
    return chosen;
  }

  /**
   * The bot's choice of `count` personnel from `candidates` for a bad result: one whose loss breaks the
   * mission requirements first, then the most valuable.
   */
  botChooses(candidates: number[], count = 1): number[] {
    const chosen: number[] = [];
    const pool = candidates.filter((k) => this.alive[k]);
    while (chosen.length < count && pool.length) {
      let pick = pool.findIndex((k) => !this.meetsWithout([...chosen, k]));
      if (pick < 0) pick = pool.reduce((best, k, i) => (this.value(k) > this.value(pool[best]) ? i : best), 0);
      chosen.push(pool[pick]);
      pool.splice(pick, 1);
    }
    return chosen;
  }

  /** A rough worth of a personnel to the mission: its skill levels the requirements name, then its attributes. */
  value(k: number): number {
    const p = this.group[k];
    let v = 0;
    for (const b of this.requirements) for (let i = 0; i < b.skills.length; i++) if (b.skills[i]) v += 10 * Math.min(p.skills[i], b.skills[i]);
    return v + p.attrs[0] + p.attrs[1] + p.attrs[2];
  }

  /** The skills the unstopped personnel lack, as indexes, optionally from `among`. */
  lackedSkills(among: number[] = BOT_SKILLS.map((_, i) => i)): number[] {
    const ks = this.unstopped();
    return among.filter((i) => !ks.some((k) => this.skill(k, i) > 0));
  }
}

/** Do the summed skills and attributes meet one branch? */
function meets(branches: RequirementBranch[], skills: number[], attrs: number[]): boolean {
  outer: for (const b of branches) {
    for (let i = 0; i < skills.length; i++) if (skills[i] < b.skills[i]) continue outer;
    for (let a = 0; a < 3; a++) if (b.attrs[a] >= 0 && !(attrs[a] > b.attrs[a])) continue outer;
    return true;
  }
  return false;
}

export const skillName = (i: number) => BOT_SKILLS[i].charAt(0).toUpperCase() + BOT_SKILLS[i].slice(1);

/**
 * Play `stack` once against the attempt. When every personnel is stopped, the rest of the stack is not
 * faced. Then the unstopped personnel must meet the requirements, as Insurrection left them.
 */
export function playPileStack(
  attempt: PileAttempt,
  stack: ReadonlyArray<DilemmaModel>,
  rand: Rand,
  trace?: (line: string) => void,
  notInStack = 0,
): PileResult {
  const state = new PlayState({ attempt, rand, trace }, notInStack);
  for (const model of stack) {
    state.current = model.title;
    state.faced.push(model.title);
    if (state.live === 0) {
      trace?.(`${model.title}: not faced, every personnel is stopped`);
      continue;
    }
    trace?.(`${model.title}:`);
    model.play(state);
  }
  state.result.fail = !state.meetsWithout();
  trace?.(state.result.fail ? 'The attempt fails.' : 'The unstopped personnel meet the mission requirements.');
  return state.result;
}
