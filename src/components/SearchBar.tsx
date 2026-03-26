import React, { useEffect, useState, useMemo, useRef } from 'react';
import searchQueryParser from 'search-query-parser';
import { textColumns, rangeColumns, textAbbreviations, rangeAbbreviations } from '../lib/constants';
import { debounce } from 'lodash';

interface SearchBarProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  variant?: 'legacy' | 'styled';
  autoFocus?: boolean;
}

const PARSER_OPTIONS = {
  keywords: textColumns.concat(Object.values(textAbbreviations)),
  ranges: rangeColumns.concat(Object.values(rangeAbbreviations)),
  offsets: false,
};

// Extract the free-text (non-field-qualified) portion from a query string
export function extractTextPortion(query: string): string {
  if (!query.trim()) return '';
  const parsed = searchQueryParser.parse(query.toLowerCase(), PARSER_OPTIONS);
  if (typeof parsed === 'string') return parsed;
  const text = (parsed as { text?: string | string[] }).text;
  if (!text) return '';
  return Array.isArray(text) ? text.join(' ') : String(text);
}

// Remove the free-text tokens from a query string, leaving only field-qualified tokens
export function extractFieldPortion(query: string, textPortion: string): string {
  if (!textPortion.trim()) return query.trim();
  let result = query;
  const words = textPortion.trim().split(/\s+/);
  for (const word of words) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(`(?:^|\\s)${escaped}(?=\\s|$)`, 'gi'), ' ');
  }
  return result.trim().replace(/\s+/g, ' ');
}

const SearchBar = React.forwardRef<HTMLInputElement, SearchBarProps>(
  function SearchBar({ searchQuery, setSearchQuery, variant = "legacy", autoFocus }, ref) {
    // Show only the free-text portion of the query in the input
    const [localTextQuery, setLocalTextQuery] = useState(() => extractTextPortion(searchQuery));
    // Store field-filter portion separately so we can reconstruct the full query
    const fieldQueryRef = useRef(extractFieldPortion(searchQuery, extractTextPortion(searchQuery)));
    const lastSentQueryRef = useRef(searchQuery);

    const debouncedSetSearchQuery = useMemo(
      () => debounce((fullQuery: string) => {
        lastSentQueryRef.current = fullQuery;
        setSearchQuery(fullQuery);
      }, 500),
      [setSearchQuery]
    );

    const debouncedSetSearchQueryRef = useRef(debouncedSetSearchQuery);
    useEffect(() => {
      debouncedSetSearchQueryRef.current = debouncedSetSearchQuery;
    });

    // When text portion changes, reconstruct full query and debounce setSearchQuery
    useEffect(() => {
      const fullQuery = [fieldQueryRef.current, localTextQuery].filter(Boolean).join(' ');
      debouncedSetSearchQueryRef.current(fullQuery);
    }, [localTextQuery]);

    // Sync local state when parent changes searchQuery externally (e.g., from SearchPills removing a filter)
    useEffect(() => {
      if (searchQuery === lastSentQueryRef.current) {
        return; // Our own debounced update reflected back — ignore
      }
      const textPortion = extractTextPortion(searchQuery);
      fieldQueryRef.current = extractFieldPortion(searchQuery, textPortion);
      setLocalTextQuery(textPortion);
    }, [searchQuery]);

    const handleClear = () => {
      debouncedSetSearchQuery.cancel();
      setLocalTextQuery('');
      setSearchQuery(fieldQueryRef.current);
    };

    if (variant === "styled") {
      return (
        <div className="relative">
          <input
            ref={ref}
            type="text"
            placeholder="Search cards..."
            value={localTextQuery}
            onChange={(e) => {
              setLocalTextQuery(e.target.value);
            }}
            autoFocus={autoFocus}
            className="input-search"
          />
          <span className="input-search-icon">⌕</span>
          {localTextQuery && (
            <button
              aria-label="Clear search"
              onClick={handleClear}
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
            ref={ref}
            type="text"
            placeholder="Search cards by name e.g. 'Odo'"
            value={localTextQuery}
            onChange={(e) => {
              setLocalTextQuery(e.target.value);
            }}
            className="bg-white text-black text-[16px] font-bold py-2 px-4 rounded my-0 border border-gray-600 w-full"
          />
        </div>
      </>
    );
  }
);

export default SearchBar;
