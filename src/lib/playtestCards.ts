// Turns the playtest TSV the owner uploads into TSV text in the columns of
// `public/cards_with_processed_columns.txt`, so `parseCardData` and
// `useDataFetching` read it unchanged (#1611). Pure: no network, no `fs`, no d3.

export const PLAYTEST_COLUMNS = [
  'Name', 'Set', 'ImageFile', 'Rarity', 'Unique', 'CollectorsInfo', 'Type', 'Cost',
  'Mission/DilemmaType', 'Span', 'Points', 'Quadrant', 'Affiliation', 'Icons', 'Staff',
  'Keywords', 'Class', 'Species', 'Skills', 'Integrity/Range', 'Cunning/Weapons',
  'Strength/Shields', 'Text',
] as const;

// The header of `public/cards_with_processed_columns.txt`, in its order.
export const CARD_DATA_COLUMNS = [
  'Name', 'Set', 'ImageFile', 'Rarity', 'Unique', 'CollectorsInfo', 'Type', 'Cost',
  'Mission', 'DilemmaType', 'Span', 'Points', 'Quadrant', 'Affiliation', 'Icons', 'Staff',
  'Keywords', 'Class', 'Species', 'Skills', 'Integrity', 'Range', 'Cunning', 'Weapons',
  'Strength', 'Shields', 'gametext', 'HoF',
] as const;

const KNOWN_TYPES = new Set([
  'personnel', 'ship', 'mission', 'dilemma', 'equipment', 'event', 'interrupt',
]);

export const PLAYTEST_PREFIX = 'PT-';

export interface Problem {
  // The 1-based line of the input where the row starts.
  line: number;
  // The card's `Name`, when the row has one.
  card?: string;
  message: string;
}

export interface PlaytestResult {
  tsv: string;
  cards: number;
  errors: Problem[];
  warnings: Problem[];
}

type PlaytestColumn = (typeof PLAYTEST_COLUMNS)[number];
type CardDataColumn = (typeof CARD_DATA_COLUMNS)[number];
type PlaytestRow = { line: number; fields: Record<PlaytestColumn, string> };

// The key `parseCardData` makes of a `CollectorsInfo`: it strips leading zeros.
export const playtestDeckKey = (collectorsInfo: string) =>
  `${PLAYTEST_PREFIX}${collectorsInfo}`.replace(/(^|[^0-9])0+(\d+)/g, '$1$2').toLowerCase();

const joinBrackets = (value: string) => value.replace(/\]\s+\[/g, '][').trim();

// Every field of the card data is in double quotes, and a quote inside is doubled.
const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;

/**
 * The cards of the other playtest sets in testing (#1644), by set name: a deck resolves a card by
 * its name and keys it by its `CollectorsInfo`, so no two sets may share either.
 */
export interface OtherPlaytestSets {
  /** The card name, to the name of the set that holds it. */
  names: Map<string, string>;
  /** The deck key of a `CollectorsInfo` (`playtestDeckKey`), to the name of the set that holds it. */
  keys: Map<string, string>;
}

const NO_OTHER_SETS: OtherPlaytestSets = { names: new Map(), keys: new Map() };

