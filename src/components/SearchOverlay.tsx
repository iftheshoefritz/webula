'use client';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { HqOption } from './SkillsChart';

interface SearchOverlayProps {
  label: string;
  hqOptions: HqOption[];
  selectedHq: string;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  onSelect: (hq: string | null) => void;
  onClose: () => void;
}

export default function SearchOverlay({
  label,
  hqOptions,
  selectedHq,
  anchorRef,
  onSelect,
  onClose,
}: SearchOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [openUpward, setOpenUpward] = useState(false);
  const [alignRight, setAlignRight] = useState(false);

  // Close on outside click or Escape
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        overlayRef.current &&
        !overlayRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [anchorRef, onClose]);

  // Flip the overlay upward if clipped below the viewport; align right if clipped on the right
  useLayoutEffect(() => {
    if (!overlayRef.current || !anchorRef.current) return;
    const anchorRect = anchorRef.current.getBoundingClientRect();
    const overlayHeight = overlayRef.current.offsetHeight;
    const overlayWidth = overlayRef.current.offsetWidth;
    const spaceBelow = window.innerHeight - anchorRect.bottom;
    const spaceRight = window.innerWidth - anchorRect.left;
    setOpenUpward(spaceBelow < overlayHeight + 8);
    setAlignRight(spaceRight < overlayWidth + 8);
  }, [anchorRef]);

  const activeHq = selectedHq !== 'all' ? hqOptions.find((o) => o.value === selectedHq) : null;
  const restOptions = hqOptions.filter((o) => o.value !== selectedHq);

  return (
    <div
      ref={overlayRef}
      className={`absolute z-50 min-w-[14rem] rounded-lg border border-white/15 bg-bg-secondary shadow-xl py-1 ${alignRight ? 'right-0' : 'left-0'} ${openUpward ? 'bottom-full mb-1' : 'top-full mt-1'}`}
      role="menu"
    >
      <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-text-muted bg-white/[0.03] rounded-t-lg border-b border-white/10 mb-1">
        Search <span className="text-text-secondary capitalize">{label}</span> matching
      </div>
      {activeHq && (
        <button
          role="menuitem"
          className="w-full text-left px-3 py-1.5 text-xs text-text-primary hover:bg-white/10 flex items-center gap-2"
          onClick={() => onSelect(activeHq.value)}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
          {activeHq.label}
        </button>
      )}
      {restOptions.map((opt) => (
        <button
          key={opt.value}
          role="menuitem"
          className="w-full text-left px-3 py-1.5 text-xs text-text-primary hover:bg-white/10"
          onClick={() => onSelect(opt.value)}
        >
          {opt.label}
        </button>
      ))}
      <div className="border-t border-white/10 mt-1" />
      <button
        role="menuitem"
        className="w-full text-left px-3 py-1.5 text-xs text-text-primary hover:bg-white/10"
        onClick={() => onSelect(null)}
      >
        Any HQ
      </button>
    </div>
  );
}
