'use client';

// The uses the cards on the table offer for this turn's plays (#1713), by the instance id of the card:
// Delivery Boy in the core, Nathan Samuels or Guinan in an away team or a crew. `PracticeTable` provides
// the open, available uses of the current turn's charges, the latest charge first, and each card that
// has one shows `TableCardUseBadge`, a button of its own, so the card's tap, hold and drag stay as they are.

import { createContext, useContext } from 'react';

export interface TableCardUse {
  label: string;
  onUse: () => void;
}

const TableCardUseContext = createContext<ReadonlyMap<string, TableCardUse>>(new Map());

export const TableCardUseProvider = TableCardUseContext.Provider;

export function useTableCardUse(id: string): TableCardUse | undefined {
  return useContext(TableCardUseContext).get(id);
}

// The badge at the top left of a card that offers a use: a tap takes it. It carries no `data-zone` and
// no `data-card-id`, and a press on it starts no drag of the card under it.
export function TableCardUseBadge({ id }: { id: string }) {
  const use = useTableCardUse(id);
  if (!use) return null;
  return (
    <button
      type="button"
      data-testid="table-card-use"
      data-use-card={id}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        use.onUse();
      }}
      aria-label={use.label}
      title={use.label}
      className="absolute top-0.5 left-0.5 z-10 min-w-6 h-6 px-1 rounded-full border border-amber-200 bg-amber-500 text-[10px] font-bold leading-none text-black shadow-md"
    >
      {use.label.match(/−\d+$/)?.[0] ?? 'Use'}
    </button>
  );
}
