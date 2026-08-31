'use client';

import React, { useMemo, useState } from 'react';

interface Deck {
  id: string;
  name: string;
  rows: any[];
}

interface CharacteristicCompareTableProps {
  decks: Deck[];
  label: string;
  characteristicName: string;
  filterFunction: (row: Record<string, any>) => boolean;
  splitFunction: (value: any) => any[];
  assembleCounts: (counts: Record<string, any>, item: any, count: number) => Record<string, any>;
}

function aggregate(
  rows: Array<Record<string, any>>,
  characteristicName: string,
  filterFunction: (row: Record<string, any>) => boolean,
  splitFunction: (value: any) => any[],
  assembleCounts: (counts: Record<string, any>, item: any, count: number) => Record<string, any>
) {
  let counts: Record<string, any> = {};
  rows
    .filter(filterFunction)
    .forEach((row) => {
      splitFunction(row[characteristicName]).forEach((item) => {
        counts = assembleCounts(counts, item, row.count);
      });
    });
  return counts;
}

export default function CharacteristicCompareTable({
  decks,
  label,
  characteristicName,
  filterFunction,
  splitFunction,
  assembleCounts,
}: CharacteristicCompareTableProps) {
  const [sortDeckId, setSortDeckId] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const deckCounts = useMemo(
    () =>
      decks.map((deck) => ({
        deck,
        counts: aggregate(deck.rows, characteristicName, filterFunction, splitFunction, assembleCounts),
      })),
    [decks, characteristicName, filterFunction, splitFunction, assembleCounts]
  );

  const allKeys = useMemo(() => {
    const keys = new Set<string>();
    deckCounts.forEach(({ counts }) => Object.keys(counts).forEach((key) => keys.add(key)));
    return Array.from(keys).sort((a, b) => a.localeCompare(b));
  }, [deckCounts]);

  const sortedKeys = useMemo(() => {
    if (!sortDeckId) return allKeys;

    const sortDeck = deckCounts.find(({ deck }) => deck.id === sortDeckId);
    if (!sortDeck) return allKeys;

    const direction = sortDirection === 'asc' ? 1 : -1;
    return [...allKeys].sort((a, b) => {
      const countA = sortDeck.counts[a] ?? 0;
      const countB = sortDeck.counts[b] ?? 0;
      return (countA - countB) * direction || a.localeCompare(b);
    });
  }, [allKeys, deckCounts, sortDeckId, sortDirection]);

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
          <th className="text-left text-text-secondary font-normal py-1 pr-4">{label}</th>
          {deckCounts.map(({ deck }) => (
            <th key={deck.id} className="text-right text-text-secondary font-normal py-1 px-2">
              <button
                type="button"
                onClick={() => handleHeaderClick(deck.id)}
                className="hover:text-text-primary"
              >
                {deck.name}
                {sortDeckId === deck.id && (sortDirection === 'desc' ? ' \u2193' : ' \u2191')}
              </button>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sortedKeys.map((key) => (
          <tr key={key} className="border-t border-white/10">
            <td className="text-text-primary py-1 pr-4">{key}</td>
            {deckCounts.map(({ deck, counts }) => (
              <td key={deck.id} className="text-right text-text-secondary py-1 px-2">
                {counts[key] ?? 0}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
