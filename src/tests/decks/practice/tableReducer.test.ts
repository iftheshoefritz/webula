import {
  tableReducer,
  initialTableState,
  createCardInstances,
  findInstanceAnywhere,
  CardInstance,
  MISSION_SLOTS,
} from '../../../app/decks/practice/tableReducer';

const card = (name: string) => ({ collectorsinfo: name, name });

const instance = (id: string, cardData: any, face: 'up' | 'down' = 'down'): CardInstance => ({
  id,
  card: cardData,
  face,
});

describe('tableReducer', () => {
  describe('reset', () => {
    it('deals the first 7 cards into the hand, face up, and leaves the rest in the pile', () => {
      const cards = Array.from({ length: 10 }, (_, i) => instance(`c${i}`, card(`Card ${i}`)));
      const state = tableReducer(
        {
          pile: [],
          hand: [instance('x', card('old'))],
          discard: [instance('y', card('old2'))],
          missions: Array(MISSION_SLOTS).fill(null),
        },
        { type: 'reset', cards, missions: [] }
      );

      expect(state.hand).toEqual(cards.slice(0, 7).map((c) => ({ ...c, face: 'up' })));
      expect(state.pile).toEqual(cards.slice(7));
      expect(state.discard).toEqual([]);
    });

    it('deals all the cards into the hand when the deck has fewer than 7', () => {
      const cards = [instance('a', card('Tricorder')), instance('b', card('Phaser'))];
      const state = tableReducer(initialTableState, { type: 'reset', cards, missions: [] });

      expect(state.hand).toEqual(cards.map((c) => ({ ...c, face: 'up' })));
      expect(state.pile).toEqual([]);
      expect(state.discard).toEqual([]);
    });

    it('deals 5 mission instances into 5 filled, face-up slots, in deck order, with unique ids', () => {
      const missions = Array.from({ length: 5 }, (_, i) => instance(`m${i}`, card(`Mission ${i}`), 'up'));
      const state = tableReducer(initialTableState, { type: 'reset', cards: [], missions });

      expect(state.missions).toEqual(missions);
      expect(new Set(state.missions.map((m) => m!.id)).size).toBe(5);
    });

    it('deals 3 mission instances into 3 filled slots and 2 empty slots', () => {
      const missions = Array.from({ length: 3 }, (_, i) => instance(`m${i}`, card(`Mission ${i}`), 'up'));
      const state = tableReducer(initialTableState, { type: 'reset', cards: [], missions });

      expect(state.missions).toEqual([...missions, null, null]);
    });

    it('deals 0 mission instances into 5 empty slots', () => {
      const state = tableReducer(initialTableState, { type: 'reset', cards: [], missions: [] });

      expect(state.missions).toEqual([null, null, null, null, null]);
    });

    it('re-deals the identical mission set on every reset, unlike the reshuffled draw pile', () => {
      const missions = Array.from({ length: 5 }, (_, i) => instance(`m${i}`, card(`Mission ${i}`), 'up'));
      const first = tableReducer(initialTableState, { type: 'reset', cards: [], missions });
      const second = tableReducer(first, { type: 'reset', cards: [], missions });

      expect(second.missions).toEqual(first.missions);
    });
  });

  describe('draw', () => {
    it('moves the top pile card into the hand and flips its face up', () => {
      const top = instance('a', card('Tricorder'), 'down');
      const rest = instance('b', card('Phaser'), 'down');
      const state = tableReducer(
        { ...initialTableState, pile: [top, rest] },
        { type: 'draw' }
      );

      expect(state.pile).toEqual([rest]);
      expect(state.hand).toEqual([{ ...top, face: 'up' }]);
    });

    it('is a no-op when the pile is empty', () => {
      const start = { ...initialTableState, hand: [instance('a', card('Tricorder'))] };
      const state = tableReducer(start, { type: 'draw' });

      expect(state).toBe(start);
    });
  });

  describe('move', () => {
    it('moves one hand card to the discard pile, setting its face up', () => {
      const moved = instance('a', card('Tricorder'), 'up');
      const start = { ...initialTableState, hand: [moved] };
      const state = tableReducer(start, { type: 'move', id: 'a', to: 'discard' });

      expect(state.hand).toEqual([]);
      expect(state.discard).toEqual([{ ...moved, face: 'up' }]);
    });

    it('moves only the targeted instance when the hand has two copies of the same card', () => {
      const copy1 = instance('a1', card('Tricorder'), 'up');
      const copy2 = instance('a2', card('Tricorder'), 'up');
      const start = { ...initialTableState, hand: [copy1, copy2] };
      const state = tableReducer(start, { type: 'move', id: 'a1', to: 'discard' });

      expect(state.hand).toEqual([copy2]);
      expect(state.discard).toEqual([copy1]);
    });

    it('sets the face from the destination zone convention (face down for the pile)', () => {
      const moved = instance('a', card('Tricorder'), 'up');
      const start = { ...initialTableState, hand: [moved] };
      const state = tableReducer(start, { type: 'move', id: 'a', to: 'pile' });

      expect(state.pile).toEqual([{ ...moved, face: 'down' }]);
    });

    it('keeps the current face on a move within the same zone', () => {
      const moved = instance('a', card('Tricorder'), 'up');
      const other = instance('b', card('Phaser'), 'up');
      const start = { ...initialTableState, hand: [moved, other] };
      const state = tableReducer(start, { type: 'move', id: 'a', to: 'hand' });

      expect(state.hand).toEqual([other, moved]);
    });

    it('is a no-op when the card id is not found in any zone', () => {
      const start = { ...initialTableState, hand: [instance('a', card('Tricorder'))] };
      const state = tableReducer(start, { type: 'move', id: 'missing', to: 'discard' });

      expect(state).toBe(start);
    });
  });

  describe('flip', () => {
    it('turns a face-up mission face down in place', () => {
      const mission = instance('m0', card('Moab IV'), 'up');
      const start = { ...initialTableState, missions: [mission, null, null, null, null] };
      const state = tableReducer(start, { type: 'flip', id: 'm0' });

      expect(state.missions).toEqual([{ ...mission, face: 'down' }, null, null, null, null]);
    });

    it('turns a face-down mission face up again', () => {
      const mission = instance('m0', card('Moab IV'), 'down');
      const start = { ...initialTableState, missions: [mission, null, null, null, null] };
      const state = tableReducer(start, { type: 'flip', id: 'm0' });

      expect(state.missions).toEqual([{ ...mission, face: 'up' }, null, null, null, null]);
    });

    it('leaves the other mission slots untouched', () => {
      const m0 = instance('m0', card('Moab IV'), 'up');
      const m1 = instance('m1', card('Angel I'), 'up');
      const start = { ...initialTableState, missions: [m0, m1, null, null, null] };
      const state = tableReducer(start, { type: 'flip', id: 'm0' });

      expect(state.missions[1]).toEqual(m1);
    });

    it('is a no-op for an id that is not on the table', () => {
      const mission = instance('m0', card('Moab IV'), 'up');
      const start = { ...initialTableState, missions: [mission, null, null, null, null] };
      const state = tableReducer(start, { type: 'flip', id: 'missing' });

      expect(state).toBe(start);
    });
  });
});

