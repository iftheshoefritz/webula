// The practice table's side of the play-place model (#1855): the `PlaceTable` of a `TableState`, and
// where a card may be played on it (`playPlacesOfRow` in `src/lib/playPlaces/`).

import { playPlacesOfRow, type PlaceCardRow, type PlaceTable, type PlayPlaces } from '../../../lib/playPlaces';
import type { TableState } from './tableReducer';

export type { PlayPlaces } from '../../../lib/playPlaces';

/** The table as the play-place model reads it. The brig is the opponent's, so it commands nothing. */
export function placeTableOf(table: TableState): PlaceTable {
  const rows = (cards: { card: PlaceCardRow | null }[]) => cards.flatMap((c) => (c.card ? [c.card] : []));
  return {
    slots: table.missions.map((slot) => ({
      mission: slot.mission?.card ?? null,
      completed: !!slot.completed,
      awayTeam: rows(slot.awayTeam),
      ships: slot.ships.map((ship) => ({ id: ship.id, card: ship.card ?? {}, crew: rows(ship.crew ?? []) })),
    })),
    core: rows(table.core),
  };
}

/**
 * Where `card` may be played on `table`: the away teams and ship rows by mission slot, the crews by the
 * ship's instance id; null for a card that is no personnel, ship or equipment.
 */
export const playPlacesOf = (card: PlaceCardRow, table: TableState): PlayPlaces | null => playPlacesOfRow(card, placeTableOf(table));
