import { useEffect, useState, useRef, useCallback } from 'react';
import { debounce } from 'lodash';
import * as d3 from 'd3';
import searchQueryParser from 'search-query-parser';
import SearchBar from '../components/SearchBar';
import SearchResults from '../components/SearchResults';
import Help from '../components/Help';
import useDataFetching from '../hooks/useDataFetching';
import { textColumns, rangeColumns } from '../lib/constants';

const nonFilterColumns = [
  'ImageFile'
]

const QUOTE_CHARS_REGEX = /[‘’“”«»\u2018\u2019\u201C\u201D]/g;

function toArray(item) {
  if (Array.isArray(item)) {
    return item;
  } else {
    return [item];
  }
}

function useFilterData(data, columns, searchQuery) {
  const [filteredData, setFilteredData] = useState([]);

  useEffect(() => {
    const parsedQuery = searchQueryParser.parse(searchQuery.replace(QUOTE_CHARS_REGEX, '"'), {
      keywords: textColumns,
      ranges: rangeColumns,
      offsets: false,
    });
    textColumns.forEach((column) => {
      if (parsedQuery[column]) {
        parsedQuery[column] = toArray(parsedQuery[column])
          .map((term) => term.toLowerCase())
      }
    });

    const filtered = data.filter((row) => {
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

    setFilteredData(filtered);
  }, [searchQuery]);

  return filteredData;
}

export default function Home() {
  const { data, columns, loading } = useDataFetching();
  const [searchQuery, setSearchQuery] = useState('');
  const filteredData = useFilterData(data, columns, searchQuery);

  return (
    <div>
      {loading ? (
        <p>Loading data...</p>
      ) : (
        <>
        <div className="container mx-auto p-8">
          <SearchBar searchQuery={searchQuery} setSearchQuery={setSearchQuery} klass="mb-4 w-full"/>
          <Help/>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            <SearchResults filteredData={filteredData}/>
          </div>
        </div>
        </>
      )}
    </div>
  );
}
