// The cards in play that change the requirements of the player's missions (#1828), one rule that the
// practice table (the bot's requirements and the cost facts) and the deck builder's requirement analysis
// both read, so the two never disagree. A rule is the `requirements` ability of a row of the mission registry
// (#1907), named by the whole title of its card.
//
// Crescent Nebula Take Out the Trash: "Add Intelligence to the requirements of each of your other non-[Fed]
// missions." Every mission of a deck, or of the table, is the player's.
//
// Gelyan Moon Harness Omega Particle and Rura Penthe Escape Gulag (#1909): "Your [Fed] personnel may attempt this
// mission, replacing its requirements during that attempt with …". The bot reads the replacement during an attempt
// whose every unstopped attempting personnel is of that affiliation (`replacedRequirementsOf`); the deck builder
// offers it as one more branch of the mission's requirements (`parsedRequirementsOf`). The skills another card
// adds apply to the replacement too.
//
// A card in play that is no mission changes requirements too (#1837): a row of `CARD_REQUIREMENT_ROWS`, by the whole
// title of a card of the core. Renewal Scroll: "Order - Place a personnel from your discard pile on this event to add
// one of their skills (…) to the requirements of each mission in play. This effect lasts until you lose command of
// this event or this order is executed again." Its skill is the choice its order recorded on the card (`named`), which
// any move of the card clears, so the change ends when it leaves the core. The deck builder sees no table, so it
// passes no cards.

import { cardTitleOf } from './cardTitle';
import { abilityOf, missionModelOfCard } from './missionModels';
import { parseMissionRequirements, type ParsedMissionRequirements, type SkillMap } from './missionRequirements';

/** A mission as both the deck builder's rows and the table's cards hold it; the card data is lowercased. */
export interface RequirementMission {
  name?: string;
  originalName?: string;
  affiliation?: string;
  missiontype?: string;
  skills?: string;
}

// A mission that may be attempted by `icon` ("[fed]") names it among its affiliations; an "(except [Fed])" does not.
const attemptableBy = (m: RequirementMission, icon: string): boolean =>
  String(m.affiliation ?? '')
    .replace(/\(except[^)]*\)/gi, '')
    .toLowerCase()
    .includes(icon.toLowerCase());

// A mission with requirements: no headquarters, and a requirement text.
const hasRequirements = (m: RequirementMission): boolean =>
  String(m.missiontype ?? '').toLowerCase().charAt(0) !== 'h' && String(m.skills ?? '').trim() !== '';

/** A card in play that is no mission, as a requirement row reads it: its whole title and its recorded choice. */
export interface RequirementCard {
  title: string;
  /** The choice an order or a play recorded on the card (`CardInstance.named`): a skill, "Diplomacy". */
  named?: string;
}

/**
 * A card that adds a skill to the requirements of missions (#1837): its whole title, the clause, which missions
 * (`each`: every mission in play with requirements) and the skill it adds (`named`: the card's recorded choice).
 */
export interface CardRequirementRow {
  title: string;
  text: string;
  missions: 'each';
  add: 'named';
}

export const CARD_REQUIREMENT_ROWS: CardRequirementRow[] = [
  {
    title: 'Renewal Scroll',
    text: 'Order - Place a personnel from your discard pile on this event to add one of their skills (except Acquisition, Intelligence, Law, or Telepathy) to the requirements of each mission in play.',
    missions: 'each',
    add: 'named',
  },
];

const CARD_ROWS = new Map(CARD_REQUIREMENT_ROWS.map((r) => [r.title.toLowerCase(), r]));

/** The requirement row of a card in play, by its whole title, or undefined. */
export const cardRequirementRowOf = (title: string): CardRequirementRow | undefined => CARD_ROWS.get(cardTitleOf(title).toLowerCase());

// The skills the cards of `cards` add to every mission with requirements, in the order of the cards.
function cardAdds(cards: readonly (RequirementCard | null | undefined)[]): string[] {
  const added: string[] = [];
  for (const c of cards) {
    if (!c?.named || !cardRequirementRowOf(c.title)) continue;
    if (!added.includes(c.named)) added.push(c.named);
  }
  return added;
}

/**
 * The skills the cards in play add to the requirements of each mission of `missions`, by index, in the
 * case of the rules' text ("Intelligence"). An empty slot gets none. `cards` are the cards in play that are no
 * mission, the core (#1837); the deck builder passes none.
 */
