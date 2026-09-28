import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// #765: the real card data. Every row with two names in `ImageFile` is a mission, and both of its
// image files exist.
describe('the double-sided missions in the card data', () => {
  const root = join(__dirname, '../../..');
  const [header, ...lines] = readFileSync(join(root, 'public/cards_with_processed_columns.txt'), 'utf8')
    .split('\n')
    .filter(Boolean);
  const columns = header.split('\t');
  const typeIdx = columns.indexOf('Type');
  const imageIdx = columns.indexOf('ImageFile');
  const doubleSided = lines.map((l) => l.split('\t')).filter((row) => (row[imageIdx] ?? '').includes(','));

  it('holds 13 rows, all missions, with both images in public/cardimages', () => {
    expect(doubleSided).toHaveLength(13);
    doubleSided.forEach((row) => {
      expect(row[typeIdx].toLowerCase()).toBe('mission');
      const names = row[imageIdx].split(',');
      expect(names).toHaveLength(2);
      names.forEach((name) => expect(existsSync(join(root, 'public/cardimages', `${name}.jpg`))).toBe(true));
    });
  });
});
