import { useEffect, useState } from 'react';
import { textColumns, rangeColumns } from '../lib/constants';
import { debounce } from 'lodash';
import { track } from '@vercel/analytics';

export default function SearchBar({ searchQuery, setSearchQuery }) {
  const [localSearchQuery, setLocalSearchQuery] = useState(searchQuery);

  const debouncedSetSearchQuery = debounce((query) => {
    setSearchQuery(query);
  }, 500);

  useEffect(() => {
    debouncedSetSearchQuery(localSearchQuery);
  }, [localSearchQuery]);

  return (
    <>
      <div className="flex items-center">
        <input
          type="text"
          placeholder="Search cards by name e.g. 'Odo'"
          value={localSearchQuery}
          onChange={(e) => {
            setLocalSearchQuery(e.target.value);
          }}
          className="align-middle w-full mb-2 focus:outline-none"
        />
        <button className="ml-2 align-middle mb-2 focus:outline-none" onClick={() => setLocalSearchQuery('')}><span className="font-bold">X</span></button>
      </div>
    </>
  );
}
