// The static modifiers (#1887, part 1 of #1864): the card texts that change a quantity of the table while their
// card is in play, "is attributes +1", "is Range +2", "do not add 2 to the span total", each one row of plain data:
// its source (the card's title and the place it must stand), its target (relative to the source), the quantities
// it changes and how, a condition, and a scope. One evaluator per quantity reads the rows over a `TableView`, in
// the order of the readers before them: for attributes and Range, the sum, then a floor at 0; for span, the
// waiver, the reductions, the floor, then the set values. It imports no React and nothing of the practice table
// (#1298); `attributeModels.ts` and `shipRange.ts` keep the public readers and build the view once.

import type { TableView, ViewCard, ViewMission, ViewShip, ViewTableCard } from '../tableView';
import { personnel } from '../tableView';
import type { AmountContext, AmountQuantity, Delta, ModifierCard, ModifierRow, Quantity, SourcePlace, TargetRelation } from './model';
import { ATTRIBUTE_ROWS } from './titles/attributes';
import { EVENT_AND_MISSION_ROWS } from './titles/eventsAndMissions';
import { SHIP_ROWS } from './titles/ships';
import { SPAN_ROWS } from './titles/span';
import { isEquipment, isPersonnel, printedOf, rowTitleKey } from './words';

export * from './model';

const AMOUNT_PLACES: Record<'attributes' | 'range' | 'span', [SourcePlace, TargetRelation][]> = {
  attributes: [
    ['self', 'self'],
    ['group', 'group'],
    ['shipRow', 'crew'],
    ['shipRow', 'any'],
    ['aboard', 'itsShip'],
    ['placedOnShip', 'itsShip'],
    ['commanded', 'shipsOnRows'],
    ['missionCard', 'any'],
    ['mission', 'any'],
    ['core', 'any'],
  ],
  range: [
    ['self', 'self'],
    ['aboard', 'itsShip'],
    ['placedOnShip', 'itsShip'],
    ['missionCard', 'any'],
    ['commanded', 'shipsOnRows'],
    ['core', 'shipsOnRows'],
  ],
  span: [
    ['moveMission', 'move'],
    ['moveShip', 'move'],
    ['core', 'move'],
  ],
};

const familyOf = (q: Quantity): keyof typeof AMOUNT_PLACES =>
  q === 'range' ? 'range' : q === 'span' || q === 'quadrantWaiver' ? 'span' : 'attributes';

/** Every row, by title. */
export const MODIFIER_ROWS: readonly ModifierRow[] = [...ATTRIBUTE_ROWS, ...EVENT_AND_MISSION_ROWS, ...SHIP_ROWS, ...SPAN_ROWS];

/**
 * The rows by title, lowercased. It throws for a row whose source and target no evaluator of one of its quantities
 * reads, for a span row with a condition, and for two rows of one title that change one quantity from one place.
 */
export function rowsByTitle(rows: readonly ModifierRow[]): ReadonlyMap<string, readonly ModifierRow[]> {
  const map = new Map<string, ModifierRow[]>();
  for (const r of rows) {
    const key = r.title.toLowerCase();
    const titled = map.get(key) ?? [];
    const quantities = Object.keys(r.changes) as Quantity[];
    if (r.condition && quantities.some((q) => familyOf(q) === 'span')) throw new Error(`"${r.title}" changes the span with a condition, which \`spanOf\` does not read`);
    for (const q of quantities) {
      if (!AMOUNT_PLACES[familyOf(q)].some(([s, t]) => s === r.source && t === r.target)) {
        throw new Error(`"${r.title}" changes ${q} from ${r.source} to ${r.target}, a place no evaluator reads`);
      }
      if (titled.some((o) => o.source === r.source && q in o.changes)) {
        throw new Error(`two rows of "${r.title}" change ${q} from ${r.source}`);
      }
    }
    titled.push(r);
    map.set(key, titled);
  }
  return map;
}

const ROWS_BY_TITLE = rowsByTitle(MODIFIER_ROWS);

/** The rows of a title, lowercased, less its version suffix. */
export const modifierRowsOf = (titleKey: string): readonly ModifierRow[] => ROWS_BY_TITLE.get(titleKey) ?? [];

