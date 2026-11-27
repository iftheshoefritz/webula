// The static modifiers (#1887, part 1 of #1864): the card texts that change a quantity of the table while their
// card is in play, "is attributes +1", "is Range +2", "do not add 2 to the span total", each one row of plain data:
// its source (the card's title and the place it must stand), its target (relative to the source), the quantities
// it changes and how, a condition, and a scope. One evaluator per quantity reads the rows over a `TableView`, in
// the order of the readers before them: for attributes and Range, the sum, then a floor at 0; for span, the
// waiver, the reductions, the floor, then the set values. It imports no React and nothing of the practice table
// (#1298); `attributeModels.ts` and `shipRange.ts` keep the public readers and build the view once.

import type { TableView, ViewCard, ViewMission, ViewShip, ViewTableCard } from '../tableView';
import { cardHasTraits, personnel, regionsOf } from '../tableView';
import { countedAmount, PERMISSION_QUANTITIES } from './model';
import type { AmountContext, AmountQuantity, CountedChange, Delta, ModifierCard, ModifierRow, PermissionQuantity, Quantity, SourcePlace, TargetRelation } from './model';
import { ATTRIBUTE_ROWS } from './titles/attributes';
import { EVENT_AND_MISSION_ROWS } from './titles/eventsAndMissions';
import { PERMISSION_ROWS } from './titles/permissions';
import { SHIP_ROWS } from './titles/ships';
import { SPAN_ROWS } from './titles/span';
import { SKILL_ROWS } from './titles/skills';
import { isEquipment, isPersonnel, printedOf, rowTitleKey } from './words';

export * from './model';

const AMOUNT_PLACES: Record<'attributes' | 'range' | 'span' | 'cost' | 'counterLimit' | 'skills' | PermissionQuantity, [SourcePlace, TargetRelation][]> = {
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
  // The cost rows (#1888), read by the readers of `src/lib/costModels/registry.ts`: the card's own play, the core,
  // a mission of the player's slots and an unstopped personnel of the player's price a play.
  cost: [
    ['played', 'play'],
    ['core', 'play'],
    ['mission', 'play'],
    ['unstopped', 'play'],
  ],
  counterLimit: [
    ['core', 'turnLimit'],
    ['unstopped', 'turnLimit'],
  ],
  // The permissions (#1915), each read by the check of its action: the played card's own requirement and place, a
  // ship whose crew cannot attempt or a core card that limits every attempt, and a core card that forbids a draw.
  play: [['played', 'play']],
  playPlace: [['played', 'play']],
  attempt: [
    ['shipRow', 'crew'],
    ['core', 'attempting'],
  ],
  spendToDraw: [['core', 'turnLimit']],
  // The skill gains (#1836), read by `skillsGainedOf`: an equipment or a personnel of a group gives its group ("your
  // personnel present"), a ship its crew ("aboard this ship"), and a core event every personnel.
  skills: [
    ['group', 'group'],
    ['shipRow', 'crew'],
    ['core', 'any'],
  ],
};

const isPermission = (q: Quantity): q is PermissionQuantity => (PERMISSION_QUANTITIES as readonly Quantity[]).includes(q);

const familyOf = (q: Quantity): keyof typeof AMOUNT_PLACES =>
  isPermission(q)
    ? q
    : q === 'range'
      ? 'range'
      : q === 'span' || q === 'quadrantWaiver'
        ? 'span'
        : q === 'cost' || q === 'counterLimit' || q === 'skills'
          ? q
          : 'attributes';

/** Every row, by title: the amounts, the span, and the permissions (#1916). */
export const MODIFIER_ROWS: readonly ModifierRow[] = [...ATTRIBUTE_ROWS, ...EVENT_AND_MISSION_ROWS, ...SHIP_ROWS, ...SPAN_ROWS, ...PERMISSION_ROWS, ...SKILL_ROWS];

// Why a cost row's scope or its once-per-title does not fit what its evaluator reads (#1888), or null: a
// `nextPlay` row is a discount the card's own play leaves, every other cost row a change while its card stands, and
// the readers of the missions and the personnel ask each title once.
function costRowError(r: ModifierRow): string | null {
  const cost = r.changes.cost;
  if (r.scope === 'nextPlay') {
    if (typeof cost !== 'object' || r.source !== 'played' || Object.keys(r.changes).length !== 1) return 'a next play is a discount of its own play alone';
  } else if (cost !== undefined && typeof cost !== 'function') return 'a discount of the next play needs the scope nextPlay';
  if (cost !== undefined && (r.source === 'mission' || r.source === 'unstopped') && !r.eachTitleOnce) return `a cost of ${r.source} counts each title once`;
  return null;
}

