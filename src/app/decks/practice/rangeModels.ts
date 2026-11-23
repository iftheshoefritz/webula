// The range and span titles (#1635): the cards whose game text changes the Range of a ship or the span total of a
// move, now modifier rows of `src/lib/modifiers` (#1887), and the tests of a card instance that the practice table
// reads. A module with no import of `tableReducer.ts` but its types, so `MissionRow` reads it
// without loading the reducer and its `@dnd-kit/sortable` import.

import { modifierTitles } from '../../../lib/modifiers';
import { rowTitleKey } from '../../../lib/modifiers/words';
import type { CardInstance, TableState } from './tableReducer';

// The personnel the player commands, a selector of the view now (#1878).
export { commandedPersonnel } from './tableView';

// What the range readers are given of the table as it stands (#1671): the mission slots with their away
// teams and ships, the discard pile (Groumall), the core (Jasad, #1683), the brig (I.K.S. Qel'Poh
// Clandestine Vessel, #1684) and the hand (I.S.S. Enterprise Terran Flagship). The readers build the
// table view of it once (#1878), and the modifier rows read the view.
export type RangeTable = Pick<TableState, 'missions' | 'discard' | 'core' | 'brig' | 'hand'>;

export const isPersonnel = (card: CardInstance) => String(card.card?.type ?? '').toLowerCase() === 'personnel';

/** The title of a card instance, lowercased, less its version suffix. */
export const titleKeyOf = (card: CardInstance | null | undefined): string => rowTitleKey(card?.card);

/**
 * The titles with a modifier row of Range, of the span total or of the 2 between quadrants, by title lowercased:
 * a read-only index of the rows (#1887), as `ATTRIBUTE_REGISTRY` is.
 */
export const RANGE_SPAN_REGISTRY: ReadonlyMap<string, { title: string }> = modifierTitles(['range', 'span', 'quadrantWaiver']);

/** The range or span title of a card, by its title less the version suffix, or undefined for a title with no row. */
export const rangeSpanModelOf = (card: CardInstance | null | undefined): { title: string } | undefined =>
  card ? RANGE_SPAN_REGISTRY.get(titleKeyOf(card)) : undefined;
