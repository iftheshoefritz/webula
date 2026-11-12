// Every row here is invented. No real playtest card belongs in this repository.
jest.mock('d3', () => ({
  // The real file wraps each field in quotes and doubles an inner quote.
  tsvParse: (text: string) => {
    const unquote = (field: string) =>
      field.startsWith('"') && field.endsWith('"') ? field.slice(1, -1).replace(/""/g, '"') : field;
    const lines = text.split('\n').filter(Boolean);
    if (lines.length < 2) return [];
    const headers = lines[0].split('\t');
    return lines.slice(1).map((line) => {
      const values = line.split('\t').map(unquote);
      return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']));
    });
  },
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { parseCardData } from '../../lib/loadCards';
import {
  CARD_DATA_COLUMNS,
  PLAYTEST_COLUMNS,
  normalisePlaytestTsv,
} from '../../lib/playtestCards';

const HEADER = PLAYTEST_COLUMNS.join('\t');

const PERSONNEL = 'Test Officer Example Persona\tPlaytest\t9001A\tT\t1\t9001A\tPersonnel\t2\t\t\t\t\tFederation\t[Stf] [Voy] [AU] \t\t\t\tHuman\tEngineer 2 Science\t6\t5\t6\tWhen you play this personnel, you may draw a card. See {9003}.';
const SHIP = 'Test Vessel Example\tPlaytest\t9002A\tT\t1\t9002A\tShip\t4\t\t\t\t\tFederation\t [Voy]\t[Cmd] [Stf]\t\tExample Class\t\t\t7\t7\t6\tWhile this ship is at {9003}, it is Range +1.';
const MISSION = 'Example Mission Place\tPlaytest\t9003A\tT\t1\t9003A\tMission\t0\tS\t3\t35\tD\t\t   \t\t\t\t\tAstrometrics, Engineer, and Cunning>30\t\t\t\tTemporal. When you complete this mission, flip it over.';
const EQUIPMENT = 'Test Gadget\tPlaytest\t9004A\tT\t\t9004A\tEquipment\t1\t\t\t\t\t\t   \t\t\t\t\t\t\t\t\tYour personnel present are Cunning +1.';

const fileOf = (...rows: string[]) => [HEADER, ...rows].join('\n');

// Reads the output rows back into objects keyed by the card data columns.
const rowsOf = (tsv: string) => {
  const [header, ...lines] = tsv.trim().split('\n');
  const columns = header.split('\t');
  return lines.map((line) =>
    Object.fromEntries(
      line.split('\t').map((field, i) => [columns[i], field.slice(1, -1).replace(/""/g, '"')]),
    ),
  );
};

const normalise = (text: string, realNames: string[] = []) => normalisePlaytestTsv(text, new Set(realNames));

const withField = (row: string, column: (typeof PLAYTEST_COLUMNS)[number], value: string) => {
  const fields = row.split('\t');
  fields[PLAYTEST_COLUMNS.indexOf(column)] = value;
  return fields.join('\t');
};

describe('normalisePlaytestTsv: the columns', () => {
  it('writes the columns of the card data file, in its order', () => {
    const realHeader = readFileSync(join(process.cwd(), 'public', 'cards_with_processed_columns.txt'), 'utf-8').split('\n')[0];
    expect(realHeader.trim().split('\t')).toEqual([...CARD_DATA_COLUMNS]);
    expect(normalise(fileOf(PERSONNEL)).tsv.split('\n')[0]).toBe(CARD_DATA_COLUMNS.join('\t'));
  });

  it('writes every field in double quotes', () => {
    const line = normalise(fileOf(EQUIPMENT)).tsv.split('\n')[1];
    expect(line.split('\t')).toHaveLength(CARD_DATA_COLUMNS.length);
    line.split('\t').forEach((field) => expect(field).toMatch(/^".*"$/));
  });
});

describe('normalisePlaytestTsv: the mapping', () => {
  const all = () => rowsOf(normalise(fileOf(PERSONNEL, SHIP, MISSION, EQUIPMENT)).tsv);

  it('maps Unique 1 to Y and blank to N', () => {
    const [personnel, , , equipment] = all();
    expect(personnel.Unique).toBe('Y');
    expect(equipment.Unique).toBe('N');
  });

  it('copies Mission/DilemmaType to both Mission and DilemmaType', () => {
    const mission = all()[2];
    expect(mission.Mission).toBe('S');
    expect(mission.DilemmaType).toBe('S');
  });

  it('puts a ship\'s attributes in Range, Weapons and Shields', () => {
    const ship = all()[1];
    expect([ship.Range, ship.Weapons, ship.Shields]).toEqual(['7', '7', '6']);
    expect([ship.Integrity, ship.Cunning, ship.Strength]).toEqual(['', '', '']);
  });

  it('puts every other type\'s attributes in Integrity, Cunning and Strength', () => {
    const personnel = all()[0];
    expect([personnel.Integrity, personnel.Cunning, personnel.Strength]).toEqual(['6', '5', '6']);
    expect([personnel.Range, personnel.Weapons, personnel.Shields]).toEqual(['', '', '']);
  });

  it('resolves a {number} reference in Text to the full name, in gametext', () => {
    const [personnel, ship] = all();
    expect(personnel.gametext).toBe('When you play this personnel, you may draw a card. See Example Mission Place.');
    expect(ship.gametext).toBe('While this ship is at Example Mission Place, it is Range +1.');
  });

  it('drops the spaces between the brackets of Icons and Staff, and trims them', () => {
    const [personnel, ship, mission] = all();
    expect(personnel.Icons).toBe('[Stf][Voy][AU]');
    expect(ship.Icons).toBe('[Voy]');
    expect(ship.Staff).toBe('[Cmd][Stf]');
    expect(mission.Icons).toBe('');
  });

  it('prefixes CollectorsInfo with PT-', () => {
    expect(all().map((row) => row.CollectorsInfo)).toEqual(['PT-9001A', 'PT-9002A', 'PT-9003A', 'PT-9004A']);
  });

  it('keeps ImageFile unchanged', () => {
    const fileWithBack = withField(MISSION, 'ImageFile', '9003A,9003B');
    expect(rowsOf(normalise(fileOf(fileWithBack)).tsv)[0].ImageFile).toBe('9003A,9003B');
    expect(all()[0].ImageFile).toBe('9001A');
  });

  it('sets HoF to N', () => {
    all().forEach((row) => expect(row.HoF).toBe('N'));
  });

  it('keeps a mission\'s requirements in Skills', () => {
    expect(all()[2].Skills).toBe('Astrometrics, Engineer, and Cunning>30');
  });

  it('copies the other columns across, trimmed', () => {
    const personnel = rowsOf(normalise(fileOf(withField(PERSONNEL, 'Species', '  Human  '))).tsv)[0];
    expect(personnel).toMatchObject({
      Name: 'Test Officer Example Persona', Set: 'Playtest', Rarity: 'T', Type: 'Personnel',
      Cost: '2', Affiliation: 'Federation', Species: 'Human', Skills: 'Engineer 2 Science',
    });
    const mission = all()[2];
    expect(mission).toMatchObject({ Span: '3', Points: '35', Quadrant: 'D' });
  });

  it('keeps a quote in a field through the round trip', () => {
    const quoted = withField(EQUIPMENT, 'Text', 'Name it "the gadget".');
    const result = normalise(fileOf(quoted));
    expect(rowsOf(result.tsv)[0].gametext).toBe('Name it "the gadget".');
    expect(parseCardData(result.tsv).data[0].gametext).toBe('name it "the gadget".');
  });
});

describe('normalisePlaytestTsv: tolerance', () => {
  it('joins a row broken after Skills across two lines', () => {
    const [head, tail] = [PERSONNEL.split('\tEngineer 2 Science\t')[0] + '\tEngineer 2', 'Science\t6\t5\t6\tSee {9003}.'];
    const result = normalise(fileOf(head, tail, MISSION));
    expect(result.cards).toBe(2);
    expect(result.errors).toEqual([]);
    const personnel = rowsOf(result.tsv)[0];
    expect(personnel.Skills).toBe('Engineer 2 Science');
    expect(personnel.Integrity).toBe('6');
    expect(personnel.gametext).toBe('See Example Mission Place.');
  });

  it('joins a row broken across three lines, and reports it at the line where it starts', () => {
    // Broken inside Icons and inside Class. With no mission, the reference warns, at the row's first line.
    const broken = SHIP.replace('\t [Voy]', '\t\n[Voy]').replace('Example Class', 'Example\nClass');
    const result = normalise(fileOf(broken));
    expect(rowsOf(result.tsv)[0]).toMatchObject({ Class: 'Example Class', Range: '7' });
    expect(rowsOf(result.tsv)[0].gametext).toBe('While this ship is at {9003}, it is Range +1.');
    expect(result.cards).toBe(1);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([
      expect.objectContaining({ line: 2, card: 'Test Vessel Example', message: expect.stringContaining('{9003}') }),
    ]);
  });

  it('skips blank lines and drops carriage returns', () => {
    const result = normalise(['', HEADER, '', MISSION, '   ', EQUIPMENT, ''].join('\r\n'));
    expect(result.cards).toBe(2);
    expect(result.errors).toEqual([]);
    expect(rowsOf(result.tsv)[1].gametext).toBe('Your personnel present are Cunning +1.');
  });
});

describe('normalisePlaytestTsv: errors', () => {
  it('reports a wrong header', () => {
    const result = normalise(['Name\tSet', MISSION].join('\n'));
    expect(result.cards).toBe(0);
    expect(result.errors).toEqual([expect.objectContaining({ line: 1 })]);
  });

  it('reports a row that still has the wrong number of fields', () => {
    const result = normalise(fileOf(`${MISSION}\textra`, EQUIPMENT));
    expect(result.errors).toEqual([
      expect.objectContaining({ line: 2, card: 'Example Mission Place', message: expect.stringContaining('24 fields') }),
    ]);
    expect(result.cards).toBe(1);
    expect(result.tsv).not.toContain('Example Mission Place');
  });

  it('reports a row still short at the end of the file', () => {
    const result = normalise(fileOf(EQUIPMENT, 'Test Short Row\tPlaytest'));
    expect(result.errors).toEqual([expect.objectContaining({ line: 3, card: 'Test Short Row' })]);
    expect(result.cards).toBe(1);
  });

  it.each(['Name', 'Type', 'ImageFile'] as const)('reports a missing %s', (column) => {
    const result = normalise(fileOf(withField(EQUIPMENT, column, ''), MISSION));
    expect(result.errors).toEqual([expect.objectContaining({ line: 2, message: `The ${column} is missing` })]);
    expect(result.cards).toBe(1);
    expect(result.tsv).not.toContain('Your personnel present');
  });

  it('reports a duplicate CollectorsInfo, after the leading zeros are stripped', () => {
    const other = withField(withField(EQUIPMENT, 'Name', 'Test Other Gadget'), 'CollectorsInfo', '09004A');
    const result = normalise(fileOf(EQUIPMENT, other));
    expect(result.errors).toEqual([
      expect.objectContaining({ line: 3, card: 'Test Other Gadget', message: expect.stringContaining('09004A') }),
    ]);
    expect(result.cards).toBe(1);
    expect(result.tsv).not.toContain('Test Other Gadget');
  });

  it('reports a name equal to a real card\'s name', () => {
    const result = normalise(fileOf(EQUIPMENT, MISSION), ['Test Gadget']);
    expect(result.errors).toEqual([expect.objectContaining({ line: 2, card: 'Test Gadget' })]);
    expect(result.cards).toBe(1);
    expect(result.tsv).not.toContain('Test Gadget');
  });

  it('reports a name used twice in the playtest list', () => {
    const result = normalise(fileOf(EQUIPMENT, withField(EQUIPMENT, 'CollectorsInfo', '9005A')));
    expect(result.errors).toEqual([expect.objectContaining({ line: 3, card: 'Test Gadget' })]);
    expect(result.cards).toBe(1);
  });
});

describe('normalisePlaytestTsv: warnings', () => {
  it('warns of an unknown reference and leaves it as it is', () => {
    const result = normalise(fileOf(PERSONNEL));
    expect(result.cards).toBe(1);
    expect(result.warnings).toEqual([expect.objectContaining({ line: 2, card: 'Test Officer Example Persona' })]);
    expect(rowsOf(result.tsv)[0].gametext).toContain('See {9003}.');
  });

  it('warns of a reference that names more than one card, and reads the first', () => {
    const back = withField(withField(MISSION, 'Name', 'Example Mission Other'), 'CollectorsInfo', '9003B');
    const result = normalise(fileOf(MISSION, back, PERSONNEL));
    expect(result.warnings).toEqual([expect.objectContaining({ line: 4, message: expect.stringContaining('more than one') })]);
    expect(rowsOf(result.tsv)[2].gametext).toContain('See Example Mission Place.');
  });

  it('warns of an unknown Type', () => {
    const result = normalise(fileOf(withField(EQUIPMENT, 'Type', 'Gizmo')));
    expect(result.cards).toBe(1);
    expect(result.warnings).toEqual([expect.objectContaining({ line: 2, message: expect.stringContaining('Gizmo') })]);
  });

  it('warns of a ship Class that does not end in " Class"', () => {
    const result = normalise(fileOf(withField(SHIP, 'Class', 'Example'), MISSION));
    expect(result.cards).toBe(2);
    expect(result.warnings).toEqual([expect.objectContaining({ line: 2, card: 'Test Vessel Example' })]);
  });
});

describe('normalisePlaytestTsv through parseCardData', () => {
  const { data } = parseCardData(normalise(fileOf(PERSONNEL, SHIP, MISSION, EQUIPMENT)).tsv);
  const byName = (name: string) => data.find((card) => card.originalName === name)!;

  it('reads a personnel with unique y', () => {
    const personnel = byName('Test Officer Example Persona');
    expect(personnel.unique).toBe('y');
    expect(personnel.collectorsinfo).toBe('pt-9001a');
    expect(personnel.icons).toBe('[stf][voy][au]');
  });

  it('reads a ship with range, weapons and shields', () => {
    const ship = byName('Test Vessel Example');
    expect([ship.range, ship.weapons, ship.shields]).toEqual(['7', '7', '6']);
    expect(ship.collectorsinfo).toBe('pt-9002a');
  });

  it('reads a mission with missiontype s', () => {
    const mission = byName('Example Mission Place');
    expect(mission.missiontype).toBe('s');
    expect(mission.dilemmatype).toBe('');
    expect(mission.imagefile).toBe('9003A');
    expect(mission.collectorsinfo).toBe('pt-9003a');
  });
});
