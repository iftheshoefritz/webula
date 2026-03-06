'use client';

import { useMemo, useState, useEffect, useRef } from 'react';
import searchQueryParser from 'search-query-parser';
import { textColumns, textAbbreviations, rangeColumns, rangeAbbreviations } from '../lib/constants';

// Create reverse mappings: abbreviation → full keyword
const textAbbreviationToFull: Record<string, string> = Object.fromEntries(
  Object.entries(textAbbreviations).map(([full, abbrev]) => [abbrev, full])
);
const rangeAbbreviationToFull: Record<string, string> = Object.fromEntries(
  Object.entries(rangeAbbreviations).map(([full, abbrev]) => [abbrev, full])
);

// Expand an abbreviation to its full keyword, or return as-is if already full
function expandKeyword(keyword: string): string {
  return textAbbreviationToFull[keyword] || rangeAbbreviationToFull[keyword] || keyword;
}

interface SearchPillsProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

interface ParsedFilter {
  key: string;
  value: string;
  isExclude: boolean;
  isRange: boolean;
  rawText: string;
}

const QUOTE_CHARS_REGEX = /[''""«»\u2018\u2019\u201C\u201D]/g;

const QUICK_TEXT_FILTERS = ['type', 'affiliation', 'skills', 'icons', 'keywords', 'name'];

// All text columns not in quick filters
const MORE_TEXT_FILTERS = textColumns.filter((col) => !QUICK_TEXT_FILTERS.includes(col));

const RANGE_DEFAULTS: Record<string, number> = {
  cost: 2,
  span: 3,
  points: 35,
  integrity: 5,
  cunning: 5,
  strength: 5,
  range: 5,
  weapons: 5,
  shields: 5,
};

function parseFilters(searchQuery: string): ParsedFilter[] {
  if (!searchQuery.trim()) {
    return [];
  }

  const normalizedQuery = searchQuery.toLowerCase().replace(QUOTE_CHARS_REGEX, '"');

  const parsedQuery = searchQueryParser.parse(normalizedQuery, {
    keywords: textColumns.concat(Object.values(textAbbreviations)),
    ranges: rangeColumns.concat(Object.values(rangeAbbreviations)),
    offsets: false,
  });

  const filters: ParsedFilter[] = [];

  // If it's just a plain string search
  if (typeof parsedQuery === 'string') {
    if (parsedQuery.trim()) {
      filters.push({
        key: '',
        value: parsedQuery.trim(),
        isExclude: false,
        isRange: false,
        rawText: parsedQuery.trim(),
      });
    }
    return filters;
  }

  // Handle text field
  if (parsedQuery.text) {
    const textValues = Array.isArray(parsedQuery.text) ? parsedQuery.text : [parsedQuery.text];
    textValues.forEach((value: string) => {
      filters.push({
        key: '',
        value,
        isExclude: false,
        isRange: false,
        rawText: value,
      });
    });
  }

  // Handle keyword filters
  const allKeywords = [...textColumns, ...Object.values(textAbbreviations)];
  allKeywords.forEach((keyword) => {
    if (parsedQuery[keyword]) {
      const values = Array.isArray(parsedQuery[keyword]) ? parsedQuery[keyword] : [parsedQuery[keyword]];
      const displayKey = expandKeyword(keyword);
      values.forEach((value: string) => {
        const needsQuotes = value.includes(' ');
        const displayValue = needsQuotes ? `"${value}"` : value;
        filters.push({
          key: keyword,
          value,
          isExclude: false,
          isRange: false,
          rawText: `${displayKey}:${displayValue}`,
        });
      });
    }
  });

  // Handle range filters
  const allRanges = [...rangeColumns, ...Object.values(rangeAbbreviations)];
  allRanges.forEach((range) => {
    if (parsedQuery[range]) {
      const rangeValue = parsedQuery[range];
      const displayKey = expandKeyword(range);
      let displayValue = '';
      if (rangeValue.from !== undefined && rangeValue.to !== undefined) {
        displayValue = `${rangeValue.from}-${rangeValue.to}`;
      } else if (rangeValue.from !== undefined) {
        displayValue = `${rangeValue.from}-`;
      } else if (rangeValue.to !== undefined) {
        displayValue = `-${rangeValue.to}`;
      }
      if (displayValue) {
        filters.push({
          key: range,
          value: displayValue,
          isExclude: false,
          isRange: true,
          rawText: `${displayKey}:${displayValue}`,
        });
      }
    }
  });

  // Handle excluded filters
  if (parsedQuery.exclude) {
    allKeywords.forEach((keyword) => {
      if (parsedQuery.exclude[keyword]) {
        const values = Array.isArray(parsedQuery.exclude[keyword])
          ? parsedQuery.exclude[keyword]
          : [parsedQuery.exclude[keyword]];
        const displayKey = expandKeyword(keyword);
        values.forEach((value: string) => {
          const needsQuotes = value.includes(' ');
          const displayValue = needsQuotes ? `"${value}"` : value;
          filters.push({
            key: keyword,
            value,
            isExclude: true,
            isRange: false,
            rawText: `-${displayKey}:${displayValue}`,
          });
        });
      }
    });
  }

  return filters;
}

