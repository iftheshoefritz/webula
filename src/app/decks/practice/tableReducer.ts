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
  | 'pile'
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
}

// A mission slot holds the mission card dealt into that position (#597), the ships placed on
// that mission's ship row (#599), the personnel/event piles dropped onto the mission card itself
// (#602), and the permanent, face-up pile of dilemmas moved under the mission (#606). The mission
// row always has MISSION_SLOTS of these, regardless of how many missions the deck has; a slot
// with no dealt mission still has room for its own ship row and piles.
export interface MissionSlot {
  mission: CardInstance | null;
  ships: CardInstance[];
  personnel: CardInstance[];
  event: CardInstance[];
  underMission: CardInstance[];
}

// A ship row is one of MISSION_SLOTS possible move destinations, not a single top-level zone
// the way pile/hand/discard are, so a move into (or out of) one needs the mission index
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

// A mission's personnel, event, and under-mission piles: personnel, equipment, mission,
// interrupt, and event cards dropped on a mission card (or dropped directly on one of its
// badges, overriding the type-based routing) file into one of the first two piles (#602),
// addressed by mission index like a ship row, plus which pile. A dilemma dropped on a mission,
// from anywhere, goes into the third pile instead, face up, permanently (#606, #733).
export type MissionPileName = 'personnel' | 'event' | 'underMission';

export interface MissionPileLocation {
  zone: 'missionPile';
  missionIndex: number;
  pile: MissionPileName;
}

export type MoveTarget = Zone | ShipRowLocation | CrewLocation | MissionPileLocation;

// A `shuffle` action (#680) only ever targets one of the zones a `PilePanel` shows: the core,
// the brig, the draw pile, the dilemma pile (#690), the dilemma stack (#733), a ship's crew, one
// of a mission's three piles, or a mission's own ship row (#713, once it holds enough ships to
// open its own list panel) — never one of the other flat zones (hand/discard/dilemmaHand) a
// `PilePanel` never opens for.
export type ShuffleLocation =
  | 'core'
  | 'brig'
  | 'pile'
  | 'dilemmaPile'
  | 'dilemmaStack'
  | CrewLocation
  | MissionPileLocation
  | ShipRowLocation;

