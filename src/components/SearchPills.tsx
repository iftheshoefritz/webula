'use client';

import { useMemo } from 'react';
import searchQueryParser from 'search-query-parser';
import { textColumns, textAbbreviations, rangeColumns, rangeAbbreviations } from '../lib/constants';

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
      values.forEach((value: string) => {
        const needsQuotes = value.includes(' ');
        const displayValue = needsQuotes ? `"${value}"` : value;
        filters.push({
          key: keyword,
          value,
          isExclude: false,
          isRange: false,
          rawText: `${keyword}:${displayValue}`,
        });
      });
    }
  });

  // Handle range filters
  const allRanges = [...rangeColumns, ...Object.values(rangeAbbreviations)];
  allRanges.forEach((range) => {
    if (parsedQuery[range]) {
      const rangeValue = parsedQuery[range];
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
          rawText: `${range}:${displayValue}`,
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
        values.forEach((value: string) => {
          const needsQuotes = value.includes(' ');
          const displayValue = needsQuotes ? `"${value}"` : value;
          filters.push({
            key: keyword,
            value,
            isExclude: true,
            isRange: false,
            rawText: `-${keyword}:${displayValue}`,
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

  const handleRemoveFilter = (filter: ParsedFilter) => {
    const newQuery = removeFilter(searchQuery, filter);
    setSearchQuery(newQuery);
  };

  const handleAddFilter = () => {
    // Focus the search input - we'll trigger this by appending a space
    // This gives the user a cue to start typing
    if (searchQuery && !searchQuery.endsWith(' ')) {
      setSearchQuery(searchQuery + ' ');
    }
  };

  if (filters.length === 0) {
    return null;
  }

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
      <button
        onClick={handleAddFilter}
        className="inline-flex items-center gap-1 px-2.5 py-1.5
                   border border-dashed border-white/20 rounded-lg
                   text-sm text-text-muted hover:text-text-secondary hover:border-white/30
                   transition-colors"
      >
        + Add filter
      </button>
    </div>
  );
}
