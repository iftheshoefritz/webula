// The personnel a card's effect lets the player choose (#1712), Common Purpose's "Stop any number of
// your personnel": every unstopped personnel the player commands, in every away team and every crew, at
// every mission, never the brig. Grouped by place, the away teams in mission order, then the crews in
// mission order and ship-row order, as `attemptMoveDestinations` orders them.

import { cardDisplayName } from '../../../lib/cardCount';
import { differentAffiliations } from '../../../lib/costModels/model';
import type { CardInstance, TableState } from './tableReducer';

export interface PersonnelCandidate {
  id: string;
  name: string;
  affiliation: string;
  card: CardInstance;
}

export interface PersonnelCandidateGroup {
  key: string;
  label: string;
  cards: PersonnelCandidate[];
}

const candidatesOf = (cards: CardInstance[]): PersonnelCandidate[] =>
  cards.flatMap((c) =>
    c.card?.type === 'personnel' && !c.stopped
      ? [{ id: c.id, name: cardDisplayName(c.card), affiliation: String(c.card.affiliation ?? '').trim(), card: c }]
      : []
  );

export function personnelCandidateGroups(table: TableState): PersonnelCandidateGroup[] {
  const groups: PersonnelCandidateGroup[] = [];
  table.missions.forEach((slot, missionIndex) => {
    const cards = candidatesOf(slot.awayTeam);
    if (cards.length) {
      const mission = slot.mission ? cardDisplayName(slot.mission.card) : `mission ${missionIndex + 1}`;
      groups.push({ key: `awayTeam-${missionIndex}`, label: `Away team at ${mission}`, cards });
    }
  });
  table.missions.forEach((slot, missionIndex) => {
    const mission = slot.mission ? cardDisplayName(slot.mission.card) : `mission ${missionIndex + 1}`;
    for (const ship of slot.ships) {
      const cards = candidatesOf(ship.crew ?? []);
      if (cards.length) groups.push({ key: `crew-${ship.id}`, label: `Crew of ${cardDisplayName(ship.card)} at ${mission}`, cards });
    }
  });
  return groups;
}

// The chosen personnel that are still candidates, in `ids` order, so a stale or stopped id is dropped.
export function chosenPersonnel(table: TableState, ids: string[]): PersonnelCandidate[] {
  const byId = new Map(personnelCandidateGroups(table).flatMap((g) => g.cards.map((c) => [c.id, c] as const)));
  return [...new Set(ids)].flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
}

// The counters the chosen personnel add: their different affiliations.
export const personnelChoiceDelta = (chosen: PersonnelCandidate[]): number => differentAffiliations(chosen.map((c) => c.affiliation));

// "3 personnel, 2 affiliations: +2".
export function personnelChoiceSummary(chosen: PersonnelCandidate[]): string {
  const n = personnelChoiceDelta(chosen);
  return `${chosen.length} personnel, ${n} ${n === 1 ? 'affiliation' : 'affiliations'}: +${n}`;
}
