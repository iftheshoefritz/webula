'use client';

// The spends of counters a mission's text allows (#1754), by mission slot: Earth's "Spend 1: draw 2"
// after a play of a [TOS] card there, and Nimbus III's download of Caithlin Dar, Korrd or St. John
// Talbot. `PracticeTable` provides the offers that stand now, and the mission card shows
// `MissionSpendButton` at its top-left corner, a button of its own, so the card's tap, double-tap, hold
// and drop halves stay as they are. It shows with Counters on or off.

import { createContext, useContext } from 'react';

export interface MissionSpendOffer {
  label: string;
  short: string;
  onPress: () => void;
}

const MissionSpendContext = createContext<ReadonlyMap<number, MissionSpendOffer>>(new Map());

export const MissionSpendProvider = MissionSpendContext.Provider;

// The button at the top-left corner of the mission card of slot `missionIndex` that offers a spend. It
// carries no `data-zone` and no `data-card-id`, and a press on it starts no drag and no tap of the card.
export function MissionSpendButton({ missionIndex, height }: { missionIndex: number; height: number }) {
  const offer = useContext(MissionSpendContext).get(missionIndex);
  if (!offer) return null;
  return (
    <button
      type="button"
      data-testid={`mission-spend-${missionIndex}`}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        offer.onPress();
      }}
      aria-label={offer.label}
      title={offer.label}
      className="absolute -top-1 -left-1 z-10 flex items-center rounded-full border border-amber-200 bg-amber-500 px-1 leading-none text-black shadow-md pointer-events-auto"
      style={{ height: Math.max(height, 16) }}
    >
      <span className="text-[9px] font-bold">{offer.short}</span>
    </button>
  );
}
