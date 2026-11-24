import { readFileSync } from 'fs';
import { resolve } from 'path';
import { initialTableState, CardInstance, TableState, MISSION_SLOTS } from '../../../app/decks/practice/tableReducer';
import {
  abilityUsable,
  abilityUsesThisTurn,
  costUseAvailable,
  GameAction,
  GameState,
  gameReducer,
  initialGameState,
  LogEntry,
  turnCharges,
  withShuffleOrders,
} from '../../../app/decks/practice/gameLog';
import { ORDER_MODELS } from '../../../lib/orderModels';
import { TRIGGER_ROWS } from '../../../lib/triggers';
import { MISSION_MODELS } from '../../../lib/missionModels';
import { TABLE_USE_MODELS } from '../../../lib/costModels/titles/tableUse';
import { costModelOf } from '../../../lib/costModels/registry';
import { clausesOf } from '../../../lib/modelCoverage';
import { cardTitleOf } from '../../../lib/cardTitle';
import { clauseUseLimit, isUseLimit, limitPerTurn, ONCE_EACH_TURN, withinUseLimit } from '../../../lib/useLimit';

// Issue #1834: one use limit for every ability the table offers, and one reader of the log that counts its uses this
// turn. With invented cards, and the titles of the registries as their keys.

describe('the use limit (#1834)', () => {
  it('reads the limit of a clause', () => {
    expect(clauseUseLimit('Discard a card from hand to draw three cards. You may do this only once each turn.')).toEqual(ONCE_EACH_TURN);
    expect(clauseUseLimit('You can do this only once per turn.')).toEqual(ONCE_EACH_TURN);
    expect(clauseUseLimit('Order - Discard a card from hand to draw a card (limit three per turn).')).toEqual(limitPerTurn(3));
    expect(clauseUseLimit('The first dilemma your personnel face here each turn that has a cost of 1 or more is prevented.')).toEqual(ONCE_EACH_TURN);
    // A limit of cards, not of uses.
    expect(clauseUseLimit('You may play up to two events (limit two cards per turn).')).toBeNull();
    expect(clauseUseLimit('Order - Stop one of your [Fer] personnel to draw a card.')).toBeNull();
  });

  it('allows a use below the limit, and every use with none', () => {
    expect(withinUseLimit(undefined, 9)).toBe(true);
    expect(withinUseLimit(ONCE_EACH_TURN, 0)).toBe(true);
    expect(withinUseLimit(ONCE_EACH_TURN, 1)).toBe(false);
    expect(withinUseLimit(limitPerTurn(2), 1)).toBe(true);
    expect(withinUseLimit(limitPerTurn(2), 2)).toBe(false);
    expect(isUseLimit(ONCE_EACH_TURN)).toBe(true);
    expect(isUseLimit({ per: 'turn', times: 0 })).toBe(false);
    expect(isUseLimit({ per: 'game', times: 1 })).toBe(false);
  });
});

