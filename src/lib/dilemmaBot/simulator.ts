import { DilemmaId } from './opponentPile';
import {
  AttemptedMission,
  BotTableFacts,
  PartnerTraits,
  PersonnelGain,
  gainHoldsAt,
  passesPartnerTest,
  personnelGainsOf,
  personnelLossOf,
  tableConditionHolds,
} from './gains';
import { BOT_SKILLS, RequirementBranch, RequirementPersonnel, SKILL_INDEX, meetsRequirements } from './requirements';

// The simulator of the dilemma bot (#1282, #1287). It plays one ordered dilemma stack against the
// attempting personnel, with random selections from `rand`, and checks the mission requirements after.

/**
 * `attrs` and `skills` are the dilemma profile: what every check of a dilemma reads, with the gains
 * "while this personnel is facing a dilemma" (#1349) and "while … attempting a mission" (#1350).
 * `requirementProfile` is what the mission-requirements check after the last dilemma reads: the base
 * and the "attempting" gains.
 */
export interface BotPersonnel {
  name: string;
  cost: number;
  /** Integrity, Cunning, Strength. */
  attrs: [number, number, number];
  /** The level of each skill, indexed as `BOT_SKILLS`. Honor is a skill in the card data. */
  skills: number[];
  /** The requirements profile. Absent means the same as the dilemma profile. */
  requirementProfile?: RequirementPersonnel;
  /** The printed traits a partner test of another personnel reads (#1356). */
  traits?: PartnerTraits;
  /** The gains that need a partner and hold at the attempted mission: `withPartnerGains` settles them. */
  partnerGains?: PersonnelGain[];
}

/** The profile of `p` that the mission-requirements check reads. */
export function requirementProfileOf(p: BotPersonnel): RequirementPersonnel {
  return p.requirementProfile ?? p;
}

/** The player's choice in Chula: Pick One to Save Two. */
export type PlayerChoice = 'best' | 'random';

export interface BotAttempt {
  personnel: BotPersonnel[];
  requirements: RequirementBranch[];
  /** The copies of Chula: The Game already on the mission. */
  gameOnMission: number;
  choice: PlayerChoice;
  /**
   * The personnel whose partner gains `playStack` settles again before each dilemma (#1357), from
   * `partnerGroupOf`. Absent or empty: no personnel has a partner gain, and `playStack` reads
   * `personnel` as it is.
   */
  livePartners?: LivePartnerProfile[];
}

/** A partner gain that some partners of the group can meet, as plain numbers for `playStack`. */
export interface LivePartnerGain {
  skills: number[];
  attrs: [number, number, number];
  /** `'attempting'`: it counts in the requirement profile too. `'facing'`: in the dilemma profile only. */
  attempting: boolean;
  /** The indexes into `BotAttempt.personnel` of the partners that pass its test. */
  partners: number[];
  count: number;
}

/** A personnel of `BotAttempt.personnel` with partner gains, and its profiles without them. */
export interface LivePartnerProfile {
  personnel: number;
  base: Profile;
  baseRequirement: Profile;
  gains: LivePartnerGain[];
}

export interface PlayResult {
  fail: boolean;
  stopped: number;
  returned: number;
}

export type Rand = () => number;

/** mulberry32: a small seeded PRNG, so a play can be repeated. */
export function seededRandom(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const OFFICER = SKILL_INDEX.officer;
const LEADERSHIP = SKILL_INDEX.leadership;
const HONOR = SKILL_INDEX.honor;

export interface Profile {
  skills: number[];
  attrs: [number, number, number];
}

function addGain(profile: Profile, gain: PersonnelGain) {
  gain.skills.forEach((level, i) => (profile.skills[i] += level));
  gain.attrs.forEach((delta, i) => (profile.attrs[i] += delta));
}

const listOf = (value: string | number | undefined, separator: string) =>
  String(value ?? '')
    .toLowerCase()
    .split(separator)
    .map((item) => item.trim())
    .filter(Boolean);

/** The fields of a card row that `partnerTraitsOf` reads. */
export interface TraitsRow {
  name: string;
  skills?: string | number;
  affiliation?: string | number;
  species?: string | number;
  keywords?: string | number;
  icons?: string | number;
}

/** The levels of the printed skills of a card row, indexed as `BOT_SKILLS`. */
function baseSkillsOf(text: string | number | undefined): number[] {
  const skills = new Array(BOT_SKILLS.length).fill(0);
  const pattern = /(\d+\s+)?([a-z]+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(String(text ?? '').toLowerCase())) !== null) {
    const i = SKILL_INDEX[match[2]];
    if (i !== undefined) skills[i] += match[1] ? parseInt(match[1], 10) : 1;
  }
  return skills;
}

