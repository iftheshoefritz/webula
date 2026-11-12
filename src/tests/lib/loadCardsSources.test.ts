// `loadCards` serves the Discord routes, `/api/cards` and the dilemma lab, which see only the public
// card file (#1614). It never reads the playtest store (#1616).
jest.mock('d3', () => ({
  tsvParse: (text: string) => {
    const lines = text.split('\n').filter(Boolean);
    const headers = lines[0].split('\t');
    return lines.slice(1).map((line) => {
      const values = line.split('\t');
      return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']));
    });
  },
}));
jest.mock('fs', () => ({ readFileSync: jest.fn() }));
jest.mock('../../lib/playtestStore', () => new Proxy({}, {
  get: (_target, name) => {
    if (name === '__esModule') return true;
    return mockStoreCall;
  },
}));
const mockStoreCall = jest.fn();

import { readFileSync } from 'fs';
import { join } from 'path';
import { loadCards } from '../../lib/loadCards';

it('reads only the public card file, and never the playtest store', () => {
  (readFileSync as jest.Mock).mockReturnValue('Name\tCollectorsInfo\tType\tImageFile\tKeywords\tMission\tDilemmaType\nPublic Card\t1R001\tEvent\tp1\t\t\t\n');
  const { data } = loadCards();
  expect(data.map((row) => row.originalName)).toEqual(['Public Card']);
  expect(readFileSync).toHaveBeenCalledTimes(1);
  expect(readFileSync).toHaveBeenCalledWith(join(process.cwd(), 'public', 'cards_with_processed_columns.txt'), 'utf-8');
  expect(mockStoreCall).not.toHaveBeenCalled();
});
