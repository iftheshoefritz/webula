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
  // An event's span model in the core (#1648): whether a move of `ship` between `from` and `to` adds
  // no 2 for their different quadrants while the event `self` is in the core.
  coreWaivesQuadrant?: (self: CardInstance, from: CardInstance, to: CardInstance, ship: CardInstance) => boolean;
  // An event's span model in the core (#1648): what a move of `ship` from `from` to `to` takes off
  // the span total while the event `self` is in the core.
  coreSpanReduction?: (self: CardInstance, from: CardInstance, to: CardInstance, ship: CardInstance) => number;
  // A personnel's range model (#1648): the Range the ship `ship` gains while `self` is in its crew.
  aboardRange?: (self: CardInstance, ship: CardInstance, missions: MissionSlot[]) => number;
  // An event's range model (#1648): the Range the ship `ship` gains while the event `self` is placed on it.
  placedOnShipRange?: (self: CardInstance, ship: CardInstance, missions: MissionSlot[]) => number;
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

// The personnel of a ship's crew. A stopped personnel is still aboard.
const crewPersonnel = (ship: CardInstance): CardInstance[] => (ship.crew ?? []).filter(isPersonnel);

// The mission cards of the player's slots: in a solo game the player commands every one.
const commandedMissions = (missions: MissionSlot[]): CardInstance[] =>
  missions.flatMap((slot) => (slot.mission ? [slot.mission] : []));

// A ship's or a lore name with no dots, as `useDataFetching` writes "U.S.S." in the keywords ("uss").
const dotless = (name: string) => name.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();

// Whether the personnel `p` is the Commander of `ship`: a "Commander: <name>." keyword whose name is
// the ship's title, or its title less the subtitle ("Commander: uss defiant." of "U.S.S. Defiant
// Prototype Warship").
const commands = (p: CardInstance, ship: CardInstance): boolean => {
  const title = dotless(titleKeyOf(ship));
  const keywords = String(p.card?.keywords ?? '').toLowerCase().replace(/u\.s\.s\./g, 'uss').replace(/i\.k\.s\./g, 'iks');
  return Array.from(keywords.matchAll(/commander:\s*([^.;]+)/g)).some(([, name]) => {
    const lore = dotless(name);
    return lore !== '' && (title === lore || title.startsWith(`${lore} `));
  });
};

// A ship's Range less `n` while more than `limit` personnel are aboard: the Shuttlepods, Ganges, Rio Grande.
const crowdedRange = (self: CardInstance, limit: number, n: number) => (crewPersonnel(self).length > limit ? -n : 0);

// "This ship is Range -1 … for each completed mission you command." (Vidiian Cruiser, Vidiian Interceptor)
const vidiianRange = (_self: CardInstance, missions: MissionSlot[]) =>
  -missions.filter((slot) => slot.mission && slot.completed).length;

