import { readFileSync } from 'fs';
import { join } from 'path';
import * as d3 from 'd3';

export interface CardData {
  collectorsinfo: string;
  dilemmatype: string;
  imagefile: string;
  name: string;
  type: string;
  originalName: string;
  mission: string;
  unique: string;
  [key: string]: string | number;
}

const nonFilterColumns = ['ImageFile'];

function parseCardData(text: string): { data: CardData[]; columns: string[] } {
  const parsedData = d3.tsvParse(text);

  const formattedData = parsedData.map((row) => {
    const newRow: Record<string, string | number> = Object.fromEntries(
      Object.entries(row).map(([key, value]) =>
        nonFilterColumns.includes(key)
          ? [key.toLowerCase(), value as number]
          : [key.toLowerCase(), (value as string).toLowerCase()],
      ),
    );
    newRow.originalName = row.Name!;
    return newRow;
  });

  const dataWithStrippedCollectorsInfo = formattedData.map((row) => {
    const paddedCollectorsInfo = row.collectorsinfo as string;
    row.collectorsinfo = paddedCollectorsInfo.replace(/(^|[^0-9])0+(\d+)/g, '$1$2');
    return row;
  });

  const dataWithDotlessCommanderKeywords = dataWithStrippedCollectorsInfo.map((row) => {
    const dottedCommanderKeywords = row.keywords as string;
    row.keywords = dottedCommanderKeywords
      .replace(/U\.S\.S./i, 'uss')
      .replace(/I\.K\.S\./i, 'iks');
    return row;
  });

  const dataWithSingleImageFile = dataWithDotlessCommanderKeywords.map((row) => {
    const imageFile = row.imagefile as string;
    row.imagefile = imageFile.split(',')[0];
    return row;
  });

  const columns = parsedData.length > 0
    ? Object.keys(parsedData[0]).map((key) => key.toLowerCase())
    : [];

  return {
    data: dataWithSingleImageFile as CardData[],
    columns
  };
}

let cachedData: { data: CardData[]; columns: string[] } | null = null;

export function loadCards(): { data: CardData[]; columns: string[] } {
  if (cachedData) {
    return cachedData;
  }

  const filePath = join(process.cwd(), 'public', 'cards_with_processed_columns.txt');
  const text = readFileSync(filePath, 'utf-8');
  cachedData = parseCardData(text);

  return cachedData;
}
