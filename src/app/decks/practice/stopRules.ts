// The rules of the Stop, Unstop, Stop all and Unstop all buttons (#681, #995, #1560), shared by a card list panel
// (`CardListPanel.tsx`) and the row of the attempting personnel in the attempt layout (#1165,
// `AttemptPersonnelRow.tsx`), so both show the same button and dispatch the same `setStopped`.
import type { CardInstance } from './tableReducer';

export interface StopButtons {
  // The selected personnel of the cards. Stop or Unstop shows while there is one.
  selectedPersonnel: CardInstance[];
  // Every selected personnel is stopped already: the button reads Unstop.
  allSelectedStopped: boolean;
  // The personnel Stop all stops.
  unstoppedPersonnel: CardInstance[];
  // The personnel Unstop all unstops.
  stoppedPersonnel: CardInstance[];
  // The cards hold a personnel and every one is stopped: Stop all reads Unstop all (#1560).
  allPersonnelStopped: boolean;
}

export function stopButtons(cards: CardInstance[], selectedIds: string[]): StopButtons {
  const selectedPersonnel = cards.filter(
    (instance) => selectedIds.includes(instance.id) && instance.card.type === 'personnel'
  );
  const personnel = cards.filter((instance) => instance.card.type === 'personnel');
  const unstoppedPersonnel = personnel.filter((instance) => !instance.stopped);
  return {
    selectedPersonnel,
    allSelectedStopped: selectedPersonnel.length > 0 && selectedPersonnel.every((instance) => instance.stopped),
    unstoppedPersonnel,
    stoppedPersonnel: personnel.filter((instance) => instance.stopped),
    allPersonnelStopped: personnel.length > 0 && unstoppedPersonnel.length === 0,
  };
}
