// The personnel a card's effect lets the player choose (#1712), Common Purpose's "Stop any number of
// your personnel": every unstopped personnel the player commands, in every away team and every crew, at
// every mission, never the brig. Grouped by place, the away teams in mission order, then the crews in
// mission order and ship-row order, as `attemptMoveDestinations` orders them.

import { cardDisplayName } from '../../../lib/cardCount';
import { cardTitleOf } from '../../../lib/cardTitle';
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

const candidatesOf = (cards: CardInstance[], includeStopped: boolean): PersonnelCandidate[] =>
  cards.flatMap((c) =>
    c.card?.type === 'personnel' && (includeStopped || !c.stopped)
      ? [{ id: c.id, name: cardDisplayName(c.card), affiliation: String(c.card.affiliation ?? '').trim(), card: c }]
      : []
  );

// `includeStopped` lists the stopped personnel too (#1739): These Are The Voyages reads "one of your
// personnel", and a stop changes no cost.
export function personnelCandidateGroups(table: TableState, { includeStopped = false }: { includeStopped?: boolean } = {}): PersonnelCandidateGroup[] {
  const groups: PersonnelCandidateGroup[] = [];
  table.missions.forEach((slot, missionIndex) => {
    const cards = candidatesOf(slot.awayTeam, includeStopped);
    if (cards.length) {
      const mission = slot.mission ? cardDisplayName(slot.mission.card) : `mission ${missionIndex + 1}`;
      groups.push({ key: `awayTeam-${missionIndex}`, label: `Away team at ${mission}`, cards });
    }
  });
  table.missions.forEach((slot, missionIndex) => {
    const mission = slot.mission ? cardDisplayName(slot.mission.card) : `mission ${missionIndex + 1}`;
    for (const ship of slot.ships) {
      const cards = candidatesOf(ship.crew ?? [], includeStopped);
      if (cards.length) groups.push({ key: `crew-${ship.id}`, label: `Crew of ${cardDisplayName(ship.card)} at ${mission}`, cards });
    }
  });
  return groups;
}

// The copy in the draw deck of the personnel `personnelId` (#1746, Second Edition): the top-most card of the
// same title (`cardTitleOf`), when the personnel is one the player commands, stopped or not, never the brig.
// Null otherwise. The reducer and the panel both ask it, so they never disagree.
export function downloadCopyOf(table: TableState, personnelId: string): CardInstance | null {
  const personnel = personnelCandidateGroups(table, { includeStopped: true })
    .flatMap((g) => g.cards)
    .find((c) => c.id === personnelId);
  if (!personnel) return null;
  const title = cardTitleOf(cardDisplayName(personnel.card.card)).toLowerCase();
  return table.drawDeck.find((c) => c.card && cardTitleOf(cardDisplayName(c.card)).toLowerCase() === title) ?? null;
}

// Whether a card has the icon `icon`, lowercased ("[au]"), in its icons.
export const cardHasIcon = (card: CardInstance['card'] | undefined, icon: string): boolean =>
  String(card?.icons ?? '').toLowerCase().includes(icon);

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

// Whether `card` is a personnel of `affiliation` (lowercased), by inclusion, so a card of several
// affiliations counts for each.
const personnelOf = (card: CardInstance['card'] | undefined, affiliation: string): boolean =>
  card?.type === 'personnel' && String(card.affiliation ?? '').toLowerCase().includes(affiliation);

export interface ExchangeCandidates {
  hand: CardInstance[];
  groups: PersonnelCandidateGroup[];
}

// The one affiliation of a personnel, lowercased, or '' (#1826).
const affiliationOf = (card: CardInstance['card'] | undefined): string => String(card?.affiliation ?? '').trim().toLowerCase();

// Whether the personnel `hand` of the hand may take the place of `onTable` (#1826): with a fixed `affiliation`
// any two of its candidates; with none, two personnel of the same affiliation (The Crossing).
export const exchangeMatches = (hand: CardInstance, onTable: CardInstance, affiliation?: string): boolean =>
  affiliation !== undefined || (affiliationOf(hand.card) !== '' && affiliationOf(hand.card) === affiliationOf(onTable.card));

// The two sides of an exchange: for Vidiian Organ Bank (#1765) the personnel of `affiliation` in the hand, and
// those the player commands, unstopped (a stopped personnel cannot be replaced), never the brig, by place. With
// no `affiliation` (The Crossing, #1826) each side keeps the personnel that share an affiliation with one of the
// other side. The reducer and the panel both ask it, so they never disagree.
export function exchangeCandidatesOf(table: TableState, affiliation?: string): ExchangeCandidates {
  if (affiliation !== undefined) {
    return {
      hand: table.hand.filter((c) => personnelOf(c.card, affiliation)),
      groups: personnelCandidateGroups(table)
        .map((g) => ({ ...g, cards: g.cards.filter((c) => personnelOf(c.card.card, affiliation)) }))
        .filter((g) => g.cards.length > 0),
    };
  }
  const handPersonnel = table.hand.filter((c) => c.card.type === 'personnel');
  const groups = personnelCandidateGroups(table)
    .map((g) => ({ ...g, cards: g.cards.filter((c) => handPersonnel.some((h) => exchangeMatches(h, c.card))) }))
    .filter((g) => g.cards.length > 0);
  return {
    hand: handPersonnel.filter((h) => groups.some((g) => g.cards.some((c) => exchangeMatches(h, c.card)))),
    groups,
  };
}
