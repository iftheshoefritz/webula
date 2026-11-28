// The split of a card's name into its title and subtitle (#1971). Every card here is invented.
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  cardTitleByRule,
  formatCardTitlesTsv,
  hofMatcher,
  joinCardTitles,
  nameLessVersion,
  parseCardTitlesTsv,
} from '../../lib/cardTitleRule.js';

const card = (CollectorsInfo: string, Name: string, Type: string) => ({ CollectorsInfo, Name, Type });
const row = (CollectorsInfo: string, Name: string, Title: string, Subtitle = '') => ({ CollectorsInfo, Name, Title, Subtitle });

describe('cardTitleByRule', () => {
  const known = new Set(['Zed', 'Zed Founder']);

  it('splits a personnel at the longest known title', () => {
    expect(cardTitleByRule('Zed Founder Quiet Watcher', 'Personnel', known))
      .toMatchObject({ Title: 'Zed Founder', Subtitle: 'Quiet Watcher' });
    expect(cardTitleByRule('Zed Loyal Friend', 'Personnel', known))
      .toMatchObject({ Title: 'Zed', Subtitle: 'Loyal Friend' });
  });

  it('matches a title only at a word boundary', () => {
    expect(cardTitleByRule('Zedd Other One', 'Personnel', known))
      .toMatchObject({ Title: 'Zedd Other One', Subtitle: '' });
  });

  it('keeps the version suffix out of the subtitle', () => {
    expect(cardTitleByRule('Zed Loyal Friend *VP', 'Ship', known))
      .toMatchObject({ Title: 'Zed', Subtitle: 'Loyal Friend' });
    expect(cardTitleByRule('Zed *AP', 'Personnel', known)).toMatchObject({ Title: 'Zed', Subtitle: '' });
  });

  it('gives a personnel with no known title its whole name', () => {
    expect(cardTitleByRule('Quill Bold Pilot', 'Personnel', known))
      .toMatchObject({ Title: 'Quill Bold Pilot', Subtitle: '', rule: expect.stringContaining('no known title') });
  });

  it('gives a dilemma and an event their name less the suffix, with no subtitle', () => {
    expect(cardTitleByRule('Zed Loyal Friend', 'Dilemma', known)).toMatchObject({ Title: 'Zed Loyal Friend', Subtitle: '' });
    expect(cardTitleByRule('Sudden Storm (SS)', 'Event', known)).toMatchObject({ Title: 'Sudden Storm', Subtitle: '' });
  });
});

describe('joinCardTitles', () => {
  const rows = [
    row('1X001', 'Zed Loyal Friend', 'Zed', 'Loyal Friend'),
    row('1X002', 'Old Renamed Card', 'Old Renamed Card'),
    row('1X003', 'Far Place Hidden Task', 'Far Place', 'Hidden Task'),
  ];
  const cards = [
    card('1X003', 'Far Place Hidden Task', 'Mission'),
    card('1X004', 'Zed Brave Leader', 'Personnel'),
    card('1X001', 'Zed Loyal Friend', 'Personnel'),
    card('1X003', 'Far Place Hidden Task', 'Mission'),
    card('1X005', 'Far Place Second Task *VP', 'Mission'),
  ];
  const joined = joinCardTitles(cards, rows);

  it('keeps an existing row unchanged', () => {
    expect(joined.byKey.get('1X001\tZed Loyal Friend')).toBe(rows[0]);
  });

  it('adds a row by the rule, with its rule', () => {
    expect(joined.added.map(({ row: added, rule }) => [added.Name, added.Title, added.Subtitle, rule])).toEqual([
      ['Zed Brave Leader', 'Zed', 'Brave Leader', 'the known title "Zed"'],
      ['Far Place Second Task *VP', 'Far Place', 'Second Task', 'the known title "Far Place"'],
    ]);
  });

  it('drops a row whose key no card has', () => {
    expect(joined.dropped).toEqual([rows[1]]);
  });

  it('writes the rows in the card data order, a repeated key once', () => {
    expect(joined.rows.map((r) => r.CollectorsInfo)).toEqual(['1X003', '1X004', '1X001', '1X005']);
  });

  it('reads and writes the plain TSV', () => {
    const text = formatCardTitlesTsv(joined.rows);
    expect(text.split('\n')[0]).toBe('CollectorsInfo\tName\tTitle\tSubtitle');
    expect(text.split('\n')[2]).toBe('1X004\tZed Brave Leader\tZed\tBrave Leader');
    expect(parseCardTitlesTsv(text)).toEqual(joined.rows);
  });
});

describe('hofMatcher', () => {
  const hof = hofMatcher(['Zed, Loyal Friend', 'Sudden Storm', 'Nobody, At All', '']);

  it('matches a line with a comma by the title and the subtitle', () => {
    expect(hof.isRetired('Zed', 'Loyal Friend')).toBe(true);
    expect(hof.isRetired('Zed', 'Brave Leader')).toBe(false);
  });

  it('matches a line with no comma by the title alone', () => {
    expect(hof.isRetired('Sudden Storm', '')).toBe(true);
    expect(hof.isRetired('Sudden Storm Front', '')).toBe(false);
  });

  it('reports the lines that matched no card', () => {
    expect(hof.unmatched()).toEqual(['Nobody, At All']);
  });
});

describe('data/card_titles.tsv and the card data', () => {
  const read = (...path: string[]) => readFileSync(join(process.cwd(), ...path), 'utf-8');
  const [header, ...lines] = read('public', 'cards_with_processed_columns.txt').trim().split('\n');
  const columns = header.split('\t');
  const cards = lines.map((line): Record<string, string> => {
    const fields = line.split('\t').map((field) => field.slice(1, -1).replace(/""/g, '"'));
    return Object.fromEntries(columns.map((column, i) => [column, fields[i]]));
  });
  const titles = parseCardTitlesTsv(read('data', 'card_titles.tsv'));

  it('holds one row for each card, in the card data order', () => {
    const keys = [...new Set(cards.map((c) => `${c.CollectorsInfo}\t${c.Name}`))];
    expect(titles.map((r) => `${r.CollectorsInfo}\t${r.Name}`)).toEqual(keys);
  });

  it('gives each card the Title and Subtitle of its row, which give back its name less the suffix', () => {
    const byKey = new Map(titles.map((r) => [`${r.CollectorsInfo}\t${r.Name}`, r] as const));
    for (const c of cards) {
      const r = byKey.get(`${c.CollectorsInfo}\t${c.Name}`)!;
      expect([c.Title, c.Subtitle]).toEqual([r.Title, r.Subtitle]);
      expect([r.Title, r.Subtitle].filter(Boolean).join(' ')).toBe(nameLessVersion(c.Name));
    }
  });
});
