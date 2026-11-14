// The attributes on the table that differ from the printed ones (#1666), for the bands of the
// personnel and the ships (`PersonnelOverlay`, `ShipOverlay`) and the Range box of a whole ship card
// (`ShipRangeLeftBox`). `PracticeTable` builds the map once per table and shares it through
// `RangeUsedContext`. With the setting "Apply card text to attributes" off (#1668) the map is empty,
// and every card shows its printed values.

import type { CardInstance } from './tableReducer';
import { type AttributeTable, personnelAttributesOnTable, shipAttributesOnTable } from './attributeModels';
import { isPersonnel } from './rangeModels';
import { shipRangeOnTable } from './shipRange';

export interface AttributesOnTable {
  integrity?: number;
  cunning?: number;
  strength?: number;
  range?: number;
  weapons?: number;
  shields?: number;
}

export type AttributeDirection = 'up' | 'down';

// A printed value as a number, or null when it is blank or not a number (a printed "—"): such a
// value never shows as modified.
export function printedNumber(value: unknown): number | null {
  const text = String(value ?? '').trim();
  if (text === '') return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

// Whether a value on the table rose or fell from the printed value, or neither.
export function attributeDirection(onTable: number | undefined, printed: unknown): AttributeDirection | undefined {
  const base = printedNumber(printed);
  if (onTable === undefined || base === null || onTable === base) return undefined;
  return onTable > base ? 'up' : 'down';
}

// The fields of `values` that differ from the card's printed values, or null when none does.
function modifiedOf(card: CardInstance, values: AttributesOnTable): AttributesOnTable | null {
  const out: AttributesOnTable = {};
  let any = false;
  for (const key of Object.keys(values) as (keyof AttributesOnTable)[]) {
    if (attributeDirection(values[key], card.card?.[key]) === undefined) continue;
    out[key] = values[key];
    any = true;
  }
  return any ? out : null;
}

const NONE: Record<string, AttributesOnTable> = {};

// The modified attributes of every personnel at a mission (in an away team or a crew) and of every
// ship on a ship row, by the card's instance id. A card whose values all equal the printed ones has
// no entry, nor has a card the readers do not cover (the hand, a pile, the brig, the discard).
export function attributesOnTableOf(table: AttributeTable, cardText: boolean): Record<string, AttributesOnTable> {
  if (!cardText) return NONE;
  const { missions } = table;
  const map: Record<string, AttributesOnTable> = {};
  const addPersonnel = (p: CardInstance) => {
    if (!isPersonnel(p)) return;
    const modified = modifiedOf(p, personnelAttributesOnTable(table, p, true));
    if (modified) map[p.id] = modified;
  };
  for (const slot of missions) {
    slot.awayTeam.forEach(addPersonnel);
    for (const ship of slot.ships) {
      (ship.crew ?? []).forEach(addPersonnel);
      const modified = modifiedOf(ship, {
        range: shipRangeOnTable(table, ship, true),
        ...shipAttributesOnTable(table, ship, true),
      });
      if (modified) map[ship.id] = modified;
    }
  }
  return Object.keys(map).length > 0 ? map : NONE;
}