// "While you command two missions that are worth 40 points or more, this ship is Range +2." Read as
// two missions each worth 40 or more. (both I.K.S. Qel'Poh)
const qelPohRange = (_self: CardInstance, missions: MissionSlot[]) =>
  commandedMissions(missions).filter((m) => (Number(m.card?.points) || 0) >= 40).length >= 2 ? 2 : 0;

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
  {
    // "When this ship is about to move between two missions, those missions are considered to be in
    // the same quadrant …"
    title: 'Redemption Medical Vessel',
    waivesQuadrant: (self, from, to) => from !== self && to !== self,
  },
  {
    // "When this ship is about to move between an [AQ] mission and a [DQ] mission, do not add 2 to
    // the span total of those missions."
    title: 'Sphere 634',
    waivesQuadrant: (self, from, to) =>
      from !== self && to !== self && [quadrantOf(from), quadrantOf(to)].sort().join('') === 'ad',
  },
  {
    // "When this ship is about to move between a non-[GQ] mission and a [GQ] mission, do not add 2 to
    // the span total of those missions."
    title: 'Aurulent',
    waivesQuadrant: (self, from, to) => from !== self && to !== self && (quadrantOf(from) === 'g') !== (quadrantOf(to) === 'g'),
  },
  {
    // "Plays in your core. When a ship is about to move between missions in different quadrants, do
    // not add 2 to the span total of those missions."
    title: 'Expedient Opportunity',
    coreWaivesQuadrant: () => true,
  },
  {
    // "Plays in your core. When your ship is about to move from a mission that has a span of 4 or
    // more, subtract 3 from the span total required."
    title: 'Hurried Departure',
    coreSpanReduction: (_self, from) => ((Number(from.card?.span) || 0) >= 4 ? 3 : 0),
  },
  {
    // "While you command more than five personnel aboard this ship, it is Range -2."
    title: 'Shuttlepod One Reliable Transport',
    shipRange: (self) => crowdedRange(self, 5, 2),
  },
  {
    // "While you command more than five personnel aboard this ship, it is Range -2."
    title: 'Shuttlepod Two Landing Craft',
    shipRange: (self) => crowdedRange(self, 5, 2),
  },
  {
    // "While you command more than seven personnel aboard this ship, it is Range -3."
    title: 'U.S.S. Ganges One of the First',
    shipRange: (self) => crowdedRange(self, 7, 3),
  },
  {
    // "While you command more than seven personnel aboard this ship, it is range -3. … While your
    // Engineer is aboard, this ship is Range +1."
    title: 'U.S.S. Rio Grande Built to Last',
    shipRange: (self) =>
      crowdedRange(self, 7, 3) + (crewPersonnel(self).some((p) => hasWord(p.card?.skills, 'engineer')) ? 1 : 0),
  },
  { title: 'Vidiian Cruiser', shipRange: vidiianRange },
  { title: 'Vidiian Interceptor', shipRange: vidiianRange },
  { title: "I.K.S. Qel'Poh H.M.S. Bounty", shipRange: qelPohRange },
  { title: "I.K.S. Qel'Poh Clandestine Vessel", shipRange: qelPohRange },
  {
    // "This ship is Range +1 for each [Rom] personnel aboard who has a cost of 4 or more (Limit +3)."
    title: 'Bird-of-Prey',
    shipRange: (self) =>
      Math.min(3, crewPersonnel(self).filter((p) => hasWord(p.card?.affiliation, 'romulan') && (Number(p.card?.cost) || 0) >= 4).length),
  },
  {
    // "While an opponent does not command a ship at a Region: Neutral Zone mission, for each Region:
    // Neutral Zone mission you command, this ship is Range +1 (limit +3)." A solo table has no
    // opponent ship.
    title: 'Pi Off Course',
    shipRange: (_self, missions) =>
      Math.min(3, commandedMissions(missions).filter((m) => String(m.card?.keywords ?? '').toLowerCase().includes('region: neutral zone')).length),
  },
  {
    // "While this personnel is aboard your [Pa][TNG] ship, that ship is Range +1."
    title: 'Fredericks',
    aboardRange: (_self, ship) => (hasWord(ship.card?.icons, 'pa') && hasWord(ship.card?.icons, 'tng') ? 1 : 0),
  },
  {
    // "While this personnel is aboard your [Fed] ship, it is Range +2."
    title: 'Thomas Riker Defiant Leader',
    aboardRange: (_self, ship) => (hasWord(ship.card?.affiliation, 'federation') ? 2 : 0),
  },
  {
    // "While this personnel is aboard a [Baj] ship, it is Range +1."
    title: 'Benjamin Sisko Shipwright',
    aboardRange: (_self, ship) => (hasWord(ship.card?.affiliation, 'bajoran') ? 1 : 0),
  },
  {
    // "Plays on your ship (limit one per ship). While you have this ship's Commander aboard, it is Range +2."
    title: 'Inspiring Leader',
    placedOnShipRange: (_self, ship) => (crewPersonnel(ship).some((p) => commands(p, ship)) ? 2 : 0),
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