/** The titles with a row of one of `quantities`, in the case of the card data, each once, in row order. */
export function modifierTitles(quantities: readonly Quantity[]): Map<string, { title: string }> {
  const map = new Map<string, { title: string }>();
  for (const r of MODIFIER_ROWS) {
    if (quantities.some((q) => q in r.changes) && !map.has(r.title.toLowerCase())) map.set(r.title.toLowerCase(), { title: r.title });
  }
  return map;
}

// The rows of `card` at `source` toward `target` that change `quantity`, and whose condition holds.
function rowsAt(view: TableView, card: ViewCard | null | undefined, source: SourcePlace, target: TargetRelation, quantity: Quantity): ModifierRow[] {
  if (!card) return [];
  return modifierRowsOf(rowTitleKey(card.row)).filter(
    (r) => r.source === source && r.target === target && quantity in r.changes && (!r.condition || r.condition.holds(view))
  );
}

const amountOf = (delta: Delta | undefined, c: AmountContext): number => (typeof delta === 'function' ? delta(c) : (delta ?? 0));

// A sum of the changes of `quantity`, each title once where a row says so.
function summer(quantity: AmountQuantity) {
  let sum = 0;
  const once = new Set<string>();
  return {
    add(view: TableView, card: ViewCard | null | undefined, source: SourcePlace, target: TargetRelation, c: Omit<AmountContext, 'view' | 'source'>) {
      if (!card) return;
      for (const r of rowsAt(view, card, source, target, quantity)) {
        if (r.eachTitleOnce) {
          if (once.has(r.title)) continue;
          once.add(r.title);
        }
        sum += amountOf(r.changes[quantity], { ...c, view, source: card });
      }
    },
    total: () => sum,
  };
}

/** The ship of a ship row with the id `id`, and its slot. */
export function shipOnRow(view: TableView, id: string): { slot: ViewMission; ship: ViewShip } | undefined {
  for (const slot of view.missions) {
    const ship = slot.ships.find((s) => s.id === id);
    if (ship) return { slot, ship };
  }
  return undefined;
}

/** The away team or the crew that holds the card `id`, with its slot and, for a crew, its ship; undefined elsewhere. */
export function groupOf(view: TableView, id: string): { slot: ViewMission; group: ViewTableCard[]; ship?: ViewShip; card: ViewTableCard } | undefined {
  for (const slot of view.missions) {
    const inTeam = slot.awayTeam.find((c) => c.id === id);
    if (inTeam) return { slot, group: slot.awayTeam, card: inTeam };
    for (const ship of slot.ships) {
      const inCrew = ship.crew.find((c) => c.id === id);
      if (inCrew) return { slot, group: ship.crew, ship, card: inCrew };
    }
  }
  return undefined;
}

/**
 * The Range of the ship `target` on the table (#1635, #1648, #1671, #1827): its printed Range, plus the rows of
 * itself, of the personnel of its crew, of the events placed on it and of the events placed on every mission card,
 * and for a ship on a ship row the rows of every personnel the player commands and of the core. Never below 0.
 * `target` is the view's ship when it is on a ship row, or the ship off the table with its crew.
 */
export function rangeOf(view: TableView, target: ModifierCard): number {
  const onRow = shipOnRow(view, target.id);
  const ship = onRow?.ship ?? target;
  const range = summer('range');
  const c = { target: ship, ship: onRow?.ship, rangeOf: (s: ModifierCard) => rangeOf(view, s) };
  range.add(view, ship, 'self', 'self', { ...c, slot: onRow?.slot });
  for (const p of ship.crew ?? []) range.add(view, p, 'aboard', 'itsShip', c);
  for (const event of ship.placedOn) range.add(view, event, 'placedOnShip', 'itsShip', c);
  for (const slot of view.missions) {
    if (!slot.card) continue;
    for (const event of slot.placedOn) range.add(view, event, 'missionCard', 'any', { ...c, slot });
  }
  if (onRow) {
    for (const p of personnel(view, { unstopped: false })) range.add(view, p, 'commanded', 'shipsOnRows', c);
    for (const event of view.core) range.add(view, event, 'core', 'shipsOnRows', c);
  }
  return Math.max(0, printedOf(ship, 'range') + range.total());
}

