'use client';

import { useMemo, useState, useEffect, useLayoutEffect, useRef } from 'react';
import searchQueryParser from 'search-query-parser';
import { textColumns, textAbbreviations, rangeColumns, rangeAbbreviations } from '../lib/constants';
import { SKILLS, AFFILIATIONS, CARD_TYPES, QUADRANTS, STAFF_OPTIONS, HOF_OPTIONS, UNIQUE_OPTIONS, MISSION_OPTIONS, DILEMMA_TYPES } from '../lib/missionRequirements';

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
  onPopoverOpenChange?: (isOpen: boolean) => void;
}

interface ParsedFilter {
  key: string;
  value: string;
  isExclude: boolean;
  isRange: boolean;
  rawText: string;
}

const QUOTE_CHARS_REGEX = /[''""«»\u2018\u2019\u201C\u201D]/g;

const QUICK_TEXT_FILTERS = ['type', 'affiliation', 'skills', 'icons', 'keywords', 'name', 'quadrant', 'staff', 'hof', 'unique', 'mission', 'dilemmatype'];

interface SimpleTypeaheadConfig {
  field: string;
  title: string;
  options: string[];
  placeholder: string;
  noMatchText: string;
}

const SIMPLE_TYPEAHEAD_CONFIGS: Record<string, SimpleTypeaheadConfig> = {
  quadrant: { field: 'quadrant', title: 'Select a Quadrant', options: QUADRANTS, placeholder: 'Search quadrants...', noMatchText: 'No quadrants match' },
  staff: { field: 'staff', title: 'Select Staff', options: STAFF_OPTIONS, placeholder: 'Search staff...', noMatchText: 'No staff options match' },
  hof: { field: 'hof', title: 'Select Hall of Fame', options: HOF_OPTIONS, placeholder: 'Search...', noMatchText: 'No options match' },
  unique: { field: 'unique', title: 'Select Unique', options: UNIQUE_OPTIONS, placeholder: 'Search...', noMatchText: 'No options match' },
  mission: { field: 'mission', title: 'Select Mission Type', options: MISSION_OPTIONS, placeholder: 'Search mission types...', noMatchText: 'No mission types match' },
  dilemmatype: { field: 'dilemmatype', title: 'Select Dilemma Type', options: DILEMMA_TYPES, placeholder: 'Search dilemma types...', noMatchText: 'No dilemma types match' },
};

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
  const allKeywords = [...new Set([...textColumns, ...Object.values(textAbbreviations)])];
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
    const excluded = parsedQuery.exclude;
    allKeywords.forEach((keyword) => {
      if (excluded[keyword]) {
        const values = Array.isArray(excluded[keyword])
          ? excluded[keyword]
          : [excluded[keyword]];
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

export default function SearchPills({ searchQuery, setSearchQuery, onPopoverOpenChange }: SearchPillsProps) {
  const filters = useMemo(() => parseFilters(searchQuery), [searchQuery]);

  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [selectedRangeFilter, setSelectedRangeFilter] = useState<string | null>(null);
  const [rangeMin, setRangeMin] = useState(5);
  const [rangeMax, setRangeMax] = useState(5);
  const [showSkillsTypeahead, setShowSkillsTypeahead] = useState(false);
  const [skillsSearch, setSkillsSearch] = useState('');
  const [showAffiliationTypeahead, setShowAffiliationTypeahead] = useState(false);
  const [affiliationSearch, setAffiliationSearch] = useState('');
  const [showTypeTypeahead, setShowTypeTypeahead] = useState(false);
  const [typeSearch, setTypeSearch] = useState('');
  const [activeSimpleTypeahead, setActiveSimpleTypeahead] = useState<SimpleTypeaheadConfig | null>(null);
  const [simpleTypeaheadSearch, setSimpleTypeaheadSearch] = useState('');

  const popoverRef = useRef<HTMLDivElement>(null);
  const popoverContentRef = useRef<HTMLDivElement>(null);
  const [popoverLeftOffset, setPopoverLeftOffset] = useState(0);

  const handleRemoveFilter = (filter: ParsedFilter) => {
    const newQuery = removeFilter(searchQuery, filter);
    setSearchQuery(newQuery);
  };

  const handleAddFilterClick = () => {
    setIsPopoverOpen(true);
    onPopoverOpenChange?.(true);
    setShowMoreFilters(false);
    setSelectedRangeFilter(null);
  };

  const closePopover = () => {
    setIsPopoverOpen(false);
    onPopoverOpenChange?.(false);
    setShowMoreFilters(false);
    setSelectedRangeFilter(null);
    setShowSkillsTypeahead(false);
    setSkillsSearch('');
    setShowAffiliationTypeahead(false);
    setAffiliationSearch('');
    setShowTypeTypeahead(false);
    setTypeSearch('');
    setActiveSimpleTypeahead(null);
    setSimpleTypeaheadSearch('');
  };

  const handleSelectTextFilter = (fieldName: string) => {
    if (fieldName === 'skills') {
      setShowSkillsTypeahead(true);
      setSkillsSearch('');
      return;
    }
    if (fieldName === 'affiliation') {
      setShowAffiliationTypeahead(true);
      setAffiliationSearch('');
      return;
    }
    if (fieldName === 'type') {
      setShowTypeTypeahead(true);
      setTypeSearch('');
      return;
    }
    const simpleConfig = SIMPLE_TYPEAHEAD_CONFIGS[fieldName];
    if (simpleConfig) {
      setActiveSimpleTypeahead(simpleConfig);
      setSimpleTypeaheadSearch('');
      return;
    }
    const prefix = searchQuery.trim() ? `${searchQuery.trim()} ` : '';
    setSearchQuery(`${prefix}${fieldName}:`);
    closePopover();
  };

  const handleSelectSkill = (skill: string) => {
    const prefix = searchQuery.trim() ? `${searchQuery.trim()} ` : '';
    setSearchQuery(`${prefix}skills:${skill}`);
    closePopover();
  };

  const handleSelectAffiliation = (value: string) => {
    const prefix = searchQuery.trim() ? `${searchQuery.trim()} ` : '';
    const needsQuotes = value.includes(' ');
    setSearchQuery(`${prefix}affiliation:${needsQuotes ? `"${value}"` : value}`);
    closePopover();
  };

  const handleSelectType = (value: string) => {
    const prefix = searchQuery.trim() ? `${searchQuery.trim()} ` : '';
    setSearchQuery(`${prefix}type:${value}`);
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

  // Adjust popover position to keep its right edge within the viewport
  useLayoutEffect(() => {
    if (!isPopoverOpen || !popoverContentRef.current) {
      setPopoverLeftOffset(0);
      return;
    }
    const el = popoverContentRef.current;
    const rect = el.getBoundingClientRect();
    const overflow = rect.right - window.innerWidth;
    if (overflow > 0) {
      setPopoverLeftOffset(-overflow - 8);
    } else {
      setPopoverLeftOffset(0);
    }
  }, [isPopoverOpen]);

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
          className="filter-chip inline-flex items-center gap-1.5 px-2.5 py-1.5
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
          <div
            ref={popoverContentRef}
            className="syntax-panel absolute left-0 top-full mt-1 z-20 min-w-[240px] !bg-[#131713] border-white/[0.1]"
            style={popoverLeftOffset !== 0 ? { left: popoverLeftOffset } : undefined}
          >
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
            ) : showSkillsTypeahead ? (
              <>
                <div className="syntax-panel-title">Select a Skill</div>
                <input
                  type="text"
                  value={skillsSearch}
                  onChange={(e) => setSkillsSearch(e.target.value)}
                  placeholder="Search skills..."
                  className="w-full px-2 py-1 mb-2 text-sm bg-white/[0.05] border border-white/10
                             rounded-md text-text-primary placeholder-text-muted outline-none
                             focus:border-accent/50"
                  autoFocus
                />
                {(() => {
                  const filtered = SKILLS.filter((s) =>
                    s.toLowerCase().includes(skillsSearch.toLowerCase())
                  );
                  return filtered.length > 0 ? (
                    <ul className="flex flex-col gap-0.5 max-h-48 overflow-y-auto">
                      {filtered.map((skill) => (
                        <li
                          key={skill}
                          role="option"
                          aria-selected={false}
                          onClick={() => handleSelectSkill(skill)}
                          className="px-2 py-1 text-sm text-text-secondary hover:text-text-primary
                                     hover:bg-white/[0.08] rounded cursor-pointer transition-colors"
                        >
                          {skill}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-text-muted py-1">No skills match</p>
                  );
                })()}
              </>
            ) : showAffiliationTypeahead ? (
              <>
                <div className="syntax-panel-title">Select an Affiliation</div>
                <input
                  type="text"
                  value={affiliationSearch}
                  onChange={(e) => setAffiliationSearch(e.target.value)}
                  placeholder="Search affiliations..."
                  className="w-full px-2 py-1 mb-2 text-sm bg-white/[0.05] border border-white/10
                             rounded-md text-text-primary placeholder-text-muted outline-none
                             focus:border-accent/50"
                  autoFocus
                />
                {(() => {
                  const filtered = AFFILIATIONS.filter((a) =>
                    a.label.toLowerCase().includes(affiliationSearch.toLowerCase())
                  );
                  return filtered.length > 0 ? (
                    <ul className="flex flex-col gap-0.5 max-h-48 overflow-y-auto">
                      {filtered.map((affiliation) => (
                        <li
                          key={affiliation.value}
                          role="option"
                          aria-selected={false}
                          onClick={() => handleSelectAffiliation(affiliation.value)}
                          className="px-2 py-1 text-sm text-text-secondary hover:text-text-primary
                                     hover:bg-white/[0.08] rounded cursor-pointer transition-colors"
                        >
                          {affiliation.label}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-text-muted py-1">No affiliations match</p>
                  );
                })()}
              </>
            ) : showTypeTypeahead ? (
              <>
                <div className="syntax-panel-title">Select a Type</div>
                <input
                  type="text"
                  value={typeSearch}
                  onChange={(e) => setTypeSearch(e.target.value)}
                  placeholder="Search types..."
                  className="w-full px-2 py-1 mb-2 text-sm bg-white/[0.05] border border-white/10
                             rounded-md text-text-primary placeholder-text-muted outline-none
                             focus:border-accent/50"
                  autoFocus
                />
                {(() => {
                  const filtered = CARD_TYPES.filter((t) =>
                    t.toLowerCase().includes(typeSearch.toLowerCase())
                  );
                  return filtered.length > 0 ? (
                    <ul className="flex flex-col gap-0.5 max-h-48 overflow-y-auto">
                      {filtered.map((cardType) => (
                        <li
                          key={cardType}
                          role="option"
                          aria-selected={false}
                          onClick={() => handleSelectType(cardType)}
                          className="px-2 py-1 text-sm text-text-secondary hover:text-text-primary
                                     hover:bg-white/[0.08] rounded cursor-pointer transition-colors"
                        >
                          {cardType}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-text-muted py-1">No types match</p>
                  );
                })()}
              </>
            ) : activeSimpleTypeahead ? (
              <>
                <div className="syntax-panel-title">{activeSimpleTypeahead.title}</div>
                <input
                  type="text"
                  value={simpleTypeaheadSearch}
                  onChange={(e) => setSimpleTypeaheadSearch(e.target.value)}
                  placeholder={activeSimpleTypeahead.placeholder}
                  className="w-full px-2 py-1 mb-2 text-sm bg-white/[0.05] border border-white/10
                             rounded-md text-text-primary placeholder-text-muted outline-none
                             focus:border-accent/50"
                  autoFocus
                />
                {(() => {
                  const filtered = activeSimpleTypeahead.options.filter((o) =>
                    o.toLowerCase().includes(simpleTypeaheadSearch.toLowerCase())
                  );
                  return filtered.length > 0 ? (
                    <ul className="flex flex-col gap-0.5 max-h-48 overflow-y-auto">
                      {filtered.map((option) => (
                        <li
                          key={option}
                          role="option"
                          aria-selected={false}
                          onClick={() => {
                            const prefix = searchQuery.trim() ? `${searchQuery.trim()} ` : '';
                            setSearchQuery(`${prefix}${activeSimpleTypeahead.field}:${option}`);
                            closePopover();
                          }}
                          className="px-2 py-1 text-sm text-text-secondary hover:text-text-primary
                                     hover:bg-white/[0.08] rounded cursor-pointer transition-colors"
                        >
                          {option}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-text-muted py-1">{activeSimpleTypeahead.noMatchText}</p>
                  );
                })()}
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