/**
 * The rows by title, lowercased. It throws for a row whose source and target no evaluator (or, for a permission, no
 * check) of one of its quantities reads, for a permission that neither allows nor forbids, for a span row with a condition, for a cost row whose scope its evaluator does not read, and for two rows
 * of one title that change one quantity from one place.
 */
export function rowsByTitle(rows: readonly ModifierRow[]): ReadonlyMap<string, readonly ModifierRow[]> {
  const map = new Map<string, ModifierRow[]>();
  for (const r of rows) {
    const key = r.title.toLowerCase();
    const titled = map.get(key) ?? [];
    const quantities = Object.keys(r.changes) as Quantity[];
    if (r.condition && quantities.some((q) => familyOf(q) === 'span')) throw new Error(`"${r.title}" changes the span with a condition, which \`spanOf\` does not read`);
    const costError = costRowError(r);
    if (costError) throw new Error(`"${r.title}": ${costError}`);
    for (const q of quantities) {
      if (isPermission(q) && r.changes[q] !== 'allow' && r.changes[q] !== 'forbid') throw new Error(`"${r.title}" changes ${q}, a permission, with neither allow nor forbid`);
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

/**
 * The permission rows of `card` (a row of the card data) at `source` that forbid `quantity` and break the rule on
 * `view` (#1916): each row with no condition, or whose condition fails. One per rule broken, in row order.
 */
export function forbiddenBy(view: TableView, card: any, source: SourcePlace, quantity: PermissionQuantity): ModifierRow[] {
  return modifierRowsOf(rowTitleKey(card)).filter(
    (r) => r.source === source && r.changes[quantity] === 'forbid' && (!r.condition || !r.condition.holds(view))
  );
}

/** The titles with a row of one of `quantities` (a permission's too, #1915), in the case of the card data, each once, in row order. */
export function modifierTitles(quantities: readonly Quantity[]): Map<string, { title: string }> {
  const map = new Map<string, { title: string }>();
  for (const r of MODIFIER_ROWS) {
    if (quantities.some((q) => q in r.changes) && !map.has(r.title.toLowerCase())) map.set(r.title.toLowerCase(), { title: r.title });
  }
  return map;
}

// Whether `card` is a stopped personnel or ship, whose rows apply nowhere (#1942). Rulebook v4, Glossary ›
// "stopped", p. 20: "You cannot use the game text, attributes, icons, or any other characteristic of any of your
// personnel or ships that are stopped." The owner reads it to cover continuous text too. The same entry says
// equipment does not become stopped, so an equipment's rows apply whatever flag its instance carries.
const isStoppedSource = (card: ViewCard): boolean =>
  !isEquipment(card) && 'stopped' in card && (card as ViewTableCard).stopped === true;

// The rows of `card` at `source` toward `target` that change `quantity`, and whose condition holds; none for a
// stopped source (#1942), the one gate of every amount evaluator.
function rowsAt(view: TableView, card: ViewCard | null | undefined, source: SourcePlace, target: TargetRelation, quantity: Quantity): ModifierRow[] {
  if (!card || isStoppedSource(card)) return [];
  return modifierRowsOf(rowTitleKey(card.row)).filter(
    (r) => r.source === source && r.target === target && quantity in r.changes && (!r.condition || r.condition.holds(view))
  );
}

/** The value of a delta on `c` (#1833): a counted change capped by its limit, a sum part by part. */
export const amountOf = (delta: Delta | undefined, c: AmountContext): number =>
  delta === undefined
    ? 0
    : typeof delta === 'number'
      ? delta
      : typeof delta === 'function'
        ? delta(c)
        : Array.isArray(delta)
          ? delta.reduce((sum: number, d: Delta) => sum + amountOf(d, c), 0)
          : countedAmount(delta as CountedChange<AmountContext>, c);

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
 * `target` is the view's ship when it is on a ship row, or the ship off the table with its crew. A stopped ship or
 * personnel adds no row (#1942, Glossary › "stopped", p. 20: "You cannot use the game text … of any of your
 * personnel or ships that are stopped"): `rowsAt` drops it.
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
  return Math.max(0, printedOf(ship, 'range') + range.total() + timedOf(view, ship.id, 'range'));
}

/**
 * An attribute of `target` on the table (#1664): its printed value, plus the rows of the events placed on each
 * mission card, each mission card, each ship of each ship row and each event of the core; for a card of an away
 * team or a crew, its own rows, the rows of the personnel and the equipment of its group (itself among them), and
 * its ship's rows of its crew; for a ship on a ship row, its own rows, the rows of its crew, of the events placed on
 * it, and of every personnel the player commands. Never below 0. Only an unstopped personnel or ship is a source
 * (#1942, Glossary › "stopped", p. 20: "You cannot use the game text, attributes, icons, or any other
 * characteristic of any of your personnel or ships that are stopped"), so a stopped personnel shows its printed
 * value plus the rows of other sources; equipment never stops.
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
  return Math.max(0, printedOf(target, quantity) + sum.total() + timedOf(view, target.id, quantity));
}

/** The sum of the changes of `quantity` an ability made to the card `id` for the rest of the attempt (#1835). */
export const timedOf = (view: TableView, id: string, quantity: AmountQuantity): number =>
  (view.timed ?? []).reduce((sum, t) => sum + (t.targetId === id ? (t.changes[quantity] ?? 0) : 0), 0);

/**
 * The skills `target`, a personnel of an away team or a crew, gains on the table (#1836): the `skills` rows of each
 * unstopped personnel and equipment of its group, of its ship for a crew when it is unstopped (#1942), and of each
 * core event, whose condition holds and
 * whose `who` and `where` it passes, in that order. Each skill once per level a row gives; a card off the table
 * gains none.
 */
export function skillsGainedOf(view: TableView, target: ModifierCard): string[] {
  const place = groupOf(view, target.id);
  if (!place || !isPersonnel(place.card)) return [];
  const self = place.card;
  const rangeOfShip = (s: ModifierCard) => rangeOf(view, s);
  const c = { rangeOf: rangeOfShip, target: self, slot: place.slot, group: place.group, ship: place.ship };
  const gained: string[] = [];
  const add = (card: ViewCard, source: SourcePlace, relation: TargetRelation) => {
    for (const r of rowsAt(view, card, source, relation, 'skills')) {
      const g = r.changes.skills!;
      const { unique, ...traits } = g.who ?? {};
      if (unique !== undefined && self.unique !== unique) continue;
      if (Object.keys(traits).length && !cardHasTraits(traits, self)) continue;
      if (g.where && !g.where({ ...c, view, source: card })) continue;
      gained.push(...g.gain);
    }
  };
  for (const source of place.group) if (isPersonnel(source) || isEquipment(source)) add(source, 'group', 'group');
  if (place.ship) add(place.ship, 'shipRow', 'crew');
  for (const event of view.core) add(event, 'core', 'any');
  return gained;
}

/** What a move adds between two different quadrants (#1635). */
export const QUADRANT_SPAN = 2;

/**
 * What a move takes off between two missions of the same Region (#1941). Rulebook v4, "2. Execute Orders" ›
 * "Order – Move a Ship", p. 10: "If the two missions have the same "Region: X" keyword, subtract two."
 */
export const REGION_SPAN = 2;

/** Whether the two missions share a "Region: X" keyword. */
export const shareRegion = (from: ViewCard, to: ViewCard): boolean => {
  const of = (c: ViewCard) => regionsOf(String(c.row?.keywords ?? ''));
  const theirs = of(to);
  return of(from).some((r) => theirs.includes(r));
};

/**
 * The span total of a move of `ship` from the mission card `from` to `to` (#1635, #1648, #1827): the printed spans,
 * plus 2 when both slots hold a mission and their quadrants differ, unless a row of either mission, of the ship or
 * of the core waives it, less 2 when the two missions share a Region (#1941), both rules of the game; then, when both slots hold a mission, the reductions of the core, a floor of 0, and the
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
  if (from && to && shareRegion(from, to)) total -= REGION_SPAN;
  if (!from || !to || !cardText) return Math.max(0, total);
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
