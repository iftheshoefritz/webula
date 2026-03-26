'use client';

import React, { useMemo, useState, useEffect, useRef } from 'react';

const skillList = [
  'acquisition',
  'anthropology',
  'archaeology',
  'astrometrics',
  'biology',
  'diplomacy',
  'engineer',
  'exobiology',
  'geology',
  'honor',
  'intelligence',
  'law',
  'leadership',
  'medical',
  'navigation',
  'officer',
  'physics',
  'programming',
  'science',
  'security',
  'telepathy',
  'transporters',
  'treachery',
];

export interface HqOption {
  label: string;
  value: string;
}

interface SkillsChartProps {
  currentDeckRows: any[];
  missionRequirements?: Record<string, number>;
  /** Called when the user picks a search option from the + overlay.
   *  hq is null for "All personnel", or a reportsto value string. */
  onSkillSearch?: (skill: string, hq: string | null) => void;
  hqOptions?: HqOption[];
  /** Per-skill currently selected HQ value (or 'all') — used to surface the
   *  active reportsto option at the top of the overlay. */
  skillHqSelections?: Record<string, string>;
}

function SkillSearchOverlay({
  skill,
  hqOptions,
  selectedHq,
  anchorRef,
  onSelect,
  onClose,
}: {
  skill: string;
  hqOptions: HqOption[];
  selectedHq: string;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  onSelect: (hq: string | null) => void;
  onClose: () => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);

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

  // Build the ordered list of options.
  // If an HQ is selected for this skill, put it first.
  const activeHq = selectedHq !== 'all' ? hqOptions.find((o) => o.value === selectedHq) : null;
  const restOptions = hqOptions.filter((o) => o.value !== selectedHq);

  return (
    <div
      ref={overlayRef}
      className="absolute right-0 top-full mt-1 z-50 min-w-[14rem] rounded-lg border border-white/15 bg-bg-secondary shadow-xl py-1"
      role="menu"
    >
      <div className="px-3 py-1.5 text-xs text-text-secondary border-b border-white/10 mb-1">
        Search <span className="text-text-primary capitalize">{skill}</span> personnel matching
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
        className="w-full text-left px-3 py-1.5 text-xs text-text-secondary hover:bg-white/10"
        onClick={() => onSelect(null)}
      >
        All
      </button>
    </div>
  );
}

function SkillRow({
  skill,
  count,
  req,
  max,
  hqOptions,
  selectedHq,
  onSkillSearch,
}: {
  skill: string;
  count: number;
  req?: number;
  max: number;
  hqOptions: HqOption[];
  selectedHq: string;
  onSkillSearch?: (skill: string, hq: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const hasSearch = !!onSkillSearch;
  const hasOptions = hqOptions.length > 0;

  const handleSelect = (hq: string | null) => {
    setOpen(false);
    onSkillSearch?.(skill, hq);
  };

  return (
    <div className="relative flex items-center gap-2 text-sm py-0.5 rounded">
      <span className="w-28 capitalize text-text-primary">{skill}</span>
      <div className="relative flex flex-1 h-5 rounded overflow-hidden bg-white/10">
        {count > 0 && (
          <div
            className="bg-blue-500/70 h-full"
            style={{ width: `${(count / max) * 100}%` }}
          />
        )}
        {req !== undefined && (
          <div
            className="absolute top-0 h-full w-0.5 bg-amber-400"
            style={{ left: `${(req / max) * 100}%` }}
          />
        )}
      </div>
      <span className="w-10 text-right text-text-secondary shrink-0">
        {count}
        <span className="text-amber-400 ml-0.5">/{req ?? 0}</span>
      </span>
      {hasSearch && (
        <button
          ref={btnRef}
          aria-label={`Search personnel with ${skill}`}
          aria-haspopup={hasOptions ? 'menu' : undefined}
          aria-expanded={open}
          onClick={(e) => {
            e.stopPropagation();
            if (hasOptions) {
              setOpen((v) => !v);
            } else {
              onSkillSearch(skill, null);
            }
          }}
          className="shrink-0 w-5 h-5 flex items-center justify-center rounded text-text-secondary hover:text-text-primary hover:bg-white/10 transition-colors text-base leading-none"
        >
          +
        </button>
      )}
      {open && hasOptions && (
        <SkillSearchOverlay
          skill={skill}
          hqOptions={hqOptions}
          selectedHq={selectedHq}
          anchorRef={btnRef}
          onSelect={handleSelect}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

export default function SkillsChart({
  currentDeckRows,
  missionRequirements,
  onSkillSearch,
  hqOptions = [],
  skillHqSelections = {},
}: SkillsChartProps) {
  const skillCounts = useMemo(() => {
    const counts: Record<string, number> = {};

    currentDeckRows
      .filter((row) => row.pile === 'draw' && row.type === 'personnel')
      .forEach((row) => {
        const skills: string[] = (row.skills || '').match(/(?:\d+ \w+|\w+)/g) || [];
        skills.forEach((skillItem: string) => {
          const [, , skill] = skillItem.trim().match(/(\d*)\s*(\w+)/) || [null, null, null];
          if (skill && skillList.includes(skill)) {
            counts[skill] = (counts[skill] || 0) + row.count;
          }
        });
      });

    return Object.entries(counts)
      .map(([skill, count]) => ({ skill, count }))
      .sort((a, b) => b.count - a.count || a.skill.localeCompare(b.skill));
  }, [currentDeckRows]);

  const hasMissionReqs = missionRequirements && Object.keys(missionRequirements).length > 0;

  const allSkills = skillList.map((skill) => ({
    skill,
    count: skillCounts.find((s) => s.skill === skill)?.count ?? 0,
  }));

  const maxCount = skillCounts.length > 0 ? Math.max(...skillCounts.map((s) => s.count)) : 0;
  const maxReq = hasMissionReqs
    ? Math.max(...Object.values(missionRequirements!))
    : 0;
  const max = Math.max(maxCount, maxReq, 1);

  return (
    <div className="space-y-1 px-2 py-1">
      {hasMissionReqs && (
        <div className="flex gap-4 text-xs text-text-secondary mb-2">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-sm bg-blue-500/70" />
            Personnel skills
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-0.5 h-3 bg-amber-400" />
            Mission required
          </span>
        </div>
      )}
      {allSkills.map(({ skill, count }) => (
        <SkillRow
          key={skill}
          skill={skill}
          count={count}
          req={missionRequirements?.[skill]}
          max={max}
          hqOptions={hqOptions}
          selectedHq={skillHqSelections[skill] ?? 'all'}
          onSkillSearch={onSkillSearch}
        />
      ))}
    </div>
  );
}
