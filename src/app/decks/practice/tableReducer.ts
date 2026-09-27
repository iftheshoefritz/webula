// Table state for the practice draw page. Kept in a `useReducer` (see the parent design in
// issue #130) rather than several `useState` calls so every zone move goes through one place
// and later slices can add zones/actions without touching how existing zones behave.

import { arrayMove } from '@dnd-kit/sortable';
import { shuffleArray } from '../deckBuilderUtils';

export type Face = 'up' | 'down';
// The core and the brig (#603) are two more flat, top-level zones: the core for any card not at
// a mission (usually events), the brig for captured personnel, though the zone rules are
// advisory, so both accept any card type, the same as the discard pile.
export type Zone =
  | 'drawDeck'
  | 'hand'
  | 'discard'
  | 'core'
  | 'brig'
  | 'dilemmaPile'
  | 'dilemmaHand'
  | 'dilemmaStack';

// The mission row always has exactly 5 positional slots (see the parent design in issue #130
// and the plan for #597), regardless of how many missions the deck has. A slot holds a
// CardInstance or, for a deck with fewer than 5 missions, null.
export const MISSION_SLOTS = 5;

export interface CardInstance {
  id: string;
  card: any;
  face: Face;
  // A ship's crew (#600): personnel/equipment aboard it. Hidden from the table; shown face up
  // in the ship's preview instead. Only meaningful on a ship instance, and only set once a ship
  // has at least one crew member (absent, not an empty array, otherwise).
  crew?: CardInstance[];
  // Whether a personnel card is stopped (#679): shown with a greyed-out image everywhere it
  // appears. Absent on a card that is not stopped, the same as `crew`. A move keeps this flag
  // (see `move` below, which only ever touches `face`), so stopping a card, then dragging it
  // elsewhere, leaves it stopped in its new home too.
  stopped?: boolean;
  // The cards placed on this card (#809): any card, face up. A card in the core or the brig, a
  // mission card, or a ship on a ship row can take a placed card. Absent when nothing is on it,
  // the same as `crew`. The stack is one level deep, so a placed card never carries `placedOn`
  // itself.
  placedOn?: CardInstance[];
}

// A mission slot holds the mission card dealt into that position (#597), the ships placed on
// that mission's ship row (#599), the away team (#602), and the permanent, face-up pile of
// dilemmas moved under the mission (#606). The events at a mission are placed on the mission card
// itself (#813), in its `on` array, so a slot has no event pile of its own. The mission
// row always has MISSION_SLOTS of these, regardless of how many missions the deck has; a slot
// with no dealt mission still has room for its own ship row and piles.
export interface MissionSlot {
  mission: CardInstance | null;
  ships: CardInstance[];
  awayTeam: CardInstance[];
  underMission: CardInstance[];
}

// A ship row is one of MISSION_SLOTS possible move destinations, not a single top-level zone
// the way drawDeck/hand/discard are, so a move into (or out of) one needs the mission index
// alongside the zone name.
export interface ShipRowLocation {
  zone: 'shipRow';
  missionIndex: number;
}

// A ship's crew (#600) is addressed by the ship's own instance id, not by mission index, so a
// crew stays reachable by the same key regardless of which mission's ship row currently holds
// the ship (a ship move between ship rows keeps its `crew` field attached; see `move` below).
export interface CrewLocation {
  zone: 'crew';
  shipId: string;
}

// A mission's away team and under-mission piles, addressed by mission index like a ship row, plus
// which pile. A card dropped on the away team badge files into the away team (#602, #813).
// The rulebook away team is the personnel at a planet mission, and its pair is the crew aboard a
// ship. This code uses the one name at every mission type; see docs/ubiquitous-language.md.
// A dilemma dropped on a mission, from anywhere, goes under it instead, face up, permanently
// (#606, #733). Any other card dropped on the mission card is placed on it (#813).
export type MissionPileName = 'awayTeam' | 'underMission';

export interface MissionPileLocation {
  zone: 'missionPile';
  missionIndex: number;
  pile: MissionPileName;
}

