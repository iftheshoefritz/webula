import { BOT_SKILLS, RequirementBranch, RequirementPersonnel, SKILL_INDEX } from '../requirements';
import { LivePartnerProfile, Rand, requirementProfileOf } from '../simulator';
import { DilemmaModel, PersonnelOp, PileAttempt, PilePersonnel, PileResult, PlayContext, PlayEffect, lastingDamage, revealCostOf } from './model';

// The state of one play of a stack (#1320, the pilot). A family of the registry acts on it through
// these verbs: select, stop, kill, place in the brig, ask the player or the bot to choose, test skills.

export type Attr = 0 | 1 | 2;
const TRANSPORTERS = SKILL_INDEX.transporters;
export const ATTR_NAMES = ['Integrity', 'Cunning', 'Strength'] as const;

/** The profiles each play reads, built once per attempt: `choosePileStack` plays one attempt thousands of times. */
const PROFILES = new WeakMap<PileAttempt, { requirement: RequirementPersonnel[]; printed: RequirementPersonnel[] }>();
function profilesOf(attempt: PileAttempt) {
  let profiles = PROFILES.get(attempt);
  if (!profiles) {
    profiles = { requirement: attempt.personnel.map(requirementProfileOf), printed: attempt.personnel.map((p) => p.printed) };
    PROFILES.set(attempt, profiles);
  }
  return profiles;
}

/** The context of a fork: the copy takes every field from the state it copies. */
const FORK_CONTEXT = {} as PlayContext;

/** An effect less the title and the why the play adds: an `Omit` over each member of the union. */
type Untitled<E> = E extends PlayEffect ? Omit<E, 'title' | 'why'> : never;

/** The `why` of a stop by Chula: The Game on the mission, before a Chula dilemma. */
const GAME = 'Chula: The Game';

export class PlayState {
  readonly attempt: PileAttempt;
  readonly group: PilePersonnel[];
  readonly rand: Rand;
  readonly trace?: (line: string) => void;
  /** The effect recorder (#1579), or undefined: a fork records nothing. */
  readonly effects?: (effect: PlayEffect) => void;
  /** The picks a random select of the first dilemma returns in place of its roll (#1588), or undefined: a fork takes none. */
  readonly picks?: (count: number, pool: number[]) => number[];
  /** The player's choice of a `playerChooses` call of the first dilemma (#1593), or undefined: a fork takes none. */
  readonly chooses?: (count: number, pool: number[]) => number[];
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
  /** "Each personnel cannot use their first-listed skill" (Accelerated Aging), the final check too. */
  firstSkillOff = false;
  /** The personnel of this cost or less cannot use their skills while facing a dilemma (Bread and Circuses). -1: none. */
  skillsOffCostAtMost = -1;
  /**
   * Pattern Loss on the mission: a dilemma whose requirements name Transporters needs one more level of
   * each skill they name, in its own check (`has`).
   */
  patternLoss: boolean;
  /** What each attribute of every personnel gains until the end of the attempt (Parallel Romance). */
  attrBonus = 0;
  /** Overwhelmed: each dilemma check (`has`) that passes stops the personnel who supplied its skills. */
  overwhelmed = false;
  /** The rest of the stack is not faced, and returns to the pile (Lack of Preparation). */
  stackEnded = false;
  /**
   * What each personnel loses from every attribute for the rest of the play (The Clown: Bitter Medicine),
   * the final check too, or null when none loses any. The attempt's personnel never change.
   */
  attrLoss: Int16Array | null = null;
  /** The dilemmas a play put on top of the rest of the stack (Vault of Tomorrow, Talosian Trial), faced next. */
  readonly onTop: DilemmaModel[] = [];
  /** The rest of the stack, not revealed yet, in order (#1555). */
  queue: DilemmaModel[] = [];
  /** How many dilemmas at the front of `queue` a fetch put there: each adds its extra budget at its reveal. */
  fetchedFront = 0;
  /**
   * The cost the bot may spend (#1555): the attempt's spend, plus the extra budget of every title of the
   * chosen stack, and of a fetched title from its reveal. Infinity when the attempt has no spend.
   */
  budget = Infinity;
  /** The total cost of the dilemmas revealed so far, with the discounts of `stackCostOf`. */
  spent = 0;
  /** The discount the last revealed dilemma gives the next one (Peremptory Plea). */
  discount = 0;
  /** A revealed dilemma took the cost over the budget: it and every later one are overcome (#1555). */
  overBudget = false;
  /** The titles of the stack faced so far, this one included. */
  readonly faced: string[] = [];
  /** The title of the dilemma being faced. */
  current = '';
  /** The drawn dilemmas the stack does not hold: what the bot could consume (Outmatched). */
  readonly notInStack: number;
  /** The copies of Chula: The Game on the mission: those there before the attempt, and those this stack placed. */
  gameCopies: number;
  private readonly requirementProfiles: RequirementPersonnel[];
  private readonly printedProfiles: RequirementPersonnel[];
  /** The personnel whose partner gains the play settles again (#1357), or null when none has one. */
  private readonly partnered: LivePartnerProfile[] | null;
  /** A personnel left the unstopped group since the dilemma profiles were last settled. */
  private dirty = false;
  /** Buffers the requirement checks reuse, so a play allocates no array per check. */
  private readonly skillSums = new Array<number>(BOT_SKILLS.length).fill(0);
  private readonly attrSums = [0, 0, 0];

