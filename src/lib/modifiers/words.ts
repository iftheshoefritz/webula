// The word tests of the modifier rows (#1887), over the raw fields of a card's row, as the range and attribute
// models of #1635 and #1664 read them: a word inside a field, not the view's whole-value traits. A module of
// its own, so the rows and the practice table's instance helpers (`rangeModels.ts`) share them.

import { cardTitleOf } from '../cardTitle';
import { personnel, type TableView, type ViewCard, type ViewTableCard } from '../tableView';

const words = (field: unknown): string[] => String(field ?? '').toLowerCase().split(/[^a-z]+/).filter(Boolean);

/** Whether `word` is a whole word of `field`, in any case: `hasWord('[DS9][Fed]', 'fed')`. A digit splits words. */
export const hasWord = (field: unknown, word: string): boolean => words(field).includes(word);

/** The title of a row, lowercased, less its version suffix: the key of every per-title registry. */
export const rowTitleKey = (row: any): string => cardTitleOf(String(row?.originalName ?? row?.name ?? '')).toLowerCase();

/**
 * Whether a row is the card of the lore name in braces, such as {Remus}: its title is the name, or the name
 * followed by the mission's subtitle ("Remus Supervise Dilithium Mine").
 */
export const rowIsNamed = (row: any, name: string): boolean => {
  const title = rowTitleKey(row);
  const lore = name.toLowerCase();
  return title === lore || title.startsWith(`${lore} `);
};

/** A mission's quadrant, `'a'`, `'d'` or `'g'`, or `''` for a row with none. */
export const rowQuadrant = (row: any): string => String(row?.quadrant ?? '').trim().toLowerCase();

/** A personnel's species, lowercased, as the card data writes it ("jem'hadar"), or '' for none. */
export const speciesOf = (c: ViewCard): string => String(c.row?.species ?? '').trim().toLowerCase();

/** The printed value of a field, 0 when it has none. */
export const printedOf = (c: ViewCard, field: string): number => Number(c.row?.[field]) || 0;

export const isPersonnel = (c: ViewCard): boolean => c.type === 'personnel';
export const isShip = (c: ViewCard): boolean => c.type === 'ship';
export const isEquipment = (c: ViewCard): boolean => c.type === 'equipment';

export const hasIcon = (c: ViewCard, icon: string): boolean => hasWord(c.row?.icons, icon);
export const hasAffiliation = (c: ViewCard, affiliation: string): boolean => hasWord(c.row?.affiliation, affiliation);
export const hasSkill = (c: ViewCard, skill: string): boolean => hasWord(c.row?.skills, skill);
export const hasKeyword = (c: ViewCard, keyword: string): boolean => hasWord(c.row?.keywords, keyword);
/** An icon read whole, "[ds9]": `hasWord` drops the digit of "ds9". */
export const hasWholeIcon = (c: ViewCard, icon: string): boolean => String(c.row?.icons ?? '').toLowerCase().includes(icon);

/** A card with the crew of a ship: a ship of a ship row, or a ship off the table with its crew. */
export type CrewedCard = ViewCard & { crew?: ViewTableCard[] };

/** The personnel of a ship's crew. A stopped personnel is still aboard. */
export const crewPersonnel = (ship: CrewedCard): ViewTableCard[] => (ship.crew ?? []).filter(isPersonnel);

/** Whether three or more [Kli] Treachery personnel are aboard the ship, a stopped one too (I.K.S. Vorn Ship of Traitors). */
export const vornCrewed = (ship: CrewedCard): boolean =>
  crewPersonnel(ship).filter((p) => hasAffiliation(p, 'klingon') && hasSkill(p, 'treachery')).length >= 3;

/**
 * Whether the card `c` is at the mission of slot `index` (the view's `at`): in its away team, or in the crew of a
 * ship of its ship row. A stopped personnel is still there.
 */
export const hereAt = (view: TableView, index: number, c: ViewCard): boolean =>
  personnel(view, { unstopped: false, at: index }).some((p) => p.id === c.id);

/** Whether `c` is a personnel the player commands, stopped or not: in an away team or a crew. */
export const commanded = (view: TableView, c: ViewCard): boolean => personnel(view, { unstopped: false }).some((p) => p.id === c.id);

/** The personnel of `group` other than `self` that pass `test`. A stopped personnel still counts (#1667). */
export const othersIn = (self: ViewCard, group: ViewTableCard[], test: (p: ViewTableCard) => boolean): ViewTableCard[] =>
  group.filter((p) => p.id !== self.id && isPersonnel(p) && test(p));
