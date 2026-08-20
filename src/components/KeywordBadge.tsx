'use client';

import React from 'react';
import SearchOverlay from './SearchOverlay';
import type { HqOption } from './SkillsChart';

export default function KeywordBadge({
  keyword,
  count,
  onSearch,
  hqOptions = [],
}: {
  keyword: string;
  count: number;
  onSearch?: (keyword: string, hq: string | null) => void;
  hqOptions?: HqOption[];
}) {
  const [open, setOpen] = React.useState(false);
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const hasSearch = !!onSearch;
  const hasOptions = hqOptions.length > 0;
  const colonIndex = keyword.indexOf(':');
  const hasColon = colonIndex !== -1;
  const keywordPrefix = hasColon ? keyword.slice(0, colonIndex) : keyword;
  const keywordSuffix = hasColon ? keyword.slice(colonIndex + 1).trim() : null;

  const handleSelect = (hq: string | null) => {
    setOpen(false);
    onSearch?.(keyword, hq);
  };

  return (
    <div className="relative m-1 px-2 py-1 rounded bg-white/[0.04] surface-hover">
      <span className="text-sm text-text-secondary flex items-center gap-1 flex-wrap">
        {count}x{' '}
        {hasColon ? (
          <span>
            <span>{keywordPrefix}:</span>
            <span className="ml-1 text-text-muted">{keywordSuffix}</span>
          </span>
        ) : (
          <span>{keyword}</span>
        )}
        {hasSearch && (
          <button
            ref={btnRef}
            aria-label={`Search personnel with keyword ${keyword}`}
            aria-haspopup={hasOptions ? 'menu' : undefined}
            aria-expanded={open}
            onClick={(e) => {
              e.stopPropagation();
              if (hasOptions) {
                setOpen((v) => !v);
              } else {
                onSearch(keyword, null);
              }
            }}
            className="ml-0.5 w-4 h-4 flex items-center justify-center text-xs text-text-muted hover:text-text-primary transition-colors cursor-pointer shrink-0"
          >
            +
          </button>
        )}
      </span>
      {open && hasOptions && (
        <SearchOverlay
          label={keyword}
          hqOptions={hqOptions}
          selectedHq="all"
          anchorRef={btnRef}
          onSelect={handleSelect}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