describe('the reader of the log (#1834)', () => {
  const order = (turn: number, id = 'damar', index = 0) =>
    ({ kind: 'orderUsed', id, order: index, card: 'Damar Ambitious Glinn', effect: {}, turn, segment: 'orders' }) as unknown as LogEntry;
  const triggered = (turn: number, source = 'li') =>
    ({ kind: 'triggerUsed', target: { entry: 0, source, row: 0, event: 0 }, card: 'Li Nalas', effect: {}, turn, segment: 'playAndDraw' }) as unknown as LogEntry;
  const orderKey = { kind: 'order', id: 'damar', index: 0 } as const;

  it('counts the uses of one card instance and ability index this turn', () => {
    expect(abilityUsesThisTurn([], 1, orderKey)).toBe(0);
    expect(abilityUsesThisTurn([order(1)], 1, orderKey)).toBe(1);
    expect(abilityUsesThisTurn([order(1)], 2, orderKey)).toBe(0);
    expect(abilityUsesThisTurn([order(1, 'other'), order(1, 'damar', 1)], 1, orderKey)).toBe(0);
  });

  it('allows a second use of a limit of two, not a third; the next turn and an undo give the uses back', () => {
    const two = limitPerTurn(2);
    expect(abilityUsable([order(1)], 1, orderKey, two)).toBe(true);
    expect(abilityUsable([order(1), order(1)], 1, orderKey, two)).toBe(false);
    expect(abilityUsable([order(1), order(1)], 2, orderKey, two)).toBe(true);
    // An undo takes the last entry out of the log.
    expect(abilityUsable([order(1), order(1)].slice(0, -1), 1, orderKey, two)).toBe(true);
    expect(abilityUsable([order(1), order(1), order(1)], 1, orderKey, undefined)).toBe(true);
  });

  it('counts a trigger row by its source card', () => {
    const key = { kind: 'trigger', id: 'li', index: 0 } as const;
    expect(abilityUsable([triggered(1)], 1, key, ONCE_EACH_TURN)).toBe(false);
    expect(abilityUsable([triggered(1, 'li2')], 1, key, ONCE_EACH_TURN)).toBe(true);
    expect(abilityUsable([triggered(1)], 2, key, ONCE_EACH_TURN)).toBe(true);
  });

  it('counts a mission spend by mission and kind', () => {
    const spend = (turn: number) => ({ kind: 'missionSpend', mission: 'Earth', spend: 'earth', cost: 1, drew: 2, turn, segment: 'playAndDraw' }) as unknown as LogEntry;
    const key = { kind: 'missionSpend', mission: 'Earth', spend: 'earth' } as const;
    expect(abilityUsable([spend(1)], 1, key, ONCE_EACH_TURN)).toBe(false);
    expect(abilityUsable([spend(1)], 2, key, ONCE_EACH_TURN)).toBe(true);
    expect(abilityUsable([spend(1)], 1, { ...key, spend: 'nimbus' }, ONCE_EACH_TURN)).toBe(true);
  });
});

describe('a table use of a play cost with a limit (#1834)', () => {
  // The New Resistance stays in the core after its use, so only a limit stops a second use in the turn. None of the
  // shipped table uses has one: the test gives The New Resistance one for its duration.
  const card = (id: string, row: Record<string, unknown>, extra: Partial<CardInstance> = {}): CardInstance => ({
    id,
    card: { collectorsinfo: id, imagefile: id, ...row } as CardInstance['card'],
    face: 'up',
    ...extra,
  });
  const dissident = (id: string, face: 'up' | 'down' = 'up') =>
    card(id, { type: 'personnel', name: `rebel ${id}`, originalName: `Rebel ${id}`, cost: '2', keywords: 'Dissident.', affiliation: 'bajoran' }, { face });
  const RESISTANCE = card('nr', { type: 'event', name: 'the new resistance', originalName: 'The New Resistance', cost: '3' });
  const table = (): TableState => ({
    ...initialTableState,
    hand: [dissident('h1'), dissident('h2')],
    core: [RESISTANCE],
    drawDeck: [dissident('d1', 'down'), dissident('d2', 'down'), dissident('d3', 'down')],
    missions: Array.from({ length: MISSION_SLOTS }, (_, i) => ({
      mission: i === 0 ? card('m0', { type: 'mission', name: 'moab iv', originalName: 'Moab IV', missiontype: 'p' }) : null,
      ships: [],
      awayTeam: [],
      underMission: [],
    })),
  });
  const play = (state: GameState, ...actions: GameAction[]) => actions.reduce((s, a) => gameReducer(s, withShuffleOrders(s.table, a, s.log)), state);
  const toAway = (id: string): GameAction => ({ type: 'move', id, to: { zone: 'missionPile', missionIndex: 0, pile: 'awayTeam' } });
  const lastCharge = (game: GameState) => turnCharges(game.log, game.table.turn).at(-1)!;
  const useOn = (game: GameState): GameAction => ({ type: 'useCard', target: lastCharge(game).target, id: 'nr' });

  const model = costModelOf('The New Resistance')!;
  beforeAll(() => {
    model.useLimit = ONCE_EACH_TURN;
  });
  afterAll(() => {
    delete model.useLimit;
  });

  it('offers the use on a first play, not on a second play that turn, again on the next turn and after an undo', () => {
    const first = play(initialGameState(table()), toAway('h1'));
    expect(lastCharge(first).uses?.[0]).toMatchObject({ id: 'nr', limit: ONCE_EACH_TURN });
    const used = play(first, useOn(first));
    expect(used.log).toHaveLength(first.log.length + 1);

    const second = play(used, toAway('h2'));
    const use = lastCharge(second).uses![0];
    expect(use.used).toBe(false);
    expect(costUseAvailable(second.table, use, second.log)).toBe(false);
    expect(play(second, useOn(second))).toBe(second);

    // The undo of the first use, with the second play kept, gives the use back.
    const withoutUse = { ...second, log: second.log.filter((_, i) => i !== used.log.length - 1) };
    expect(costUseAvailable(second.table, use, withoutUse.log)).toBe(true);
    expect(costUseAvailable(used.table, lastCharge(first).uses![0], first.log)).toBe(true);

    const nextTurn = { ...second, table: { ...second.table, turn: second.table.turn + 1 } };
    expect(costUseAvailable(nextTurn.table, use, nextTurn.log)).toBe(true);
  });
});