/** The printed traits of a card row that a `PartnerTest` reads: a partner's, or a discard pile card's. */
export function partnerTraitsOf(card: TraitsRow, skills: number[] = baseSkillsOf(card.skills)): PartnerTraits {
  return {
    name: card.name.toLowerCase(),
    affiliation: String(card.affiliation ?? '').toLowerCase(),
    species: listOf(card.species, '/'),
    keywords: listOf(card.keywords, '.'),
    icons: String(card.icons ?? '').toLowerCase().match(/\[[a-z0-9]+\]/g) ?? [],
    skills,
  };
}

/**
 * A personnel of the card data (lowercased by `parseCardData`) as the bot reads it, attempting
 * `mission` (`attemptedMissionOf`). With no mission, only the gains with no mission condition count.
 * A gain that needs a partner is kept in `partnerGains`, not counted: only `withPartnerGains`, which
 * sees the group, counts it. A gain with a table condition counts while the condition holds on the
 * table of `facts` (#1352); with no facts, the dilemma lab's case, it always counts. While the condition
 * of a skill loss holds on the same terms (#1360), every skill is 0 in both profiles and the gains of
 * the loss's next ability do not count; `traits` keep the printed skills. With no facts the lab assumes
 * the loss holds, unless `lossSuspended`: the lab sets it for a deck where Sphere 117 holds (#1363), so
 * the loss does not apply while every other table condition still holds.
 */
export function botPersonnelOf(card: TraitsRow & {
  originalName?: string;
  cost: string | number;
  integrity: string | number;
  cunning: string | number;
  strength: string | number;
  skills: string | number;
  gametext?: string | number;
}, mission?: AttemptedMission, facts?: BotTableFacts, lossSuspended = false): BotPersonnel {
  const skills = baseSkillsOf(card.skills);
  const attrs: [number, number, number] = [Number(card.integrity) || 0, Number(card.cunning) || 0, Number(card.strength) || 0];
  // Both profiles are built here, once, never per play: `chooseStack` runs up to 500 × 500 plays.
  const facing = { skills: skills.slice(), attrs: [...attrs] as [number, number, number] };
  const requirement = { skills: skills.slice(), attrs: [...attrs] as [number, number, number] };
  const partnerGains: PersonnelGain[] = [];
  const loss = personnelLossOf(card);
  const lost = loss !== null && !lossSuspended && tableConditionHolds(loss.table, facts);
  if (lost) for (const profile of [facing, requirement]) profile.skills.fill(0);
  for (const gain of personnelGainsOf(card)) {
    if (lost && loss.nextAbility && gain.nextAbility) continue;
    if (!gainHoldsAt(gain, mission) || (gain.table && !tableConditionHolds(gain.table, facts))) continue;
    if (gain.partner) {
      partnerGains.push(gain);
      continue;
    }
    for (const profile of gain.condition === 'attempting' ? [facing, requirement] : [facing]) addGain(profile, gain);
  }
  return {
    name: card.originalName ?? card.name,
    cost: Number(card.cost) || 0,
    attrs: facing.attrs,
    skills: facing.skills,
    requirementProfile: requirement,
    traits: partnerTraitsOf(card, skills),
    ...(partnerGains.length ? { partnerGains } : {}),
  };
}

/** A gain of `group[personnel]` that needs `count` partners, and the other members that pass its test. */
export interface PartnerGainEntry {
  personnel: number;
  gain: PersonnelGain;
  /** The indexes of the other members of the group that pass one of the gain's partner tests. */
  partners: number[];
  count: number;
}

