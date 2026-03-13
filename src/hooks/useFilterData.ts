import searchQueryParser from 'search-query-parser';
import { useState, useEffect } from 'react';
import { textColumns, textAbbreviations, rangeColumns, rangeAbbreviations } from '../lib/constants';
import { AFFILIATION_ABBREVIATIONS } from '../lib/missionRequirements';
import { HQ_PLAYABILITY } from '../lib/hqPlayability';
import { track } from '@vercel/analytics';

const QUOTE_CHARS_REGEX = /[""«»\u2018\u2019\u201C\u201D]/g;

type CardRow = Record<string, any>;

interface RangeValue {
  from?: string;
  to?: string;
}

interface ParsedQuery {
  exclude?: Record<string, string | string[]>;
  [key: string]: string | string[] | RangeValue | Record<string, string | string[]> | undefined;
}

function isAnyAffiliationMatch(row: CardRow): boolean {
  return row.affiliation.includes('any affiliation');
}

function getReportsToSortRank(card: CardRow): number {
  const na = card.affiliation.includes('non-aligned');
  if (card.type === 'personnel') return na ? 1 : 0;
  if (card.type === 'ship') return na ? 3 : 2;
  if (card.type === 'equipment') return 4;
  return 5;
}

function toArray(item: string | string[]): string[] {
  if (Array.isArray(item)) {
    return item;
  } else {
    return [item];
  }
}

const colInQuery = (col: string, parsedQuery: ParsedQuery): string => {
  if (parsedQuery[col]) return col;
  if (parsedQuery.exclude && parsedQuery.exclude[col]) return col;
  return textAbbreviations[col] || rangeAbbreviations[col];
}


const useFilterData = (loading: boolean, data: CardRow[], columns: string[], searchQuery: string): CardRow[] => {
  console.log('starting useFilterData');
  const [filteredData, setFilteredData] = useState<CardRow[]>([]);

  let filtered: CardRow[];

  useEffect(() => {
    console.log(searchQuery);
    const parsedQuery: ParsedQuery = searchQueryParser.parse((searchQuery.toLowerCase() || '').replace(QUOTE_CHARS_REGEX, '"'), {
      keywords: textColumns.concat(Object.values(textAbbreviations)),
      ranges: rangeColumns.concat(Object.values(rangeAbbreviations)),
      offsets: false,
    }) as ParsedQuery;

    if (typeof parsedQuery === 'string') {
      console.log('typeof parsedQuery is string!')
      filtered = data.filter((row) => {
        return row.name.includes((parsedQuery as unknown as string).toLowerCase());
      })
    } else {
      console.log('typeof parsedQuery is not string!');
      textColumns.forEach((column) => {
        const fullOrAbbreviatedColumn = colInQuery(column, parsedQuery)
        const colValue = parsedQuery[fullOrAbbreviatedColumn];
        if (colValue) {
          parsedQuery[fullOrAbbreviatedColumn] = toArray(colValue as string | string[])
            .map((term) => term.toLowerCase())
        }
        if (parsedQuery.exclude && parsedQuery.exclude[fullOrAbbreviatedColumn]) {
          parsedQuery.exclude[fullOrAbbreviatedColumn] = toArray(parsedQuery.exclude[fullOrAbbreviatedColumn] as string | string[])
            .map((term) => term.toLowerCase())
        }
      });

      const withoutExcluded = data.filter((row) => {
        return textColumns.concat(rangeColumns).every((column) => {
          const fullOrAbbreviatedColumn = colInQuery(column, parsedQuery)
          if ( parsedQuery.exclude && parsedQuery.exclude[fullOrAbbreviatedColumn] ) {
            if (textColumns.includes(column)) {
              return (parsedQuery.exclude[fullOrAbbreviatedColumn] as string[]).every((match) => {
                if (column === 'affiliation') {
                  const abbrev = AFFILIATION_ABBREVIATIONS[match];
                  const affiliationText = row[column].replace(/\(except[^)]*\)/g, '');
                  return !affiliationText.includes(match) && !(abbrev && affiliationText.includes(abbrev));
                }
                if (column === 'reportsto') {
                  const predicate = HQ_PLAYABILITY[match];
                  return !predicate || !predicate(row);
                }
                return !row[column].includes(match);
              })
            }
          }
          return true;
        })
      })

      filtered = withoutExcluded.filter((row) => {
        return textColumns.concat(rangeColumns).every((column) => {
          const fullOrAbbreviatedColumn = colInQuery(column, parsedQuery)
          if (parsedQuery[fullOrAbbreviatedColumn]) {
            if (textColumns.includes(column)) {
              return (parsedQuery[fullOrAbbreviatedColumn] as string[]).every((match) => {
                if (column === 'affiliation') {
                  const abbrev = AFFILIATION_ABBREVIATIONS[match];
                  const exceptMatch = row[column].match(/\(except([^)]*)\)/i);
                  const affiliationText = row[column].replace(/\(except[^)]*\)/g, '');
                  if (affiliationText.includes('any affiliation')) {
                    if (!exceptMatch) return true;
                    const exceptText = exceptMatch[1].toLowerCase();
                    return !exceptText.includes(match) && !(abbrev && exceptText.includes(abbrev));
                  }
                  return affiliationText.includes(match) || (abbrev && affiliationText.includes(abbrev));
                }
                if (column === 'reportsto') {
                  const predicate = HQ_PLAYABILITY[match];
                  return predicate ? predicate(row) : false;
                }
                return row[column].includes(match);
              })
            } else if (rangeColumns.includes(column)) {
              const range = parsedQuery[fullOrAbbreviatedColumn] as RangeValue;
              const rowValue = parseFloat(row[column]);
              const fromValue = (range.from !== '' && range.from !== undefined) ? parseFloat(range.from) : -Infinity;
              const toValue = range.to !== '' && range.to !== undefined ? parseFloat(range.to) : Infinity;
              return rowValue >= fromValue && rowValue <= toValue;
            }
          }
          return true;
        });
      });
    }

    const affiliationCol = colInQuery('affiliation', parsedQuery);
    if (typeof parsedQuery !== 'string' && parsedQuery[affiliationCol]) {
      filtered = [...filtered].sort((a, b) => {
        const aIsAny = isAnyAffiliationMatch(a);
        const bIsAny = isAnyAffiliationMatch(b);
        if (aIsAny === bIsAny) return 0;
        return aIsAny ? 1 : -1;
      });
    }

    const reportstoCol = colInQuery('reportsto', parsedQuery);
    if (typeof parsedQuery !== 'string' && parsedQuery[reportstoCol]) {
      filtered = [...filtered].sort((a, b) => getReportsToSortRank(a) - getReportsToSortRank(b));
    }

    if (JSON.stringify(filtered) !== JSON.stringify(filteredData)) {
      track('deckBuilder.setFiltered', {q: searchQuery})
      setFilteredData(filtered);
    }
  }, [searchQuery, columns, data]);

  return filteredData;
}

export default useFilterData;
