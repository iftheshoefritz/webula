'use client';

import React, { useRef, useState } from 'react';
import { CARD_ICON_IMAGES } from '../lib/missionRequirements';
import SearchOverlay from './SearchOverlay';
import type { HqOption } from './SkillsChart';

interface IconPillProps {
  icon: string;
  count: number;
  onSearch?: (icon: string, hq: string | null) => void;
  hqOptions?: HqOption[];
}

export default function IconPill({ icon, count, onSearch, hqOptions = [] }: IconPillProps) {
  const iconSrc = CARD_ICON_IMAGES[icon.toLowerCase()];
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const hasSearch = !!onSearch;
  const hasOptions = hqOptions.length > 0;

  const handleSelect = (hq: string | null) => {
    setOpen(false);
    onSearch?.(icon, hq);
  };

  return (
    <div className="relative m-2 p-2 border border-white/[0.06] rounded surface-hover">
      <span className="px-1 text-text-secondary flex items-center gap-1">
        {count}x{' '}
        {iconSrc
          ? <img src={iconSrc} alt={icon} title={icon} className="inline h-4 w-4" />
          : <b className="text-text-primary">[{icon}]</b>
        }
        {hasSearch && (
          <button
            ref={btnRef}
            aria-label={`Search personnel with ${icon}`}
            aria-haspopup={hasOptions ? 'menu' : undefined}
            aria-expanded={open}
            onClick={(e) => {
              e.stopPropagation();
              if (hasOptions) {
                setOpen((v) => !v);
              } else {
                onSearch(icon, null);
              }
            }}
            className="btn-icon btn-icon-sm shrink-0 ml-1"
          >
            +
          </button>
        )}
      </span>
      {open && hasOptions && (
        <SearchOverlay
          label={icon}
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
