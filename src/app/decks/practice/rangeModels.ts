// The registry of range and span models (#1635): the cards whose game text changes the Range of a
// ship or the span total of a move, one entry per title less its version suffix (`cardTitleOf`), as
// the dilemma registry of the pile bot keys its models. `shipRange.ts` consults them at each move,
// from the table as it stands. A module with no import of `tableReducer.ts` but its types, so
// `MissionRow` reads it without loading the reducer and its `@dnd-kit/sortable` import.

import { cardTitleOf } from '../../../lib/cardTitle';
import type { CardInstance, MissionSlot } from './tableReducer';

export interface RangeSpanModel {
  // The title, less its version suffix, as the card data names it ("Mouth of the Wormhole Deep Space 9").
  title: string;
  // A span model: whether a move between the missions `from` and `to` adds no 2 for their different
  // quadrants. Consulted for the card of either mission and for the moving ship, as `self`.
  waivesQuadrant?: (self: CardInstance, from: CardInstance, to: CardInstance) => boolean;
  // A ship's range model: the Range the ship `self` gains, from the table as it stands.
  shipRange?: (self: CardInstance, missions: MissionSlot[]) => number;
  // An event's range model: the Range a ship gains while the event `self` is placed on the mission
  // card `mission`.
  eventRange?: (self: CardInstance, mission: CardInstance, ship: CardInstance, missions: MissionSlot[]) => number;
}

const words = (field: unknown): string[] => String(field ?? '').toLowerCase().split(/[^a-z]+/).filter(Boolean);
const hasWord = (field: unknown, word: string) => words(field).includes(word);
const isPersonnel = (card: CardInstance) => String(card.card?.type ?? '').toLowerCase() === 'personnel';

/** The title of a card instance, lowercased, less its version suffix. */
export const titleKeyOf = (card: CardInstance | null | undefined): string =>
  cardTitleOf(String(card?.card?.originalName ?? card?.card?.name ?? '')).toLowerCase();

// Whether a card is the mission of the lore name in braces, such as {Remus}: its title is the name,
// or the name followed by the mission's subtitle ("Remus Supervise Dilithium Mine").
const isNamed = (card: CardInstance, name: string): boolean => {
  const title = titleKeyOf(card);
  const lore = name.toLowerCase();
  return title === lore || title.startsWith(`${lore} `);
};

/** The personnel the player commands: every away team and every ship's crew, not the brig, the hand or a pile. */
export function commandedPersonnel(missions: MissionSlot[]): CardInstance[] {
  return missions.flatMap((slot) => [...slot.awayTeam, ...slot.ships.flatMap((ship) => ship.crew ?? [])]).filter(isPersonnel);
}

const MODELS: RangeSpanModel[] = [
  {
    // "When any player is about to move a ship between this mission and a [GQ] mission, do not add 2
    // to the span total of those missions."
    title: 'Mouth of the Wormhole Deep Space 9',
    waivesQuadrant: (self, from, to) => quadrantOf(from === self ? to : from) === 'g',
  },
  {
    // "Plays on {Remus}. Each of your [Rom] ships is Range +1 for each Reman you command (limit +3)."
    title: 'The Reman Mines',
    eventRange: (_self, mission, ship, missions) => {
      if (!isNamed(mission, 'Remus') || !hasWord(ship.card?.affiliation, 'romulan')) return 0;
      return Math.min(3, commandedPersonnel(missions).filter((p) => hasWord(p.card?.species, 'reman')).length);
    },
  },
  {
    // "While your [Fed] Medical personnel is aboard this ship, it is Range +5." A stopped personnel
    // is still aboard.
    title: 'U.S.S. Pasteur Medical Ship',
    shipRange: (self) =>
      (self.crew ?? []).some((p) => isPersonnel(p) && hasWord(p.card?.affiliation, 'federation') && hasWord(p.card?.skills, 'medical'))
        ? 5
        : 0,
  },
];

export const RANGE_SPAN_REGISTRY: ReadonlyMap<string, RangeSpanModel> = (() => {
  const map = new Map<string, RangeSpanModel>();
  for (const m of MODELS) {
    const key = m.title.toLowerCase();
    if (map.has(key)) throw new Error(`two models of "${m.title}" in the range and span registry`);
    map.set(key, m);
  }
  return map;
})();

/** The range or span model of a card, by its title less the version suffix, or undefined for a title the registry lacks. */
export const rangeSpanModelOf = (card: CardInstance | null | undefined): RangeSpanModel | undefined =>
  card ? RANGE_SPAN_REGISTRY.get(titleKeyOf(card)) : undefined;

/** A mission's quadrant, `'a'`, `'d'` or `'g'`, or `''` for a card with none. */
export const quadrantOf = (card: CardInstance | null | undefined): string => String(card?.card?.quadrant ?? '').trim().toLowerCase();
