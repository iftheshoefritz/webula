import { useEffect, useState } from 'react';
import * as d3 from 'd3';
import searchQueryParser from 'search-query-parser';
import Image from 'next/image';

export default function Home() {
  const [data, setData] = useState([]);
  const [columns, setColumns] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const response = await fetch('/cards.txt');
      const text = await response.text();
      const parsedData = d3.tsvParse(text);
      setData(
        parsedData.map((row) =>
          Object.fromEntries(
            Object.entries(row).map(([key, value]) => [
              key.toLowerCase(),
              value,
            ])
          )
        )
      );

      // Extract column names
      if (parsedData.length > 0) {
        setColumns(Object.keys(parsedData[0]).map((key) => key.toLowerCase()));      }
      setLoading(false);
    };
    fetchData();
  }, []);

  const textColumns = [
    'name', 'set', 'rarity', 'unique', 'collectorsinfo', 'type', 'mission/dilemmatype',
    'quadrant', 'affiliation', 'icons', 'staff', 'keywords', 'class', 'species', 'skills',
    'text'
  ];

  const rangeColumns = [
    'cost', 'span', 'points', 'integrity/range', 'cunning/weapons', 'strength/shields'
  ]

  const parsedQuery = searchQueryParser.parse(searchQuery, {
    keywords: textColumns,
    ranges: rangeColumns,
    offsets: false,
  });

  const filterRow = (row) => {
    if (typeof parsedQuery === 'string') {
      return columns.some((column) =>
        row[column].toLowerCase().includes(parsedQuery.toLowerCase())
      );
    } else {
      return columns.every((column) => {
        if (parsedQuery[column]) {
          if (textColumns.includes(column)) {
            return row[column]
              .toLowerCase()
              .includes(parsedQuery[column].toLowerCase());
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
    }
  };
  const filteredData = data.filter(filterRow);

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
                onChange={(e) => setSearchQuery(e.target.value)}
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