describe('the use limits of the registries (#1834)', () => {
  const rows = readFileSync(resolve(process.cwd(), 'public/cards_with_processed_columns.txt'), 'utf8').split('\n').slice(1);
  const cards = new Map(rows.map((r) => r.split('\t').map((c) => c.replace(/^"|"$/g, ''))).map((c) => [cardTitleOf(c[0] ?? ''), { type: c[6] ?? '', text: c[26] ?? '' }]));
  const textOf = (title: string) => {
    const data = cards.get(title);
    expect([title, data !== undefined]).toEqual([title, true]);
    return data!;
  };

  it('gives every order row the limit its clause states, and none where it states none', () => {
    for (const model of ORDER_MODELS) {
      const data = textOf(model.title);
      const clause = clausesOf({ name: model.title, type: data.type, gametext: data.text }).filter((c) => c.concern === 'order')[model.index];
      expect([model.title, model.limit ?? null]).toEqual([model.title, clauseUseLimit(clause.text)]);
    }
  });

  it('gives every trigger row the limit its clause states', () => {
    for (const row of TRIGGER_ROWS) {
      const data = textOf(row.title);
      const clause = clausesOf({ name: row.title, type: data.type, gametext: data.text }).find((c) => c.text.endsWith(row.text));
      expect([row.title, row.limit ?? null]).toEqual([row.title, clauseUseLimit(clause?.text ?? row.text)]);
    }
  });

  it('gives every mission spend and reveal the limit its sentence states', () => {
    // A standing cost's "the first … each turn" changes a cost, the cost models' concern, and offers no ability.
    for (const model of MISSION_MODELS) {
      for (const ability of model.abilities) {
        if (ability.trigger !== 'spend' && ability.trigger !== 'onDilemmaReveal') continue;
        const limit = ability.trigger === 'spend' ? ability.spend.limit : ability.reveal.kind === 'prevent' ? ability.reveal.limit : undefined;
        expect([model.title, ability.trigger, limit ?? null]).toEqual([model.title, ability.trigger, clauseUseLimit(ability.text)]);
      }
    }
  });

  it('gives every table use of a play cost the limit its text states', () => {
    for (const model of TABLE_USE_MODELS) {
      expect([model.title, model.useLimit ?? null]).toEqual([model.title, clauseUseLimit(textOf(model.title).text)]);
    }
  });
});
