// Table state for the practice draw page. Kept in a `useReducer` (see the parent design in
// issue #130) rather than several `useState` calls so every zone move goes through one place
// and later slices can add zones/actions without touching how existing zones behave.

export type Face = 'up' | 'down';
export type Zone = 'pile' | 'hand' | 'discard';

// The mission row always has exactly 5 positional slots (see the parent design in issue #130
// and the plan for #597), regardless of how many missions the deck has. A slot holds a
// CardInstance or, for a deck with fewer than 5 missions, null.
export const MISSION_SLOTS = 5;

export interface CardInstance {
  id: string;
  card: any;
  face: Face;
}

// A mission slot holds both the mission card dealt into that position (#597) and the ships
// placed on that mission's ship row (#599). The mission row always has MISSION_SLOTS of these,
// regardless of how many missions the deck has; a slot with no dealt mission still has room for
// its own ship row.
export interface MissionSlot {
  mission: CardInstance | null;
  ships: CardInstance[];
}

// A ship row is one of MISSION_SLOTS possible move destinations, not a single top-level zone
// the way pile/hand/discard are, so a move into (or out of) one needs the mission index
// alongside the zone name.
export interface ShipRowLocation {
  zone: 'shipRow';
  missionIndex: number;
}

export type MoveTarget = Zone | ShipRowLocation;

export interface TableState {
  pile: CardInstance[];
  hand: CardInstance[];
  discard: CardInstance[];
  missions: MissionSlot[];
}

export type TableAction =
  | { type: 'draw' }
  | { type: 'move'; id: string; to: MoveTarget }
  | { type: 'flip'; id: string }
  | { type: 'reset'; cards: CardInstance[]; missions: CardInstance[] };

export const ZONE_FACE: Record<Zone, Face> = {
  pile: 'down',
  hand: 'up',
  discard: 'up',
};

// A ship row's face convention, kept apart from ZONE_FACE since a ship row is not a top-level
// Zone: a ship is always played face up (parent design, issue #130).
const SHIP_ROW_FACE: Face = 'up';

export const initialTableState: TableState = {
  pile: [],
  hand: [],
  discard: [],
  missions: Array.from({ length: MISSION_SLOTS }, () => ({ mission: null, ships: [] })),
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

const findZone = (state: TableState, id: string): Zone | null => {
  if (state.pile.some((c) => c.id === id)) return 'pile';
  if (state.hand.some((c) => c.id === id)) return 'hand';
  if (state.discard.some((c) => c.id === id)) return 'discard';
  return null;
};

const findShipRow = (state: TableState, id: string): ShipRowLocation | null => {
  const missionIndex = state.missions.findIndex((slot) => slot.ships.some((s) => s.id === id));
  return missionIndex === -1 ? null : { zone: 'shipRow', missionIndex };
};

// A card's location on the table, for callers (the flip action, and the page's preview) that
// need to find a card regardless of whether it sits in one of `move`'s zones, in the `missions`
// array as a mission card, or in a mission's ship row. `missions` is a positional array rather
// than a zone a card moves in and out of, so the mission card itself stays outside the
// `MoveTarget` union that `move` targets; a ship in a ship row does move, so its location is a
// `ShipRowLocation`.
export type TableZone = Zone | 'missions' | ShipRowLocation;

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
  return null;
}

const flipFace = (face: Face): Face => (face === 'up' ? 'down' : 'up');

// Reads the cards at a move source or destination, regardless of whether it is a top-level
// zone (pile/hand/discard) or a mission's ship row.
const cardsAt = (state: TableState, location: MoveTarget): CardInstance[] =>
  isShipRowLocation(location) ? state.missions[location.missionIndex].ships : state[location];

// Writes the cards at a move source or destination, the counterpart to `cardsAt`.
const withCardsAt = (state: TableState, location: MoveTarget, cards: CardInstance[]): TableState => {
  if (isShipRowLocation(location)) {
    const missions = state.missions.map((slot, i) =>
      i === location.missionIndex ? { ...slot, ships: cards } : slot
    );
    return { ...state, missions };
  }
  return { ...state, [location]: cards };
};

const faceForLocation = (location: MoveTarget): Face =>
  isShipRowLocation(location) ? SHIP_ROW_FACE : ZONE_FACE[location];

const sameLocation = (a: MoveTarget, b: MoveTarget): boolean =>
  isShipRowLocation(a) || isShipRowLocation(b)
    ? isShipRowLocation(a) && isShipRowLocation(b) && a.missionIndex === b.missionIndex
    : a === b;

export function tableReducer(state: TableState, action: TableAction): TableState {
  switch (action.type) {
    case 'draw': {
      if (state.pile.length === 0) return state;
      const [top, ...rest] = state.pile;
      return {
        ...state,
        pile: rest,
        hand: [...state.hand, { ...top, face: ZONE_FACE.hand }],
      };
    }

    case 'move': {
      const from = findZone(state, action.id) ?? findShipRow(state, action.id);
      if (!from) return state;
      const card = cardsAt(state, from).find((c) => c.id === action.id)!;
      // A move within the same zone (or the same mission's ship row) keeps the card's current
      // face; a move to a different location takes on that location's face.
      const toSameLocation = sameLocation(from, action.to);
      const face = toSameLocation ? card.face : faceForLocation(action.to);
      const withoutCard = cardsAt(state, from).filter((c) => c.id !== action.id);
      const afterRemoval = withCardsAt(state, from, withoutCard);
      const destination = toSameLocation ? withoutCard : cardsAt(afterRemoval, action.to);
      return withCardsAt(afterRemoval, action.to, [...destination, { ...card, face }]);
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
      // A ship on a ship row is always face up (parent design, issue #130) and has no Flip
      // control (#599), so flip only applies to the string zones (pile/hand/discard).
      if (typeof zone !== 'string') return state;
      return {
        ...state,
        [zone]: state[zone].map((c) => (c.id === action.id ? { ...c, face: flipFace(c.face) } : c)),
      };
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
      }));
      return { pile, hand, discard: [], missions };
    }

    default:
      return state;
  }
}