// The cards placed on a card (#809), addressed by that card's own instance id the same way a crew
// is addressed by its ship's, so the collection stays reachable wherever that card sits.
export interface PlacedOnLocation {
  zone: 'on';
  targetId: string;
}

export type MoveTarget = Zone | ShipRowLocation | CrewLocation | MissionPileLocation | PlacedOnLocation;

// A `shuffle` action (#680) only ever targets one of the zones a `PilePanel` shows: the core,
// the brig, the draw deck, the dilemma pile (#690), the dilemma stack (#733), a ship's crew, one
// of a mission's two piles, or a mission's own ship row (#713, once it holds enough ships to
// open its own list panel) — never one of the other flat zones (hand/discard/dilemmaHand) a
// `PilePanel` never opens for.
export type ShuffleLocation =
  | 'core'
  | 'brig'
  | 'drawDeck'
  | 'dilemmaPile'
  | 'dilemmaStack'
  | CrewLocation
  | MissionPileLocation
  | ShipRowLocation;

export interface TableState {
  drawDeck: CardInstance[];
  hand: CardInstance[];
  discard: CardInstance[];
  core: CardInstance[];
  brig: CardInstance[];
  // The dilemma pile and the dilemma hand (#604) are two more flat zones: the pile starts
  // shuffled and face down like the draw deck, and a tap moves one card to the hand, face up.
  dilemmaPile: CardInstance[];
  dilemmaHand: CardInstance[];
  // The dilemma stack (#733): a face-down stack of dilemmas, no longer tied to a mission slot.
  // This issue only adds the state; #630 gives it a place on the table.
  dilemmaStack: CardInstance[];
  missions: MissionSlot[];
  // The turn counter (#718): starts at 1 on a new game and on reset, and only ever changes via
  // `nextTurn` below.
  turn: number;
  // The score counter (#719): starts at 0 on a new game and on reset, and only ever changes via
  // `adjustScore` below, which clamps it to the 0-140 range.
  score: number;
}

// The score counter's range (#719) and the amount each button press changes it by.
export const SCORE_MIN = 0;
export const SCORE_MAX = 140;
export const SCORE_STEP = 5;

export type TableAction =
  // A tap on a face-down pile moves its top card to a hand. The draw deck and the hand are one
  // pair (#596); the dilemma pile and the dilemma hand are the other (#604).
  | { type: 'drawCard'; from: Zone; to: Zone }
  // `position` chooses which end of the destination array the moved card lands on: 'bottom'
  // (the default, when omitted) keeps every existing call site's behaviour — the moved card (and
  // any crew it releases) goes after the destination's existing cards, same as always. 'top'
  // puts it before them instead, so it becomes index 0 — the card a later `draw` takes first
  // (#607). Only the dilemma pile's two drop halves pass this; every other destination is
  // unordered from the player's point of view, so nothing else needs it.
  | { type: 'move'; id: string; to: MoveTarget; position?: 'top' | 'bottom' }
  | { type: 'flip'; id: string }
  // Puts the cards of one pile panel's zone in a random order (#680): the order in the table
  // state itself, not just the panel's display order, so the table and the next time the panel
  // opens both show the same shuffled order. Never changes a card's face, a ship's crew, or any
  // other field of a card instance — only the order of the array at that location.
  | { type: 'shuffle'; location: ShuffleLocation }
  // Moves one card of the dilemma stack to sit where another card of the same stack currently
  // sits (#632): a drag inside the stack's own popup, dropped on top of a neighbour, reorders the
  // stack in the table state itself — the popup's array order, closing and reopening the popup
  // keeps the new order, and the reveal order (#630/#733's index-0-is-first-revealed convention)
  // changes with it. `overId` names the card being dropped on, rather than a raw index, since
  // that is what a drop event on the popup naturally resolves to; a no-op (dropping a card on
  // itself, or on a card no longer in the stack) leaves the state unchanged. Only ever targets
  // `dilemmaStack`, so it needs no `location` the way `shuffle` does.
  | { type: 'reorderDilemmaStack'; id: string; overId: string }
  // Sets one or more personnel cards' `stopped` flag to a single value (#681), wherever each
  // currently sits — including aboard a ship as crew, the same reach `flip` lacks. `ids` lets
  // the pile panel's "Stop"/"Unstop" button (a selection of more than one card) and the card
  // preview's own single-card button (#679) share one action; a per-card toggle would go out of
  // step on a mixed selection (some stopped, some not), so this always sets the same explicit
  // value on every id, rather than flipping each one's current value. Reuses `cardsAt`/
  // `withCardsAt` (the same helpers `move` uses) instead of per-zone branches, since setting
  // `stopped` has no zone-dependent behaviour to encode.
  | { type: 'setStopped'; ids: string[]; stopped: boolean }
  // Raises the turn counter by one and unstops every stopped personnel card, in every zone
  // (#718): the flat zones, every mission's piles, every ship row, and every ship's crew.
  | { type: 'nextTurn' }
  // Changes the score counter by `delta` (#719), clamped to SCORE_MIN..SCORE_MAX: a delta that
  // would take the score past either limit stops there instead.
  | { type: 'adjustScore'; delta: number }
  | { type: 'reset'; cards: CardInstance[]; missions: CardInstance[]; dilemmas: CardInstance[] }
  // The seeded fixture of `/decks/practice?fixture=piles` (#802): deals like `reset`, then puts
  // `SEED_PILE_PERSONNEL` personnel into the first mission's away team, and a ship with
  // `SEED_CREW` personnel aboard into the second mission's ship row. The cards come from the deck
  // itself, taken in deck order, so a deck in a fixed order seeds the same cards every time.
  | { type: 'resetWithPiles'; cards: CardInstance[]; missions: CardInstance[]; dilemmas: CardInstance[] };

