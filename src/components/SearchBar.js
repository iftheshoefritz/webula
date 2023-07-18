import { useEffect, useState } from 'react';
import { textColumns, rangeColumns } from '../lib/constants';
import { debounce } from 'lodash';

export default function SearchBar({ searchQuery, setSearchQuery }) {
  const [localSearchQuery, setLocalSearchQuery] = useState(searchQuery);

  const debouncedSetSearchQuery = debounce((query) => {
    setSearchQuery(query);
  }, 300);

  useEffect(() => {
    debouncedSetSearchQuery(localSearchQuery);
  }, [localSearchQuery]);

  return (
    <>
      <input
        type="text"
        placeholder="Search query, e.g. name:Odo type:personnel"
        value={localSearchQuery}
        onChange={(e) => {
          setLocalSearchQuery(e.target.value);
        }}
        className='mb-4 w-full'
      />
      <div className='mb-4'>
        <input type="checkbox" className="peer" />&nbsp;show help
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
    </>
  );
}
