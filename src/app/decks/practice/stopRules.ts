// The rules of the Stop, Unstop and Stop all buttons (#681, #995), shared by a card list panel
// (`CardListPanel.tsx`) and the row of the attempting personnel in the attempt layout (#1165,
// `AttemptPersonnelRow.tsx`), so both show the same button and dispatch the same `setStopped`.
import type { CardInstance } from './tableReducer';

export interface StopButtons {
  // The selected personnel of the cards. Stop or Unstop shows while there is one.
  selectedPersonnel: CardInstance[];
  // Every selected personnel is stopped already: the button reads Unstop.
  allSelectedStopped: boolean;
  // The personnel Stop all stops. Stop all is disabled when there is none.
  unstoppedPersonnel: CardInstance[];
}

export function stopButtons(cards: CardInstance[], selectedIds: string[]): StopButtons {
  const selectedPersonnel = cards.filter(
    (instance) => selectedIds.includes(instance.id) && instance.card.type === 'personnel'
  );
  return {
    selectedPersonnel,
    allSelectedStopped: selectedPersonnel.length > 0 && selectedPersonnel.every((instance) => instance.stopped),
    unstoppedPersonnel: cards.filter((instance) => instance.card.type === 'personnel' && !instance.stopped),
  };
}
