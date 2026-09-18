import {
  tableReducer,
  initialTableState,
  createCardInstances,
  findInstanceAnywhere,
  CardInstance,
  MissionSlot,
  MISSION_SLOTS,
} from '../../../app/decks/practice/tableReducer';

const card = (name: string) => ({ collectorsinfo: name, name });

const instance = (id: string, cardData: any, face: 'up' | 'down' = 'down'): CardInstance => ({
  id,
  card: cardData,
  face,
});

// Builds a 5-slot missions array, each slot holding the given mission card (or null) and an
// empty ship row and empty piles, unless a slot's ships/personnel/event are overridden
// explicitly by index.
const missionSlots = (
  missions: (CardInstance | null)[],
  shipsByIndex: Record<number, CardInstance[]> = {},
  personnelByIndex: Record<number, CardInstance[]> = {},
  eventByIndex: Record<number, CardInstance[]> = {}
): MissionSlot[] =>
  Array.from({ length: MISSION_SLOTS }, (_, i) => ({
    mission: missions[i] ?? null,
    ships: shipsByIndex[i] ?? [],
    personnel: personnelByIndex[i] ?? [],
    event: eventByIndex[i] ?? [],
  }));

describe('tableReducer', () => {
  describe('reset', () => {
    it('deals the first 7 cards into the hand, face up, and leaves the rest in the pile', () => {
      const cards = Array.from({ length: 10 }, (_, i) => instance(`c${i}`, card(`Card ${i}`)));
      const state = tableReducer(
        {
          ...initialTableState,
          pile: [],
          hand: [instance('x', card('old'))],
          discard: [instance('y', card('old2'))],
          missions: missionSlots([]),
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

    it('deals 5 mission instances into 5 filled, face-up slots, in deck order, with unique ids, each with an empty ship row', () => {
      const missions = Array.from({ length: 5 }, (_, i) => instance(`m${i}`, card(`Mission ${i}`), 'up'));
      const state = tableReducer(initialTableState, { type: 'reset', cards: [], missions });

      expect(state.missions).toEqual(missionSlots(missions));
      expect(new Set(state.missions.map((slot) => slot.mission!.id)).size).toBe(5);
      expect(state.missions.every((slot) => slot.ships)).toBe(true);
    });

    it('deals 3 mission instances into 3 filled slots and 2 empty slots', () => {
      const missions = Array.from({ length: 3 }, (_, i) => instance(`m${i}`, card(`Mission ${i}`), 'up'));
      const state = tableReducer(initialTableState, { type: 'reset', cards: [], missions });

      expect(state.missions).toEqual(missionSlots(missions));
    });

    it('deals 0 mission instances into 5 empty slots, each with an empty ship row', () => {
      const state = tableReducer(initialTableState, { type: 'reset', cards: [], missions: [] });

      expect(state.missions).toEqual(missionSlots([]));
    });

    it('re-deals the identical mission set on every reset, unlike the reshuffled draw pile', () => {
      const missions = Array.from({ length: 5 }, (_, i) => instance(`m${i}`, card(`Mission ${i}`), 'up'));
      const first = tableReducer(initialTableState, { type: 'reset', cards: [], missions });
      const second = tableReducer(first, { type: 'reset', cards: [], missions });

      expect(second.missions).toEqual(first.missions);
    });

    it('clears any ships that were on a ship row before the reset', () => {
      const ship = instance('s0', card('U.S.S. Relativity'), 'up');
      const start = { ...initialTableState, missions: missionSlots([], { 0: [ship] }) };
      const state = tableReducer(start, { type: 'reset', cards: [], missions: [] });

      expect(state.missions).toEqual(missionSlots([]));
    });

    it('clears the core and the brig even when they held cards before the reset (#603)', () => {
      const start = {
        ...initialTableState,
        core: [instance('e0', card('Event'), 'up')],
        brig: [instance('p0', card('Data'), 'up')],
      };
      const state = tableReducer(start, { type: 'reset', cards: [], missions: [] });

      expect(state.core).toEqual([]);
      expect(state.brig).toEqual([]);
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

    it('moves one hand card to the core, setting its face up (#603)', () => {
      const moved = instance('a', card('Tricorder'), 'down');
      const start = { ...initialTableState, hand: [moved] };
      const state = tableReducer(start, { type: 'move', id: 'a', to: 'core' });

      expect(state.hand).toEqual([]);
      expect(state.core).toEqual([{ ...moved, face: 'up' }]);
    });

    it('moves a personnel card from a mission pile to the brig, setting its face up (#603)', () => {
      const captured = instance('p0', card('Data'), 'down');
      const start = { ...initialTableState, missions: missionSlots([], {}, { 0: [captured] }) };
      const state = tableReducer(start, { type: 'move', id: 'p0', to: 'brig' });

      expect(state.missions[0].personnel).toEqual([]);
      expect(state.brig).toEqual([{ ...captured, face: 'up' }]);
    });

    it('moves a card from the brig to the discard pile, removing it from the brig (#603)', () => {
      const moved = instance('a', card('Data'), 'up');
      const start = { ...initialTableState, brig: [moved] };
      const state = tableReducer(start, { type: 'move', id: 'a', to: 'discard' });

      expect(state.brig).toEqual([]);
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

    it('moves a hand card to a mission\'s ship row, face up', () => {
      const ship = instance('s0', card('U.S.S. Relativity'), 'down');
      const start = { ...initialTableState, hand: [ship], missions: missionSlots([]) };
      const state = tableReducer(start, { type: 'move', id: 's0', to: { zone: 'shipRow', missionIndex: 2 } });

      expect(state.hand).toEqual([]);
      expect(state.missions[2].ships).toEqual([{ ...ship, face: 'up' }]);
      expect(state.missions[0].ships).toEqual([]);
    });

    it('moves a discard-pile card to a ship row, face up', () => {
      const ship = instance('s0', card('U.S.S. Relativity'), 'up');
      const start = { ...initialTableState, discard: [ship], missions: missionSlots([]) };
      const state = tableReducer(start, { type: 'move', id: 's0', to: { zone: 'shipRow', missionIndex: 0 } });

      expect(state.discard).toEqual([]);
      expect(state.missions[0].ships).toEqual([{ ...ship, face: 'up' }]);
    });

    it('moves a ship from one mission\'s ship row to another, leaving the source ship row empty', () => {
      const ship = instance('s0', card('U.S.S. Relativity'), 'up');
      const other = instance('s1', card('I.K.S. Somraw'), 'up');
      const start = { ...initialTableState, missions: missionSlots([], { 0: [ship, other] }) };
      const state = tableReducer(start, { type: 'move', id: 's0', to: { zone: 'shipRow', missionIndex: 3 } });

      expect(state.missions[0].ships).toEqual([other]);
      expect(state.missions[3].ships).toEqual([ship]);
    });

    it('moves a ship from a ship row to the discard pile, removing it from that mission only', () => {
      const ship = instance('s0', card('U.S.S. Relativity'), 'up');
      const untouched = instance('s1', card('I.K.S. Somraw'), 'up');
      const start = { ...initialTableState, missions: missionSlots([], { 0: [ship], 1: [untouched] }) };
      const state = tableReducer(start, { type: 'move', id: 's0', to: 'discard' });

      expect(state.missions[0].ships).toEqual([]);
      expect(state.missions[1].ships).toEqual([untouched]);
      expect(state.discard).toEqual([{ ...ship, face: 'up' }]);
    });

    it("moves a personnel card from the hand aboard a ship, keeping the ship's other crew intact", () => {
      const staying = instance('p0', card('Worf'), 'up');
      const ship = { ...instance('s0', card('U.S.S. Relativity'), 'up'), crew: [staying] };
      const moved = instance('p1', card('Data'), 'up');
      const start = { ...initialTableState, hand: [moved], missions: missionSlots([], { 0: [ship] }) };
      const state = tableReducer(start, { type: 'move', id: 'p1', to: { zone: 'crew', shipId: 's0' } });

      expect(state.hand).toEqual([]);
      expect(state.missions[0].ships[0].crew).toEqual([staying, moved]);
    });

    it('sets a crew card face up regardless of its previous face', () => {
      const ship = instance('s0', card('U.S.S. Relativity'), 'up');
      const moved = instance('p0', card('Data'), 'down');
      const start = { ...initialTableState, hand: [moved], missions: missionSlots([], { 0: [ship] }) };
      const state = tableReducer(start, { type: 'move', id: 'p0', to: { zone: 'crew', shipId: 's0' } });

      expect(state.missions[0].ships[0].crew).toEqual([{ ...moved, face: 'up' }]);
    });

    it("keeps two copies of the same personnel card aboard one ship as separate crew members", () => {
      const ship = instance('s0', card('U.S.S. Relativity'), 'up');
      const copy1 = instance('p1', card('Tribble Handler'), 'up');
      const copy2 = instance('p2', card('Tribble Handler'), 'up');
      const start = { ...initialTableState, hand: [copy1, copy2], missions: missionSlots([], { 0: [ship] }) };
      const afterFirst = tableReducer(start, { type: 'move', id: 'p1', to: { zone: 'crew', shipId: 's0' } });
      const afterSecond = tableReducer(afterFirst, { type: 'move', id: 'p2', to: { zone: 'crew', shipId: 's0' } });

      expect(afterSecond.missions[0].ships[0].crew).toEqual([copy1, copy2]);
    });

    it("moves a crew card out to the discard pile, leaving the rest of the ship's crew intact", () => {
      const staying = instance('p0', card('Worf'), 'up');
      const moving = instance('p1', card('Data'), 'up');
      const ship = { ...instance('s0', card('U.S.S. Relativity'), 'up'), crew: [staying, moving] };
      const start = { ...initialTableState, missions: missionSlots([], { 0: [ship] }) };
      const state = tableReducer(start, { type: 'move', id: 'p1', to: 'discard' });

      expect(state.missions[0].ships[0].crew).toEqual([staying]);
      expect(state.discard).toEqual([moving]);
    });

    it("releases a ship's crew into the discard pile, as separate cards, when the ship itself is discarded", () => {
      const crewMember = instance('p0', card("Miles O'Brien"), 'up');
      const ship = { ...instance('s0', card('U.S.S. Relativity'), 'up'), crew: [crewMember] };
      const start = { ...initialTableState, missions: missionSlots([], { 0: [ship] }) };
      const state = tableReducer(start, { type: 'move', id: 's0', to: 'discard' });

      expect(state.missions[0].ships).toEqual([]);
      expect(state.discard).toEqual([
        { id: 's0', card: card('U.S.S. Relativity'), face: 'up' },
        { id: 'p0', card: card("Miles O'Brien"), face: 'up' },
      ]);
    });

    it("keeps a ship's crew attached when it moves between two ship rows", () => {
      const crewMember = instance('p0', card('Worf'), 'up');
      const ship = { ...instance('s0', card('U.S.S. Relativity'), 'up'), crew: [crewMember] };
      const start = { ...initialTableState, missions: missionSlots([], { 0: [ship] }) };
      const state = tableReducer(start, { type: 'move', id: 's0', to: { zone: 'shipRow', missionIndex: 3 } });

      expect(state.missions[3].ships).toEqual([ship]);
    });

    it('is a no-op when a ship is dropped back on the ship row it already occupies (#601)', () => {
      const ship = instance('s0', card('U.S.S. Relativity'), 'up');
      const start = { ...initialTableState, missions: missionSlots([], { 0: [ship] }) };
      const state = tableReducer(start, { type: 'move', id: 's0', to: { zone: 'shipRow', missionIndex: 0 } });

      expect(state).toBe(start);
    });

    it('is a no-op, and does not reorder the row, when one of two ships in a row is dropped back on it', () => {
      const ship = instance('s0', card('U.S.S. Relativity'), 'up');
      const other = instance('s1', card('I.K.S. Somraw'), 'up');
      const start = { ...initialTableState, missions: missionSlots([], { 0: [ship, other] }) };
      const state = tableReducer(start, { type: 'move', id: 's0', to: { zone: 'shipRow', missionIndex: 0 } });

      expect(state).toBe(start);
      expect(state.missions[0].ships).toEqual([ship, other]);
    });

    it('files a hand card into a mission\'s personnel pile, face down (#602)', () => {
      const moved = instance('p0', card('Data'), 'up');
      const start = { ...initialTableState, hand: [moved], missions: missionSlots([]) };
      const state = tableReducer(start, {
        type: 'move',
        id: 'p0',
        to: { zone: 'missionPile', missionIndex: 1, pile: 'personnel' },
      });

      expect(state.hand).toEqual([]);
      expect(state.missions[1].personnel).toEqual([{ ...moved, face: 'down' }]);
    });

    it('files a hand card into a mission\'s event pile, face up (#602)', () => {
      const moved = instance('e0', card('Q Net'), 'down');
      const start = { ...initialTableState, hand: [moved], missions: missionSlots([]) };
      const state = tableReducer(start, {
        type: 'move',
        id: 'e0',
        to: { zone: 'missionPile', missionIndex: 1, pile: 'event' },
      });

      expect(state.hand).toEqual([]);
      expect(state.missions[1].event).toEqual([{ ...moved, face: 'up' }]);
    });

    it('moves a card from one mission\'s pile to another mission\'s pile', () => {
      const moved = instance('p0', card('Data'), 'down');
      const start = { ...initialTableState, missions: missionSlots([], {}, { 0: [moved] }) };
      const state = tableReducer(start, {
        type: 'move',
        id: 'p0',
        to: { zone: 'missionPile', missionIndex: 3, pile: 'personnel' },
      });

      expect(state.missions[0].personnel).toEqual([]);
      expect(state.missions[3].personnel).toEqual([moved]);
    });

    it('moves a mission pile card to the discard pile, removing it from that pile only', () => {
      const moving = instance('p0', card('Data'), 'down');
      const staying = instance('p1', card('Worf'), 'down');
      const start = { ...initialTableState, missions: missionSlots([], {}, { 0: [moving, staying] }) };
      const state = tableReducer(start, { type: 'move', id: 'p0', to: 'discard' });

      expect(state.missions[0].personnel).toEqual([staying]);
      expect(state.discard).toEqual([{ ...moving, face: 'up' }]);
    });

    it('is a no-op when a card is dropped back on the mission pile it already occupies', () => {
      const moved = instance('p0', card('Data'), 'down');
      const start = { ...initialTableState, missions: missionSlots([], {}, { 0: [moved] }) };
      const state = tableReducer(start, {
        type: 'move',
        id: 'p0',
        to: { zone: 'missionPile', missionIndex: 0, pile: 'personnel' },
      });

      expect(state.missions[0].personnel).toEqual([moved]);
    });
  });

  describe('flip', () => {
    it('turns a face-up mission face down in place', () => {
      const mission = instance('m0', card('Moab IV'), 'up');
      const start = { ...initialTableState, missions: missionSlots([mission]) };
      const state = tableReducer(start, { type: 'flip', id: 'm0' });

      expect(state.missions).toEqual(missionSlots([{ ...mission, face: 'down' }]));
    });

    it('turns a face-down mission face up again', () => {
      const mission = instance('m0', card('Moab IV'), 'down');
      const start = { ...initialTableState, missions: missionSlots([mission]) };
      const state = tableReducer(start, { type: 'flip', id: 'm0' });

      expect(state.missions).toEqual(missionSlots([{ ...mission, face: 'up' }]));
    });

    it('leaves the other mission slots untouched', () => {
      const m0 = instance('m0', card('Moab IV'), 'up');
      const m1 = instance('m1', card('Angel I'), 'up');
      const start = { ...initialTableState, missions: missionSlots([m0, m1]) };
      const state = tableReducer(start, { type: 'flip', id: 'm0' });

      expect(state.missions[1].mission).toEqual(m1);
    });

    it('is a no-op for an id that is not on the table', () => {
      const mission = instance('m0', card('Moab IV'), 'up');
      const start = { ...initialTableState, missions: missionSlots([mission]) };
      const state = tableReducer(start, { type: 'flip', id: 'missing' });

      expect(state).toBe(start);
    });

    it('is a no-op for a ship on a ship row (a ship has no Flip control and is always face up)', () => {
      const ship = instance('s0', card('U.S.S. Relativity'), 'up');
      const start = { ...initialTableState, missions: missionSlots([], { 0: [ship] }) };
      const state = tableReducer(start, { type: 'flip', id: 's0' });

      expect(state).toBe(start);
    });

    it('is a no-op for a crew card (it has no Flip control and is always face up)', () => {
      const crewMember = instance('p0', card('Worf'), 'up');
      const ship = { ...instance('s0', card('U.S.S. Relativity'), 'up'), crew: [crewMember] };
      const start = { ...initialTableState, missions: missionSlots([], { 0: [ship] }) };
      const state = tableReducer(start, { type: 'flip', id: 'p0' });

      expect(state).toBe(start);
    });

    it('turns a face-down personnel pile card face up in place (#602)', () => {
      const personnelCard = instance('p0', card('Data'), 'down');
      const start = { ...initialTableState, missions: missionSlots([], {}, { 1: [personnelCard] }) };
      const state = tableReducer(start, { type: 'flip', id: 'p0' });

      expect(state.missions[1].personnel).toEqual([{ ...personnelCard, face: 'up' }]);
    });

    it('turns a face-up event pile card face down in place (#602)', () => {
      const eventCard = instance('e0', card('Q Net'), 'up');
      const start = { ...initialTableState, missions: missionSlots([], {}, {}, { 2: [eventCard] }) };
      const state = tableReducer(start, { type: 'flip', id: 'e0' });

      expect(state.missions[2].event).toEqual([{ ...eventCard, face: 'down' }]);
    });

    it('leaves other cards in the same mission pile untouched', () => {
      const flipped = instance('p0', card('Data'), 'down');
      const untouched = instance('p1', card('Worf'), 'down');
      const start = { ...initialTableState, missions: missionSlots([], {}, { 0: [flipped, untouched] }) };
      const state = tableReducer(start, { type: 'flip', id: 'p0' });

      expect(state.missions[0].personnel).toEqual([{ ...flipped, face: 'up' }, untouched]);
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
    const state = { ...initialTableState, missions: missionSlots([mission]) };

    expect(findInstanceAnywhere(state, 'm0')).toEqual({ instance: mission, zone: 'missions' });
  });

  it('finds a ship in a ship row and reports its mission index', () => {
    const ship = instance('s0', card('U.S.S. Relativity'), 'up');
    const state = { ...initialTableState, missions: missionSlots([], { 2: [ship] }) };

    expect(findInstanceAnywhere(state, 's0')).toEqual({
      instance: ship,
      zone: { zone: 'shipRow', missionIndex: 2 },
    });
  });

  it("finds a crew card and reports its ship's id", () => {
    const crewMember = instance('p0', card('Worf'), 'up');
    const ship = { ...instance('s0', card('U.S.S. Relativity'), 'up'), crew: [crewMember] };
    const state = { ...initialTableState, missions: missionSlots([], { 0: [ship] }) };

    expect(findInstanceAnywhere(state, 'p0')).toEqual({
      instance: crewMember,
      zone: { zone: 'crew', shipId: 's0' },
    });
  });

  it('returns null for an id that is not on the table', () => {
    expect(findInstanceAnywhere(initialTableState, 'missing')).toBeNull();
  });

  it('finds a card in the core and reports its zone (#603)', () => {
    const eventCard = instance('e0', card('Event'), 'up');
    const state = { ...initialTableState, core: [eventCard] };

    expect(findInstanceAnywhere(state, 'e0')).toEqual({ instance: eventCard, zone: 'core' });
  });

  it('finds a card in the brig and reports its zone (#603)', () => {
    const captured = instance('p0', card('Data'), 'up');
    const state = { ...initialTableState, brig: [captured] };

    expect(findInstanceAnywhere(state, 'p0')).toEqual({ instance: captured, zone: 'brig' });
  });

  it("finds a card in a mission's personnel pile and reports its mission index and pile (#602)", () => {
    const personnelCard = instance('p0', card('Data'), 'down');
    const state = { ...initialTableState, missions: missionSlots([], {}, { 1: [personnelCard] }) };

    expect(findInstanceAnywhere(state, 'p0')).toEqual({
      instance: personnelCard,
      zone: { zone: 'missionPile', missionIndex: 1, pile: 'personnel' },
    });
  });

  it("finds a card in a mission's event pile and reports its mission index and pile (#602)", () => {
    const eventCard = instance('e0', card('Q Net'), 'up');
    const state = { ...initialTableState, missions: missionSlots([], {}, {}, { 3: [eventCard] }) };

    expect(findInstanceAnywhere(state, 'e0')).toEqual({
      instance: eventCard,
      zone: { zone: 'missionPile', missionIndex: 3, pile: 'event' },
    });
  });
});
