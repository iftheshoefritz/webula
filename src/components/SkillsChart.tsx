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
}

export default function SkillsChart({ currentDeckRows }: SkillsChartProps) {
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

  if (skillCounts.length === 0) {
    return null;
  }

  const max = skillCounts[0].count;

  return (
    <div className="space-y-1 px-2 py-1">
      {skillCounts.map(({ skill, count }) => (
        <div key={skill} className="flex items-center gap-2 text-sm">
          <span className="w-28 capitalize text-text-primary">{skill}</span>
          <div className="flex flex-1 h-3 rounded overflow-hidden bg-white/10">
            <div
              className="bg-blue-500/70 h-full"
              style={{ width: `${(count / max) * 100}%` }}
            />
          </div>
          <span className="w-6 text-right text-text-secondary">{count}</span>
        </div>
      ))}
    </div>
  );
}
