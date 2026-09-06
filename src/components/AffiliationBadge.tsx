'use client';

import React from 'react';
import SearchOverlay from './SearchOverlay';
import CompareDelta from './CompareDelta';
import AffiliationGlyph from './AffiliationGlyph';
import type { HqOption } from './SkillsChart';

export default function AffiliationBadge({
  affiliation,
  count,
  compareCount,
  onSearch,
  hqOptions = [],
}: {
  affiliation: string;
  count: number;
  compareCount?: number;
  onSearch?: (affiliation: string, hq: string | null) => void;
  hqOptions?: HqOption[];
}) {
  const [open, setOpen] = React.useState(false);
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const hasSearch = !!onSearch;
  const hasOptions = hqOptions.length > 0;

  const handleSelect = (hq: string | null) => {
    setOpen(false);
    onSearch?.(affiliation, hq);
  };

  return (
    <div className="relative m-1 px-2 py-1 rounded bg-white/[0.04] surface-hover">
      <span className="text-sm text-text-secondary flex items-center gap-1 flex-wrap">
        {count}x<CompareDelta count={count} compareCount={compareCount} />{' '}
        <AffiliationGlyph affiliation={affiliation} />
        {hasSearch && (
          <button
            ref={btnRef}
            aria-label={`Search personnel with affiliation ${affiliation}`}
            aria-haspopup={hasOptions ? 'menu' : undefined}
            aria-expanded={open}
            onClick={(e) => {
              e.stopPropagation();
              if (hasOptions) {
                setOpen((v) => !v);
              } else {
                onSearch(affiliation, null);
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
          label={affiliation}
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
