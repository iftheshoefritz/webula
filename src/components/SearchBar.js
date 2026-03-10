import { useEffect, useState, useMemo, useRef } from 'react';
import { textColumns, rangeColumns } from '../lib/constants';
import { debounce } from 'lodash';
import { track } from '@vercel/analytics';

export default function SearchBar({ searchQuery, setSearchQuery, variant = "legacy" }) {
  const [localSearchQuery, setLocalSearchQuery] = useState(searchQuery);
  const isLocalChangeRef = useRef(false);

  const debouncedSetSearchQuery = useMemo(
    () => debounce((query) => {
      setSearchQuery(query);
    }, 500),
    [setSearchQuery]
  );

  const debouncedSetSearchQueryRef = useRef(debouncedSetSearchQuery);
  useEffect(() => {
    debouncedSetSearchQueryRef.current = debouncedSetSearchQuery;
  });

  useEffect(() => {
    isLocalChangeRef.current = true;
    debouncedSetSearchQueryRef.current(localSearchQuery);
  }, [localSearchQuery]);

  // Sync local state when parent changes searchQuery externally (e.g., from SearchPills removing a filter)
  useEffect(() => {
    if (isLocalChangeRef.current) {
      // This change came from our debounced update, ignore it
      isLocalChangeRef.current = false;
      return;
    }
    if (searchQuery !== localSearchQuery) {
      setLocalSearchQuery(searchQuery);
    }
  }, [searchQuery]);

  if (variant === "styled") {
    return (
      <div className="relative">
        <input
          type="text"
          placeholder="Search cards..."
          value={localSearchQuery}
          onChange={(e) => {
            setLocalSearchQuery(e.target.value);
          }}
          className="input-search"
        />
        <span className="input-search-icon">⌕</span>
        {localSearchQuery && (
          <button
            aria-label="Clear search"
            onClick={() => {
              debouncedSetSearchQuery.cancel();
              setLocalSearchQuery('');
              setSearchQuery('');
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary leading-none"
          >
            ×
          </button>
        )}
      </div>
    );
  }

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
          className="bg-white text-black font-bold py-2 px-4 rounded my-0 border border-gray-600 w-full"
        />
      </div>
    </>
  );
}