  constructor(context: PlayContext, notInStack = 0, from?: PlayState) {
    // A fork (#1555) is built by the constructor, not `Object.create`, so it shares the shape of every
    // other play: the forks of a fetch are a search's hottest path.
    if (from) {
      Object.assign(this, from);
      return;
    }
    this.attempt = context.attempt;
    this.group = context.attempt.personnel;
    this.rand = context.rand;
    this.trace = context.trace;
    this.effects = context.effects;
    this.picks = context.picks;
    this.chooses = context.chooses;
    this.alive = new Uint8Array(this.group.length).fill(1);
    this.present = new Uint8Array(this.group.length).fill(1);
    this.live = this.group.length;
    this.requirements = context.attempt.requirements;
    this.notInStack = notInStack;
    this.gameCopies = context.attempt.gameOnMission ?? 0;
    this.spent = context.attempt.revealedCost ?? 0;
    this.patternLoss = !!context.attempt.table.onMission?.includes('Pattern Loss');
    const profiles = profilesOf(context.attempt);
    this.printedProfiles = profiles.printed;
    const partnered = context.attempt.livePartners?.length ? context.attempt.livePartners : null;
    this.partnered = partnered;
    if (!partnered) {
      this.requirementProfiles = profiles.requirement;
    } else {
      // The working profiles of the personnel with partner gains, copied once per play. Every other index
      // reads the attempt's own profiles.
      this.group = this.group.slice();
      this.requirementProfiles = profiles.requirement.slice();
      for (const { personnel: k } of partnered) {
        const p = this.group[k];
        this.group[k] = { ...p, attrs: [...p.attrs] as [number, number, number], skills: p.skills.slice() };
        const r = this.requirementProfiles[k];
        this.requirementProfiles[k] = { attrs: [...r.attrs] as [number, number, number], skills: r.skills.slice() };
      }
      this.dirty = true;
    }
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
    if (this.firstSkillOff && p.firstSkill === i) return 0;
    if (p.cost <= this.skillsOffCostAtMost) return 0;
    return (this.abilitiesOff ? p.printed : p).skills[i];
  }

  attr(k: number, a: Attr): number {
    const p = this.group[k];
    return (this.abilitiesOff ? p.printed.attrs[a] : p.attrs[a] + this.attrBonus) - (this.attrLoss ? this.attrLoss[k] : 0);
  }

  hasSkill(k: number, ...skills: number[]): boolean {
    return skills.some((i) => this.skill(k, i) > 0);
  }

  /**
   * Do the unstopped personnel meet one branch, as a dilemma reads them? This is the dilemma's own check,
   * so Pattern Loss raises it and Overwhelmed stops the personnel whose skills pass it.
   */
  has(branches: RequirementBranch[]): boolean {
    const skills = this.skillSums.fill(0);
    const attrs = this.attrSums.fill(0);
    for (let k = 0; k < this.group.length; k++) if (this.alive[k]) this.addProfile(k, skills, attrs, false);
    return this.passes(branches, skills, attrs, () => this.unstopped());
  }

