// The modifier rows of the span total of a move (#1635, #1648, #1827): "do not add 2 to the span total" of a
// mission, of the moving ship or of an event in the core, a reduction of the core, and the total a move requires.

import { type ModifierRow, type MoveContext, row } from '../model';
import { hasKeyword, printedOf, rowQuadrant } from '../words';

const quadrant = (c: { row: any }) => rowQuadrant(c.row);

export const SPAN_ROWS: ModifierRow[] = [
  // "When any player is about to move a ship between this mission and a [GQ] mission, do not add 2 to the span
  // total of those missions."
  row('Mouth of the Wormhole Deep Space 9', 'moveMission', 'move', {
    quadrantWaiver: ({ source, from, to }: MoveContext) => quadrant(from.id === source.id ? to : from) === 'g',
  }),
  // "When this ship is about to move between two missions, those missions are considered to be in the same
  // quadrant …"
  row('Redemption Medical Vessel', 'moveShip', 'move', { quadrantWaiver: () => true }),
  // "When this ship is about to move between an [AQ] mission and a [DQ] mission, do not add 2 to the span total of
  // those missions."
  row('Sphere 634', 'moveShip', 'move', { quadrantWaiver: ({ from, to }) => [quadrant(from), quadrant(to)].sort().join('') === 'ad' }),
  // "When this ship is about to move between a non-[GQ] mission and a [GQ] mission, do not add 2 to the span total
  // of those missions."
  row('Aurulent', 'moveShip', 'move', { quadrantWaiver: ({ from, to }) => (quadrant(from) === 'g') !== (quadrant(to) === 'g') }),
  // "Plays in your core. When a ship is about to move between missions in different quadrants, do not add 2 to the
  // span total of those missions."
  row('Expedient Opportunity', 'core', 'move', { quadrantWaiver: () => true }),
  // "Plays in your core. When your ship is about to move from a mission that has a span of 4 or more, subtract 3
  // from the span total required."
  row('Hurried Departure', 'core', 'move', { span: { reduce: ({ from }) => (printedOf(from, 'span') >= 4 ? 3 : 0) } }),
  // "Plays in your core. When the Range required to move a ship to or from its owner's space mission is 4 or less,
  // if that ship is Temporal or costs 3 or more, the Range required becomes 5." Every slot of the table is the
  // player's.
  row('Shadows of the Night', 'core', 'move', {
    span: {
      set: ({ from, to, ship }, total) =>
        total <= 4 &&
        [from, to].some((m) => String(m.row?.missiontype ?? '').toLowerCase() === 's') &&
        (hasKeyword(ship, 'temporal') || printedOf(ship, 'cost') >= 3)
          ? 5
          : total,
    },
  }),
];