function removeFilter(searchQuery: string, filterToRemove: ParsedFilter): string {
  // Simple approach: remove the raw text from the search query
  let newQuery = searchQuery;

  // Try to find and remove the filter text
  const escapedRawText = filterToRemove.rawText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Match the filter with optional surrounding spaces
  const regex = new RegExp(`\\s*${escapedRawText}\\s*`, 'gi');
  newQuery = newQuery.replace(regex, ' ');

  return newQuery.trim();
}

export default function SearchPills({ searchQuery, setSearchQuery }: SearchPillsProps) {
  const filters = useMemo(() => parseFilters(searchQuery), [searchQuery]);

  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [selectedRangeFilter, setSelectedRangeFilter] = useState<string | null>(null);
  const [rangeMin, setRangeMin] = useState(5);
  const [rangeMax, setRangeMax] = useState(5);

  const popoverRef = useRef<HTMLDivElement>(null);

  const handleRemoveFilter = (filter: ParsedFilter) => {
    const newQuery = removeFilter(searchQuery, filter);
    setSearchQuery(newQuery);
  };

  const handleAddFilterClick = () => {
    setIsPopoverOpen(true);
    setShowMoreFilters(false);
    setSelectedRangeFilter(null);
  };

  const closePopover = () => {
    setIsPopoverOpen(false);
    setShowMoreFilters(false);
    setSelectedRangeFilter(null);
  };

  const handleSelectTextFilter = (fieldName: string) => {
    const prefix = searchQuery.trim() ? `${searchQuery.trim()} ` : '';
    setSearchQuery(`${prefix}${fieldName}:`);
    closePopover();
  };

  const handleSelectRangeFilter = (fieldName: string) => {
    const defaultVal = RANGE_DEFAULTS[fieldName] ?? 5;
    setSelectedRangeFilter(fieldName);
    setRangeMin(defaultVal);
    setRangeMax(defaultVal);
  };

  const handleAddRangeFilter = () => {
    const prefix = searchQuery.trim() ? `${searchQuery.trim()} ` : '';
    setSearchQuery(`${prefix}${selectedRangeFilter}:${rangeMin}-${rangeMax}`);
    closePopover();
  };

  // Close on Escape key
  useEffect(() => {
    if (!isPopoverOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePopover();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isPopoverOpen]);

  // Close on click outside
  useEffect(() => {
    if (!isPopoverOpen) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        closePopover();
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [isPopoverOpen]);

  return (
    <div className="flex flex-wrap items-center gap-2 mt-3">
      {filters.map((filter, index) => (
        <span
          key={`${filter.rawText}-${index}`}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5
                     bg-accent/20 border border-accent/40 rounded-lg
                     text-sm font-mono text-text-primary"
        >
          <span className={filter.isExclude ? 'text-red-400' : ''}>
            {filter.rawText}
          </span>
          <button
            onClick={() => handleRemoveFilter(filter)}
            className="text-text-muted hover:text-text-primary transition-colors ml-0.5"
            aria-label={`Remove ${filter.rawText} filter`}
          >
            ×
          </button>
        </span>
      ))}

      <div className="relative" ref={popoverRef}>
        <button
          onClick={handleAddFilterClick}
          className="filter-chip-add"
          aria-label="Add filter"
        >
          + Add filter
        </button>

        {isPopoverOpen && (
          <div className="syntax-panel absolute left-0 top-full mt-1 z-20 min-w-[240px] !bg-[#131713] border-white/[0.1]">
            {selectedRangeFilter ? (
              <>
                <div className="syntax-panel-title">{selectedRangeFilter}</div>
                <div className="flex items-center gap-4 my-2">
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-xs text-text-muted">Min</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setRangeMin((m) => m - 1)}
                        className="btn-icon btn-icon-sm"
                        aria-label="−"
                      >
                        −
                      </button>
                      <span className="font-mono text-lg min-w-[2ch] text-center">{rangeMin}</span>
                      <button
                        onClick={() => setRangeMin((m) => m + 1)}
                        className="btn-icon btn-icon-sm"
                        aria-label="+"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-xs text-text-muted">Max</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setRangeMax((m) => m - 1)}
                        className="btn-icon btn-icon-sm"
                        aria-label="−"
                      >
                        −
                      </button>
                      <span className="font-mono text-lg min-w-[2ch] text-center">{rangeMax}</span>
                      <button
                        onClick={() => setRangeMax((m) => m + 1)}
                        className="btn-icon btn-icon-sm"
                        aria-label="+"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleAddRangeFilter}
                  className="btn-primary mt-3 w-full"
                  aria-label={`Add ${selectedRangeFilter}:${rangeMin}-${rangeMax}`}
                >
                  Add {selectedRangeFilter}:{rangeMin}-{rangeMax}
                </button>
              </>
            ) : (
              <>
                <div className="syntax-panel-title">Text Filters</div>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {QUICK_TEXT_FILTERS.map((filter) => (
                    <button
                      key={filter}
                      onClick={() => handleSelectTextFilter(filter)}
                      className="text-xs px-2 py-1 bg-white/[0.05] border border-white/10
                                 rounded-md text-text-secondary hover:text-text-primary
                                 hover:bg-white/[0.08] transition-colors font-mono"
                      aria-label={`${filter}:`}
                    >
                      {filter}:
                    </button>
                  ))}
                </div>

                <div className="divider" />
                <div className="syntax-panel-title">Range Filters</div>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {Object.keys(RANGE_DEFAULTS).map((filter) => (
                    <button
                      key={filter}
                      onClick={() => handleSelectRangeFilter(filter)}
                      className="text-xs px-2 py-1 bg-white/[0.05] border border-white/10
                                 rounded-md text-text-secondary hover:text-text-primary
                                 hover:bg-white/[0.08] transition-colors font-mono"
                      aria-label={`${filter}:`}
                    >
                      {filter}:
                    </button>
                  ))}
                </div>

                <div className="divider" />
                <button
                  onClick={() => setShowMoreFilters((prev) => !prev)}
                  className="btn-ghost text-xs w-full text-left px-0"
                >
                  {showMoreFilters ? '▼ Less' : '▶ More text filters'}
                </button>

                {showMoreFilters && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {MORE_TEXT_FILTERS.map((filter) => (
                      <button
                        key={filter}
                        onClick={() => handleSelectTextFilter(filter)}
                        className="text-xs px-2 py-1 bg-white/[0.05] border border-white/10
                                   rounded-md text-text-secondary hover:text-text-primary
                                   hover:bg-white/[0.08] transition-colors font-mono"
                        aria-label={`${filter}:`}
                      >
                        {filter}:
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