  /** A dilemma's check of summed profiles: Pattern Loss raises it, and Overwhelmed stops the personnel of `pool` who pass it. */
  private passes(branches: RequirementBranch[], skills: number[], attrs: number[], pool: () => number[]): boolean {
    const checked =
      this.patternLoss && branches.some((b) => b.skills[TRANSPORTERS] > 0)
        ? branches.map((b) => ({ ...b, skills: b.skills.map((n) => (n > 0 ? n + 1 : 0)) }))
        : branches;
    const passed = metBranch(checked, skills, attrs);
    if (passed && this.overwhelmed) this.stop(this.skillUsers(passed, pool()), 'Overwhelmed');
    return passed !== undefined;
  }

  /** The fewest personnel of `pool`, chosen greedily, whose skills cover the skills of `branch`. */
  skillUsers(branch: RequirementBranch, pool: number[] = this.unstopped()): number[] {
    const need = branch.skills.slice();
    const users: number[] = [];
    while (need.some((n) => n > 0)) {
      let best = -1;
      let bestCover = 0;
      for (const k of pool) {
        if (users.includes(k)) continue;
        let cover = 0;
        for (let i = 0; i < need.length; i++) cover += Math.min(need[i], this.skill(k, i));
        if (cover > bestCover) [best, bestCover] = [k, cover];
      }
      if (best < 0) break;
      users.push(best);
      for (let i = 0; i < need.length; i++) need[i] = Math.max(0, need[i] - this.skill(best, i));
    }
    return users;
  }

  /**
   * Do the personnel `ks` together meet one branch, as a dilemma reads them: "unless those personnel have
   * …". It is a dilemma's own check, as `has` is. With `printedSkills`, their skills are the printed ones, as while they "cannot gain skills".
   */
  hasAmong(branches: RequirementBranch[], ks: readonly number[], printedSkills = false): boolean {
    const skills = this.skillSums.fill(0);
    const attrs = this.attrSums.fill(0);
    for (const k of ks) this.addProfile(k, skills, attrs, printedSkills);
    return this.passes(branches, skills, attrs, () => ks.slice());
  }

  private addProfile(k: number, skills: number[], attrs: number[], printedSkills: boolean) {
    const printed = this.group[k].printed.skills;
    for (let i = 0; i < skills.length; i++) skills[i] += printedSkills ? Math.min(printed[i], this.skill(k, i)) : this.skill(k, i);
    for (let a = 0; a < 3; a++) attrs[a] += this.attr(k, a as Attr);
  }

  totalAttr(a: Attr): number {
    return this.unstopped().reduce((s, k) => s + this.attr(k, a), 0);
  }

  /**
   * Settle the partner gains (#1357): each dilemma profile, or with `requirement` each requirement
   * profile, of a personnel with partner gains is its base plus each gain whose partners in `present`
   * number at least its count. A requirement profile takes only the `'attempting'` gains.
   */
  private settle(requirement: boolean, present: ArrayLike<number>) {
    for (const { personnel: k, base, baseRequirement, gains } of this.partnered!) {
      const from = requirement ? baseRequirement : base;
      const to = requirement ? this.requirementProfiles[k] : this.group[k];
      for (let i = 0; i < from.skills.length; i++) to.skills[i] = from.skills[i];
      for (let a = 0; a < 3; a++) to.attrs[a] = from.attrs[a];
      for (const gain of gains) {
        if (requirement && !gain.attempting) continue;
        let count = 0;
        for (const j of gain.partners) count += present[j];
        if (count < gain.count) continue;
        for (let i = 0; i < gain.skills.length; i++) to.skills[i] += gain.skills[i];
        for (let a = 0; a < 3; a++) to.attrs[a] += gain.attrs[a];
      }
    }
  }

  /** Before a dilemma: settle the dilemma profiles against the unstopped personnel, when one left since. */
  settleBeforeDilemma() {
    if (!this.partnered || !this.dirty) return;
    this.settle(false, this.alive);
    this.dirty = false;
  }

