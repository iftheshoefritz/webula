jest.mock('d3', () => ({
  tsvParse: (text: string) => {
    const lines = text.split('\n').filter(Boolean);
    if (lines.length < 2) return [];
    const headers = lines[0].split('\t');
    return lines.slice(1).map((line) => {
      const values = line.split('\t');
      return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']));
    });
  },
}));

import { parseCardData } from '../../lib/loadCards';

const buildTsv = (rows: Record<string, string>[]) => {
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join('\t'),
    ...rows.map((row) => headers.map((h) => row[h]).join('\t')),
  ];
  return lines.join('\n');
};

const baseRow = {
  Name: 'Tricorder',
  CollectorsInfo: '1R001',
  Type: 'Equipment',
  Keywords: 'Tool',
  ImageFile: 'img1',
  Mission: '',
  DilemmaType: '',
};

describe('parseCardData mission/dilemmatype normalization', () => {
  it('clears mission field for non-Mission cards', () => {
    const tsv = buildTsv([{ ...baseRow, Type: 'Personnel', Mission: 'planet' }]);
    const { data } = parseCardData(tsv);
    expect(data[0].mission).toBe('');
  });

  it('preserves mission field for Mission cards', () => {
    const tsv = buildTsv([{ ...baseRow, Type: 'Mission', Mission: 'planet' }]);
    const { data } = parseCardData(tsv);
    expect(data[0].mission).toBe('planet');
  });

  it('clears dilemmatype field for non-Dilemma cards', () => {
    const tsv = buildTsv([{ ...baseRow, Type: 'Mission', Mission: 'planet', DilemmaType: 'planet' }]);
    const { data } = parseCardData(tsv);
    expect(data[0].dilemmatype).toBe('');
  });

  it('preserves dilemmatype field for Dilemma cards', () => {
    const tsv = buildTsv([{ ...baseRow, Type: 'Dilemma', DilemmaType: 'planet' }]);
    const { data } = parseCardData(tsv);
    expect(data[0].dilemmatype).toBe('planet');
  });
});