export const SEED_PILE_PERSONNEL = 20;
export const SEED_CREW = 12;

export const ZONE_FACE: Record<Zone, Face> = {
  drawDeck: 'down',
  hand: 'up',
  discard: 'up',
  core: 'up',
  brig: 'up',
  dilemmaPile: 'down',
  dilemmaHand: 'up',
  dilemmaStack: 'down',
};

// A ship row's face convention, kept apart from ZONE_FACE since a ship row is not a top-level
// Zone: a ship is always played face up (parent design, issue #130).
const SHIP_ROW_FACE: Face = 'up';

// A crew card's face convention: always face up, shown face up in the ship's preview (#600).
const CREW_FACE: Face = 'up';

// A placed card is always face up (#809).
const ON_FACE: Face = 'up';

// A mission pile's face convention: personnel/equipment go into the away team face down
// (matching the parent design's default for a personnel/equipment card in play). A dilemma moved
// under the mission is always face up, matching the parent design's zone for it (#606).
const MISSION_PILE_FACE: Record<MissionPileName, Face> = {
  awayTeam: 'down',
  underMission: 'up',
};

export const initialTableState: TableState = {
  drawDeck: [],
  hand: [],
  discard: [],
  core: [],
  brig: [],
  dilemmaPile: [],
  dilemmaHand: [],
  dilemmaStack: [],
  missions: Array.from({ length: MISSION_SLOTS }, () => ({
    mission: null,
    ships: [],
    awayTeam: [],
    underMission: [],
  })),
  turn: 1,
  score: 0,
};

let nextInstanceId = 0;

// A simple counter is enough here: ids only need to be unique within one dealt deck, and
// jsdom's crypto (used in tests) doesn't implement `randomUUID`.
const generateInstanceId = (): string => {
  nextInstanceId += 1;
  return `card-${nextInstanceId}`;
};

// Gives each expanded deck row a stable, unique id so a specific copy of a duplicated card
// can be moved on its own. Defaults to face down (the draw deck's convention); callers dealing
// straight to a face-up zone (the missions) pass 'up' explicitly.
export function createCardInstances(cards: any[], face: Face = ZONE_FACE.drawDeck): CardInstance[] {
  return cards.map((card) => ({ id: generateInstanceId(), card, face }));
}

const isShipRowLocation = (value: MoveTarget): value is ShipRowLocation =>
  typeof value === 'object' && value !== null && value.zone === 'shipRow';