describe('createCardInstances', () => {
  it('gives each card a unique id and a face-down face by default', () => {
    const cards = [card('Tricorder'), card('Phaser'), card('Tricorder')];
    const instances = createCardInstances(cards);

    expect(instances).toHaveLength(3);
    expect(instances.every((i) => i.face === 'down')).toBe(true);
    expect(new Set(instances.map((i) => i.id)).size).toBe(3);
    expect(instances.map((i) => i.card)).toEqual(cards);
  });

  it('gives each card a face-up face when passed the face-up argument', () => {
    const cards = [card('Moab IV'), card('Angel I')];
    const instances = createCardInstances(cards, 'up');

    expect(instances.every((i) => i.face === 'up')).toBe(true);
  });
});

describe('findInstanceAnywhere', () => {
  it('finds a hand card and reports its zone', () => {
    const moved = instance('a', card('Tricorder'), 'up');
    const state = { ...initialTableState, hand: [moved] };

    expect(findInstanceAnywhere(state, 'a')).toEqual({ instance: moved, zone: 'hand' });
  });

  it('finds a mission slot and reports its zone as "missions"', () => {
    const mission = instance('m0', card('Moab IV'), 'up');
    const state = { ...initialTableState, missions: [mission, null, null, null, null] };

    expect(findInstanceAnywhere(state, 'm0')).toEqual({ instance: mission, zone: 'missions' });
  });

  it('returns null for an id that is not on the table', () => {
    expect(findInstanceAnywhere(initialTableState, 'missing')).toBeNull();
  });
});
