// Files the records of `scripts/collect_stats.mjs` (#1431) into month files of JSON Lines, and
// merges them with the lines a file holds already. Two merges of the same records give the same
// bytes.

/** The kinds of record: the folder under `stats/`, the key, the time that picks the month, and the sort. */
export const KINDS = {
  runs: {
    key: (r) => `${r.repository}\t${r.run_id}\t${r.run_attempt}`,
    time: (r) => r.created_at,
    sort: (r) => [r.created_at, r.repository, r.run_id, r.run_attempt],
  },
  issues: {
    key: (r) => `${r.repository}\t${r.date}`,
    time: (r) => r.date,
    sort: (r) => [r.date, r.repository],
  },
  items: {
    key: (r) => `${r.repository}\t${r.number}\t${r.kind}`,
    time: (r) => r.closed_at,
    sort: (r) => [r.closed_at, r.repository, r.kind, r.number],
  },
};

/** `YYYY-MM` of an ISO date or time. */
export function monthOf(time) {
  return String(time).slice(0, 7);
}

function compare(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    if (typeof a[i] === 'number' && typeof b[i] === 'number') return a[i] - b[i];
    return String(a[i]) < String(b[i]) ? -1 : 1;
  }
  return 0;
}

/** The records split by month: `{ 'YYYY-MM': record[] }`. */
export function groupByMonth(kind, records) {
  const groups = {};
  for (const record of records) {
    const month = monthOf(KINDS[kind].time(record));
    (groups[month] ??= []).push(record);
  }
  return groups;
}

/** The records of a JSON Lines text. */
export function parseLines(text) {
  return text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line));
}

/**
 * The text of a month file: the existing records and the new ones, one per key, a new record
 * taking the place of an old one with its key, sorted, one compact line each.
 */
export function mergeLines(kind, existingText, records) {
  const byKey = new Map();
  for (const record of [...parseLines(existingText ?? ''), ...records]) {
    byKey.set(KINDS[kind].key(record), record);
  }
  const sorted = [...byKey.values()].sort((a, b) => compare(KINDS[kind].sort(a), KINDS[kind].sort(b)));
  return sorted.map((record) => JSON.stringify(record) + '\n').join('');
}
