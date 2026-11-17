import { initialTableState, CardInstance, TableState, MISSION_SLOTS } from '../../../app/decks/practice/tableReducer';
import {
  actionReveal,
  entryCharges,
  gameReducer,
  GameAction,
  GameState,
  initialGameState,
  logEntryText,
  withShuffleOrders,
} from '../../../app/decks/practice/gameLog';
import { costFactsOf } from '../../../app/decks/practice/costFacts';
import { costModelOf } from '../../../lib/costModels/registry';
import { CostFacts } from '../../../lib/costModels/model';

// Issue #1738: in a bot game a play of Ptol reveals the top four cards of the bot's dilemma pile, costs 5
// less the dual dilemmas among them, and puts the four on the bottom of the pile, in one entry and one
// undo. With invented dilemmas.

const card = (id: string, row: Record<string, unknown>, face: CardInstance['face'] = 'up'): CardInstance => ({
  id,
  card: { collectorsinfo: id, imagefile: id, ...row } as CardInstance['card'],
  face,
});
const dilemma = (id: string, dilemmatype: string) =>
  card(id, { type: 'dilemma', name: `dilemma ${id}`, originalName: `Dilemma ${id}`, dilemmatype }, 'down');
const ptol = card('ptol', { type: 'personnel', name: 'ptol', originalName: 'Ptol', cost: '5', affiliation: 'non-aligned' });

// The pile, top first: `types` gives each dilemma's type, `d` for a dual dilemma.
function table(types: string[], bot = true): TableState {
  return {
    ...initialTableState,
    ...(bot ? { opponent: 'bot' as const } : {}),
    hand: [ptol],
    missions: Array.from({ length: MISSION_SLOTS }, (_, i) => ({
      mission: i === 0 ? card('m0', { type: 'mission', name: 'moab iv', originalName: 'Moab IV', missiontype: 'p' }) : null,
      ships: [],
      awayTeam: [],
      underMission: [],
    })),
    dilemmaPile: types.map((t, i) => dilemma(`d${i + 1}`, t)),
  };
}

const PLAY: GameAction = { type: 'move', id: 'ptol', to: { zone: 'missionPile', missionIndex: 0, pile: 'awayTeam' } };

function play(start: TableState): { state: GameState; chosen: GameAction } {
  const chosen = withShuffleOrders(start, PLAY, []);
  return { state: gameReducer(initialGameState(start), chosen), chosen };
}

const facts = (pile?: CostFacts['opponentDilemmaPile']): CostFacts => ({ commanded: [], core: [], hand: [], ...(pile ? { opponentDilemmaPile: pile } : {}) });
const pileOf = (types: string[]) => types.map((dilemmaType, i) => ({ id: `d${i + 1}`, dilemmaType }));
const ptolCost = (f: CostFacts) => costModelOf('Ptol')!.playCost!({ type: 'personnel', printed: 5 }, f);

describe('the Ptol model with the opponent\'s dilemma pile (#1738)', () => {
  it.each([
    [['s', 'p', 's', 'p'], 5, 0],
    [['d', 's', 'd', 'p'], 3, 2],
    [['d', 'd', 'd', 'd', 'd'], 1, 4],
  ])('reveals the top four of %j: cost %i', (types, cost, duals) => {
    expect(ptolCost(facts(pileOf(types)))).toEqual({
      cost,
      reason: `${duals} dual ${duals === 1 ? 'dilemma' : 'dilemmas'} of 4 cards revealed, put on the bottom of the dilemma pile`,
      reveal: { ids: ['d1', 'd2', 'd3', 'd4'] },
    });
  });

  it('reveals only the cards a short pile holds', () => {
    expect(ptolCost(facts(pileOf(['d', 's'])))).toMatchObject({ cost: 4, reveal: { ids: ['d1', 'd2'] } });
  });

  it('reveals nothing from an empty pile, at the printed cost', () => {
    expect(ptolCost(facts([]))).toEqual({ cost: 5, reason: '0 dual dilemmas of 0 cards revealed, put on the bottom of the dilemma pile' });
  });

  it('keeps the counted choice without the fact', () => {
    expect(ptolCost(facts())).toMatchObject({ cost: 5, choice: { label: 'Dual dilemmas revealed', step: 1, max: 4 } });
  });
});

describe('costFactsOf and the opponent\'s dilemma pile (#1738)', () => {
  it('reads the dilemma pile, top first, in a bot game', () => {
    expect(costFactsOf(table(['d', 's'])).opponentDilemmaPile).toEqual([
      { id: 'd1', dilemmaType: 'd' },
      { id: 'd2', dilemmaType: 's' },
    ]);
  });

  it('reads no opponent\'s pile in a game with no bot', () => {
    expect(costFactsOf(table(['d', 's'], false)).opponentDilemmaPile).toBeUndefined();
  });
});

describe('a play of Ptol in a bot game (#1738)', () => {
  const start = table(['d', 's', 'd', 'p', 'h', 's']);

  it('charges 5 less the duals, and puts the four revealed cards on the bottom of the pile in pile order', () => {
    const { state, chosen } = play(start);
    expect(actionReveal(chosen)).toEqual(['d1', 'd2', 'd3', 'd4']);
    expect(state.table.dilemmaPile.map((c) => c.id)).toEqual(['d5', 'd6', 'd1', 'd2', 'd3', 'd4']);
    expect(state.table.missions[0].awayTeam.map((c) => c.id)).toEqual(['ptol']);
    expect(state.log).toHaveLength(1);
    expect(entryCharges(state.log, 0).map((c) => c.cost)).toEqual([3]);
    expect(logEntryText(state.log[0])).toContain('2 dual dilemmas of 4 cards revealed, put on the bottom of the dilemma pile');
  });

  it('takes back the play, the reveal and the moves with one undo', () => {
    const { state } = play(start);
    const undone = gameReducer(state, { type: 'undo' });
    expect(undone.table).toBe(start);
    expect(undone.log).toEqual([]);
  });

  it('lets a correction of the charge change the cost', () => {
    const { state } = play(start);
    const corrected = gameReducer(state, { type: 'correctCharge', target: { entry: 0, move: 0, card: 0 }, cost: 0 });
    expect(entryCharges(corrected.log, 0).map((c) => c.cost)).toEqual([0]);
  });

  it('moves no dilemma and keeps the choice in a game with no bot', () => {
    const plain = table(['d', 's', 'd', 'p'], false);
    const { state, chosen } = play(plain);
    expect(chosen.type).toBe('move');
    expect(actionReveal(chosen)).toEqual([]);
    expect(state.table.dilemmaPile.map((c) => c.id)).toEqual(['d1', 'd2', 'd3', 'd4']);
    expect(entryCharges(state.log, 0)).toEqual([expect.objectContaining({ cost: 5, source: expect.objectContaining({ choice: expect.objectContaining({ step: 1 }) }) })]);
  });

  it('reads the pile the earlier moves of a batch left', () => {
    const chosen = withShuffleOrders(start, { type: 'batch', actions: [{ type: 'move', id: 'd1', to: 'dilemmaPile', position: 'bottom' }, PLAY] as never }, []);
    expect(actionReveal(chosen)).toEqual(['d2', 'd3', 'd4', 'd5']);
    const after = gameReducer(initialGameState(start), chosen).table;
    expect(after.dilemmaPile.map((c) => c.id)).toEqual(['d6', 'd1', 'd2', 'd3', 'd4', 'd5']);
  });
});
