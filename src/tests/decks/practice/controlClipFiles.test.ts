import fs from 'fs';
import path from 'path';
import { CONTROL_ROWS, clipFiles, type ControlColumn } from '../../../app/decks/practice/controls';

// #1091: every clip a row of `controls.ts` claims is committed under `public/controls/`, and each
// file stays under 200 KB, so the Controls panel loads fast on a phone. `scripts/record_controls.sh`
// writes the files and prints their sizes.

const MAX_BYTES = 200 * 1024;
const PUBLIC = path.join(__dirname, '../../../../public');
const COLUMNS: ControlColumn[] = ['touch', 'mouse'];

const files = CONTROL_ROWS.flatMap((row) =>
  COLUMNS.flatMap((column) => {
    const clip = clipFiles(row, column);
    return clip ? Object.values(clip).map((file) => [row.id, column, file] as const) : [];
  })
);

describe('the committed clips of the Controls panel', () => {
  it('has at least one row with a clip', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s (%s): %s exists and is under 200 KB', (_id, _column, file) => {
    const full = path.join(PUBLIC, file);
    expect(fs.existsSync(full)).toBe(true);
    expect(fs.statSync(full).size).toBeLessThan(MAX_BYTES);
  });
});
