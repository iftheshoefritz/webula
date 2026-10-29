// Issue #1341: the Move to… list of the attempt row in the facing phase, its destinations and the
// moves a destination dispatches.
import {
  tableReducer,
  initialTableState,
  CardInstance,
  MissionSlot,
  TableAction,
  TableState,
} from '../../../app/decks/practice/tableReducer';
import { attemptMoveDestinations, AttemptMoveDestination } from '../../../app/decks/practice/attempt';

const inst = (id: string, name: string, type: string, extra: Partial<CardInstance> & Record<string, any> = {}): CardInstance => {
  const { stopped, crew, missiontype, ...rest } = extra;
  return {
    id,
    card: { name, originalName: name, type, ...(missiontype ? { missiontype } : {}), ...rest },
    face: 'up',
    ...(stopped ? { stopped } : {}),
    ...(crew ? { crew } : {}),
  };
};

const mission = (id: string, name: string, missiontype: string) => inst(id, name, 'mission', { missiontype });
const personnel = (id: string, stopped = false) => inst(id, `Person ${id}`, 'personnel', { stopped });
const equipment = (id: string) => inst(id, `Kit ${id}`, 'equipment');
const ship = (id: string, name: string, crew: CardInstance[] = []) => inst(id, name, 'ship', { crew });

const slot = (overrides: Partial<MissionSlot> = {}): MissionSlot => ({
  mission: null,
  ships: [],
  awayTeam: [],
  underMission: [],
  ...overrides,
});

// Slot 0: a planet mission; slot 1: the attempted space mission, with the attempting ship s1 and a
// second ship s5; slot 2: a headquarters with a ship; slot 3: a planet mission with two ships; slot
// 4: no mission card.
const table = (): TableState => ({
  ...initialTableState,
  drawDeck: [personnel('top'), personnel('bottom')],
  missions: [
    slot({ mission: mission('m0', 'Moab IV', 'p'), awayTeam: [personnel('a1')] }),
    slot({
      mission: mission('m1', 'Bilana System', 's'),
      ships: [ship('s1', 'Relativity', [personnel('c1', true), equipment('c2'), personnel('c3')]), ship('s5', 'Enterprise')],
    }),
    slot({ mission: mission('m2', 'Earth', 'h'), ships: [ship('s2', 'Hood')] }),
    slot({ mission: mission('m3', 'Angel I', 'p'), ships: [ship('s3', 'Defiant'), ship('s4', 'Voyager')] }),
    slot({ ships: [ship('s6', 'Orphan')] }),
  ],
  attempt: { missionIndex: 1, shipId: 's1', personnel: 2, subtract: 0, phase: 'face', drawn: 0 },
});

const destination = (t: TableState, key: string): AttemptMoveDestination => {
  const found = attemptMoveDestinations(t).find((d) => d.key === key);
  if (!found) throw new Error(`no destination ${key}`);
  return found;
};

// The moves of the batch PracticeTable dispatches: the row's order, reversed for the top of the draw
// deck. `gameReducer` runs a batch as these moves in turn.
const moveBatch = (ids: string[], d: AttemptMoveDestination): TableAction[] =>
  (d.position === 'top' ? [...ids].reverse() : ids).map((id) => ({
    type: 'move',
    id,
    to: d.to,
    ...(d.position ? { position: d.position } : {}),
  }));

const run = (state: TableState, actions: TableAction[]) => actions.reduce(tableReducer, state);

const crewIds = (t: TableState) => (t.missions[1].ships[0].crew ?? []).map((c) => c.id);

describe('attemptMoveDestinations (#1341)', () => {
  it('lists the bottom row, then the away team and every crew of each other mission', () => {
    expect(attemptMoveDestinations(table()).map((d) => [d.key, d.label])).toEqual([
      ['hand', 'Hand'],
      ['drawDeck-top', 'Top of the draw deck'],
      ['drawDeck-bottom', 'Bottom of the draw deck'],
      ['discard', 'Discard'],
      ['core', 'Core'],
      ['brig', 'Brig'],
      ['awayTeam-0', 'Away team at Moab IV'],
      ['awayTeam-2', 'Away team at Earth'],
      ['crew-s2', 'Crew of Hood at Earth'],
      ['awayTeam-3', 'Away team at Angel I'],
      ['crew-s3', 'Crew of Defiant at Angel I'],
      ['crew-s4', 'Crew of Voyager at Angel I'],
    ]);
  });

  it('lists nothing with no attempt, or in the dilemma choice', () => {
    expect(attemptMoveDestinations({ ...table(), attempt: undefined })).toEqual([]);
    const t = table();
    expect(attemptMoveDestinations({ ...t, attempt: { ...t.attempt!, phase: 'choose' } })).toEqual([]);
  });
});

describe('the moves of Move to… (#1341)', () => {
  it('moves to the hand, the discard, the core and the brig, and clears stopped only off the table', () => {
    for (const [key, zone, keepsStopped] of [
      ['hand', 'hand', false],
      ['discard', 'discard', false],
      ['core', 'core', true],
      ['brig', 'brig', true],
    ] as const) {
      const before = table();
      const after = run(before, moveBatch(['c1', 'c2'], destination(before, key)));
      expect(after[zone].map((c) => c.id)).toEqual(['c1', 'c2']);
      expect(crewIds(after)).toEqual(['c3']);
      expect(!!after[zone][0].stopped).toBe(keepsStopped);
      expect(after.attempt).toBe(before.attempt);
    }
  });

  it('puts the cards on top of the draw deck in row order, or at its bottom', () => {
    const before = table();
    const top = run(before, moveBatch(['c1', 'c2'], destination(before, 'drawDeck-top')));
    expect(top.drawDeck.map((c) => c.id)).toEqual(['c1', 'c2', 'top', 'bottom']);
    expect(top.drawDeck[0].stopped).toBeUndefined();
    const bottom = run(before, moveBatch(['c1', 'c2'], destination(before, 'drawDeck-bottom')));
    expect(bottom.drawDeck.map((c) => c.id)).toEqual(['top', 'bottom', 'c1', 'c2']);
    expect(bottom.attempt).toBe(before.attempt);
  });

  it("moves to another mission's away team and to another ship's crew", () => {
    const before = table();
    const team = run(before, moveBatch(['c3'], destination(before, 'awayTeam-0')));
    expect(team.missions[0].awayTeam.map((c) => c.id)).toEqual(['a1', 'c3']);
    expect(crewIds(team)).toEqual(['c1', 'c2']);
    expect(team.attempt).toBe(before.attempt);
    const crew = run(before, moveBatch(['c2'], destination(before, 'crew-s4')));
    expect((crew.missions[3].ships[1].crew ?? []).map((c) => c.id)).toEqual(['c2']);
    expect(crewIds(crew)).toEqual(['c1', 'c3']);
    expect(crew.attempt).toBe(before.attempt);
  });
});
