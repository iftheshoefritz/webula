// A saved practice game (#975, part of #950): a snapshot of the table that survives a reload.
// These helpers are pure. They read no localStorage and call no Drive API; the practice page
// does both.
//
// A saved card instance holds the `DeckList` key of its row in the dealt deck instead of the
// full card row, so the save stays small. The key is unique inside one deck, where a card
// database column such as `collectorsinfo` or `imagefile` is not.

import { DeckList } from '../../../types';
import { CardInstance, TableState, Zone, ZONE_FACE, initialTableState } from './tableReducer';

export const SAVED_GAME_VERSION = 1;

export type SavedGameSource = 'builder' | 'drive';

export type SavedCardInstance = Omit<CardInstance, 'card' | 'crew' | 'placedOn'> & {
  key: string;
  crew?: SavedCardInstance[];
  placedOn?: SavedCardInstance[];
};

export type SavedMissionSlot = {
  mission: SavedCardInstance | null;
  ships: SavedCardInstance[];
  awayTeam: SavedCardInstance[];
  underMission: SavedCardInstance[];
  // Absent in a save made before #991, which loads as not complete.
  completed?: boolean;
};

export type SavedTable = Omit<TableState, Zone | 'missions'> &
  Record<Zone, SavedCardInstance[]> & { missions: SavedMissionSlot[] };

export interface SavedGame {
  version: number;
  savedAt: string;
  source: SavedGameSource;
  driveFileId?: string;
  dealtDeck: DeckList;
  table: SavedTable;
}

export interface RestoredGame {
  table: TableState;
  dealtDeck: DeckList;
  source: SavedGameSource;
  driveFileId?: string;
  // The largest N of the restored `card-N` IDs, for `seedInstanceIds`.
  maxInstanceId: number;
}

const FLAT_ZONES = Object.keys(ZONE_FACE) as Zone[];

// Applies `f` to every card instance at the top level of the table: the flat zones and the
// four places of each mission slot. `f` handles a card's own `crew` and `placedOn`.
const mapTable = <A, B>(table: any, f: (c: A) => B): any => ({
  ...table,
  ...Object.fromEntries(FLAT_ZONES.filter((zone) => zone in table).map((zone) => [zone, table[zone].map(f)])),
  ...(table.missions
    ? {
        missions: table.missions.map((slot: any) => ({
          ...slot,
          mission: slot.mission ? f(slot.mission) : null,
          ships: slot.ships.map(f),
          awayTeam: slot.awayTeam.map(f),
          underMission: slot.underMission.map(f),
        })),
      }
    : {}),
});

// A dealt card is a copy of its deck row (`expandPile`), and a mission copy may carry the
// `backimagefile` that `withBackImageFiles` filled in, so that field is left out of the match.
const matchesRow = (card: any, row: any): boolean =>
  Object.keys(row).every((field) => field === 'backimagefile' || card?.[field] === row[field]);

const keyFor = (card: any, dealtDeck: DeckList): string | undefined =>
  Object.keys(dealtDeck).find((key) => matchesRow(card, dealtDeck[key].row));

export function toSavedGame(
  table: TableState,
  dealtDeck: DeckList,
  source: SavedGameSource,
  driveFileId?: string
): SavedGame {
  // The saved deck takes the `backimagefile` of a dealt mission (#765), so a restore needs no
  // card database to repair it.
  const savedDeck: DeckList = { ...dealtDeck };
  const save = (instance: CardInstance): SavedCardInstance => {
    const { card, crew, placedOn, ...rest } = instance;
    const key = keyFor(card, dealtDeck) ?? '';
    const entry = savedDeck[key];
    if (entry && entry.row.backimagefile === undefined && card?.backimagefile !== undefined) {
      savedDeck[key] = { ...entry, row: { ...entry.row, backimagefile: card.backimagefile } };
    }
    return {
      ...rest,
      key,
      ...(crew ? { crew: crew.map(save) } : {}),
      ...(placedOn ? { placedOn: placedOn.map(save) } : {}),
    };
  };
  const savedTable: SavedTable = mapTable(table, save);
  return {
    version: SAVED_GAME_VERSION,
    savedAt: new Date().toISOString(),
    source,
    ...(driveFileId ? { driveFileId } : {}),
    dealtDeck: savedDeck,
    table: savedTable,
  };
}

// The deck's cards as sorted `key:count` pairs. A key with no copies left is not part of it.
const fingerprint = (deck: DeckList): string =>
  Object.entries(deck)
    .filter(([, entry]) => (entry?.count ?? 0) > 0)
    .map(([key, entry]) => `${key}:${entry.count}`)
    .sort()
    .join('\n');

// One step per version, each taking a save of that version to the next one. A new version adds
// its step here, the same way `withCurrentPiles` (#837) and `withBackImageFiles` (#765) repair
// an older deck on load.
const MIGRATIONS: Record<number, (save: any) => any> = {};

const migrate = (save: any): SavedGame | null => {
  let current = save;
  while (current.version !== SAVED_GAME_VERSION) {
    const step = MIGRATIONS[current.version];
    if (!step) return null;
    current = step(current);
  }
  return current;
};

const isObject = (value: unknown): value is Record<string, any> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

class MissingKeyError extends Error {}

const instanceNumber = (id: string): number => {
  const match = /^card-(\d+)$/.exec(id);
  return match ? Number(match[1]) : 0;
};

// Returns the restored game, or null when the save must be dropped: bad JSON, an unknown
// version, a builder save whose deck no longer matches `currentDeck`, or a card whose key is not
// in the saved deck. A Drive save is trusted as it is, with no Drive call.
export function fromSavedGame(json: string, currentDeck: DeckList): RestoredGame | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!isObject(parsed)) return null;
  const save = migrate(parsed);
  if (!save || !isObject(save.table) || !isObject(save.dealtDeck)) return null;
  if (save.source !== 'builder' && save.source !== 'drive') return null;
  if (save.source === 'builder' && fingerprint(save.dealtDeck) !== fingerprint(currentDeck ?? {})) return null;

  const dealtDeck = save.dealtDeck;
  let maxInstanceId = 0;
  const restore = (saved: SavedCardInstance): CardInstance => {
    const { key, crew, placedOn, ...rest } = saved;
    const entry = dealtDeck[key];
    if (!entry?.row) throw new MissingKeyError();
    maxInstanceId = Math.max(maxInstanceId, instanceNumber(saved.id));
    return {
      ...rest,
      card: { ...entry.row },
      ...(crew ? { crew: crew.map(restore) } : {}),
      ...(placedOn ? { placedOn: placedOn.map(restore) } : {}),
    };
  };

  let restoredTable: Partial<TableState>;
  try {
    restoredTable = mapTable(save.table, restore);
  } catch (error) {
    if (error instanceof MissingKeyError || error instanceof TypeError) return null;
    throw error;
  }
  return {
    // A top-level field that an older save lacks takes its default.
    table: { ...initialTableState, ...restoredTable },
    dealtDeck,
    source: save.source,
    ...(save.driveFileId ? { driveFileId: save.driveFileId } : {}),
    maxInstanceId,
  };
}
