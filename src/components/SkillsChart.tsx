'use client';

import React, { useMemo } from 'react';

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

interface SkillsChartProps {
  currentDeckRows: any[];
  missionRequirements?: Record<string, number>;
  onSkillClick?: (skill: string) => void;
}

export default function SkillsChart({ currentDeckRows, missionRequirements, onSkillClick }: SkillsChartProps) {
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
      {allSkills.map(({ skill, count }) => {
        const req = missionRequirements?.[skill];
        const clickable = !!onSkillClick;
        return (
          <div
            key={skill}
            className={`flex items-center gap-2 text-sm py-0.5 rounded ${clickable ? 'cursor-pointer hover:bg-white/5' : ''}`}
            onClick={clickable ? () => onSkillClick(skill) : undefined}
            role={clickable ? 'button' : undefined}
            tabIndex={clickable ? 0 : undefined}
            onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') onSkillClick(skill); } : undefined}
          >
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
            <span className="w-10 text-right text-text-secondary">
              {count}
              <span className="text-amber-400 ml-0.5">/{req ?? 0}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
