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

export interface TableState {
  pile: CardInstance[];
  hand: CardInstance[];
  discard: CardInstance[];
  missions: (CardInstance | null)[];
}

export type TableAction =
  | { type: 'draw' }
  | { type: 'move'; id: string; to: Zone }
  | { type: 'flip'; id: string }
  | { type: 'reset'; cards: CardInstance[]; missions: CardInstance[] };

export const ZONE_FACE: Record<Zone, Face> = {
  pile: 'down',
  hand: 'up',
  discard: 'up',
};

export const initialTableState: TableState = {
  pile: [],
  hand: [],
  discard: [],
  missions: Array(MISSION_SLOTS).fill(null),
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

const findZone = (state: TableState, id: string): Zone | null => {
  if (state.pile.some((c) => c.id === id)) return 'pile';
  if (state.hand.some((c) => c.id === id)) return 'hand';
  if (state.discard.some((c) => c.id === id)) return 'discard';
  return null;
};

// A card's location on the table, for callers (the flip action, and the page's preview) that
// need to find a card regardless of whether it sits in one of `move`'s zones or in a
// `missions` slot. `missions` is a positional array rather than a zone a card moves in and out
// of, so it stays outside the `Zone` union that `move` targets.
export type TableZone = Zone | 'missions';

export function findInstanceAnywhere(
  state: TableState,
  id: string
): { instance: CardInstance; zone: TableZone } | null {
  const zone = findZone(state, id);
  if (zone) {
    return { instance: state[zone].find((c) => c.id === id)!, zone };
  }
  const missionIdx = state.missions.findIndex((m) => m?.id === id);
  if (missionIdx !== -1) {
    return { instance: state.missions[missionIdx]!, zone: 'missions' };
  }
  return null;
}

const flipFace = (face: Face): Face => (face === 'up' ? 'down' : 'up');

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
      const from = findZone(state, action.id);
      if (!from) return state;
      const card = state[from].find((c) => c.id === action.id)!;
      // A move within the same zone keeps the card's current face; a move to a different
      // zone takes on that zone's face.
      const face = from === action.to ? card.face : ZONE_FACE[action.to];
      const withoutCard = state[from].filter((c) => c.id !== action.id);
      const destination = from === action.to ? withoutCard : state[action.to];
      return {
        ...state,
        [from]: withoutCard,
        [action.to]: [...destination, { ...card, face }],
      };
    }

    case 'flip': {
      const found = findInstanceAnywhere(state, action.id);
      if (!found) return state;
      const { zone, instance } = found;
      if (zone === 'missions') {
        const idx = state.missions.findIndex((m) => m?.id === action.id);
        const missions = [...state.missions];
        missions[idx] = { ...instance, face: flipFace(instance.face) };
        return { ...state, missions };
      }
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
      // shuffling, and reset re-deals the identical set every time (unlike the draw pile).
      const missions: (CardInstance | null)[] = Array.from(
        { length: MISSION_SLOTS },
        (_, i) => action.missions[i] ?? null
      );
      return { pile, hand, discard: [], missions };
    }

    default:
      return state;
  }
}