const isCrewLocation = (value: MoveTarget): value is CrewLocation =>
  typeof value === 'object' && value !== null && value.zone === 'crew';

const isMissionPileLocation = (value: MoveTarget): value is MissionPileLocation =>
  typeof value === 'object' && value !== null && value.zone === 'missionPile';

const isPlacedOnLocation = (value: MoveTarget): value is PlacedOnLocation =>
  typeof value === 'object' && value !== null && value.zone === 'on';


const findZone = (state: TableState, id: string): Zone | null => {
  if (state.drawDeck.some((c) => c.id === id)) return 'drawDeck';
  if (state.hand.some((c) => c.id === id)) return 'hand';
  if (state.discard.some((c) => c.id === id)) return 'discard';
  if (state.core.some((c) => c.id === id)) return 'core';
  if (state.brig.some((c) => c.id === id)) return 'brig';
  if (state.dilemmaPile.some((c) => c.id === id)) return 'dilemmaPile';
  if (state.dilemmaHand.some((c) => c.id === id)) return 'dilemmaHand';
  if (state.dilemmaStack.some((c) => c.id === id)) return 'dilemmaStack';
  return null;
};

const findShipRow = (state: TableState, id: string): ShipRowLocation | null => {
  const missionIndex = state.missions.findIndex((slot) => slot.ships.some((s) => s.id === id));
  return missionIndex === -1 ? null : { zone: 'shipRow', missionIndex };
};

// Finds the ship instance with the given id in any mission's ship row, regardless of which
// mission currently holds it.
const findShipInstance = (state: TableState, shipId: string): CardInstance | null => {
  for (const slot of state.missions) {
    const ship = slot.ships.find((s) => s.id === shipId);
    if (ship) return ship;
  }
  return null;
};

// Finds the card with the given id that can take a placed card (#809): a card in the core or the
// brig, a mission card, or a ship on a ship row. A card anywhere else, including one already
// placed on another card, cannot take one, so this returns null for it.
const findPlacedOnTarget = (state: TableState, targetId: string): CardInstance | null => {
  const flat = state.core.find((c) => c.id === targetId) ?? state.brig.find((c) => c.id === targetId);
  if (flat) return flat;
  const slot = state.missions.find((s) => s.mission?.id === targetId);
  if (slot) return slot.mission;
  return findShipInstance(state, targetId);
};

// Every card on the table that can take a placed card, wherever it sits, for the searches that
// need to look inside each one's `placedOn` array.
const placedOnTargets = (state: TableState): CardInstance[] => [
  ...state.core,
  ...state.brig,
  ...state.missions.flatMap((slot) => [...(slot.mission ? [slot.mission] : []), ...slot.ships]),
];

const findOnLocation = (state: TableState, id: string): PlacedOnLocation | null => {
  const target = placedOnTargets(state).find((t) => t.placedOn?.some((c) => c.id === id));
  return target ? { zone: 'on', targetId: target.id } : null;
};

const findCrewLocation = (state: TableState, id: string): CrewLocation | null => {
  for (const slot of state.missions) {
    for (const ship of slot.ships) {
      if (ship.crew?.some((c) => c.id === id)) return { zone: 'crew', shipId: ship.id };
    }
  }
  return null;
};

// Finds a card in any of a mission's piles (the away team, #602; under the mission, #606),
// across all mission slots.
const findMissionPileLocation = (state: TableState, id: string): MissionPileLocation | null => {
  for (let i = 0; i < state.missions.length; i++) {
    const slot = state.missions[i];
    if (slot.awayTeam.some((c) => c.id === id)) return { zone: 'missionPile', missionIndex: i, pile: 'awayTeam' };
    if (slot.underMission.some((c) => c.id === id))
      return { zone: 'missionPile', missionIndex: i, pile: 'underMission' };
  }
  return null;
};

