import fs from 'fs';
import path from 'path';
import {
  PRACTICE_FIXTURE_MANIFEST,
  PRACTICE_MANIFEST,
  isFixtureParam,
  practiceMetadata,
} from '../../lib/practiceManifest';

const readManifest = (href: string) =>
  JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public', href), 'utf8'));

describe('practice table manifests (#922)', () => {
  it('links the fixture manifest only for ?fixture=1', () => {
    expect(isFixtureParam('1')).toBe(true);
    expect(isFixtureParam(['1'])).toBe(true);
    expect(isFixtureParam(undefined)).toBe(false);
    expect(isFixtureParam('0')).toBe(false);
    expect(practiceMetadata(false).manifest).toBe(PRACTICE_MANIFEST);
    expect(practiceMetadata(true).manifest).toBe(PRACTICE_FIXTURE_MANIFEST);
  });

  it('gives the two manifests distinct ids, names and start urls', () => {
    const table = readManifest(PRACTICE_MANIFEST);
    const fixture = readManifest(PRACTICE_FIXTURE_MANIFEST);
    expect(table.start_url).toBe('/decks/practice');
    expect(fixture.start_url).toBe('/decks/practice?fixture=1');
    for (const key of ['id', 'name', 'short_name']) {
      expect(table[key]).toBeTruthy();
      expect(table[key]).not.toBe(fixture[key]);
    }
    for (const m of [table, fixture]) {
      expect(m.display).toBe('fullscreen');
      expect(m.orientation).toBe('landscape');
      for (const icon of m.icons) {
        expect(fs.existsSync(path.join(process.cwd(), 'public', icon.src))).toBe(true);
      }
    }
  });
});