  /** Would the unstopped personnel, less `without`, meet the mission requirements? */
  meetsWithout(without: number[] = []): boolean {
    if (this.partnered) {
      const present = this.alive.slice();
      for (const k of without) present[k] = 0;
      this.settle(true, present);
    }
    // The profiles the check after the last dilemma reads: the printed ones once abilities are off.
    const profiles = this.abilitiesOff ? this.printedProfiles : this.requirementProfiles;
    const skills = this.skillSums.fill(0);
    const attrs = this.attrSums.fill(0);
    for (let k = 0; k < profiles.length; k++) {
      if (!this.alive[k] || without.includes(k)) continue;
      const p = profiles[k];
      for (let i = 0; i < skills.length; i++) skills[i] += p.skills[i];
      const first = this.group[k].firstSkill;
      if (this.firstSkillOff && first !== undefined) skills[first] -= p.skills[first];
      const loss = this.attrLoss ? this.attrLoss[k] : 0;
      for (let a = 0; a < 3; a++) attrs[a] += p.attrs[a] + (this.abilitiesOff ? 0 : this.attrBonus) - loss;
    }
    return meets(this.requirements, skills, attrs);
  }

  /**
   * Up to `count` different unstopped personnel, in a random order, from `pool` or the whole group. With
   * the recorder on, it records the selection (#1588); `order` marks a selection of the whole pool whose
   * order the play reads, and `why` a selection that is not the dilemma's own (Chula: The Game). While the
   * first dilemma of the stack is faced, `picks`, when set, decides the selection in place of the roll.
   */
  select(count: number, pool: number[] = this.unstopped(), { order, why }: { order?: boolean; why?: string } = {}): number[] {
    const take = Math.min(count, pool.length);
    let picked: number[];
    if (this.picks && !why && this.faced.length === 1) {
      picked = this.picks(take, pool.slice()).slice(0, take);
    } else {
      const out = pool.slice();
      for (let i = 0; i < take; i++) {
        const j = i + Math.floor(this.rand() * (out.length - i));
        [out[i], out[j]] = [out[j], out[i]];
      }
      picked = out.slice(0, take);
    }
    if (this.effects) this.record({ op: 'select', count, pool: pool.slice(), ks: picked.slice(), ...(order ? { order: true as const } : {}) }, why);
    return picked;
  }

  /** A roll of the random function outside `select` (#1588): the recorder notes it, since its result decides the effect. */
  roll(): number {
    if (this.effects) this.record({ op: 'roll' });
    return this.rand();
  }

  /** A choice the player makes in the play's place (#1588): the recorder notes it, since the table cannot make it. */
  playerChoice() {
    if (this.effects) this.record({ op: 'playerChooses' });
  }

  /** Record an effect under the dilemma being faced, when the recorder is on. */
  private record(effect: Untitled<PlayEffect>, why?: string) {
    this.effects?.({ title: this.current, ...(why ? { why } : {}), ...effect } as PlayEffect);
  }

  private remove(
    ks: number[],
    what: keyof Omit<PileResult, 'fail' | 'labels' | 'backToPile' | 'notUnder' | 'fetchedNothing'>,
    op: PersonnelOp,
    verb: string,
    why?: string,
    quiet = false,
  ) {
    const done: number[] = [];
    for (const k of ks) {
      if (!this.alive[k]) continue;
      this.alive[k] = 0;
      if (what !== 'stopped') this.present[k] = 0;
      this.live--;
      this.result[what]++;
      this.dirty = true;
      done.push(k);
    }
    if (done.length && this.effects) this.record({ op, ks: done }, why);
    if (done.length && !quiet) this.trace?.(`  ${why ? `${why}: ` : ''}${verb} ${done.map((k) => this.name(k)).join(', ')}`);
  }