/**
 * The group step (#1356): each partner gain of each personnel of `group`, with the indexes of the
 * **other** members that pass its test. A personnel is never its own partner. All the string matching
 * of a partner test happens here, once per group, never in `playStack`.
 */
export function partnerGainEntriesOf(group: ReadonlyArray<BotPersonnel>): PartnerGainEntry[] {
  const entries: PartnerGainEntry[] = [];
  group.forEach((p, k) => {
    for (const gain of p.partnerGains ?? []) {
      const partner = gain.partner!;
      const partners: number[] = [];
      group.forEach((other, j) => {
        if (j !== k && other.traits && partner.anyOf.some((test) => passesPartnerTest(test, other.traits!))) partners.push(j);
      });
      entries.push({ personnel: k, gain, partners, count: partner.count });
    }
  });
  return entries;
}

/**
 * The group step (#1356, #1357): `personnel` is `group` with each partner gain whose count of partners
 * is met counted in the profiles its condition names, against the whole group as the attempt starts,
 * every personnel unstopped. `livePartners` keeps, for `playStack`, the base profiles and the gains
 * of each personnel with a gain that some partners can meet, so it can settle them again against the
 * unstopped personnel before each dilemma. Call it once per group: the table's `botAttemptOf` and the
 * lab both do.
 */
export function partnerGroupOf(group: BotPersonnel[]): Pick<BotAttempt, 'personnel' | 'livePartners'> {
  const met = partnerGainEntriesOf(group).filter((e) => e.partners.length >= e.count);
  if (!met.length) return { personnel: group };
  const out = group.slice();
  const live = new Map<number, LivePartnerProfile>();
  for (const { personnel: k, gain, partners, count } of met) {
    const p = out[k];
    const requirement = requirementProfileOf(p);
    const facing: Profile = { skills: p.skills.slice(), attrs: [...p.attrs] as [number, number, number] };
    const required: Profile = { skills: requirement.skills.slice(), attrs: [...requirement.attrs] as [number, number, number] };
    const attempting = gain.condition === 'attempting';
    for (const profile of attempting ? [facing, required] : [facing]) addGain(profile, gain);
    out[k] = { ...p, attrs: facing.attrs, skills: facing.skills, requirementProfile: required };

    if (!live.has(k)) {
      const base = requirementProfileOf(group[k]);
      live.set(k, {
        personnel: k,
        base: { skills: group[k].skills.slice(), attrs: [...group[k].attrs] as [number, number, number] },
        baseRequirement: { skills: base.skills.slice(), attrs: [...base.attrs] as [number, number, number] },
        gains: [],
      });
    }
    live.get(k)!.gains.push({ skills: gain.skills.slice(), attrs: [...gain.attrs] as [number, number, number], attempting, partners, count });
  }
  return { personnel: out, livePartners: Array.from(live.values()) };
}

/** The personnel of `partnerGroupOf(group)`: the partner gains settled as the attempt starts. */
export function withPartnerGains(group: BotPersonnel[]): BotPersonnel[] {
  return partnerGroupOf(group).personnel;
}

/**
 * Play `stack` once. Before each dilemma, each copy of Chula: The Game on the mission stops one random
 * unstopped personnel: every title of the pile begins with "Chula". When every personnel is stopped, the
 * rest of the stack is not faced. `trace`, when given, gets one line for each event.
 *
 * With `attempt.livePartners`, the partner gains are live (#1357): after those stops, and only when a
 * personnel was stopped or returned since, each dilemma profile with partner gains is settled again
 * against the unstopped personnel, so a partner that a dilemma removes ends the gain from the next
 * dilemma on. The requirements check reads the `'attempting'` gains settled against the final unstopped
 * personnel, and `bestPickOne` against each set it tests.
 */
