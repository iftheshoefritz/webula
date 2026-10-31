// The undo and redo histories of the saved practice game (#1401), so a reload keeps both. In memory
// `GameState` keeps whole tables (#1194, #1403). The save keeps only the change between each two
// neighbouring tables of a chain: the top-level fields and the mission slots that differ, each with
// its value before and after. `tableReducer` shares every field an action does not change, so a
// comparison by reference finds exactly the changed ones.
//
// The history lives under a key of its own, next to the save, so a full quota never stops the save
// of the table. A write that throws keeps fewer steps (`writeSavedHistory`). A restore walks the
// chains back from the saved table (`rebuildSavedHistory`), and drops the whole history when a step
// does not match the table it reaches.

import { GameState, isLogEntry, LogEntry } from './gameLog';
import { CardInstance, MissionSlot, TableState, ZONE_FACE } from './tableReducer';
import type { SavedCardInstance, SavedMissionSlot, SavedTable } from './savedGame';

export const SAVED_HISTORY_VERSION = 1;

// The localStorage key of the history of the game saved under `gameKey`.
export const savedHistoryKey = (gameKey: string): string => `${gameKey}:history`;

// One side of a changed field: `{ v }` holds the value, and `{}` says the field is absent, as
// `attempt` is after `endAttempt`. JSON drops a key whose value is undefined, so the absence
// survives the save.
type Side = { v?: unknown };

export interface TableDelta {
  // The changed top-level fields other than `missions`, each [before, after].
  f: Record<string, [Side, Side]>;
  // The changed mission slots, by index, each [before, after].
  m: Record<string, [Side, Side]>;
}

export interface SavedHistory {
  version: number;
  // The length of the log when the history was written. A save that a build with no history wrote
  // later has a longer log, so the history no longer belongs to it.
  logLength: number;
  // The change of each kept undo step, oldest first. They belong to the last entries of the log.
  undo: TableDelta[];
  // The redo steps, in the order of `GameState.redo`: the last one is the next redo.
  redo: { entry: LogEntry; delta: TableDelta }[];
}

type SaveCard = (instance: CardInstance) => SavedCardInstance;

const CARD_FIELDS: ReadonlySet<string> = new Set(Object.keys(ZONE_FACE));

const side = (value: unknown): Side => (value === undefined ? {} : { v: value });

const savedSlot = (slot: MissionSlot, save: SaveCard): SavedMissionSlot => ({
  ...slot,
  mission: slot.mission ? save(slot.mission) : null,
  ships: slot.ships.map(save),
  awayTeam: slot.awayTeam.map(save),
  underMission: slot.underMission.map(save),
});

const savedField = (field: string, value: unknown, save: SaveCard): unknown =>
  CARD_FIELDS.has(field) && Array.isArray(value) ? value.map(save) : value;

// The JSON of the change from `before` to `after`. The change of a pair of tables never changes, so
// it is kept per pair, and each write converts only the new steps.
const deltaCache = new WeakMap<TableState, { after: TableState; json: string }>();

function deltaJson(before: TableState, after: TableState, save: SaveCard): string {
  const cached = deltaCache.get(before);
  if (cached && cached.after === after) return cached.json;
  const b = before as unknown as Record<string, unknown>;
  const a = after as unknown as Record<string, unknown>;
  const delta: TableDelta = { f: {}, m: {} };
  for (const field of new Set([...Object.keys(b), ...Object.keys(a)])) {
    if (field === 'missions' || b[field] === a[field]) continue;
    delta.f[field] = [side(savedField(field, b[field], save)), side(savedField(field, a[field], save))];
  }
  if (before.missions !== after.missions) {
    before.missions.forEach((slot, i) => {
      if (slot !== after.missions[i]) delta.m[i] = [{ v: savedSlot(slot, save) }, { v: savedSlot(after.missions[i], save) }];
    });
  }
  const json = JSON.stringify(delta);
  deltaCache.set(before, { after, json });
  return json;
}

// The saved history of `game`, as JSON: the newest `keepUndo` undo steps, and the redo steps unless
// `keepRedo` is false.
export function savedHistoryJson(game: GameState, save: SaveCard, keepUndo = Infinity, keepRedo = true): string {
  const chain = [...game.undo, game.table];
  const kept = Math.max(0, game.undo.length - keepUndo);
  const undo = game.undo.slice(kept).map((table, i) => deltaJson(table, chain[kept + i + 1], save));
  const redo = keepRedo
    ? game.redo.map((step, i) => {
        const before = i === game.redo.length - 1 ? game.table : game.redo[i + 1].table;
        return `{"entry":${JSON.stringify(step.entry)},"delta":${deltaJson(before, step.table, save)}}`;
      })
    : [];
  return `{"version":${SAVED_HISTORY_VERSION},"logLength":${game.log.length},"undo":[${undo.join(',')}],"redo":[${redo.join(',')}]}`;
}