/**
 * An attribute of `target` on the table (#1664): its printed value, plus the rows of the events placed on each
 * mission card, each mission card, each ship of each ship row and each event of the core; for a card of an away
 * team or a crew, its own rows, the rows of the personnel and the equipment of its group (itself among them), and
 * its ship's rows of its crew; for a ship on a ship row, its own rows, the rows of its crew, of the events placed on
 * it, and of every personnel the player commands. Never below 0.
 */
export function attributeOf(view: TableView, target: ModifierCard, quantity: Exclude<AmountQuantity, 'range'>): number {
  const sum = summer(quantity);
  const rangeOfShip = (s: ModifierCard) => rangeOf(view, s);
  const base = { rangeOf: rangeOfShip };
  const place = groupOf(view, target.id);
  const onRow = shipOnRow(view, target.id);
  const self = place?.card ?? onRow?.ship ?? target;
  for (const slot of view.missions) {
    if (!slot.card) continue;
    for (const event of slot.placedOn) sum.add(view, event, 'missionCard', 'any', { ...base, target: self, slot });
    sum.add(view, slot.card, 'mission', 'any', { ...base, target: self, slot });
    for (const ship of slot.ships) sum.add(view, ship, 'shipRow', 'any', { ...base, target: self, slot, ship });
  }
  for (const event of view.core) sum.add(view, event, 'core', 'any', { ...base, target: self });
  if (place) {
    const c = { ...base, target: self, slot: place.slot, group: place.group, ship: place.ship };
    sum.add(view, self, 'self', 'self', c);
    for (const source of place.group) {
      if (isPersonnel(source) || isEquipment(source)) sum.add(view, source, 'group', 'group', c);
    }
    if (place.ship) sum.add(view, place.ship, 'shipRow', 'crew', c);
  }
  if (onRow) {
    const c = { ...base, target: onRow.ship, slot: onRow.slot, ship: onRow.ship };
    sum.add(view, onRow.ship, 'self', 'self', c);
    for (const p of onRow.ship.crew) sum.add(view, p, 'aboard', 'itsShip', c);
    for (const event of onRow.ship.placedOn) sum.add(view, event, 'placedOnShip', 'itsShip', c);
    for (const p of personnel(view, { unstopped: false })) sum.add(view, p, 'commanded', 'shipsOnRows', c);
  }
  return Math.max(0, printedOf(target, quantity) + sum.total());
}

/** What a move adds between two different quadrants (#1635). */
export const QUADRANT_SPAN = 2;

/**
 * The span total of a move of `ship` from the mission card `from` to `to` (#1635, #1648, #1827): the printed spans,
 * plus 2 when both slots hold a mission and their quadrants differ, unless a row of either mission, of the ship or
 * of the core waives it; then, when both slots hold a mission, the reductions of the core, a floor of 0, and the
 * set values of the core, in core order. With `cardText` false no row applies.
 */
export function spanOf(
  from: ViewCard | null,
  to: ViewCard | null,
  ship: ModifierCard,
  core: readonly ViewCard[],
  cardText: boolean
): number {
  const quadrant = (c: ViewCard) => String(c.row?.quadrant ?? '').trim().toLowerCase();
  const rows = (card: ViewCard, source: SourcePlace, q: Quantity) =>
    modifierRowsOf(rowTitleKey(card.row)).filter((r) => r.source === source && q in r.changes);
  let total = (from ? printedOf(from, 'span') : 0) + (to ? printedOf(to, 'span') : 0);
  if (from && to && quadrant(from) && quadrant(to) && quadrant(from) !== quadrant(to)) {
    const waives = (source: ViewCard, place: SourcePlace) =>
      rows(source, place, 'quadrantWaiver').some((r) => r.changes.quadrantWaiver?.({ source, from, to, ship }));
    const waived = cardText && (waives(from, 'moveMission') || waives(to, 'moveMission') || waives(ship, 'moveShip') || core.some((c) => waives(c, 'core')));
    if (!waived) total += QUADRANT_SPAN;
  }
  if (!from || !to || !cardText) return total;
  for (const source of core) {
    for (const r of rows(source, 'core', 'span')) {
      const change = r.changes.span;
      if (change && 'reduce' in change) total -= change.reduce({ source, from, to, ship });
    }
  }
  total = Math.max(0, total);
  for (const source of core) {
    for (const r of rows(source, 'core', 'span')) {
      const change = r.changes.span;
      if (change && 'set' in change) total = change.set({ source, from, to, ship }, total);
    }
  }
  return total;
}
