// The cards in play that change the requirements of the player's missions (#1828), one rule that the
// practice table (the bot's requirements and the cost facts) and the deck builder's requirement analysis
// both read, so the two never disagree. A rule is named by the whole title of its card.
//
// Crescent Nebula Take Out the Trash: "Add Intelligence to the requirements of each of your other non-[Fed]
// missions." Every mission of a deck, or of the table, is the player's.

import { cardTitleOf } from './cardTitle';
import { parseMissionRequirements, type ParsedMissionRequirements } from './missionRequirements';

/** A mission as both the deck builder's rows and the table's cards hold it; the card data is lowercased. */
export interface RequirementMission {
  name?: string;
  originalName?: string;
  affiliation?: string;
  missiontype?: string;
  skills?: string;
}

const CRESCENT_NEBULA = 'crescent nebula take out the trash';

const titleOf = (m: RequirementMission): string => cardTitleOf(String(m.originalName ?? m.name ?? '')).toLowerCase();

// A [Fed] mission names the [Fed] icon among the affiliations that may attempt it; an "(except [Fed])" does not.
const isFedMission = (m: RequirementMission): boolean =>
  /\[fed\]/i.test(String(m.affiliation ?? '').replace(/\(except[^)]*\)/gi, ''));

// A mission with requirements: no headquarters, and a requirement text.
const hasRequirements = (m: RequirementMission): boolean =>
  String(m.missiontype ?? '').toLowerCase().charAt(0) !== 'h' && String(m.skills ?? '').trim() !== '';

/**
 * The skills the cards in play add to the requirements of each mission of `missions`, by index, in the
 * case of the rules' text ("Intelligence"). An empty slot gets none.
 */
export function addedRequirements(missions: readonly (RequirementMission | null | undefined)[]): string[][] {
  const nebulae = missions.flatMap((m, i) => (m && titleOf(m) === CRESCENT_NEBULA ? [i] : []));
  return missions.map((m, i) => {
    if (!m || !hasRequirements(m)) return [];
    const added: string[] = [];
    if (nebulae.some((n) => n !== i) && !isFedMission(m)) added.push('Intelligence');
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