export function playStack(
  attempt: BotAttempt,
  stack: DilemmaId[],
  rand: Rand,
  trace?: (line: string) => void,
): PlayResult {
  const { requirements, livePartners } = attempt;
  let group = attempt.personnel;
  const requirementGroup = group.map(requirementProfileOf);
  const n = group.length;
  const alive = new Uint8Array(n).fill(1);
  let live = n;
  let stopped = 0;
  let returned = 0;
  let copies = attempt.gameOnMission;
  const name = (k: number) => group[k].name;

  // The working profiles of the personnel with partner gains, allocated once per play. Every other
  // index reads the attempt's own profiles.
  const partnered = livePartners?.length ? livePartners : null;
  let dirty = false;
  if (partnered) {
    group = group.slice();
    for (const { personnel: k } of partnered) {
      const p = group[k];
      group[k] = { name: p.name, cost: p.cost, attrs: [...p.attrs] as [number, number, number], skills: p.skills.slice() };
      const r = requirementGroup[k];
      requirementGroup[k] = { attrs: [...r.attrs] as [number, number, number], skills: r.skills.slice() };
    }
    dirty = true;
  }
  /** Settle the dilemma profiles, or with `requirement` the requirement profiles, against `alive`. */
  const settle = (requirement: boolean) => {
    for (const { personnel: k, base, baseRequirement, gains } of partnered!) {
      const from = requirement ? baseRequirement : base;
      const to = requirement ? requirementGroup[k] : group[k];
      for (let i = 0; i < from.skills.length; i++) to.skills[i] = from.skills[i];
      for (let i = 0; i < 3; i++) to.attrs[i] = from.attrs[i];
      for (const gain of gains) {
        if (requirement && !gain.attempting) continue;
        let present = 0;
        for (const j of gain.partners) present += alive[j];
        if (present < gain.count) continue;
        for (let i = 0; i < gain.skills.length; i++) to.skills[i] += gain.skills[i];
        for (let i = 0; i < 3; i++) to.attrs[i] += gain.attrs[i];
      }
    }
  };
  const settleRequirements = partnered ? () => settle(true) : undefined;

  const stop = (k: number) => {
    alive[k] = 0;
    live--;
    stopped++;
    dirty = true;
  };
  const stopAll = (ks: number[], why: string) => {
    ks.forEach(stop);
    trace?.(`  ${why}: stops ${ks.map(name).join(', ')}`);
  };
  /** Up to `count` different unstopped personnel, in a random order. */
  const select = (count: number): number[] => {
    const pool: number[] = [];
    for (let k = 0; k < n; k++) if (alive[k]) pool.push(k);
    const take = Math.min(count, pool.length);
    for (let i = 0; i < take; i++) {
      const j = i + Math.floor(rand() * (pool.length - i));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, take);
  };

  for (const id of stack) {
    if (live === 0) {
      trace?.(`${id}: not faced, every personnel is stopped`);
      continue;
    }
    trace?.(`${id}:`);
    for (let c = 0; c < copies && live > 0; c++) {
      const [k] = select(1);
      stop(k);
      trace?.(`  Chula: The Game on the mission stops ${name(k)}`);
    }
    if (live === 0) continue;
    if (dirty && partnered) {
      settle(false);
      dirty = false;
    }

    switch (id) {
      case 'game':
        copies++;
        trace?.(`  goes onto the mission (${copies} there now)`);
        break;
      case 'echoes':
      case 'moveAlongHome': {
        const attr = id === 'echoes' ? 1 : 2;
        const ks = select(3);
        const highest = Math.max(...ks.map((k) => group[k].attrs[attr]));
        const label = `selects ${ks.map(name).join(', ')}, highest ${attr === 1 ? 'Cunning' : 'Strength'} ${highest}`;
        if (highest % 2 === 0) stopAll(ks, label);
        else trace?.(`  ${label}: odd, no effect`);
        break;
      }
      case 'unfortunateRoll': {
        const ks = select(3);
        const total = ks.reduce((s, k) => s + group[k].attrs[0], 0);
        const label = `selects ${ks.map(name).join(', ')}, total Integrity ${total}`;
        if (total % 2 === 1) stopAll(ks, label);
        else trace?.(`  ${label}: even, no effect`);
        break;
      }
      case 'trickery': {
        const ks = select(3);
        const officer = ks.reduce((s, k) => s + group[k].skills[OFFICER], 0);
        const different = BOT_SKILLS.filter((_, i) => ks.some((k) => group[k].skills[i] > 0)).length;
        const label = `selects ${ks.map(name).join(', ')}, ${officer} Officer, ${different} different skills`;
        if (officer >= 2 || different >= 12) trace?.(`  ${label}: no effect`);
        else stopAll(ks, label);
        break;
      }
      case 'dice': {
        if (diceMet(group, alive)) trace?.('  the group has Integrity>6, Cunning>6 and Strength>6: no effect');
        else stopAll(select(n), 'the group lacks Integrity>6, Cunning>6 and Strength>6');
        break;
      }
      case 'chandra': {
        // Select until a personnel has a cost equal to or greater than the first. No personnel is selected twice.
        const order = select(n);
        const first = group[order[0]].cost;
        let last = 0;
        for (let i = 1; i < order.length; i++) {
          last = i;
          if (group[order[i]].cost >= first) break;
        }
        stopAll(order.slice(0, last + 1), `first cost ${first}`);
        break;
      }
      case 'precipice': {
        if (live % 2 === 1) {
          trace?.(`  ${live} personnel, an odd number: no effect`);
          break;
        }
        const order = select(n);
        const halves = [order.slice(0, live / 2), order.slice(live / 2)];
        if (halves.some((h) => precipiceHalfMet(group, h))) {
          trace?.('  one half has Leadership, Cunning>5 and Honor: no effect');
        } else {
          stopAll(halves[rand() < 0.5 ? 0 : 1], 'no half has Leadership, Cunning>5 and Honor');
        }
        break;
      }
      case 'pickOne': {
        const ks = select(3);
        const option = attempt.choice === 'random' ? Math.floor(rand() * (ks.length + 1)) - 1 : bestPickOne(requirements, requirementGroup, alive, ks, settleRequirements);
        if (option < 0) {
          stopAll(ks, `selects ${ks.map(name).join(', ')}; the player stops all`);
        } else {
          alive[ks[option]] = 0;
          live--;
          returned++;
          dirty = true;
          trace?.(`  selects ${ks.map(name).join(', ')}; the player returns ${name(ks[option])} to the hand`);
        }
        break;
      }
    }
  }

  settleRequirements?.();
  const fail = !meetsRequirements(requirements, requirementGroup, alive);
  trace?.(fail ? 'The attempt fails.' : 'The unstopped personnel meet the mission requirements.');
  return { fail, stopped, returned };
}

