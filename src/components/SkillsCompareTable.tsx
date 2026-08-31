'use client';

import React, { useMemo, useState } from 'react';
import { countSkills, countDrawPileCards } from './SkillsChart';
import { SKILLS } from '../lib/missionRequirements';

const skillList = SKILLS.map((s) => s.toLowerCase());

interface Deck {
  id: string;
  name: string;
  rows: any[];
}

interface SkillsCompareTableProps {
  decks: Deck[];
}

export default function SkillsCompareTable({ decks }: SkillsCompareTableProps) {
  const [sortDeckId, setSortDeckId] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const deckCounts = useMemo(
    () => decks.map((deck) => ({ deck, counts: countSkills(deck.rows) })),
    [decks]
  );

  const sortedSkills = useMemo(() => {
    if (!sortDeckId) return skillList;

    const sortDeck = deckCounts.find(({ deck }) => deck.id === sortDeckId);
    if (!sortDeck) return skillList;

    const direction = sortDirection === 'asc' ? 1 : -1;
    return [...skillList].sort((a, b) => {
      const countA = sortDeck.counts[a] ?? 0;
      const countB = sortDeck.counts[b] ?? 0;
      return (countA - countB) * direction || a.localeCompare(b);
    });
  }, [deckCounts, sortDeckId, sortDirection]);

  const handleHeaderClick = (deckId: string) => {
    if (sortDeckId === deckId) {
      setSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortDeckId(deckId);
      setSortDirection('desc');
    }
  };

  return (
    <table className="text-sm w-full">
      <thead>
        <tr>
          <th className="text-left text-text-secondary font-normal py-1 pr-4">Skill</th>
          {deckCounts.map(({ deck }) => (
            <th key={deck.id} className="text-right text-text-secondary font-normal py-1 px-2">
              <button
                type="button"
                onClick={() => handleHeaderClick(deck.id)}
                className="hover:text-text-primary"
              >
                {deck.name} ({countDrawPileCards(deck.rows)})
                {sortDeckId === deck.id && (sortDirection === 'desc' ? ' \u2193' : ' \u2191')}
              </button>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sortedSkills.map((skill) => (
          <tr key={skill} className="border-t border-white/10">
            <td className="capitalize text-text-primary py-1 pr-4">{skill}</td>
            {deckCounts.map(({ deck, counts }) => (
              <td key={deck.id} className="text-right text-text-secondary py-1 px-2">
                {counts[skill] ?? 0}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
