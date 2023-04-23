import { useEffect, useState, useRef, useCallback } from 'react';
import { debounce } from 'lodash';
import * as d3 from 'd3';
import searchQueryParser from 'search-query-parser';
import Image from 'next/image';

const textColumns = [
  'name', 'set', 'rarity', 'unique', 'collectorsinfo', 'type', 'mission/dilemmatype',
  'quadrant', 'affiliation', 'icons', 'staff', 'keywords', 'class', 'species', 'skills',
  'gametext'
];

const rangeColumns = [
  'cost', 'span', 'points', 'integrity/range', 'cunning/weapons', 'strength/shields'
]

const nonFilterColumns = [
  'imagefile'
]

function toArray(item) {
  if (Array.isArray(item)) {
    return item;
  } else {
    return [item];
  }
}

export default function Home() {
  const [data, setData] = useState([]);
  const [columns, setColumns] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredData, setFilteredData] = useState([]);
  const [loading, setLoading] = useState(true);

  const debouncedFilterData = useRef(null);

  useEffect(() => {
    debouncedFilterData.current = debounce(
      (query) => {
        const parsedQuery = searchQueryParser.parse(query, {
          keywords: textColumns,
          ranges: rangeColumns,
          offsets: false,
        });
        // make every term into an array of lower case strings
        columns.forEach((column) => {
          if (parsedQuery[column]) {
            parsedQuery[column] = toArray(parsedQuery[column]).map((term) => term.toLowerCase());
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
                const fromValue = range.from !== '' ? parseFloat(range.from) : -Infinity;
                const toValue = range.to !== '' ? parseFloat(range.to) : Infinity;
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

  useEffect(() => {
    const fetchData = async () => {
      const response = await fetch('/cards.txt');
      const text = await response.text();
      const parsedData = d3.tsvParse(text);
      const formattedData = parsedData.map((row) =>
        Object.fromEntries(
          Object.entries(row)
            .map(([key, value]) => nonFilterColumns.includes(key) ? [key.toLowerCase, value] : [
              key.toLowerCase(),
              value.toLowerCase(),
            ])
        )
      );
      setData(formattedData);
      setFilteredData(formattedData);

      // Extract column names
      if (parsedData.length > 0) {
        setColumns(Object.keys(parsedData[0]).map((key) => key.toLowerCase()));
      }
      setLoading(false);
    };
    fetchData();
  }, []);

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
                ))}
              </div>
            </div>
        </>
      )}
    </div>
  );
}
