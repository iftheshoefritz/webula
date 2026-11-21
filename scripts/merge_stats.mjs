// Merges the month files of another `stats/` folder into this repository's `stats/` (#1431).
//
//   node scripts/merge_stats.mjs <other stats folder>
//
// The Stats Recorder workflow rebuilds `stats/update` from `main` on every run. Before it collects,
// it merges the stats of the previous `stats/update` into the new one with this script, so the
// days that the open stats pull request holds stay in it until it merges. Each file is merged
// with `mergeLines`, by the key of its kind, so a merge of the same files twice changes no byte.

import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { KINDS, mergeLines, parseLines } from './stats/records.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const STATS = path.join(ROOT, 'stats');
const MONTH_FILE = /^\d{4}-\d{2}\.jsonl$/;

async function main() {
  const other = process.argv[2];
  if (!other || process.argv.length > 3) throw new Error('usage: merge_stats.mjs <other stats folder>');
  for (const kind of Object.keys(KINDS)) {
    const dir = path.join(other, kind);
    if (!existsSync(dir)) continue;
    await mkdir(path.join(STATS, kind), { recursive: true });
    for (const name of (await readdir(dir)).filter((n) => MONTH_FILE.test(n)).sort()) {
      const target = path.join(STATS, kind, name);
      const current = existsSync(target) ? await readFile(target, 'utf8') : '';
      const records = parseLines(await readFile(path.join(dir, name), 'utf8'));
      await writeFile(target, mergeLines(kind, current, records));
      console.log(`merged ${records.length} records into stats/${kind}/${name}`);
    }
  }
}

main().catch((error) => {
  console.error(`merge_stats.mjs: ${error.message}`);
  process.exit(1);
});
