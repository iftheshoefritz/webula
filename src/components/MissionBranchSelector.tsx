'use client';

import type { ParsedMissionRequirements } from '../lib/missionRequirements';

interface MissionBranchSelectorProps {
  missionName: string;
  parsed: ParsedMissionRequirements;
  selected: number | null;
  onChange: (index: number | null) => void;
}

export default function MissionBranchSelector({
  missionName,
  parsed,
  selected,
  onChange,
}: MissionBranchSelectorProps) {
  const branchLabel = (branch: Record<string, number>) => {
    const combined = { ...parsed.mandatory, ...branch };
    return Object.keys(combined)
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join(', ');
  };

  const mandatoryLabel = Object.keys(parsed.mandatory)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(', ');

  return (
    <div className="mt-2 flex flex-wrap gap-1 justify-center" data-testid={`branch-selector-${missionName}`}>
      {parsed.orBranches ? (
        <>
          <button
            className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
              selected === null
                ? 'bg-amber-500 border-amber-500 text-black font-semibold'
                : 'border-border text-text-secondary hover:border-amber-400 hover:text-amber-300'
            }`}
            onClick={() => onChange(null)}
            aria-pressed={selected === null}
          >
            All
          </button>
          {parsed.orBranches.map((branch, i) => (
            <button
              key={i}
              className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                selected === i
                  ? 'bg-amber-500 border-amber-500 text-black font-semibold'
                  : 'border-border text-text-secondary hover:border-amber-400 hover:text-amber-300'
              }`}
              onClick={() => onChange(i)}
              aria-pressed={selected === i}
            >
              {branchLabel(branch)}
            </button>
          ))}
        </>
      ) : (
        <button
          className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
            selected !== -1
              ? 'bg-amber-500 border-amber-500 text-black font-semibold'
              : 'border-border text-text-secondary hover:border-amber-400 hover:text-amber-300'
          }`}
          onClick={() => onChange(null)}
          aria-pressed={selected !== -1}
        >
          {mandatoryLabel}
        </button>
      )}
      <button
        className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
          selected === -1
            ? 'bg-amber-500 border-amber-500 text-black font-semibold'
            : 'border-border text-text-secondary hover:border-amber-400 hover:text-amber-300'
        }`}
        onClick={() => onChange(-1)}
        aria-pressed={selected === -1}
      >
        None
      </button>
    </div>
  );
}