export interface TableState {
  pile: CardInstance[];
  hand: CardInstance[];
  discard: CardInstance[];
  core: CardInstance[];
  brig: CardInstance[];
  // The dilemma pile and the dilemma hand (#604) are two more flat zones: the pile starts
  // shuffled and face down like the draw pile, and a tap moves one card to the hand, face up.
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
  // A tap on a face-down pile moves its top card to a hand. The draw pile and the hand are one
  // pair (#596); the dilemma pile and the dilemma hand are the other (#604).
  | { type: 'draw'; from: Zone; to: Zone }
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
  | { type: 'reset'; cards: CardInstance[]; missions: CardInstance[]; dilemmas: CardInstance[] };

export const ZONE_FACE: Record<Zone, Face> = {
  pile: 'down',
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

// A mission pile's face convention: personnel/equipment go into the personnel pile face down
// (matching the parent design's default for a personnel/equipment card in play); event, mission,
// and interrupt cards go into the event pile face up (#602). A dilemma moved under the mission is
// always face up, matching the parent design's zone for it (#606).
const MISSION_PILE_FACE: Record<MissionPileName, Face> = {
  personnel: 'down',
  event: 'up',
  underMission: 'up',
};

export const initialTableState: TableState = {
  pile: [],
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
    personnel: [],
    event: [],
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
// can be moved on its own. Defaults to face down (the draw pile's convention); callers dealing
// straight to a face-up zone (the missions) pass 'up' explicitly.
export function createCardInstances(cards: any[], face: Face = ZONE_FACE.pile): CardInstance[] {
  return cards.map((card) => ({ id: generateInstanceId(), card, face }));
}

const isShipRowLocation = (value: MoveTarget): value is ShipRowLocation =>
  typeof value === 'object' && value !== null && value.zone === 'shipRow';

const isCrewLocation = (value: MoveTarget): value is CrewLocation =>
  typeof value === 'object' && value !== null && value.zone === 'crew';

const isMissionPileLocation = (value: MoveTarget): value is MissionPileLocation =>
  typeof value === 'object' && value !== null && value.zone === 'missionPile';

const findZone = (state: TableState, id: string): Zone | null => {
  if (state.pile.some((c) => c.id === id)) return 'pile';
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

const findCrewLocation = (state: TableState, id: string): CrewLocation | null => {
  for (const slot of state.missions) {
    for (const ship of slot.ships) {
      if (ship.crew?.some((c) => c.id === id)) return { zone: 'crew', shipId: ship.id };
    }
  }
  return null;
};

// Finds a card in any of a mission's piles (personnel/event, #602; under the mission, #606),
// across all mission slots.
const findMissionPileLocation = (state: TableState, id: string): MissionPileLocation | null => {
  for (let i = 0; i < state.missions.length; i++) {
    const slot = state.missions[i];
    if (slot.personnel.some((c) => c.id === id)) return { zone: 'missionPile', missionIndex: i, pile: 'personnel' };
    if (slot.event.some((c) => c.id === id)) return { zone: 'missionPile', missionIndex: i, pile: 'event' };
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
export type TableZone = Zone | 'missions' | ShipRowLocation | CrewLocation | MissionPileLocation;

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
  return null;
}

const flipFace = (face: Face): Face => (face === 'up' ? 'down' : 'up');

// Reads the cards at a move source or destination, regardless of whether it is a top-level
// zone (pile/hand/discard), a mission's ship row, or a ship's crew.
const cardsAt = (state: TableState, location: MoveTarget): CardInstance[] => {
  if (isShipRowLocation(location)) return state.missions[location.missionIndex].ships;
  if (isCrewLocation(location)) return findShipInstance(state, location.shipId)?.crew ?? [];
  if (isMissionPileLocation(location)) return state.missions[location.missionIndex][location.pile];
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
  return { ...state, [location]: cards };
};

const faceForLocation = (location: MoveTarget): Face => {
  if (isShipRowLocation(location)) return SHIP_ROW_FACE;
  if (isCrewLocation(location)) return CREW_FACE;
  if (isMissionPileLocation(location)) return MISSION_PILE_FACE[location.pile];
  return ZONE_FACE[location];
};

// A stable key per location, used to tell whether a move's source and destination are the same
// place (which keeps the card's current face instead of taking on the destination's).
const locationKey = (location: MoveTarget): string => {
  if (isShipRowLocation(location)) return `shipRow-${location.missionIndex}`;
  if (isCrewLocation(location)) return `crew-${location.shipId}`;
  if (isMissionPileLocation(location)) return `missionPile-${location.missionIndex}-${location.pile}`;
  return location;
};

const sameLocation = (a: MoveTarget, b: MoveTarget): boolean => locationKey(a) === locationKey(b);

export function tableReducer(state: TableState, action: TableAction): TableState {
  switch (action.type) {
    case 'draw': {
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
        findMissionPileLocation(state, action.id);
      if (!from) return state;
      // A ship dropped back on the ship row it already occupies (#601) is a genuine no-op: unlike
      // a same-zone move in the flat zones (hand/pile/discard), which already reorders the moved
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
      const movedCard = releasesCrew ? { ...card, face, crew: undefined } : { ...card, face };
      const releasedCrew = releasesCrew
        ? card.crew!.map((c) => ({ ...c, face: faceForLocation(action.to) }))
        : [];

      const destination = toSameLocation ? withoutCard : cardsAt(afterRemoval, action.to);
      const movedCards = [movedCard, ...releasedCrew];
      const orderedDestination =
        action.position === 'top' ? [...movedCards, ...destination] : [...destination, ...movedCards];
      return withCardsAt(afterRemoval, action.to, orderedDestination);
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
      // zones (pile/hand/discard) and a mission's piles, handled above.
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
      // in different zones (say, one card in the core and another in a mission's personnel pile)
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
        personnel: unstopCards(slot.personnel),
        event: unstopCards(slot.event),
        underMission: unstopCards(slot.underMission),
      }));
      return {
        ...state,
        turn: state.turn + 1,
        pile: unstopCards(state.pile),
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
      // leaves the rest in the draw pile. A deck with fewer than 7 cards deals all of it.
      const handSize = Math.min(7, action.cards.length);
      const hand = action.cards.slice(0, handSize).map((c) => ({ ...c, face: ZONE_FACE.hand }));
      const pile = action.cards.slice(handSize);
      // The missions are dealt face up into the mission row in deck order, as a fixed set: no
      // shuffling, and reset re-deals the identical set every time (unlike the draw pile). No
      // ships are dealt; a mission's ship row always starts empty.
      const missions: MissionSlot[] = Array.from({ length: MISSION_SLOTS }, (_, i) => ({
        mission: action.missions[i] ?? null,
        ships: [],
        personnel: [],
        event: [],
        underMission: [],
      }));
      // The dilemmas arrive already shuffled, and all of them start in the dilemma pile: a new
      // game and the reset button deal no dilemmas into the dilemma hand or the dilemma stack.
      return {
        pile,
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

    default:
      return state;
  }
}