export function addedRequirements(
  missions: readonly (RequirementMission | null | undefined)[],
  cards: readonly (RequirementCard | null | undefined)[] = []
): string[][] {
  const fromCards = cardAdds(cards);
  // The slots of the missions with a `requirements` ability, each with its change.
  const rules = missions.flatMap((m, i) => {
    const change = abilityOf(missionModelOfCard(m), 'requirements')?.requirements;
    return change?.kind === 'add' ? [{ slot: i, change }] : [];
  });
  return missions.map((m, i) => {
    if (!m || !hasRequirements(m)) return [];
    const added: string[] = [];
    for (const { slot, change } of rules) {
      if (slot === i || (change.exceptIcon && attemptableBy(m, change.exceptIcon))) continue;
      for (const skill of change.add) if (!added.includes(skill)) added.push(skill);
    }
    for (const skill of fromCards) if (!added.includes(skill)) added.push(skill);
    return added;
  });
}

/** The replacement of a mission's own requirements (#1909), or undefined for a mission with none. */
export function requirementReplacementOf(m: RequirementMission | null | undefined): { icon: string; affiliation: string; skills: string } | undefined {
  const change = abilityOf(missionModelOfCard(m), 'requirements')?.requirements;
  return change?.kind === 'replace' ? { icon: change.icon, affiliation: change.affiliation, skills: change.skills } : undefined;
}

/**
 * The requirement text that replaces the mission's own during an attempt by `attempting`, the affiliations of the
 * unstopped attempting personnel as the card data has them (#1909): the replacement when there is at least one and
 * every one has the replacement's affiliation, "federation" in "federation/bajoran" too; undefined otherwise.
 */
export function replacedRequirementsOf(m: RequirementMission | null | undefined, attempting: readonly string[]): string | undefined {
  const replace = requirementReplacementOf(m);
  if (!replace || !attempting.length) return undefined;
  return attempting.every((a) => String(a).toLowerCase().includes(replace.affiliation)) ? replace.skills : undefined;
}

/**
 * The requirement text with `added` skills, which every branch needs: "Intelligence, (Anthropology or Law)".
 * The printed text goes in parentheses, so an "or" in it keeps the added skill in each branch.
 */
export const requirementTextWith = (skills: string, added: readonly string[]): string =>
  added.length ? `${added.join(', ')}, (${skills})` : skills;

/** The requirement text of each mission of `missions` on the table, as the cards in play change it. */
export const requirementTextsOf = (
  missions: readonly (RequirementMission | null | undefined)[],
  cards: readonly (RequirementCard | null | undefined)[] = []
): string[] => {
  const added = addedRequirements(missions, cards);
  return missions.map((m, i) => requirementTextWith(String(m?.skills ?? ''), added[i]));
};

/**
 * The deck builder's parsed requirements of each mission of a deck (#1828), with the skills the deck's
 * cards add counted among the skills every branch needs.
 */
export function parsedRequirementsOf(missions: readonly RequirementMission[]): ParsedMissionRequirements[] {
  const added = addedRequirements(missions);
  return missions.map((m, i) => {
    const printed = parseMissionRequirements(String(m.skills ?? ''));
    const replace = requirementReplacementOf(m);
    const parsed = replace ? withBranch(printed, parseMissionRequirements(replace.skills)) : printed;
    const mandatory = { ...parsed.mandatory };
    for (const skill of added[i]) mandatory[skill.toLowerCase()] = (mandatory[skill.toLowerCase()] ?? 0) + 1;
    return { ...parsed, mandatory };
  });
}

// The whole skills of each branch of `p`: its mandatory skills with each branch's, or the mandatory alone.
const wholeBranches = (p: ParsedMissionRequirements): SkillMap[] =>
  p.orBranches ? p.orBranches.map((b) => sumSkills(p.mandatory, b)) : [p.mandatory];

function sumSkills(a: SkillMap, b: SkillMap): SkillMap {
  const out: SkillMap = { ...a };
  for (const [k, n] of Object.entries(b)) out[k] = (out[k] ?? 0) + n;
  return out;
}

/**
 * `p` with the whole requirements of `extra` as one more branch (#1909): the mandatory skills are those every branch
 * needs, at the least count among them, and each branch keeps what it needs beyond them.
 */
function withBranch(p: ParsedMissionRequirements, extra: ParsedMissionRequirements): ParsedMissionRequirements {
  const branches = [...wholeBranches(p), ...wholeBranches(extra)];
  const mandatory: SkillMap = {};
  for (const k of Object.keys(branches[0])) {
    if (branches.every((b) => b[k] !== undefined)) mandatory[k] = Math.min(...branches.map((b) => b[k]));
  }
  const orBranches = branches.map((b) => {
    const rest: SkillMap = {};
    for (const [k, n] of Object.entries(b)) if (n - (mandatory[k] ?? 0) > 0) rest[k] = n - (mandatory[k] ?? 0);
    return rest;
  });
  return { mandatory, orBranches };
}
