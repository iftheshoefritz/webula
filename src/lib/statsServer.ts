// The server side of the stats page (#1417): the top-level `stats/` folder (#1431), read from disk.
// Nothing under `public/` holds the stats, so they reach a browser only through `/api/stats`, and only
// for an early-access user. `outputFileTracingIncludes` in `next.config.mjs` puts the folder into the
// route's function bundle.

import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { parseJsonLines, summarizeStats } from './stats';
import type { IssueSnapshot, ItemRecord, RunRecord, StatsSummary } from './stats';

export const STATS_DIR = join(process.cwd(), 'stats');

// Every record of the month files of one kind; a missing folder gives none.
async function readKind<T>(kind: 'runs' | 'issues' | 'items'): Promise<T[]> {
  const dir = join(STATS_DIR, kind);
  let files: string[];
  try {
    files = (await readdir(dir)).filter((name) => name.endsWith('.jsonl')).sort();
  } catch {
    return [];
  }
  const texts = await Promise.all(files.map((name) => readFile(join(dir, name), 'utf-8').catch(() => '')));
  return texts.flatMap((text) => parseJsonLines<T>(text));
}

export async function readStatsSummary(): Promise<StatsSummary> {
  const [runs, issues, items] = await Promise.all([
    readKind<RunRecord>('runs'),
    readKind<IssueSnapshot>('issues'),
    readKind<ItemRecord>('items'),
  ]);
  return summarizeStats({ runs, issues, items });
}
