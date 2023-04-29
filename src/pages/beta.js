import { useEffect, useState, useRef, useCallback } from 'react';
import { debounce } from 'lodash';
import * as d3 from 'd3';
import searchQueryParser from 'search-query-parser';
import Image from 'next/image';
import useDataFetching from '../hooks/useDataFetching';

function useLocalStorage(key, defaultValue) {
  const [value, setValue] = useState(() => {
    if (typeof window !== 'undefined') {
      const savedValue = localStorage.getItem(key);
      return savedValue ? JSON.parse(savedValue) : defaultValue;
    }
    return defaultValue;
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(key, JSON.stringify(value));
    }
  }, [key, value]);

  return [value, setValue];
}

const textColumns = [
  'name', 'set', 'rarity', 'unique', 'collectorsinfo', 'type', 'mission', 'dilemmatype',
  'quadrant', 'affiliation', 'icons', 'staff', 'keywords', 'class', 'species', 'skills',
  'gametext'
];

const rangeColumns = [
  'cost', 'span', 'points', 'integrity', 'range', 'cunning', 'weapons', 'strength', 'shields'
]

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

export default function Home() {
  const { data, filteredData, setFilteredData, columns, loading } = useDataFetching();
  const [searchQuery, setSearchQuery] = useState('');

  const [scratchCards, setScratchCards] = useLocalStorage('scratchCards', {});

  const handleSelect = (collectorsinfo, count) => {
    console.log(collectorsinfo);
    console.log(count)
    setScratchCards(prevState => ({
      ...prevState,
      [collectorsinfo]: count,
    }));
  };

  const debouncedFilterData = useRef(null);

  useEffect(() => {
    debouncedFilterData.current = debounce(
      (query) => {
        const parsedQuery = searchQueryParser.parse(query.replace(QUOTE_CHARS_REGEX, '"'), {
          keywords: textColumns,
          ranges: rangeColumns,
          offsets: false,
        });
        console.log(query);
        console.log(parsedQuery);
        textColumns.forEach((column) => {
          if (parsedQuery[column]) {
            parsedQuery[column] = toArray(parsedQuery[column])
              .map((term) => term.toLowerCase()) // make every text term into an array of lower case strings
          }
        });
        console.log(parsedQuery);


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
      }, 500
    );
  }, [data, columns]);


  const filterData = useCallback((query) => {
    debouncedFilterData.current(query);
  }, []);

  return (
    <div>
      {loading ? (
        <p>Loading data...</p>
      ) : (
        <>
          <div className="container mx-auto p-8">
            <input
                type="text"
                placeholder="Search query, e.g. name:Odo type:personnel"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  filterData(e.target.value);
                }}
                className='mb-4 w-full'
              />
            <div className='mb-4'>
              <input
                type="checkbox"
                className="peer"
                  />&nbsp;show help
              <div className="flex flex-wrap max-h-0 overflow-hidden peer-checked:max-h-80">
                <div className="w-full">
                  <p>Search text with the following fields, e.g. <i>name:Odo</i></p>
                  <div className="flex flex-wrap">
                    {textColumns.map(column => (
                        <div key={column} className="bg-gray-200 p-2 m-1">{column}</div>
                    ))}
                  </div>
                  <p>Search numbers with the following fields, e.g. <i>cost:1-4</i></p>
                  <div className="flex flex-wrap">
                    {rangeColumns.map(column => (
                        <div key={column} className="bg-gray-200 p-2 m-1">{column}</div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {filteredData.map((row, index) => (
                  <div key={index} className='gridItem'>
                    <Image
                      src={`/cardimages/${row.imagefile}.jpg`}
                      width={165}
                      height={229}
                      placeholder='blur'
                      blurDataURL='/cardimages/cardback.jpg'
                      alt={row.name}
                      key={index}
                      className='w-full h-auto'
                    />
                    <select
                      value={scratchCards[row.collectorsinfo] || 0}
                      onChange={(e) =>
                        handleSelect(row.collectorsinfo, parseInt(e.target.value, 10))
                      }
                    >
                      <option value={0}>0</option>
                      <option value={1}>1</option>
                      <option value={2}>2</option>
                      <option value={3}>3</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>
        </>
      )}
    </div>
  );
}
