'use client';

// The hold that places a dragged card on one card in the core or the brig (#1029). A drop on a
// card in either zone adds the dragged card to the zone, unless the drag held over that card for
// `PLACE_ON_HOLD_MS` first, which arms it. `page.tsx` tracks both values from `onDragOver` and
// shares them here, so `FlatCardRow` can show the zone highlight while the pointer is over an
// unarmed card, and the card's own highlight only once it is armed.

import { createContext, useContext } from 'react';

export type PlaceOnHold = {
  // The card whose `on-<id>` droppable the drag is over, or null.
  overTargetId: string | null;
  // The card a drop now places the dragged card on, or null.
  armedTargetId: string | null;
};

export const NO_PLACE_ON_HOLD: PlaceOnHold = { overTargetId: null, armedTargetId: null };

const PlaceOnHoldContext = createContext<PlaceOnHold>(NO_PLACE_ON_HOLD);

export const PlaceOnHoldProvider = PlaceOnHoldContext.Provider;

export function usePlaceOnHold(): PlaceOnHold {
  return useContext(PlaceOnHoldContext);
}