  /**
   * Stop `ks`. `why`, when given, leads the trace line: "selects …, highest Cunning 6: stops …". `quiet`
   * leaves the line out, for a caller that traces its own.
   */
  stop(ks: number[], why?: string, quiet = false) {
    this.remove(ks, 'stopped', 'stop', 'stops', why, quiet);
  }
  stopAll() {
    this.stop(this.unstopped());
  }
  kill(ks: number[]) {
    this.remove(ks, 'killed', 'kill', 'kills');
  }
  /** Remove `ks` from the game (#1579): it counts as a kill in `PileResult`, and records `remove`. */
  removeFromGame(ks: number[]) {
    this.remove(ks, 'killed', 'remove', 'removes from the game');
  }
  brig(ks: number[]) {
    this.remove(ks, 'brig', 'brig', 'places in the bot\'s brig');
  }
  holdInCore(ks: number[]) {
    this.remove(ks, 'heldInCore', 'holdInCore', 'holds in the core');
  }
  move(ks: number[]) {
    this.remove(ks, 'moved', 'move', 'moves off the attempt');
  }
  returnToHand(ks: number[], why?: string, quiet = false) {
    this.remove(ks, 'returned', 'returnToHand', 'returns to the hand', why, quiet);
  }
  /**
   * The ship leaves with every personnel aboard, stopped or not: at a space mission, the whole attempting
   * group. `what` is the count it fills: `'moved'` for a ship sent to another mission (Artificial Wormhole).
   */
  loseShip(what: 'shipLost' | 'moved' = 'shipLost') {
    const aboard: number[] = [];
    for (let k = 0; k < this.group.length; k++) {
      if (!this.present[k]) continue;
      aboard.push(k);
      this.present[k] = 0;
      if (this.alive[k]) {
        this.alive[k] = 0;
        this.live--;
        this.dirty = true;
      }
    }
    this.result[what] += aboard.length;
    if (aboard.length && this.effects) this.record({ op: 'loseShip', ks: aboard, count: what });
    if (aboard.length) this.trace?.(`  the ship ${what === 'moved' ? 'moves to another mission' : 'leaves'} with ${aboard.map((k) => this.name(k)).join(', ')}`);
  }

  /** The dilemma being faced returns to the bot's dilemma pile, so it does not go beneath the mission (#1518). */
  returnsToPile() {
    this.result.backToPile = (this.result.backToPile ?? 0) + 1;
    this.record({ op: 'returnsToPile' });
    this.trace?.(`  ${this.current} returns to the dilemma pile`);
  }

  /** The dilemma being faced goes to `where` and not beneath the mission, because its effect fired (#1534). */
  notPlacedUnder(where: string) {
    this.result.notUnder = (this.result.notUnder ?? 0) + 1;
    this.record({ op: 'notPlacedUnder', where });
    this.trace?.(`  ${this.current} goes ${where}, not beneath the mission`);
  }

  /** The rest of the stack is not faced, and returns to the dilemma pile (Lack of Preparation). */
  endStack() {
    this.stackEnded = true;
    this.record({ op: 'endStack' });
    this.trace?.('  the rest of the stack returns to the dilemma pile');
  }

  /**
   * A copy of this play that a dilemma can play ahead, to see what it would do: its personnel, flags and
   * result are its own, and it draws from the same random function. It writes no trace and records no effect.
   */
  fork(): PlayState {
    const f = new PlayState(FORK_CONTEXT, 0, this);
    const own = f as unknown as Record<string, unknown>;
    own.alive = this.alive.slice();
    own.present = this.present.slice();
    own.result = { ...this.result, labels: this.result.labels.slice() };
    own.blockedSkills = new Set(this.blockedSkills);
    own.faced = this.faced.slice();
    own.onTop = [];
    own.queue = this.queue.slice();
    own.trace = undefined;
    own.effects = undefined;
    own.picks = undefined;
    own.chooses = undefined;
    if (this.attrLoss) f.attrLoss = this.attrLoss.slice();
    // `settle` writes the profiles of the personnel with partner gains, so the copy needs its own.
    if (this.partnered) {
      own.group = this.group.map((p) => ({ ...p, attrs: [...p.attrs] as [number, number, number], skills: p.skills.slice() }));
      own.requirementProfiles = this.requirementProfiles.map((r) => ({ attrs: [...r.attrs] as [number, number, number], skills: r.skills.slice() }));
    }
    return f;
  }

  /** The cost the bot may still spend before the next reveal (#1555): Infinity when the attempt has no spend. */
  get costLeft(): number {
    return this.budget - this.spent;
  }

  /**
   * Reveal `model` against the cost (#1555): the running cost takes it, a fetched title adds its extra
   * budget, and the result says whether the cost went over the budget, so the dilemma is overcome.
   */
  private reveal(model: DilemmaModel, fetched: boolean): boolean {
    if (this.overBudget) return true;
    const step = revealCostOf(this.attempt, model, this.discount);
    if (fetched) this.budget += model.extraBudget ?? 0;
    this.spent += step.cost;
    this.discount = step.discount;
    if (this.spent > this.budget) this.overBudget = true;
    return this.overBudget;
  }

