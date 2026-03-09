'use client';

import { useMemo, useState, useEffect, useLayoutEffect, useRef } from 'react';
import searchQueryParser from 'search-query-parser';
import { textColumns, textAbbreviations, rangeColumns, rangeAbbreviations } from '../lib/constants';
import { SKILLS, AFFILIATIONS, CARD_TYPES, QUADRANTS, STAFF_OPTIONS, HOF_OPTIONS, UNIQUE_OPTIONS, MISSION_OPTIONS, DILEMMA_TYPES, ICONS, KEYWORDS } from '../lib/missionRequirements';

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

interface SimpleTypeaheadConfig {
  field: string;
  title: string;
  options: string[];
  placeholder: string;
  noMatchText: string;
}

// Filters that use a free-text input popover instead of a typeahead list
const TEXT_INPUT_FILTER_TITLES: Record<string, string> = {
  name: 'Search by Name',
  set: 'Search by Set',
  rarity: 'Search by Rarity',
  collectorsinfo: 'Search by Collectors Info',
  class: 'Search by Class',
  species: 'Search by Species',
  gametext: 'Search by Game Text',
};

const SIMPLE_TYPEAHEAD_CONFIGS: Record<string, SimpleTypeaheadConfig> = {
  quadrant: { field: 'quadrant', title: 'Select a Quadrant', options: QUADRANTS, placeholder: 'Search quadrants...', noMatchText: 'No quadrants match' },
  staff: { field: 'staff', title: 'Select Staff', options: STAFF_OPTIONS, placeholder: 'Search staff...', noMatchText: 'No staff options match' },
  hof: { field: 'hof', title: 'Select Hall of Fame', options: HOF_OPTIONS, placeholder: 'Search...', noMatchText: 'No options match' },
  unique: { field: 'unique', title: 'Select Unique', options: UNIQUE_OPTIONS, placeholder: 'Search...', noMatchText: 'No options match' },
  mission: { field: 'mission', title: 'Select Mission Type', options: MISSION_OPTIONS, placeholder: 'Search mission types...', noMatchText: 'No mission types match' },
  dilemmatype: { field: 'dilemmatype', title: 'Select Dilemma Type', options: DILEMMA_TYPES, placeholder: 'Search dilemma types...', noMatchText: 'No dilemma types match' },
  icons: { field: 'icons', title: 'Select an Icon', options: ICONS, placeholder: 'Search icons...', noMatchText: 'No icons match' },
  keywords: { field: 'keywords', title: 'Select a Keyword', options: KEYWORDS, placeholder: 'Search keywords...', noMatchText: 'No keywords match' },
};

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
  const allKeywords = Array.from(new Set(textColumns.concat(Object.values(textAbbreviations))));
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
  const [editingFilter, setEditingFilter] = useState<ParsedFilter | null>(null);
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
  const [activeTextInputFilter, setActiveTextInputFilter] = useState<string | null>(null);
  const [textInputValue, setTextInputValue] = useState('');
  const [filterMode, setFilterMode] = useState<'include' | 'exclude'>('include');

  const popoverRef = useRef<HTMLDivElement>(null);
  const popoverContentRef = useRef<HTMLDivElement>(null);
  const [popoverLeftOffset, setPopoverLeftOffset] = useState(0);

  // Returns the base query to build from when adding a filter.
  // In edit mode, removes the filter being replaced first.
  const getBaseQuery = () => {
    if (editingFilter) {
      return removeFilter(searchQuery, editingFilter);
    }
    return searchQuery;
  };

  const handleRemoveFilter = (filter: ParsedFilter) => {
    const newQuery = removeFilter(searchQuery, filter);
    setSearchQuery(newQuery);
  };

  const handleAddFilterClick = () => {
    setIsPopoverOpen(true);
    setEditingFilter(null);
    onPopoverOpenChange?.(true);
    setSelectedRangeFilter(null);
    setFilterMode('include');
  };

  const closePopover = () => {
    setIsPopoverOpen(false);
    setEditingFilter(null);
    onPopoverOpenChange?.(false);
    setSelectedRangeFilter(null);
    setShowSkillsTypeahead(false);
    setSkillsSearch('');
    setShowAffiliationTypeahead(false);
    setAffiliationSearch('');
    setShowTypeTypeahead(false);
    setTypeSearch('');
    setActiveSimpleTypeahead(null);
    setSimpleTypeaheadSearch('');
    setActiveTextInputFilter(null);
    setTextInputValue('');
    setFilterMode('include');
  };

  const handleEditFilter = (filter: ParsedFilter) => {
    // Reset all popover states before opening in edit mode
    setSelectedRangeFilter(null);
    setShowSkillsTypeahead(false);
    setSkillsSearch('');
    setShowAffiliationTypeahead(false);
    setAffiliationSearch('');
    setShowTypeTypeahead(false);
    setTypeSearch('');
    setActiveSimpleTypeahead(null);
    setSimpleTypeaheadSearch('');
    setActiveTextInputFilter(null);
    setTextInputValue('');

    setEditingFilter(filter);
    setFilterMode(filter.isExclude ? 'exclude' : 'include');

    if (filter.isRange) {
      const expandedKey = expandKeyword(filter.key);
      setSelectedRangeFilter(expandedKey);
      // Parse existing range values (e.g. "2-5", "3-", "-5")
      const dashIdx = filter.value.indexOf('-');
      if (dashIdx >= 0) {
        const minStr = filter.value.slice(0, dashIdx);
        const maxStr = filter.value.slice(dashIdx + 1);
        setRangeMin(minStr ? parseInt(minStr, 10) : (RANGE_DEFAULTS[expandedKey] ?? 5));
        setRangeMax(maxStr ? parseInt(maxStr, 10) : (RANGE_DEFAULTS[expandedKey] ?? 5));
      }
    } else {
      const fullKey = expandKeyword(filter.key);
      if (fullKey === 'skills') {
        setShowSkillsTypeahead(true);
      } else if (fullKey === 'affiliation') {
        setShowAffiliationTypeahead(true);
      } else if (fullKey === 'type') {
        setShowTypeTypeahead(true);
      } else {
        const simpleConfig = SIMPLE_TYPEAHEAD_CONFIGS[fullKey];
        if (simpleConfig) {
          setActiveSimpleTypeahead(simpleConfig);
        } else if (TEXT_INPUT_FILTER_TITLES[fullKey]) {
          setActiveTextInputFilter(fullKey);
          setTextInputValue(filter.value);
        }
      }
    }

    setIsPopoverOpen(true);
    onPopoverOpenChange?.(true);
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
    if (TEXT_INPUT_FILTER_TITLES[fieldName]) {
      setActiveTextInputFilter(fieldName);
      setTextInputValue('');
      return;
    }
    const base = getBaseQuery();
    const prefix = base.trim() ? `${base.trim()} ` : '';
    setSearchQuery(`${prefix}${fieldName}:`);
    closePopover();
  };

  const handleSelectSkill = (skill: string) => {
    const base = getBaseQuery();
    const prefix = base.trim() ? `${base.trim()} ` : '';
    const excludePrefix = filterMode === 'exclude' ? '-' : '';
    setSearchQuery(`${prefix}${excludePrefix}skills:${skill}`);
    closePopover();
  };

  const handleSelectAffiliation = (value: string) => {
    const base = getBaseQuery();
    const prefix = base.trim() ? `${base.trim()} ` : '';
    const excludePrefix = filterMode === 'exclude' ? '-' : '';
    const needsQuotes = value.includes(' ');
    setSearchQuery(`${prefix}${excludePrefix}affiliation:${needsQuotes ? `"${value}"` : value}`);
    closePopover();
  };

  const handleSelectType = (value: string) => {
    const base = getBaseQuery();
    const prefix = base.trim() ? `${base.trim()} ` : '';
    const excludePrefix = filterMode === 'exclude' ? '-' : '';
    setSearchQuery(`${prefix}${excludePrefix}type:${value}`);
    closePopover();
  };

  const handleSelectRangeFilter = (fieldName: string) => {
    const defaultVal = RANGE_DEFAULTS[fieldName] ?? 5;
    setSelectedRangeFilter(fieldName);
    setRangeMin(defaultVal);
    setRangeMax(defaultVal);
  };

  const handleAddRangeFilter = () => {
    const base = getBaseQuery();
    const prefix = base.trim() ? `${base.trim()} ` : '';
    setSearchQuery(`${prefix}${selectedRangeFilter}:${rangeMin}-${rangeMax}`);
    closePopover();
  };

  const handleSubmitTextInputFilter = () => {
    if (!activeTextInputFilter || !textInputValue.trim()) return;
    const base = getBaseQuery();
    const prefix = base.trim() ? `${base.trim()} ` : '';
    const val = textInputValue.trim();
    const needsQuotes = val.includes(' ');
    const excludePrefix = filterMode === 'exclude' ? '-' : '';
    setSearchQuery(`${prefix}${excludePrefix}${activeTextInputFilter}:${needsQuotes ? `"${val}"` : val}`);
    closePopover();
  };

  const handleToggleMode = (newMode: 'include' | 'exclude') => {
    if (filterMode === newMode) return;
    setFilterMode(newMode);

    // When editing an existing filter, immediately re-commit with the new mode
    // so the search query (and results) update right away.
    if (editingFilter && !editingFilter.isRange) {
      const base = removeFilter(searchQuery, editingFilter);
      const prefix = base.trim() ? `${base.trim()} ` : '';
      const excludePrefix = newMode === 'exclude' ? '-' : '';
      const displayKey = expandKeyword(editingFilter.key) || editingFilter.key;
      const val = editingFilter.value;
      const needsQuotes = val.includes(' ');
      const newRawText = `${excludePrefix}${displayKey}:${needsQuotes ? `"${val}"` : val}`;
      setSearchQuery(`${prefix}${newRawText}`);
      setEditingFilter({ ...editingFilter, isExclude: newMode === 'exclude', rawText: newRawText });
    }
  };

  const renderIncludeExcludeToggle = (disabled = false) => (
    <div className="flex gap-1 mb-3">
      <button
        onClick={() => handleToggleMode('include')}
        disabled={disabled}
        aria-pressed={filterMode === 'include'}
        className={`text-xs px-2 py-1 rounded-md border transition-colors ${
          filterMode === 'include'
            ? 'bg-green-800/50 border-green-600/60 text-green-400'
            : 'bg-white/[0.03] border-white/10 text-text-muted hover:bg-white/[0.08]'
        } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        + Include
      </button>
      <button
        onClick={() => handleToggleMode('exclude')}
        disabled={disabled}
        aria-pressed={filterMode === 'exclude'}
        className={`text-xs px-2 py-1 rounded-md border transition-colors ${
          filterMode === 'exclude'
            ? 'bg-red-900/50 border-red-600/60 text-red-400'
            : 'bg-white/[0.03] border-white/10 text-text-muted hover:bg-white/[0.08]'
        } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        − Exclude
      </button>
    </div>
  );

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
    <div ref={popoverRef} className="relative flex flex-wrap items-center gap-2 mt-3">
      {filters.map((filter, index) => (
        <span
          key={`${filter.rawText}-${index}`}
          className="filter-chip inline-flex items-center gap-1.5 px-2.5 py-1.5
                     bg-accent/20 border border-accent/40 rounded-lg
                     text-sm font-mono text-text-primary"
        >
          <button
            onClick={() => handleEditFilter(filter)}
            className={filter.isExclude ? 'text-red-400' : ''}
            aria-label={`Edit ${filter.rawText} filter`}
          >
            {filter.rawText}
          </button>
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
              {renderIncludeExcludeToggle(true)}
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
              {renderIncludeExcludeToggle()}
              <input
                type="text"
                value={skillsSearch}
                onChange={(e) => setSkillsSearch(e.target.value)}
                placeholder="Search skills..."
                className="w-full px-2 py-1 mb-2 text-[16px] bg-white/[0.05] border border-white/10
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
              {renderIncludeExcludeToggle()}
              <input
                type="text"
                value={affiliationSearch}
                onChange={(e) => setAffiliationSearch(e.target.value)}
                placeholder="Search affiliations..."
                className="w-full px-2 py-1 mb-2 text-[16px] bg-white/[0.05] border border-white/10
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
              {renderIncludeExcludeToggle()}
              <input
                type="text"
                value={typeSearch}
                onChange={(e) => setTypeSearch(e.target.value)}
                placeholder="Search types..."
                className="w-full px-2 py-1 mb-2 text-[16px] bg-white/[0.05] border border-white/10
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
              {renderIncludeExcludeToggle()}
              <input
                type="text"
                value={simpleTypeaheadSearch}
                onChange={(e) => setSimpleTypeaheadSearch(e.target.value)}
                placeholder={activeSimpleTypeahead.placeholder}
                className="w-full px-2 py-1 mb-2 text-[16px] bg-white/[0.05] border border-white/10
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
                          const base = getBaseQuery();
                          const prefix = base.trim() ? `${base.trim()} ` : '';
                          const excludePrefix = filterMode === 'exclude' ? '-' : '';
                          const needsQuotes = option.includes(' ');
                          setSearchQuery(`${prefix}${excludePrefix}${activeSimpleTypeahead.field}:${needsQuotes ? `"${option}"` : option}`);
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
          ) : activeTextInputFilter ? (
            <>
              <div className="syntax-panel-title">{TEXT_INPUT_FILTER_TITLES[activeTextInputFilter]}</div>
              {renderIncludeExcludeToggle()}
              <input
                type="text"
                value={textInputValue}
                onChange={(e) => setTextInputValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSubmitTextInputFilter(); }}
                placeholder={`Enter ${activeTextInputFilter}...`}
                className="w-full px-2 py-1 mb-2 text-[16px] bg-white/[0.05] border border-white/10
                           rounded-md text-text-primary placeholder-text-muted outline-none
                           focus:border-accent/50"
                autoFocus
              />
              <button
                onClick={handleSubmitTextInputFilter}
                disabled={!textInputValue.trim()}
                className="btn-primary w-full disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label={`Apply ${activeTextInputFilter} filter`}
              >
                Apply
              </button>
            </>
          ) : (
            <>
              <div className="syntax-panel-title">Text Filters</div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {textColumns.map((filter) => (
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
            </>
          )}
        </div>
      )}
    </div>
  );
}