// A card's location on the table, for callers (the flip action, and the page's preview) that
// need to find a card regardless of whether it sits in one of `move`'s zones, in the `missions`
// array as a mission card, in a mission's ship row, or aboard a ship as crew. `missions` is a
// positional array rather than a zone a card moves in and out of, so the mission card itself
// stays outside the `MoveTarget` union that `move` targets; a ship in a ship row, and a crew
// card aboard a ship, both do move, so their locations are a `ShipRowLocation`/`CrewLocation`.
export type TableZone = Zone | 'missions' | ShipRowLocation | CrewLocation | MissionPileLocation | PlacedOnLocation;

export function findInstanceAnywhere(
  state: TableState,
  id: string
): { instance: CardInstance; zone: TableZone } | null {
  const zone = findZone(state, id);
  if (zone) {
    return { instance: state[zone].find((c) => c.id === id)!, zone };
  }
  const missionIdx = state.missions.findIndex((slot) => slot.mission?.id === id);
  if (missionIdx !== -1) {
    return { instance: state.missions[missionIdx].mission!, zone: 'missions' };
  }
  const shipRow = findShipRow(state, id);
  if (shipRow) {
    const ships = state.missions[shipRow.missionIndex].ships;
    return { instance: ships.find((s) => s.id === id)!, zone: shipRow };
  }
  const crewLocation = findCrewLocation(state, id);
  if (crewLocation) {
    const ship = findShipInstance(state, crewLocation.shipId)!;
    return { instance: ship.crew!.find((c) => c.id === id)!, zone: crewLocation };
  }
  const missionPile = findMissionPileLocation(state, id);
  if (missionPile) {
    const cards = state.missions[missionPile.missionIndex][missionPile.pile];
    return { instance: cards.find((c) => c.id === id)!, zone: missionPile };
  }
  const onLocation = findOnLocation(state, id);
  if (onLocation) {
    const target = findPlacedOnTarget(state, onLocation.targetId)!;
    return { instance: target.placedOn!.find((c) => c.id === id)!, zone: onLocation };
  }
  return null;
}

const flipFace = (face: Face): Face => (face === 'up' ? 'down' : 'up');

// Reads the cards at a move source or destination, regardless of whether it is a top-level
// zone (drawDeck/hand/discard), a mission's ship row, or a ship's crew.
const cardsAt = (state: TableState, location: MoveTarget): CardInstance[] => {
  if (isShipRowLocation(location)) return state.missions[location.missionIndex].ships;
  if (isCrewLocation(location)) return findShipInstance(state, location.shipId)?.crew ?? [];
  if (isMissionPileLocation(location)) return state.missions[location.missionIndex][location.pile];
  if (isPlacedOnLocation(location)) return findPlacedOnTarget(state, location.targetId)?.placedOn ?? [];
  return state[location];
};

// Writes the cards at a move source or destination, the counterpart to `cardsAt`.
const withCardsAt = (state: TableState, location: MoveTarget, cards: CardInstance[]): TableState => {
  if (isShipRowLocation(location)) {
    const missions = state.missions.map((slot, i) =>
      i === location.missionIndex ? { ...slot, ships: cards } : slot
    );
    return { ...state, missions };
  }
  if (isCrewLocation(location)) {
    const missions = state.missions.map((slot) => ({
      ...slot,
      ships: slot.ships.map((s) => (s.id === location.shipId ? { ...s, crew: cards } : s)),
    }));
    return { ...state, missions };
  }
  if (isMissionPileLocation(location)) {
    const missions = state.missions.map((slot, i) =>
      i === location.missionIndex ? { ...slot, [location.pile]: cards } : slot
    );
    return { ...state, missions };
  }
  if (isPlacedOnLocation(location)) {
    // The card that takes the placed cards can sit in the core, the brig, a mission slot, or a
    // ship row, so every one of them is checked; an empty `placedOn` goes back to absent.
    const placedOn = cards.length ? cards : undefined;
    const update = (c: CardInstance): CardInstance => (c.id === location.targetId ? { ...c, placedOn } : c);
    return {
      ...state,
      core: state.core.map(update),
      brig: state.brig.map(update),
      missions: state.missions.map((slot) => ({
        ...slot,
        mission: slot.mission && update(slot.mission),
        ships: slot.ships.map(update),
      })),
    };
  }
  return { ...state, [location]: cards };
};