  /** A fetching dilemma that is not faced fetches nothing too (#1555): the bot played it for nothing. */
  private unfaced(model: DilemmaModel) {
    if (model.family === 'adds-dilemma') this.result.fetchedNothing = (this.result.fetchedNothing ?? 0) + 1;
  }

  /**
   * Face the rest of the stack, `queue`, one dilemma at a time (#1555): a fork runs it to the end to play a
   * fetch ahead. When every personnel is stopped, or a dilemma ends the stack, the rest is not faced; a
   * dilemma revealed over the cost the bot may spend, and every one after it, is overcome.
   */
  faceRest() {
    while (this.queue.length) {
      const model = this.queue.shift()!;
      const fetched = this.fetchedFront > 0;
      if (fetched) this.fetchedFront--;
      if (this.stackEnded) {
        this.trace?.(`${model.title}: not faced, it returns to the dilemma pile`);
        this.unfaced(model);
        continue;
      }
      if (this.reveal(model, fetched)) {
        this.trace?.(`${model.title}: overcome, over the cost the bot may spend`);
        this.unfaced(model);
        continue;
      }
      this.current = model.title;
      this.faced.push(model.title);
      if (this.live === 0) {
        this.trace?.(`${model.title}: not faced, every personnel is stopped`);
        this.unfaced(model);
        continue;
      }
      this.trace?.(`${model.title}:`);
      // Chula: The Game: before a dilemma whose title begins with "Chula", each copy on the mission stops one
      // random unstopped personnel.
      if (model.title.startsWith('Chula')) {
        for (let c = 0; c < this.gameCopies && this.live > 0; c++) {
          const [k] = this.select(1, undefined, { why: GAME });
          this.stop([k], GAME, true);
          this.trace?.(`  Chula: The Game on the mission stops ${this.name(k)}`);
        }
        if (this.live === 0) continue;
      }
      this.settleBeforeDilemma();
      model.play(this);
      // A dilemma placed on top of the stack is faced next (#1518).
      if (this.onTop.length) {
        this.fetchedFront += this.onTop.length;
        this.queue.unshift(...this.onTop.splice(0));
      }
    }
  }

  /**
   * Put on top of the rest of the stack the one of `candidates` that does the attempt most harm (#1518,
   * #1555). Each is played ahead from here, with the rest of the stack after it and the cost rule
   * applied, against a play of the rest with no fetch. A candidate helps when its play fails where the
   * play without does not, or does more lasting damage, or stops more personnel; the best of those, a
   * failed attempt first, then the most lasting damage, then the most stopped, goes on top. Returns its
   * title, or null when there is no candidate or none helps: the fetch fetches nothing.
   */
  addBestOnTop(candidates: DilemmaModel[]): string | null {
    const outcome = (f: PlayState) => ({ fail: f.live === 0 || !f.meetsWithout(), damage: lastingDamage(f.result), stopped: f.result.stopped });
    let best: DilemmaModel | null = null;
    let bestOutcome: ReturnType<typeof outcome> | null = null;
    if (candidates.length) {
      const without = this.fork();
      without.faceRest();
      const base = outcome(without);
      for (const model of candidates) {
        // A candidate over the cost left is overcome at its reveal, with the rest of the stack: it never helps.
        if (revealCostOf(this.attempt, model, this.discount).cost - (model.extraBudget ?? 0) > this.costLeft) continue;
        const f = this.fork();
        f.queue.unshift(model);
        f.fetchedFront++;
        f.faceRest();
        const o = outcome(f);
        const helps = (o.fail && !base.fail) || o.damage > base.damage || o.stopped > base.stopped;
        if (!helps) continue;
        const better = !bestOutcome || Number(o.fail) - Number(bestOutcome.fail) || o.damage - bestOutcome.damage || o.stopped - bestOutcome.stopped;
        if (better === true || better > 0) [best, bestOutcome] = [model, o];
      }
    }
    if (!best) {
      this.result.fetchedNothing = (this.result.fetchedNothing ?? 0) + 1;
      this.record({ op: 'addBestOnTop', added: null });
      this.trace?.('  fetches nothing');
      return null;
    }
    this.onTop.push(best);
    this.record({ op: 'addBestOnTop', added: best.title });
    this.trace?.(`  puts ${best.title} on top of the stack`);
    return best.title;
  }

  label(text: string) {
    this.result.labels.push({ title: this.current, label: text });
    this.record({ op: 'label', label: text });
    this.trace?.(`  label: ${text}`);
  }

