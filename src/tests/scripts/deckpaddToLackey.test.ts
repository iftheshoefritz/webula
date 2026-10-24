import fs from 'fs';
import path from 'path';

import {
  convertDeckpadd,
  decodeHtmlEntities,
  normalizeCardName,
  normalizeCollectorId,
  parseCardData,
  parseDeckpadd,
} from '../../../scripts/deckpadd_to_lackey.js';

// Rows in the shape `parseCardData` gives them: the Name, CollectorsInfo and Type columns of
// public/cards_with_processed_columns.txt, unchanged.
// `set` is the Set column. It defaults to the tag at the end of the name, such as `(R2)`.
const card = (name: string, collectorsInfo: string, type: string, set?: string) => ({
  name,
  set: set ?? (name.match(/\((\w+)\)$/) || name.match(/\*(\w+)$/) || [])[1] ?? `set${collectorsInfo.match(/^\d+/)?.[0]}`,
  collectorsInfo,
  type,
});

const cards = [
  card('Common Enemy', '33V022', 'Interrupt'),
  card('Mouth of the Wormhole Deep Space 9 *VP', '0VP272', 'Mission'),
  card('Mouth of the Wormhole Deep Space 9', '1S364', 'Mission'),
  card('Bareil Antos Selfless Scapegoat', '60AP013', 'Personnel'),
  card('Elim Garak Plain, Simple Tailor', '3U144', 'Personnel'),
  card('Elim Garak Plain, Simple Tailor (SS)', '59V021', 'Personnel'),
  card('Odo "Kodrak the Unenthused"', '52V010', 'Personnel'),
  card('Enrique Muniz Dependable Troubleshooter', '26V033', 'Personnel'),
  card('T\'Rul Guarded Attache', '33V045', 'Personnel'),
  card('Adopted Authority (SS)', '59V001', 'Dilemma'),
  card('Adopted Authority *VP', '0VP280', 'Dilemma'),
  card('Bareil Antos Esteemed Vedek', '1R208', 'Personnel'),
  card('Bareil Antos Esteemed Vedek (R2)', '1R208', 'Personnel'),
  card('Nimbus III Staff Backwater Embassy', '62V010', 'Mission'),
  card('U.S.S. Excelsior', '1C393', 'Ship'),
  card('U.S.S. Excelsior (BP)', '1B005', 'Ship'),
  card('U.S.S. Voyager Home Away From Home *VP', '0VP016', 'Ship'),
  card('U.S.S. Voyager Home Away From Home (BP)', '1B006', 'Ship'),
  card('Enterprise-D Diplomatic Envoy (BP)', '0B000', 'Ship'),
  card('Machinations', '2R049', 'Event'),
  card('Machinations (R2)', '2R049', 'Event'),
  card('Odo Curzon Odo', '6P040', 'Personnel', 'R2'),
  card('Near Marva V Elude Federation Forces', '14U054', 'Mission'),
];

describe('decodeHtmlEntities', () => {
  it('decodes accented letters, numeric entities and the common named ones', () => {
    expect(decodeHtmlEntities('Mu&ntilde;iz')).toBe('Muniz');
    expect(decodeHtmlEntities('Attach&eacute;')).toBe('Attache');
    expect(decodeHtmlEntities('A &amp; B &#233; &#xE9;')).toBe('A & B é é');
    expect(decodeHtmlEntities('&unknown;')).toBe('&unknown;');
  });
});

describe('normalizeCardName', () => {
  it('gives the DeckPADD name and the card data name the same form', () => {
    expect(normalizeCardName('Enrique Mu&ntilde;iz Dependable Troubleshooter'))
      .toBe(normalizeCardName('Enrique Muniz Dependable Troubleshooter'));
    expect(normalizeCardName('Jadzia Dax Conversant Veteran'))
      .toBe(normalizeCardName('•Jadzia Dax, Conversant Veteran'));
    expect(normalizeCardName('Adopted Authority')).toBe(normalizeCardName('Adopted Authority (SS)'));
    expect(normalizeCardName('Timescape')).toBe(normalizeCardName('Timescape *VP'));
  });
});

describe('normalizeCollectorId', () => {
  it('removes the zero padding of the card data', () => {
    expect(normalizeCollectorId('33V022')).toBe('33v22');
    expect(normalizeCollectorId('0VP001')).toBe('0vp1');
    expect(normalizeCollectorId('60AP13')).toBe('60ap13');
  });
});

describe('parseDeckpadd', () => {
  it('reads CRLF lines and reports a line that is not a DeckPADD line', () => {
    const { entries, unmatched, totalLines } = parseDeckpadd('33V22\tCommon Enemy\r\nnonsense\r\n\r\n');
    expect(entries).toEqual([
      { lineNumber: 1, line: '33V22\tCommon Enemy', collectorId: '33V22', name: 'Common Enemy' },
    ]);
    expect(unmatched).toEqual([expect.objectContaining({ lineNumber: 2, line: 'nonsense' })]);
    expect(totalLines).toBe(2);
  });
});