const faceForLocation = (location: MoveTarget): Face => {
  if (isShipRowLocation(location)) return SHIP_ROW_FACE;
  if (isCrewLocation(location)) return CREW_FACE;
  if (isMissionPileLocation(location)) return MISSION_PILE_FACE[location.pile];
  if (isPlacedOnLocation(location)) return ON_FACE;
  return ZONE_FACE[location];
};

// A stable key per location, used to tell whether a move's source and destination are the same
// place (which keeps the card's current face instead of taking on the destination's).
const locationKey = (location: MoveTarget): string => {
  if (isShipRowLocation(location)) return `shipRow-${location.missionIndex}`;
  if (isCrewLocation(location)) return `crew-${location.shipId}`;
  if (isMissionPileLocation(location)) return `missionPile-${location.missionIndex}-${location.pile}`;
  if (isPlacedOnLocation(location)) return `on-${location.targetId}`;
  return location;
};

const sameLocation = (a: MoveTarget, b: MoveTarget): boolean => locationKey(a) === locationKey(b);

export function tableReducer(state: TableState, action: TableAction): TableState {
  switch (action.type) {
    case 'drawCard': {
      const source = state[action.from];
      if (source.length === 0) return state;
      const [top, ...rest] = source;
      return {
        ...state,
        [action.from]: rest,
        [action.to]: [...state[action.to], { ...top, face: ZONE_FACE[action.to] }],
      };
    }

    case 'move': {
      const from =
        findZone(state, action.id) ??
        findShipRow(state, action.id) ??
        findCrewLocation(state, action.id) ??
        findMissionPileLocation(state, action.id) ??
        findOnLocation(state, action.id);
      if (!from) return state;
      // A card goes only on a card that can take one (#809). A move onto a card that cannot, such
      // as a card already placed on another card, is refused rather than redirected, and so is a
      // move of a card onto itself.
      if (isPlacedOnLocation(action.to) && (action.to.targetId === action.id || !findPlacedOnTarget(state, action.to.targetId))) {
        return state;
      }
      // A ship dropped back on the ship row it already occupies (#601) is a genuine no-op: unlike
      // a same-zone move in the flat zones (hand/drawDeck/discard), which already reorders the moved
      // card to the end, a ship row has no concept of order the player can see, so nothing about
      // the ship row should change, not even its internal array order or the state reference.
      if (isShipRowLocation(from) && sameLocation(from, action.to)) return state;
      const card = cardsAt(state, from).find((c) => c.id === action.id)!;
      // A move within the same zone (or the same mission's ship row, or the same ship's crew)
      // keeps the card's current face; a move to a different location takes on that location's
      // face.
      const toSameLocation = sameLocation(from, action.to);
      const face = toSameLocation ? card.face : faceForLocation(action.to);
      const withoutCard = cardsAt(state, from).filter((c) => c.id !== action.id);
      const afterRemoval = withCardsAt(state, from, withoutCard);

      // A ship moving out of a ship row into anywhere but another ship row releases its crew
      // into that destination too: each crew member becomes its own independent card there,
      // taking the destination's face, and the ship's own `crew` field clears. A ship moving
      // between two ship rows (#601) keeps its crew attached unchanged instead.
      const releasesCrew = isShipRowLocation(from) && !isShipRowLocation(action.to) && !!card.crew?.length;
      // The `placedOn` cards (#809) do not travel with the card they sit on. Any move of that card
      // sends them to the discard pile, whatever the destination, and a move to the discard pile is
      // the plain case of the same rule. A drop back in the same location is not a move,
      // so it keeps its stack: the flat zones treat a same-zone drop as a reorder, and losing the
      // stack to a reorder would surprise the player.
      const discardsOn = !toSameLocation && !!card.placedOn?.length;
      const movedCard = {
        ...card,
        face,
        ...(releasesCrew ? { crew: undefined } : {}),
        ...(discardsOn ? { placedOn: undefined } : {}),
      };
      const releasedCrew = releasesCrew
        ? card.crew!.map((c) => ({ ...c, face: faceForLocation(action.to) }))
        : [];
      const discardedOn = discardsOn ? card.placedOn!.map((c) => ({ ...c, face: ZONE_FACE.discard })) : [];

      const destination = toSameLocation ? withoutCard : cardsAt(afterRemoval, action.to);
      const movedCards = [movedCard, ...releasedCrew];
      const orderedDestination =
        action.position === 'top' ? [...movedCards, ...destination] : [...destination, ...movedCards];
      const moved = withCardsAt(afterRemoval, action.to, orderedDestination);
      // The discarded stack is appended after the move, so a card that goes to the discard pile
      // itself lands there first and its cards follow it.
      return discardedOn.length ? { ...moved, discard: [...moved.discard, ...discardedOn] } : moved;
    }

    case 'flip': {
      const found = findInstanceAnywhere(state, action.id);
      if (!found) return state;
      const { zone, instance } = found;
      if (zone === 'missions') {
        const idx = state.missions.findIndex((slot) => slot.mission?.id === action.id);
        const missions = state.missions.map((slot, i) =>
          i === idx ? { ...slot, mission: { ...instance, face: flipFace(instance.face) } } : slot
        );
        return { ...state, missions };
      }
      if (typeof zone === 'object' && zone.zone === 'missionPile') {
        const { missionIndex, pile } = zone;
        const missions = state.missions.map((slot, i) =>
          i === missionIndex
            ? { ...slot, [pile]: slot[pile].map((c) => (c.id === action.id ? { ...c, face: flipFace(c.face) } : c)) }
            : slot
        );
        return { ...state, missions };
      }
      // A ship on a ship row, and a crew card aboard a ship, are always face up (parent design,
      // issue #130) and have no Flip control (#599, #600), so flip only applies to the string
      // zones (drawDeck/hand/discard) and a mission's piles, handled above.
      if (typeof zone !== 'string') return state;
      return {
        ...state,
        [zone]: state[zone].map((c) => (c.id === action.id ? { ...c, face: flipFace(c.face) } : c)),
      };
    }

    case 'shuffle': {
      // `ShuffleLocation` ('core' | 'brig' | CrewLocation | MissionPileLocation) is a subset of
      // `MoveTarget`, so `cardsAt`/`withCardsAt` already read and write the right array for it.
      const cards = cardsAt(state, action.location);
      return withCardsAt(state, action.location, shuffleArray(cards));
    }

    case 'reorderDilemmaStack': {
      const fromIndex = state.dilemmaStack.findIndex((c) => c.id === action.id);
      const toIndex = state.dilemmaStack.findIndex((c) => c.id === action.overId);
      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return state;
      return { ...state, dilemmaStack: arrayMove(state.dilemmaStack, fromIndex, toIndex) };
    }

    case 'setStopped': {
      // Each id applies to whatever state the previous id's update left behind, so multiple ids
      // in different zones (say, one card in the core and another in a mission's away team)
      // all update correctly off one action.
      return action.ids.reduce((currentState, id) => {
        const found = findInstanceAnywhere(currentState, id);
        if (!found) return currentState;
        const { zone, instance } = found;
        const updated = { ...instance, stopped: action.stopped };
        if (zone === 'missions') {
          const idx = currentState.missions.findIndex((slot) => slot.mission?.id === id);
          const missions = currentState.missions.map((slot, i) => (i === idx ? { ...slot, mission: updated } : slot));
          return { ...currentState, missions };
        }
        // Every other zone `findInstanceAnywhere` reports (the flat zones, a ship row, a ship's
        // crew, a mission pile) is a `MoveTarget`, so `cardsAt`/`withCardsAt` read and write it
        // the same way `move` does.
        const cards = cardsAt(currentState, zone);
        return withCardsAt(currentState, zone, cards.map((c) => (c.id === id ? updated : c)));
      }, state);
    }

    case 'nextTurn': {
      // Unstops every card in one of the flat zones/piles, leaving an already-unstopped card
      // untouched (and so `===` to the old one, same as every other zone-wide update here).
      const unstopCards = (cards: CardInstance[]): CardInstance[] =>
        cards.map((c) => (c.stopped ? { ...c, stopped: false } : c));
      // A ship's crew unstops alongside the ship itself; a ship on a ship row can carry the flag
      // too (`stopped` is generic on `CardInstance`, not personnel-only), so both are cleared.
      const unstopShips = (ships: CardInstance[]): CardInstance[] =>
        ships.map((ship) => {
          const unstoppedShip = ship.stopped ? { ...ship, stopped: false } : ship;
          return ship.crew ? { ...unstoppedShip, crew: unstopCards(ship.crew) } : unstoppedShip;
        });
      const missions = state.missions.map((slot) => ({
        ...slot,
        mission: slot.mission?.stopped ? { ...slot.mission, stopped: false } : slot.mission,
        ships: unstopShips(slot.ships),
        awayTeam: unstopCards(slot.awayTeam),
        underMission: unstopCards(slot.underMission),
      }));
      return {
        ...state,
        turn: state.turn + 1,
        drawDeck: unstopCards(state.drawDeck),
        hand: unstopCards(state.hand),
        discard: unstopCards(state.discard),
        core: unstopCards(state.core),
        brig: unstopCards(state.brig),
        dilemmaPile: unstopCards(state.dilemmaPile),
        dilemmaHand: unstopCards(state.dilemmaHand),
        dilemmaStack: unstopCards(state.dilemmaStack),
        missions,
      };
    }

    case 'adjustScore': {
      const score = Math.min(SCORE_MAX, Math.max(SCORE_MIN, state.score + action.delta));
      return { ...state, score };
    }

    case 'reset': {
      // A new game (and the reset button) deals an opening hand of 7 cards, face up, and
      // leaves the rest in the draw deck. A deck with fewer than 7 cards deals all of it.
      const handSize = Math.min(7, action.cards.length);
      const hand = action.cards.slice(0, handSize).map((c) => ({ ...c, face: ZONE_FACE.hand }));
      const drawDeck = action.cards.slice(handSize);
      // The missions are dealt face up into the mission row in deck order, as a fixed set: no
      // shuffling, and reset re-deals the identical set every time (unlike the draw deck). No
      // ships are dealt; a mission's ship row always starts empty.
      const missions: MissionSlot[] = Array.from({ length: MISSION_SLOTS }, (_, i) => ({
        mission: action.missions[i] ?? null,
        ships: [],
        awayTeam: [],
        underMission: [],
      }));
      // The dilemmas arrive already shuffled, and all of them start in the dilemma pile: a new
      // game and the reset button deal no dilemmas into the dilemma hand or the dilemma stack.
      return {
        drawDeck,
        hand,
        discard: [],
        core: [],
        brig: [],
        dilemmaPile: action.dilemmas,
        dilemmaHand: [],
        dilemmaStack: [],
        missions,
        turn: 1,
        score: 0,
      };
    }

    case 'resetWithPiles': {
      const personnel = action.cards.filter((c) => c.card.type === 'personnel');
      const pileCards = personnel.slice(0, SEED_PILE_PERSONNEL);
      const crew = personnel.slice(SEED_PILE_PERSONNEL, SEED_PILE_PERSONNEL + SEED_CREW);
      const ship = action.cards.find((c) => c.card.type === 'ship');
      const seeded = new Set([...pileCards, ...crew, ...(ship ? [ship] : [])].map((c) => c.id));
      const dealt = tableReducer(state, { ...action, type: 'reset', cards: action.cards.filter((c) => !seeded.has(c.id)) });
      const missions = dealt.missions.map((slot, i) => {
        if (i === 0) {
          return { ...slot, awayTeam: pileCards.map((c) => ({ ...c, face: MISSION_PILE_FACE.awayTeam })) };
        }
        if (i === 1 && ship) {
          const crewed = { ...ship, face: SHIP_ROW_FACE, crew: crew.map((c) => ({ ...c, face: CREW_FACE })) };
          return { ...slot, ships: [crewed] };
        }
        return slot;
      });
      return { ...dealt, missions };
    }

    default:
      return state;
  }
}