export function normalisePlaytestTsv(
  text: string,
  realNames: Set<string>,
  others: OtherPlaytestSets = NO_OTHER_SETS,
): PlaytestResult {
  const errors: Problem[] = [];
  const warnings: Problem[] = [];
  const lines = text.split('\n').map((line, i) => ({ line: i + 1, text: line.replace(/\r/g, '') }))
    .filter(({ text: line }) => line.trim() !== '');

  const empty: PlaytestResult = { tsv: `${CARD_DATA_COLUMNS.join('\t')}\n`, cards: 0, errors, warnings };
  if (lines.length === 0) {
    errors.push({ line: 1, message: 'The file is empty' });
    return empty;
  }

  const header = lines[0].text.split('\t').map((field) => field.trim());
  if (header.length !== PLAYTEST_COLUMNS.length || header.some((name, i) => name !== PLAYTEST_COLUMNS[i])) {
    errors.push({
      line: lines[0].line,
      message: `The header must be the ${PLAYTEST_COLUMNS.length} columns ${PLAYTEST_COLUMNS.join(', ')}`,
    });
    return empty;
  }

  const rows: PlaytestRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const start = lines[i].line;
    let fields = lines[i].text.split('\t');
    // A row broken across lines: join the next line with a space until it has 23 fields.
    while (fields.length < PLAYTEST_COLUMNS.length && i + 1 < lines.length) {
      i++;
      const next = lines[i].text.split('\t');
      fields = [...fields.slice(0, -1), `${fields[fields.length - 1]} ${next[0]}`, ...next.slice(1)];
    }
    const name = fields[0]?.trim() || undefined;
    if (fields.length !== PLAYTEST_COLUMNS.length) {
      errors.push({
        line: start,
        card: name,
        message: `The row has ${fields.length} fields, not ${PLAYTEST_COLUMNS.length}`,
      });
      continue;
    }
    rows.push({
      line: start,
      fields: Object.fromEntries(PLAYTEST_COLUMNS.map((column, j) => [column, fields[j].trim()])) as Record<PlaytestColumn, string>,
    });
  }

  // `{9003}` names the card whose `CollectorsInfo` is 9003 with a letter suffix.
  const namesByNumber = new Map<string, string[]>();
  for (const { fields } of rows) {
    const number = fields.CollectorsInfo.replace(/[A-Za-z]+$/, '');
    if (!number || !fields.Name) continue;
    namesByNumber.set(number, [...(namesByNumber.get(number) ?? []), fields.Name]);
  }

  const seenKeys = new Set<string>();
  const seenNames = new Set<string>();
  const output: string[] = [CARD_DATA_COLUMNS.join('\t')];

  for (const { line, fields } of rows) {
    const card = fields.Name || undefined;
    const rowErrors: string[] = [];
    for (const column of ['Name', 'Type', 'ImageFile'] as const) {
      if (!fields[column]) rowErrors.push(`The ${column} is missing`);
    }
    if (fields.CollectorsInfo) {
      const key = playtestDeckKey(fields.CollectorsInfo);
      if (seenKeys.has(key)) rowErrors.push(`The CollectorsInfo ${fields.CollectorsInfo} is used by another card`);
      else if (others.keys.has(key)) {
        rowErrors.push(`The CollectorsInfo ${fields.CollectorsInfo} is used by a card of the playtest set ${others.keys.get(key)}`);
      }
      seenKeys.add(key);
    }
    if (card) {
      if (realNames.has(card)) rowErrors.push('The name is the name of a real card');
      else if (seenNames.has(card)) rowErrors.push('The name is used by another playtest card');
      else if (others.names.has(card)) rowErrors.push(`The name is used by a card of the playtest set ${others.names.get(card)}`);
      seenNames.add(card);
    }
    if (rowErrors.length > 0) {
      rowErrors.forEach((message) => errors.push({ line, card, message }));
      continue;
    }

    const type = fields.Type.toLowerCase();
    if (!KNOWN_TYPES.has(type)) warnings.push({ line, card, message: `The Type ${fields.Type} is unknown` });
    const isShip = type === 'ship';
    if (isShip && !fields.Class.endsWith(' Class')) {
      warnings.push({ line, card, message: `The Class "${fields.Class}" does not end in " Class"` });
    }

    const gametext = fields.Text.replace(/\{(\d+)\}/g, (reference, number: string) => {
      const names = namesByNumber.get(number);
      if (!names) {
        warnings.push({ line, card, message: `The reference ${reference} names no card` });
        return reference;
      }
      if (names.length > 1) {
        warnings.push({ line, card, message: `The reference ${reference} names more than one card; it reads ${names[0]}` });
      }
      return names[0];
    });

    const mapped: Record<CardDataColumn, string> = {
      Name: fields.Name,
      Set: fields.Set,
      ImageFile: fields.ImageFile,
      Rarity: fields.Rarity,
      Unique: fields.Unique === '1' ? 'Y' : 'N',
      CollectorsInfo: `${PLAYTEST_PREFIX}${fields.CollectorsInfo}`,
      Type: fields.Type,
      Cost: fields.Cost,
      Mission: fields['Mission/DilemmaType'],
      DilemmaType: fields['Mission/DilemmaType'],
      Span: fields.Span,
      Points: fields.Points,
      Quadrant: fields.Quadrant,
      Affiliation: fields.Affiliation,
      Icons: joinBrackets(fields.Icons),
      Staff: joinBrackets(fields.Staff),
      Keywords: fields.Keywords,
      Class: fields.Class,
      Species: fields.Species,
      Skills: fields.Skills,
      Integrity: isShip ? '' : fields['Integrity/Range'],
      Range: isShip ? fields['Integrity/Range'] : '',
      Cunning: isShip ? '' : fields['Cunning/Weapons'],
      Weapons: isShip ? fields['Cunning/Weapons'] : '',
      Strength: isShip ? '' : fields['Strength/Shields'],
      Shields: isShip ? fields['Strength/Shields'] : '',
      gametext,
      HoF: 'N',
    };
    output.push(CARD_DATA_COLUMNS.map((column) => quote(mapped[column])).join('\t'));
  }

  return { tsv: `${output.join('\n')}\n`, cards: output.length - 1, errors, warnings };
}
