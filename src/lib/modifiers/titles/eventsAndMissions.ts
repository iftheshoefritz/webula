// The modifier rows of the events and the missions (#1648, #1664, #1683, #1827): placed on a mission card, the
// mission card of a slot, in the core, or placed on a ship.

import { isCommanderOf } from '../../commander';
import { personnel, ships, type ViewMission } from '../../tableView';
import { type AmountContext, counted, each, type ModifierRow, row } from '../model';
import { commanded, crewPersonnel, hasAffiliation, hasIcon, hasKeyword, hasWord, hereAt, isPersonnel, isShip, rowIsNamed, rowTitleKey } from '../words';
import { attributes } from './attributes';

const points = (mission: ViewMission | undefined) => Number(mission?.card?.row?.points) || 0;
// A [TN] ship on a ship row, and a [TN] personnel the player commands (Dark Dissension).
const tnShip = ({ view, target }: AmountContext) => hasIcon(target, 'tn') && isShip(target) && ships(view).some((s) => s.id === target.id);
const tnPersonnel = ({ view, target }: AmountContext) => hasIcon(target, 'tn') && isPersonnel(target) && commanded(view, target);

export const EVENT_AND_MISSION_ROWS: ModifierRow[] = [
  // "Plays on your mission. While this mission is worth 40 or more points, each of your personnel at this mission
  // is attributes +1."
  row(
    'U.S.S. Enterprise-J',
    'missionCard',
    'any',
    attributes(({ view, slot, target }) => (isPersonnel(target) && points(slot) >= 40 && hereAt(view, slot!.index, target) ? 1 : 0))
  ),
  // "Each of your personnel here with a cost of 1 or less is attributes +1." "Here" reads as "at this mission":
  // the away team and the crews of the ships here. A personnel with no cost gets none.
  row(
    'Orlitus Cluster Astronomical Survey',
    'mission',
    'any',
    attributes(({ view, slot, target }) => {
      const cost = String(target.row?.cost ?? '').trim();
      return isPersonnel(target) && cost !== '' && Number(cost) <= 1 && hereAt(view, slot!.index, target) ? 1 : 0;
    })
  ),
  // "Each of your [Pa] personnel at this mission is attributes +1."
  row(
    'Organia Secure Strategic Base',
    'mission',
    'any',
    attributes(({ view, slot, target }) => (isPersonnel(target) && hasIcon(target, 'pa') && hereAt(view, slot!.index, target) ? 1 : 0))
  ),
  // "Plays in your core. Your [TN] ships are each Weapons +1 and Shields -1. Your [TN] personnel are each
  // Integrity -1 and Cunning +1."
  row('Dark Dissension', 'core', 'any', {
    weapons: (c) => (tnShip(c) ? 1 : 0),
    shields: (c) => (tnShip(c) ? -1 : 0),
    integrity: (c) => (tnPersonnel(c) ? -1 : 0),
    cunning: (c) => (tnPersonnel(c) ? 1 : 0),
  }),
  // "Plays in your core. While no opponent commands a ship at a Region: Sector 001 mission, each of your [SF]
  // Dissident personnel is Cunning +1 and Strength +1." A solo table has no opponent ship, as Pi Off Course reads
  // it.
  row(
    "Humanity's Worst Enemy",
    'core',
    'any',
    each(['cunning', 'strength'], ({ view, target }) =>
      isPersonnel(target) && hasAffiliation(target, 'starfleet') && hasKeyword(target, 'dissident') && commanded(view, target) ? 1 : 0
    )
  ),
  // "Plays in your core. Each of your [Bor] personnel is attributes +1 for each personnel on this event." The
  // personnel placed on it in the core; its Order, which places them, is not modelled (#1887).
  row(
    'Biological Distinctiveness',
    'core',
    'any',
    attributes(({ view, source, target }) =>
      isPersonnel(target) && hasAffiliation(target, 'borg') && commanded(view, target) ? source.placedOn.filter(isPersonnel).length : 0
    )
  ),
  // "… Damage - This ship is Weapons -2 and Shields -2." While it is placed on the ship.
  row('Exceed Engine Output', 'placedOnShip', 'itsShip', each(['weapons', 'shields'], -2)),
  // "Plays on {Remus}. Each of your [Rom] ships is Range +1 for each Reman you command (limit +3)."
  row('The Reman Mines', 'missionCard', 'any', {
    range: counted(
      ({ view, slot, target }) =>
        rowIsNamed(slot?.card?.row, 'Remus') && hasAffiliation(target, 'romulan')
          ? personnel(view, { unstopped: false }).filter((p) => hasWord(p.row?.species, 'reman')).length
          : 0,
      1,
      3
    ),
  }),
  // "Plays in your core. Each ship in play is Range +1." Each copy adds +1. The clause on an opponent's ship waits
  // for an opponent on the table (#1758).
  row('Soliton Wave', 'core', 'shipsOnRows', { range: 1 }),
  // "Plays on your ship (limit one per ship). While you have this ship's Commander aboard, it is Range +2."
  row('Inspiring Leader', 'placedOnShip', 'itsShip', {
    range: ({ target }) => (crewPersonnel(target).some((p) => isCommanderOf(String(p.row?.keywords ?? ''), rowTitleKey(target.row))) ? 2 : 0),
  }),
];
