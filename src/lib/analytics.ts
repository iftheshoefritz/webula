import posthog from 'posthog-js';
import searchQueryParser from 'search-query-parser';
import { textColumns, textAbbreviations, numericColumns, numericAbbreviations } from './constants';

// Every custom PostHog event goes through `track`, with or without consent (#1408). The
// properties hold no free text: numbers, booleans, and strings from a fixed list only. A visitor
// who gave no consent sends the same events, in PostHog's cookieless mode.

// A search field name of `src/lib/constants.ts`. Only `queryFields` makes one, so a string the
// visitor typed cannot pass as a field name.
export type QueryField = string & { readonly __queryField: true };

export type AnalyticsEvents = {
  'useDataFetch.fetchCardsStart': undefined;
  'useDataFetch.fetchCardsFinish': undefined;
  'useDataFetch.parseDataStart': undefined;
  'useDataFetching.parseDataFinish': undefined;
  'deckBuilder.setFiltered': { fields: QueryField[]; text: boolean; results: number };
  'deckBuilder.handleFileLoad.start': undefined;
  'deckBuilder.handleFileLoad.finish': { lines: number };
  'deckBuilder.handleFileLoad.unknownCard': undefined;
  'deckBuilder.lackeyExport.start': undefined;
  'deckBuilder.lackeyExport.finish': { bytes: number };
  'deckBuilder.bulkImportFromDisk.start': { fileCount: number };
  'deckBuilder.bulkImportFromDisk.finish': { fileCount: number };
  'deckBuilder.driveFileLoad.start': undefined;
  'deckBuilder.driveFileLoad.end': undefined;
  'deckBuilder.compareDeckLoad.start': undefined;
  'deckBuilder.compareDeckLoad.end': undefined;
  'deckBuilder.driveFileDelete.start': undefined;
  'deckBuilder.driveFileDelete.end': undefined;
  'deckBuilder.driveFolderCreate.start': undefined;
  'deckBuilder.driveFolderCreate.end': undefined;
  'deckBuilder.driveFileMove.start': undefined;
  'deckBuilder.driveFileMove.end': undefined;
  'deckBuilder.driveFileRename.start': undefined;
  'deckBuilder.driveFileRename.end': undefined;
};

export type AnalyticsEvent = keyof AnalyticsEvents;

export function track<E extends AnalyticsEvent>(
  ...[name, properties]: AnalyticsEvents[E] extends undefined ? [E] : [E, AnalyticsEvents[E]]
): void {
  if (properties) posthog.capture(name, properties);
  else posthog.capture(name);
}

const fieldOfName: Record<string, string> = Object.fromEntries([
  ...textColumns.map((column) => [column, column]),
  ...numericColumns.map((column) => [column, column]),
  ...Object.entries(textAbbreviations).map(([column, abbreviation]) => [abbreviation, column]),
  ...Object.entries(numericAbbreviations).map(([column, abbreviation]) => [abbreviation, column]),
]);

// The field names a search query uses, abbreviations made full, and whether it holds a bare text
// term. Never the values: `a:federation sk:medical picard` gives `affiliation`, `skills` and `text`.
export function queryFields(searchQuery: string): { fields: QueryField[]; text: boolean } {
  const parsed = searchQueryParser.parse(searchQuery.toLowerCase(), {
    keywords: textColumns.concat(Object.values(textAbbreviations)),
    ranges: numericColumns.concat(Object.values(numericAbbreviations)),
    offsets: false,
  }) as string | Record<string, unknown>;

  if (typeof parsed === 'string') return { fields: [], text: parsed.trim() !== '' };

  const exclude = (parsed.exclude ?? {}) as Record<string, unknown>;
  const names = [...Object.keys(parsed), ...Object.keys(exclude)];
  const fields = Array.from(new Set(names.flatMap((name) => (fieldOfName[name] ? [fieldOfName[name]] : []))))
    .sort() as QueryField[];
  const hasText = (value: unknown) => (Array.isArray(value) ? value.length > 0 : typeof value === 'string' && value.trim() !== '');
  return { fields, text: hasText(parsed.text) || hasText(exclude.text) };
}