  /**
   * The player's choice of `count` personnel from `candidates` for a bad result: the ones whose loss
   * keeps the mission requirements met, then any. While the first dilemma of the stack is faced,
   * `chooses`, when set, makes the choice in its place (#1593). The recorder notes the call, its pool
   * and the personnel it returned.
   */
  playerChooses(candidates: number[], count = 1): number[] {
    const pool = candidates.filter((k) => this.alive[k]);
    const chosen = this.chooses && this.faced.length === 1 ? this.chosenBy(this.chooses, count, pool) : this.modelChooses(count, pool);
    if (this.effects) this.record({ op: 'playerChooses', count, pool, ks: chosen.slice() });
    return chosen;
  }

  /** The answer of `chooses` (#1593): its indexes that are live candidates, each once, up to `count`. */
  private chosenBy(chooses: (count: number, pool: number[]) => number[], count: number, pool: number[]): number[] {
    const chosen: number[] = [];
    for (const k of chooses(count, pool.slice())) if (pool.includes(k) && !chosen.includes(k) && chosen.length < count) chosen.push(k);
    return chosen;
  }

  /** The model's pick for the player: the candidates whose loss keeps the requirements met, then the least valuable. */
  private modelChooses(count: number, candidates: number[]): number[] {
    const chosen: number[] = [];
    const pool = candidates.slice();
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

  /**
   * "Your opponent chooses <count> personnel": `botChooses`, and the label shows the choice (#1574), so
   * the player applies it to the personnel the play acts on. A choice of nobody makes no label. A play
   * that picks a personnel only to name its title (He Wasn't Nice) calls `botChooses` and labels "Named".
   */
  botChoice(candidates: number[], count = 1): number[] {
    const chosen = this.botChooses(candidates, count);
    this.labelChosen(chosen);
    return chosen;
  }

  /** The label of the personnel the bot chose: "Chose <name>[, <name>]", or none when it chose nobody. */
  labelChosen(chosen: number[]) {
    if (chosen.length) this.label(`Chose ${chosen.map((k) => this.name(k)).join(', ')}`);
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

/** The first branch the summed skills and attributes meet, or undefined. */
function metBranch(branches: RequirementBranch[], skills: number[], attrs: number[]): RequirementBranch | undefined {
  outer: for (const b of branches) {
    for (let i = 0; i < skills.length; i++) if (skills[i] < b.skills[i]) continue outer;
    for (let a = 0; a < 3; a++) if (b.attrs[a] >= 0 && !(attrs[a] > b.attrs[a])) continue outer;
    return b;
  }
  return undefined;
}

/** Do the summed skills and attributes meet one branch? */
const meets = (branches: RequirementBranch[], skills: number[], attrs: number[]) => metBranch(branches, skills, attrs) !== undefined;

export const skillName = (i: number) => BOT_SKILLS[i].charAt(0).toUpperCase() + BOT_SKILLS[i].slice(1);

/**
 * Play `stack` once against the attempt. When every personnel is stopped, or a dilemma ends the stack, the
 * rest of the stack is not faced. With the attempt's `spend`, a dilemma revealed over the cost the bot may
 * spend, and every one after it, is overcome (#1555). Then the unstopped personnel must meet the requirements, as Insurrection left them.
 * `options.effects`, when given, records each effect of the play in order (#1579); `options.picks` decides
 * the random selections of the first dilemma (#1588), and `options.chooses` the player's choices (#1593).
 */
export function playPileStack(
  attempt: PileAttempt,
  stack: ReadonlyArray<DilemmaModel>,
  rand: Rand,
  trace?: (line: string) => void,
  notInStack = 0,
  options: Pick<PlayContext, 'effects' | 'picks' | 'chooses'> = {},
): PileResult {
  const state = new PlayState({ attempt, rand, trace, effects: options.effects, picks: options.picks, chooses: options.chooses }, notInStack);
  state.queue = stack.slice();
  if (attempt.spend !== undefined) state.budget = stack.reduce((t, m) => t + (m.extraBudget ?? 0), attempt.spend);
  state.faceRest();
  state.result.fail = !state.meetsWithout();
  trace?.(state.result.fail ? 'The attempt fails.' : 'The unstopped personnel meet the mission requirements.');
  return state.result;
}
