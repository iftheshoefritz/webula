import searchQueryParser from 'search-query-parser';
import { useState, useEffect } from 'react';
import { textColumns, textAbbreviations, rangeColumns, rangeAbbreviations } from '../lib/constants';
import { track } from '@vercel/analytics';

const QUOTE_CHARS_REGEX = /[‘’“”«»\u2018\u2019\u201C\u201D]/g;

function toArray(item) {
  if (Array.isArray(item)) {
    return item;
  } else {
    return [item];
  }
}

const colInQuery = (col, parsedQuery) =>
      parsedQuery[col] ? col : (textAbbreviations[col] || rangeAbbreviations[col])


const useFilterData = (loading, data, columns, searchQuery) => {
  console.log('starting useFilterData');
  const [filteredData, setFilteredData] = useState([]);

  let filtered;

  useEffect(() => {
    console.log(searchQuery);
    const parsedQuery = searchQueryParser.parse((searchQuery.toLowerCase() || '').replace(QUOTE_CHARS_REGEX, '"'), {
      keywords: textColumns.concat(Object.values(textAbbreviations)),
      ranges: rangeColumns.concat(Object.values(rangeAbbreviations)),
      offsets: false,
    });

    if (typeof parsedQuery === 'string') {
      console.log('typeof parsedQuery is string!')
      filtered = data.filter((row) => {
        return row.name.includes(parsedQuery.toLowerCase());
      })
    } else {
      console.log('typeof parsedQuery is not string!');
      textColumns.forEach((column) => {
        const fullOrAbbreviatedColumn = colInQuery(column, parsedQuery)
        if (parsedQuery[fullOrAbbreviatedColumn]) {
          parsedQuery[fullOrAbbreviatedColumn] = toArray(parsedQuery[fullOrAbbreviatedColumn])
            .map((term) => term.toLowerCase())
        }
        if (parsedQuery.exclude && parsedQuery.exclude[fullOrAbbreviatedColumn])
          parsedQuery.exclude[fullOrAbbreviatedColumn] = toArray(parsedQuery.exclude[fullOrAbbreviatedColumn])
            .map((term) => term.toLowerCase())
      });

      const withoutExcluded = data.filter((row) => {
        return textColumns.concat(rangeColumns).every((column) => {
          const fullOrAbbreviatedColumn = colInQuery(column, parsedQuery)
          if ( parsedQuery.exclude && parsedQuery.exclude[fullOrAbbreviatedColumn] ) {
            if (textColumns.includes(column)) {
              return parsedQuery.exclude[fullOrAbbreviatedColumn].every((match) =>
                !row[column].includes(match)
              )
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
              return parsedQuery[fullOrAbbreviatedColumn].every((match) =>
                row[column].includes(match)
              )
            } else if (rangeColumns.includes(column)) {
              const range = parsedQuery[fullOrAbbreviatedColumn];
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

    if (JSON.stringify(filtered) !== JSON.stringify(filteredData)) {
      track('deckBuilder.setFiltered', {q: searchQuery})
      setFilteredData(filtered);
    }
  }, [searchQuery, columns, data]);

  return filteredData;
}

export default useFilterData;