describe('convertDeckpadd', () => {
  const convert = (lines: string[]) => convertDeckpadd(lines.join('\r\n') + '\r\n', cards);

  it('counts one line per copy and sorts the cards into the Lackey piles', () => {
    const result = convert([
      '33V22\tCommon Enemy',
      '0VP272\tMouth of the Wormhole Deep Space 9',
      '33V22\tCommon Enemy',
      '59V1\tAdopted Authority',
      '33V22\tCommon Enemy',
    ]);
    expect(result.unmatched).toEqual([]);
    expect(result.lackey).toBe([
      'Deck:',
      '3\tCommon Enemy',
      'Dilemmas:',
      '1\tAdopted Authority (SS)',
      'Missions:',
      '1\tMouth of the Wormhole Deep Space 9 *VP',
    ].join('\n'));
  });

  it('uses the collector ID to tell two printings with one name apart', () => {
    const result = convert(['59V1\tAdopted Authority', '0VP280\tAdopted Authority']);
    expect(result.matches.map((m) => [m.card.name, m.method])).toEqual([
      ['Adopted Authority (SS)', 'id'],
      ['Adopted Authority *VP', 'id'],
    ]);
  });

  it('matches names with a comma in the subtitle, quotes and HTML entities', () => {
    const result = convert([
      '59V21\tElim Garak Plain, Simple Tailor',
      '52V10\tOdo "Kodrak the Unenthused"',
      '26V33\tEnrique Mu&ntilde;iz Dependable Troubleshooter',
      '33V45\tT\'Rul Guarded Attach&eacute;',
      '60AP13\tBareil Antos Selfless Scapegoat',
      '62V10\tNimbus III Staff Backwater Embassy',
    ]);
    expect(result.unmatched).toEqual([]);
    expect(result.matches.map((m) => m.card.name)).toEqual([
      'Elim Garak Plain, Simple Tailor (SS)',
      'Odo "Kodrak the Unenthused"',
      'Enrique Muniz Dependable Troubleshooter',
      'T\'Rul Guarded Attache',
      'Bareil Antos Selfless Scapegoat',
      'Nimbus III Staff Backwater Embassy',
    ]);
  });

  it('takes the original printing when a reprint shares the collector ID', () => {
    const result = convert(['1R208\tBareil Antos Esteemed Vedek']);
    expect(result.matches[0].card.name).toBe('Bareil Antos Esteemed Vedek');
  });

  it('falls back to the name when the collector ID is unknown', () => {
    const result = convert(['99V1\tCommon Enemy']);
    expect(result.matches).toEqual([expect.objectContaining({ method: 'name' })]);
    expect(result.matches[0].card.name).toBe('Common Enemy');
  });

  it('takes the printing of the DeckPADD set and rarity when the collector ID differs', () => {
    const result = convert([
      '0B5\tU.S.S. Excelsior',
      '0B6\tU.S.S. Voyager Home Away From Home',
      '6R49\tMachinations',
    ]);
    expect(result.matches.map((m) => [m.card.name, m.method])).toEqual([
      ['U.S.S. Excelsior (BP)', 'name'],
      ['U.S.S. Voyager Home Away From Home (BP)', 'name'],
      ['Machinations (R2)', 'name'],
    ]);
  });

  it('accepts a small typo in the name when the collector ID agrees', () => {
    const result = convert(['14U54\tNear Marva IV Elude Federation Forces']);
    expect(result.matches.map((m) => [m.card.name, m.method])).toEqual([
      ['Near Marva V Elude Federation Forces', 'idCloseName'],
    ]);
  });

  it('reports a line it cannot match, with the line number and a reason', () => {
    const result = convert(['33V22\tCommon Enemy', '33V22\tSomething Else', '99V9\tNo Such Card']);
    expect(result.totalLines).toBe(3);
    expect(result.unmatched).toEqual([
      { lineNumber: 2, line: '33V22\tSomething Else', reason: expect.stringContaining('"Common Enemy"') },
      { lineNumber: 3, line: '99V9\tNo Such Card', reason: expect.stringContaining('no card') },
    ]);
    expect(result.lackey).toBe('Deck:\n1\tCommon Enemy');
  });
});

describe('parseCardData', () => {
  it('removes the quotes of the card data file', () => {
    const tsv = [
      '"Name"\t"Set"\t"CollectorsInfo"\t"Type"',
      '"The Caretaker\'s ""Guests"" *VP"\t"VP"\t"0VP035"\t"Dilemma"',
    ].join('\n');
    expect(parseCardData(tsv)).toEqual([
      { name: 'The Caretaker\'s "Guests" *VP', set: 'VP', collectorsInfo: '0VP035', type: 'Dilemma' },
    ]);
  });
});

describe('the real card data', () => {
  const cardData = parseCardData(
    fs.readFileSync(path.join(process.cwd(), 'public', 'cards_with_processed_columns.txt'), 'utf8')
  );

  it('matches a DeckPADD sample by collector ID', () => {
    const result = convertDeckpadd([
      '0VP35\tThe Caretaker\'s "Guests"',
      '30V8\t"Rapid Progress"',
      '7C110\tVarria Lavishly Rewarded Aide',
      '26V33\tEnrique Mu&ntilde;iz Dependable Troubleshooter',
      '0VP272\tMouth of the Wormhole Deep Space 9',
    ].join('\r\n'), cardData);
    expect(result.unmatched).toEqual([]);
    expect(result.matches.map((m) => m.method)).toEqual(['id', 'id', 'id', 'id', 'id']);
  });
});