// Writes the history with `write` and returns how many undo steps the next write should keep at
// most (#1401). The table save is already written, so nothing here can stop it. A write that throws,
// a full quota, keeps half the undo steps and tries again, then drops the redo steps, and then
// removes the key, with no message. Undo then stops at the oldest kept step.
export function writeSavedHistory(
  game: GameState,
  json: (keepUndo: number, keepRedo: boolean) => string,
  write: (json: string) => void,
  remove: () => void,
  limit: number
): number {
  let keepUndo = Math.min(limit, game.undo.length);
  let keepRedo = true;
  for (;;) {
    try {
      write(json(keepUndo, keepRedo));
      return keepUndo < game.undo.length ? keepUndo : limit;
    } catch {
      if (keepUndo > 0) keepUndo = Math.floor(keepUndo / 2);
      else if (keepRedo && game.redo.length) keepRedo = false;
      else {
        try {
          remove();
        } catch {
          // nothing more to free
        }
        return 0;
      }
    }
  }
}

const isObject = (value: unknown): value is Record<string, any> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// Equal as JSON: the same values, in any key order, with a key whose value is undefined left out.
const sameJson = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => sameJson(x, b[i]));
  }
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  const ka = Object.keys(ra).filter((k) => ra[k] !== undefined);
  const kb = Object.keys(rb).filter((k) => rb[k] !== undefined);
  return ka.length === kb.length && ka.every((k) => sameJson(ra[k], rb[k]));
};

const isSide = (value: unknown): value is Side => isObject(value);
const isPair = (value: unknown): value is [Side, Side] =>
  Array.isArray(value) && value.length === 2 && isSide(value[0]) && isSide(value[1]);
const isDelta = (value: unknown): value is TableDelta =>
  isObject(value) &&
  isObject(value.f) &&
  isObject(value.m) &&
  Object.values(value.f).every(isPair) &&
  Object.values(value.m).every(isPair);

const matches = (value: unknown, s: Side): boolean => ('v' in s ? sameJson(value, s.v) : value === undefined);

// The saved table one step along a chain: `from` is the side the table must match, `to` the side
// that replaces it. Null when it does not match. Every field the step does not name stays the same
// object, so the restored tables share them as the tables in memory did.
function step(table: SavedTable, delta: TableDelta, from: 0 | 1, to: 0 | 1): SavedTable | null {
  const current = table as unknown as Record<string, unknown>;
  const next: Record<string, unknown> = { ...current };
  for (const [field, sides] of Object.entries(delta.f)) {
    if (field === 'missions' || !matches(current[field], sides[from])) return null;
    if ('v' in sides[to]) next[field] = sides[to].v;
    else delete next[field];
  }
  const slots = Object.entries(delta.m);
  if (slots.length) {
    const missions = [...table.missions];
    for (const [index, sides] of slots) {
      const i = Number(index);
      if (!Number.isInteger(i) || i < 0 || i >= missions.length) return null;
      if (!('v' in sides[to]) || !matches(missions[i], sides[from])) return null;
      missions[i] = sides[to].v as SavedMissionSlot;
    }
    next.missions = missions;
  }
  return next as unknown as SavedTable;
}

// The saved tables of the undo and the redo chains, rebuilt back from the saved table, or null
// when the history must be dropped: bad JSON, an unknown version, a log of another length, more
// undo steps than log entries, a bad redo entry, or a step that does not match the table it reaches.
export function rebuildSavedHistory(
  table: SavedTable,
  json: string,
  log: LogEntry[]
): { undo: SavedTable[]; redo: { entry: LogEntry; table: SavedTable }[] } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!isObject(parsed) || parsed.version !== SAVED_HISTORY_VERSION || parsed.logLength !== log.length) return null;
  const { undo, redo } = parsed;
  if (!Array.isArray(undo) || !Array.isArray(redo) || undo.length > log.length) return null;
  if (!undo.every(isDelta)) return null;
  if (!redo.every((s) => isObject(s) && isLogEntry(s.entry) && isDelta(s.delta))) return null;
  if (!isObject(table) || !Array.isArray(table.missions)) return null;

  const undoTables: SavedTable[] = [];
  let current: SavedTable | null = table;
  for (let i = undo.length - 1; i >= 0; i--) {
    current = step(current, undo[i], 1, 0);
    if (!current) return null;
    undoTables.unshift(current);
  }
  const redoSteps: { entry: LogEntry; table: SavedTable }[] = [];
  current = table;
  for (let i = redo.length - 1; i >= 0; i--) {
    current = step(current, redo[i].delta, 0, 1);
    if (!current) return null;
    redoSteps.unshift({ entry: redo[i].entry, table: current });
  }
  return { undo: undoTables, redo: redoSteps };
}
