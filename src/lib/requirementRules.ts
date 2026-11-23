// The cards in play that change the requirements of the player's missions (#1828), one rule that the
// practice table (the bot's requirements and the cost facts) and the deck builder's requirement analysis
// both read, so the two never disagree. A rule is the `requirements` ability of a row of the mission registry
// (#1907), named by the whole title of its card.
//
// Crescent Nebula Take Out the Trash: "Add Intelligence to the requirements of each of your other non-[Fed]
// missions." Every mission of a deck, or of the table, is the player's.

import { abilityOf, missionModelOfCard } from './missionModels';
import { parseMissionRequirements, type ParsedMissionRequirements } from './missionRequirements';

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

/**
 * The skills the cards in play add to the requirements of each mission of `missions`, by index, in the
 * case of the rules' text ("Intelligence"). An empty slot gets none.
 */
export function addedRequirements(missions: readonly (RequirementMission | null | undefined)[]): string[][] {
  // The slots of the missions with a `requirements` ability, each with its change.
  const rules = missions.flatMap((m, i) => {
    const ability = abilityOf(missionModelOfCard(m), 'requirements');
    return ability ? [{ slot: i, change: ability.requirements }] : [];
  });
  return missions.map((m, i) => {
    if (!m || !hasRequirements(m)) return [];
    const added: string[] = [];
    for (const { slot, change } of rules) {
      if (slot === i || (change.exceptIcon && attemptableBy(m, change.exceptIcon))) continue;
      for (const skill of change.add) if (!added.includes(skill)) added.push(skill);
    }
    return added;
  });
}

/**
 * The requirement text with `added` skills, which every branch needs: "Intelligence, (Anthropology or Law)".
 * The printed text goes in parentheses, so an "or" in it keeps the added skill in each branch.
 */
export const requirementTextWith = (skills: string, added: readonly string[]): string =>
  added.length ? `${added.join(', ')}, (${skills})` : skills;

/** The requirement text of each mission of `missions` on the table, as the cards in play change it. */
export const requirementTextsOf = (missions: readonly (RequirementMission | null | undefined)[]): string[] => {
  const added = addedRequirements(missions);
  return missions.map((m, i) => requirementTextWith(String(m?.skills ?? ''), added[i]));
};

/**
 * The deck builder's parsed requirements of each mission of a deck (#1828), with the skills the deck's
 * cards add counted among the skills every branch needs.
 */
export function parsedRequirementsOf(missions: readonly RequirementMission[]): ParsedMissionRequirements[] {
  const added = addedRequirements(missions);
  return missions.map((m, i) => {
    const parsed = parseMissionRequirements(String(m.skills ?? ''));
    const mandatory = { ...parsed.mandatory };
    for (const skill of added[i]) mandatory[skill.toLowerCase()] = (mandatory[skill.toLowerCase()] ?? 0) + 1;
    return { ...parsed, mandatory };
  });
}