/**
 * The player's best choice without sight of the rest of the stack: return the first personnel whose
 * loss keeps the mission requirements met, read on the requirements profiles in `group`; when no
 * return does, stop all three, which is no lasting damage. `settle`, when given, settles the partner
 * gains of `group` against `alive` before each test.
 * Returns the index into `ks` to return, or -1 to stop all three.
 */
function bestPickOne(
  requirements: RequirementBranch[],
  group: RequirementPersonnel[],
  alive: Uint8Array,
  ks: number[],
  settle?: () => void,
): number {
  for (let i = 0; i < ks.length; i++) {
    alive[ks[i]] = 0;
    settle?.();
    const ok = meetsRequirements(requirements, group, alive);
    alive[ks[i]] = 1;
    if (ok) return i;
  }
  return -1;
}

function diceMet(group: BotPersonnel[], alive: Uint8Array): boolean {
  const n = group.length;
  for (let a = 0; a < n; a++) {
    if (!alive[a] || group[a].attrs[0] <= 6) continue;
    for (let b = 0; b < n; b++) {
      if (b === a || !alive[b] || group[b].attrs[1] <= 6) continue;
      for (let c = 0; c < n; c++) {
        if (c !== a && c !== b && alive[c] && group[c].attrs[2] > 6) return true;
      }
    }
  }
  return false;
}

function precipiceHalfMet(group: BotPersonnel[], half: number[]): boolean {
  return half.some((a) =>
    group[a].skills[LEADERSHIP] > 0 &&
    half.some((b) =>
      b !== a &&
      group[b].attrs[1] > 5 &&
      half.some((c) => c !== a && c !== b && group[c].skills[HONOR] > 0),
    ),
  );
}
