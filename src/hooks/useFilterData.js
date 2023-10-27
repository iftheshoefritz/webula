import searchQueryParser from 'search-query-parser';
import { useState, useEffect } from 'react';
import { textColumns, rangeColumns } from '../lib/constants';
import { track } from '@vercel/analytics';

const QUOTE_CHARS_REGEX = /[‘’“”«»\u2018\u2019\u201C\u201D]/g;

function toArray(item) {
  if (Array.isArray(item)) {
    return item;
  } else {
    return [item];
  }
}

const useFilterData = (loading, data, columns, searchQuery) => {
  console.log('starting useFilterData');
  const [filteredData, setFilteredData] = useState([]);

  useEffect(() => {
    const parsedQuery = searchQueryParser.parse((searchQuery || '').replace(QUOTE_CHARS_REGEX, '"'), {
      keywords: textColumns,
      ranges: rangeColumns,
      offsets: false,
    });
    textColumns.forEach((column) => {
      if (parsedQuery[column]) {
        parsedQuery[column] = toArray(parsedQuery[column])
          .map((term) => term.toLowerCase())
      }
      if (parsedQuery.exclude && parsedQuery.exclude[column])
        parsedQuery.exclude[column] = toArray(parsedQuery.exclude[column])
          .map((term) => term.toLowerCase())
    });

    const withoutExcluded = data.filter((row) => {
      return columns.every((column) => {
        if ( parsedQuery.exclude && parsedQuery.exclude[column] ) {
          if (textColumns.includes(column)) {
            return parsedQuery.exclude[column].every((match) =>
              !row[column].includes(match)
            )
          }
        }
        return true;
      })
    })

    const filtered = withoutExcluded.filter((row) => {
      return columns.every((column) => {
        if (parsedQuery[column]) {
          if (textColumns.includes(column)) {
            return parsedQuery[column].every((match) =>
              row[column].includes(match)
            )
          } else if (rangeColumns.includes(column)) {
            const range = parsedQuery[column];
            const rowValue = parseFloat(row[column]);
            const fromValue = range.from !== '' && range.from !== undefined ? parseFloat(range.from) : -Infinity;
            const toValue = range.to !== '' && range.to !== undefined ? parseFloat(range.to) : Infinity;
            return rowValue >= fromValue && rowValue <= toValue;
          }
        }
        return true;
      });
    });

    if (JSON.stringify(filtered) !== JSON.stringify(filteredData)) {
      track('deckBuilder.setFiltered', {q: searchQuery})
      setFilteredData(filtered);
    }
  }, [searchQuery, columns, data]);

  return filteredData;
}

export default useFilterData;
