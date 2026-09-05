'use client';

import React from 'react';
import { useCharacteristicCompare } from '../hooks/useCharacteristicCompare';
import { countDrawPileCards } from './SkillsChart';
import IconGlyph from './IconGlyph';

interface Deck {
  id: string;
  name: string;
  rows: any[];
}

interface IconCompareTableProps {
  decks: Deck[];
  label: string;
  characteristicName: string;
  filterFunction: (row: Record<string, any>) => boolean;
  splitFunction: (value: any) => any[];
  assembleCounts: (counts: Record<string, any>, item: any, count: number) => Record<string, any>;
}

export default function IconCompareTable({
  decks,
  label,
  characteristicName,
  filterFunction,
  splitFunction,
  assembleCounts,
}: IconCompareTableProps) {
  const { deckCounts, sortedKeys, sortDeckId, sortDirection, handleHeaderClick } = useCharacteristicCompare(
    decks,
    characteristicName,
    filterFunction,
    splitFunction,
    assembleCounts
  );

  return (
    <table className="text-sm w-full">
      <thead>
        <tr>
          <th className="text-left text-text-secondary font-normal py-1 pr-4">{label}</th>
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
        {sortedKeys.map((key) => (
          <tr key={key} className="group border-t border-white/10">
            <td
              className={`text-text-primary py-1 pr-4 rounded-l transition-colors group-hover:bg-white/[0.04] ${
                deckCounts.length === 0 ? 'rounded-r' : ''
              }`}
            >
              <IconGlyph icon={key} />
            </td>
            {deckCounts.map(({ deck, counts }, index) => (
              <td
                key={deck.id}
                className={`text-right text-text-secondary py-1 px-2 transition-colors group-hover:bg-white/[0.04] ${
                  index === deckCounts.length - 1 ? 'rounded-r' : ''
                }`}
              >
                {counts[key] ?? 0}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
