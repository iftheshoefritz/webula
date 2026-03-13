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

export interface FilterOptions {
  sets: string[];
  species: string[];
  keywords: string[];
  affiliations: string[];
  icons: string[];
}

let cachedData: { data: CardData[]; columns: string[] } | null = null;
let cachedFilterOptions: FilterOptions | null = null;

export function loadCards(): { data: CardData[]; columns: string[] } {
  if (cachedData) {
    return cachedData;
  }

  const filePath = join(process.cwd(), 'public', 'cards_with_processed_columns.txt');
  const text = readFileSync(filePath, 'utf-8');
  cachedData = parseCardData(text);

  return cachedData;
}

export function loadFilterOptions(): FilterOptions {
  if (cachedFilterOptions) {
    return cachedFilterOptions;
  }

  const { data } = loadCards();

  const sets = new Set<string>();
  const species = new Set<string>();
  const keywords = new Set<string>();
  const affiliations = new Set<string>();
  const icons = new Set<string>();

  for (const card of data) {
    // Single-value fields
    if (card.set && typeof card.set === 'string' && card.set.trim()) {
      sets.add(card.set.trim());
    }
    if (card.species && typeof card.species === 'string' && card.species.trim()) {
      species.add(card.species.trim());
    }
    if (card.affiliation && typeof card.affiliation === 'string' && card.affiliation.trim()) {
      affiliations.add(card.affiliation.trim());
    }

    // Keywords: period-separated tokens, e.g. "admiral. region: badlands."
    if (card.keywords && typeof card.keywords === 'string' && card.keywords.trim()) {
      // Split on '. ' or '.' at end of string; filter out Commander: ship names
      const raw = card.keywords as string;
      // Split on '. ' boundaries and strip trailing dot
      const parts = raw.split(/\.\s+/).map((p) => p.replace(/\.$/, '').trim()).filter(Boolean);
      for (const part of parts) {
        // Skip "Commander: <ship>" entries — too specific to be useful as filter options
        if (!part.toLowerCase().startsWith('commander:')) {
          keywords.add(part);
        }
      }
    }

    // Icons: tokens in [brackets], e.g. "[cmd][ds9]"
    if (card.icons && typeof card.icons === 'string' && card.icons.trim()) {
      const iconRaw = card.icons as string;
      const iconRegex = /\[([^\]]+)\]/g;
      let iconMatch: RegExpExecArray | null;
      while ((iconMatch = iconRegex.exec(iconRaw)) !== null) {
        icons.add(iconMatch[1].trim());
      }
    }
  }

  cachedFilterOptions = {
    sets: Array.from(sets).sort(),
    species: Array.from(species).sort(),
    keywords: Array.from(keywords).sort(),
    affiliations: Array.from(affiliations).sort(),
    icons: Array.from(icons).sort(),
  };

  return cachedFilterOptions;
}
