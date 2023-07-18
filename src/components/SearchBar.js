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
    </>
  );
}
