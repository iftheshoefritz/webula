// Table state for the practice draw page. Kept in a `useReducer` (see the parent design in
// issue #130) rather than several `useState` calls so every zone move goes through one place
// and later slices can add zones/actions without touching how existing zones behave.

export type Face = 'up' | 'down';
// The core and the brig (#603) are two more flat, top-level zones: the core for any card not at
// a mission (usually events), the brig for captured personnel, though the zone rules are
// advisory, so both accept any card type, the same as the discard pile.
export type Zone = 'pile' | 'hand' | 'discard' | 'core' | 'brig' | 'dilemmaPile' | 'dilemmaHand';

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
// (#602), the face-down dilemma stack built there from the dilemma hand (#605), and the
// permanent, face-up pile of dilemmas moved under the mission (#606). The mission row always has
// MISSION_SLOTS of these, regardless of how many missions the deck has; a slot with no dealt
// mission still has room for its own ship row and piles.
export interface MissionSlot {
  mission: CardInstance | null;
  ships: CardInstance[];
  personnel: CardInstance[];
  event: CardInstance[];
  dilemma: CardInstance[];
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

// A mission's personnel, event, dilemma, and under-mission piles: personnel, equipment, mission,
// interrupt, and event cards dropped on a mission card (or dropped directly on one of its
// badges, overriding the type-based routing) file into one of the first two piles (#602),
// addressed by mission index like a ship row, plus which pile. A dilemma dropped on a mission
// from the dilemma hand builds a face-down stack in the third pile instead (#605); a dilemma
// dropped on a mission from anywhere else — including that mission's own dilemma stack — goes
// into the fourth pile instead, face up, permanently out of the stack (#606).
export type MissionPileName = 'personnel' | 'event' | 'dilemma' | 'underMission';

export interface MissionPileLocation {
  zone: 'missionPile';
  missionIndex: number;
  pile: MissionPileName;
}

export type MoveTarget = Zone | ShipRowLocation | CrewLocation | MissionPileLocation;

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
  missions: MissionSlot[];
}

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
  // Toggles a personnel card's `stopped` flag (#679), wherever it currently sits — including
  // aboard a ship as crew, unlike `flip`, which has no meaning there. Modeled on `flip`, but
  // reuses `cardsAt`/`withCardsAt` (the same helpers `move` uses) instead of `flip`'s own
  // per-zone branches, since toggling `stopped` has no zone-dependent behaviour to encode.
  | { type: 'stop'; id: string }
  | { type: 'reset'; cards: CardInstance[]; missions: CardInstance[]; dilemmas: CardInstance[] };

export const ZONE_FACE: Record<Zone, Face> = {
  pile: 'down',
  hand: 'up',
  discard: 'up',
  core: 'up',
  brig: 'up',
  dilemmaPile: 'down',
  dilemmaHand: 'up',
};

// A ship row's face convention, kept apart from ZONE_FACE since a ship row is not a top-level
// Zone: a ship is always played face up (parent design, issue #130).
const SHIP_ROW_FACE: Face = 'up';

// A crew card's face convention: always face up, shown face up in the ship's preview (#600).
const CREW_FACE: Face = 'up';

// A mission pile's face convention: personnel/equipment go into the personnel pile face down
// (matching the parent design's default for a personnel/equipment card in play); event, mission,
// and interrupt cards go into the event pile face up (#602). A dilemma stacked on a mission stays
// face down until the player reveals it with Flip (#605); a dilemma moved under the mission is
// always face up, matching the parent design's zone for it (#606).
const MISSION_PILE_FACE: Record<MissionPileName, Face> = {
  personnel: 'down',
  event: 'up',
  dilemma: 'down',
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
  missions: Array.from({ length: MISSION_SLOTS }, () => ({
    mission: null,
    ships: [],
    personnel: [],
    event: [],
    dilemma: [],
    underMission: [],
  })),
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

// Finds a card in any of a mission's piles (personnel/event, #602; dilemma stack, #605; under
// the mission, #606), across all mission slots.
const findMissionPileLocation = (state: TableState, id: string): MissionPileLocation | null => {
  for (let i = 0; i < state.missions.length; i++) {
    const slot = state.missions[i];
    if (slot.personnel.some((c) => c.id === id)) return { zone: 'missionPile', missionIndex: i, pile: 'personnel' };
    if (slot.event.some((c) => c.id === id)) return { zone: 'missionPile', missionIndex: i, pile: 'event' };
    if (slot.dilemma.some((c) => c.id === id)) return { zone: 'missionPile', missionIndex: i, pile: 'dilemma' };
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

    case 'stop': {
      const found = findInstanceAnywhere(state, action.id);
      if (!found) return state;
      const { zone, instance } = found;
      const toggled = { ...instance, stopped: !instance.stopped };
      if (zone === 'missions') {
        const idx = state.missions.findIndex((slot) => slot.mission?.id === action.id);
        const missions = state.missions.map((slot, i) => (i === idx ? { ...slot, mission: toggled } : slot));
        return { ...state, missions };
      }
      // Every other zone `findInstanceAnywhere` reports (the flat zones, a ship row, a ship's
      // crew, a mission pile) is a `MoveTarget`, so `cardsAt`/`withCardsAt` read and write it the
      // same way `move` does.
      const cards = cardsAt(state, zone);
      return withCardsAt(state, zone, cards.map((c) => (c.id === action.id ? toggled : c)));
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
        dilemma: [],
        underMission: [],
      }));
      // The dilemmas arrive already shuffled, and all of them start in the dilemma pile: a new
      // game and the reset button deal no dilemmas into the dilemma hand.
      return {
        pile,
        hand,
        discard: [],
        core: [],
        brig: [],
        dilemmaPile: action.dilemmas,
        dilemmaHand: [],
        missions,
      };
    }

    default:
      return state;
  }
}
