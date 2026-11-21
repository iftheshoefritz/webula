'use client';

// The name a card named (#1789), shown on the card in a card list panel: Self-Replicating Roadblock on a
// mission card. `PracticeTable` provides the ids of the cards that may name one and the opener of the
// picker; each such card shows `NamedCardBadge`, a button of its own, "Named: Wavefront" or "Name a card",
// so the card's tap, hold and drag stay as they are.

import { createContext, useContext } from 'react';

export interface NamedCards {
  ids: ReadonlySet<string>;
  onName: (id: string) => void;
}

const NamedCardContext = createContext<NamedCards>({ ids: new Set(), onName: () => {} });

export const NamedCardProvider = NamedCardContext.Provider;

// The badge at the bottom of a card that names a card: a tap opens the picker to name it or change it.
// It carries no `data-zone` and no `data-card-id`, and a press on it starts no drag of the card under it.
export function NamedCardBadge({ id, named }: { id: string; named?: string }) {
  const { ids, onName } = useContext(NamedCardContext);
  if (!ids.has(id)) return null;
  const label = named ? `Named: ${named}` : 'Name a card';
  return (
    <button
      type="button"
      data-testid="named-card"
      data-named={named ?? ''}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onName(id);
      }}
      aria-label={named ? `Named ${named}: change the name` : 'Name a card'}
      title={label}
      className="absolute bottom-1 left-1/2 z-10 max-w-[95%] -translate-x-1/2 truncate rounded-full border border-amber-200 bg-amber-500 px-2 py-0.5 text-[10px] font-bold leading-none text-black shadow-md"
    >
      {label}
    </button>
  );
}
