// Table state for the practice draw page. Kept in a `useReducer` (see the parent design in
// issue #130) rather than several `useState` calls so every zone move goes through one place
// and later slices can add zones/actions without touching how existing zones behave.

export type Face = 'up' | 'down';
export type Zone = 'pile' | 'hand' | 'discard';

export interface CardInstance {
  id: string;
  card: any;
  face: Face;
}

export interface TableState {
  pile: CardInstance[];
  hand: CardInstance[];
  discard: CardInstance[];
}

export type TableAction =
  | { type: 'draw' }
  | { type: 'move'; id: string; to: Zone }
  | { type: 'reset'; cards: CardInstance[] };

export const ZONE_FACE: Record<Zone, Face> = {
  pile: 'down',
  hand: 'up',
  discard: 'up',
};

export const initialTableState: TableState = {
  pile: [],
  hand: [],
  discard: [],
};

let nextInstanceId = 0;

// A simple counter is enough here: ids only need to be unique within one dealt deck, and
// jsdom's crypto (used in tests) doesn't implement `randomUUID`.
const generateInstanceId = (): string => {
  nextInstanceId += 1;
  return `card-${nextInstanceId}`;
};

// Gives each expanded deck row a stable, unique id so a specific copy of a duplicated card
// can be moved on its own, and a face matching where it starts (the draw pile, face down).
export function createCardInstances(cards: any[]): CardInstance[] {
  return cards.map((card) => ({ id: generateInstanceId(), card, face: ZONE_FACE.pile }));
}

const findZone = (state: TableState, id: string): Zone | null => {
  if (state.pile.some((c) => c.id === id)) return 'pile';
  if (state.hand.some((c) => c.id === id)) return 'hand';
  if (state.discard.some((c) => c.id === id)) return 'discard';
  return null;
};

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

    case 'reset':
      return { pile: action.cards, hand: [], discard: [] };

    default:
      return state;
  }
}
