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
import { BOT_SKILLS, RequirementPersonnel, SKILL_INDEX } from './requirements';
import { cardTitleOf } from '../cardTitle';

// The personnel of the dilemma bot (#1282, #1287): each attempting card as the profiles the pile
// bot's play reads (`pile/play.ts`), the partner gains settled against the group, and the seeded
// random of every play.

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

/** A partner gain that some partners of the group can meet, as plain numbers for `playPileStack`. */
export interface LivePartnerGain {
  skills: number[];
  attrs: [number, number, number];
  /** `'attempting'`: it counts in the requirement profile too. `'facing'`: in the dilemma profile only. */
  attempting: boolean;
  /** The indexes into `PileAttempt.personnel` of the partners that pass its test. */
  partners: number[];
  count: number;
}

/** A personnel of `PileAttempt.personnel` with partner gains, and its profiles without them. */
export interface LivePartnerProfile {
  personnel: number;
  base: Profile;
  baseRequirement: Profile;
  gains: LivePartnerGain[];
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
  // Both profiles are built here, once, never per play: `choosePileStack` plays one attempt thousands of times.
  const facing = { skills: skills.slice(), attrs: [...attrs] as [number, number, number] };
  const requirement = { skills: skills.slice(), attrs: [...attrs] as [number, number, number] };
  const partnerGains: PersonnelGain[] = [];
  const loss = personnelLossOf(card);
  const lost = loss !== null && !lossSuspended && tableConditionHolds(loss.table, facts);
  if (lost) for (const profile of [facing, requirement]) profile.skills.fill(0);
  // A title whose attributes the table already reads (#1667) keeps only the skills of its gains.
  const attrsOnRow = facts?.attributeTitles?.includes(cardTitleOf(String(card.originalName ?? card.name)).toLowerCase()) ?? false;
  for (const parsed of personnelGainsOf(card)) {
    const gain: PersonnelGain = attrsOnRow ? { ...parsed, attrs: [0, 0, 0] } : parsed;
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
 * of a partner test happens here, once per group, never in `playPileStack`.
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
 * every personnel unstopped. `livePartners` keeps, for `playPileStack`, the base profiles and the gains
 * of each personnel with a gain that some partners can meet, so it can settle them again against the
 * unstopped personnel before each dilemma. Call it once per group: the table's `pileAttemptOf` and the
 * lab both do.
 */
export function partnerGroupOf<P extends BotPersonnel>(group: P[]): { personnel: P[]; livePartners?: LivePartnerProfile[] } {
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

