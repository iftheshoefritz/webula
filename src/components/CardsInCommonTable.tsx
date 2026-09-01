'use client';

import React, { useMemo, useState } from 'react';

interface Deck {
  id: string;
  name: string;
  rows: any[];
}

interface CardsInCommonTableProps {
  decks: Deck[];
  filterFunction?: (row: any) => boolean;
}

interface CardsInCommonRow {
  name: string;
  countsByDeckId: Record<string, number>;
  numDecks: number;
}

type SortKey = 'name' | 'numDecks' | string;

export function aggregateCardsInCommon(
  decks: Deck[],
  filterFunction: (row: any) => boolean = () => true
): CardsInCommonRow[] {
  const countsByName = new Map<string, Record<string, number>>();

  decks.forEach((deck) => {
    deck.rows.filter(filterFunction).forEach((row) => {
      const name = row.name;
      const countsByDeckId = countsByName.get(name) ?? {};
      countsByDeckId[deck.id] = (countsByDeckId[deck.id] ?? 0) + (row.count ?? 0);
      countsByName.set(name, countsByDeckId);
    });
  });

  return Array.from(countsByName.entries()).map(([name, countsByDeckId]) => ({
    name,
    countsByDeckId,
    numDecks: decks.filter((deck) => (countsByDeckId[deck.id] ?? 0) > 0).length,
  }));
}

export default function CardsInCommonTable({ decks, filterFunction }: CardsInCommonTableProps) {
  const rows = useMemo(() => aggregateCardsInCommon(decks, filterFunction), [decks, filterFunction]);

  const maxThreshold = Math.max(decks.length, 1);
  // Raw text of the "Minimum decks" input. `null` means the user hasn't touched it
  // (falls back to `maxThreshold`); `''` represents a transient empty state while
  // the user is retyping the value, which must NOT be force-clamped back to a
  // number, or the next keystroke would be appended to the clamped value instead
  // of starting fresh (see #499).
  const [rawThreshold, setRawThreshold] = useState<string | null>(null);
  const effectiveThreshold = useMemo(() => {
    if (rawThreshold === null || rawThreshold === '') return maxThreshold;
    const parsed = Number(rawThreshold);
    if (Number.isNaN(parsed)) return maxThreshold;
    return Math.min(Math.max(parsed, 1), maxThreshold);
  }, [rawThreshold, maxThreshold]);
  const displayThreshold = rawThreshold === '' ? '' : effectiveThreshold;

  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const filteredRows = useMemo(
    () => rows.filter((row) => row.numDecks > effectiveThreshold),
    [rows, effectiveThreshold]
  );

  const sortedRows = useMemo(() => {
    if (!sortKey) return filteredRows;

    const direction = sortDirection === 'asc' ? 1 : -1;
    return [...filteredRows].sort((a, b) => {
      if (sortKey === 'name') {
        return a.name.localeCompare(b.name) * direction;
      }
      if (sortKey === 'numDecks') {
        return (a.numDecks - b.numDecks) * direction || a.name.localeCompare(b.name);
      }
      const countA = a.countsByDeckId[sortKey] ?? 0;
      const countB = b.countsByDeckId[sortKey] ?? 0;
      return (countA - countB) * direction || a.name.localeCompare(b.name);
    });
  }, [filteredRows, sortKey, sortDirection]);

  const handleHeaderClick = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDirection('desc');
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center gap-2 text-sm text-text-secondary">
        Minimum decks
        <input
          type="number"
          aria-label="Minimum decks"
          min={1}
          max={maxThreshold}
          value={displayThreshold}
          onChange={(e) => setRawThreshold(e.target.value)}
          onBlur={() => {
            if (rawThreshold === '') setRawThreshold(null);
          }}
          className="w-16 bg-white/[0.05] text-text-primary text-sm py-1 px-2 rounded border border-white/10 focus:outline-none focus:border-accent/40"
        />
      </label>
      <table className="text-sm w-full">
        <thead>
          <tr>
            <th className="text-left text-text-secondary font-normal py-1 pr-4">
              <button type="button" onClick={() => handleHeaderClick('name')} className="hover:text-text-primary">
                Card
                {sortKey === 'name' && (sortDirection === 'desc' ? ' \u2193' : ' \u2191')}
              </button>
            </th>
            {decks.map((deck) => (
              <th key={deck.id} className="text-right text-text-secondary font-normal py-1 px-2">
                <button
                  type="button"
                  onClick={() => handleHeaderClick(deck.id)}
                  className="hover:text-text-primary"
                >
                  {deck.name}
                  {sortKey === deck.id && (sortDirection === 'desc' ? ' \u2193' : ' \u2191')}
                </button>
              </th>
            ))}
            <th className="text-right text-text-secondary font-normal py-1 px-2">
              <button type="button" onClick={() => handleHeaderClick('numDecks')} className="hover:text-text-primary">
                # decks
                {sortKey === 'numDecks' && (sortDirection === 'desc' ? ' \u2193' : ' \u2191')}
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row) => (
            <tr key={row.name} className="border-t border-white/10">
              <td className="text-text-primary py-1 pr-4">{row.name}</td>
              {decks.map((deck) => (
                <td key={deck.id} className="text-right text-text-secondary py-1 px-2">
                  {row.countsByDeckId[deck.id] ?? 0}
                </td>
              ))}
              <td className="text-right text-text-secondary py-1 px-2">{row.numDecks}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
