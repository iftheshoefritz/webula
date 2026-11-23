// The attribute readers (#1664): a personnel's Integrity, Cunning and Strength, and a ship's Weapons and
// Shields, on the table as it stands. The cards whose game text changes them are modifier rows of
// `src/lib/modifiers` (#1887), one or more per title less its version suffix (`cardTitleOf`), and
// `attributeOf` evaluates them over the table view. A module with no import of `tableReducer.ts` but its
// types, so `MissionRow` can read it without loading the reducer.

import { ATTRIBUTE_QUANTITIES, attributeOf, modifierTitles } from '../../../lib/modifiers';
import type { CardInstance, TableState } from './tableReducer';
import { titleKeyOf } from './rangeModels';
import { modifierCardOf, type TableRead, tableReadOf } from './tableView';

// What the attribute readers are given of the table as it stands (#1667): the mission slots with their
// away teams and ships, the core, the hand, the discard pile, the brig (#1684), the score and the Range used.
// The readers build the table view of it once (#1878), and the modifier rows read the view.
export type AttributeTable = Pick<TableState, 'missions' | 'core' | 'hand' | 'discard' | 'brig' | 'score' | 'rangeUsed'>;

export interface PersonnelAttributes {
  integrity: number;
  cunning: number;
  strength: number;
}

export interface ShipAttributes {
  weapons: number;
  shields: number;
}

/**
 * The titles with a modifier row of a personnel's attributes or a ship's Weapons or Shields, by title lowercased:
 * a read-only index of the rows (#1887). The bot reads its keys (`attributeTitles`).
 */
export const ATTRIBUTE_REGISTRY: ReadonlyMap<string, { title: string }> = modifierTitles(ATTRIBUTE_QUANTITIES);

/** The attribute title of a card, by its title less the version suffix, or undefined for a title with no row. */
export const attributeModelOf = (card: CardInstance | null | undefined): { title: string } | undefined =>
  card ? ATTRIBUTE_REGISTRY.get(titleKeyOf(card)) : undefined;

// A card with no printed value reads 0.
const printed = (card: CardInstance, field: string): number => Number(card.card?.[field]) || 0;

// A personnel's Integrity, Cunning and Strength on the table as it stands (#1664): the printed values
// plus every modifier row that applies, each never below 0. With `cardText` false, the setting
// "Apply card text to attributes" off (#1668), the printed values.
export function personnelAttributesOnTable(table: AttributeTable, p: CardInstance, cardText = true): PersonnelAttributes {
  return cardText
    ? personnelAttributesOf(tableReadOf(table), p)
    : { integrity: printed(p, 'integrity'), cunning: printed(p, 'cunning'), strength: printed(p, 'strength') };
}

// A personnel's attributes on the table that `read` holds (#1878), the card text on: `attributesOnTableOf`
// reads every card from one view.
export function personnelAttributesOf(read: TableRead, p: CardInstance): PersonnelAttributes {
  const target = modifierCardOf(p);
  return {
    integrity: attributeOf(read.view, target, 'integrity'),
    cunning: attributeOf(read.view, target, 'cunning'),
    strength: attributeOf(read.view, target, 'strength'),
  };
}

// A ship's Weapons and Shields on the table as it stands (#1664): the printed values plus every
// modifier row that applies, each never below 0. With `cardText` false (#1668), the printed values.
export function shipAttributesOnTable(table: AttributeTable, ship: CardInstance, cardText = true): ShipAttributes {
  return cardText ? shipAttributesOf(tableReadOf(table), ship) : { weapons: printed(ship, 'weapons'), shields: printed(ship, 'shields') };
}

// A ship's Weapons and Shields on the table that `read` holds (#1878), the card text on.
export function shipAttributesOf(read: TableRead, ship: CardInstance): ShipAttributes {
  const target = modifierCardOf(ship);
  return { weapons: attributeOf(read.view, target, 'weapons'), shields: attributeOf(read.view, target, 'shields') };
}
