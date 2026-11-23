import { initialTableState, CardInstance, TableState, MISSION_SLOTS } from '../../../app/decks/practice/tableReducer';
import {
  GameState,
  gameReducer,
  initialGameState,
  isLogEntry,
  LogEntry,
  logEntryText,
  pendingPlayEffectOf,
  recordStepName,
  resolveStageOf,
  withShuffleOrders,
} from '../../../app/decks/practice/gameLog';
import { bottomFromHand, discardFromHand, draw, drawUpTo, EffectStep, stagesOf } from '../../../lib/effectSteps';
import type { PlayModel } from '../../../lib/playModels';
import type { ResolveModel } from '../../../lib/resolveModels';

// Issue #1863: the play and resolve models are lists of effect steps, one action (`effectStep`) applies the next
// stage of either, and a resolving event's stage is one generic entry. With invented cards, and the titles of the
// registries, their keys. Two invented titles are rows of a new order of steps, added below by mocking the
// registries' lookups only: no new action, entry or panel.

const NEW_PLAY: PlayModel = { title: 'Invented Discarder', text: 'Discard a card from hand to draw two cards.', steps: [discardFromHand(1), draw(2)] };
const NEW_EVENT: ResolveModel = { title: 'Invented Insight', steps: [drawUpTo(3, false), bottomFromHand(1)] };

jest.mock('../../../lib/playModels', () => {
  const actual = jest.requireActual('../../../lib/playModels');
  return { ...actual, playModelOf: (name: string) => (name === 'Invented Discarder' ? NEW_PLAY : actual.playModelOf(name)) };
});
jest.mock('../../../lib/resolveModels', () => {
  const actual = jest.requireActual('../../../lib/resolveModels');
  return { ...actual, resolveModelOf: (name: string) => (name === 'Invented Insight' ? NEW_EVENT : actual.resolveModelOf(name)) };
});

const { PLAY_MODELS } = jest.requireActual('../../../lib/playModels') as typeof import('../../../lib/playModels');
const { RESOLVE_MODELS } = jest.requireActual('../../../lib/resolveModels') as typeof import('../../../lib/resolveModels');

const card = (id: string, row: Record<string, unknown>, extra: Partial<CardInstance> = {}): CardInstance => ({
  id,
  card: { collectorsinfo: id, imagefile: id, ...row } as CardInstance['card'],
  face: 'up',
  ...extra,
});
const deckCard = (id: string) => card(id, { type: 'event', name: `card ${id}`, originalName: `Card ${id}`, cost: '1' }, { face: 'down' });
const event = (id: string, name: string) => card(id, { type: 'event', name: name.toLowerCase(), originalName: name, cost: '1', gametext: 'draw.' });
const person = (id: string, name: string, cost: number) =>
  card(id, { type: 'personnel', name: name.toLowerCase(), originalName: name, cost: String(cost), affiliation: 'federation' });
const TRICORDER = card('h1', { type: 'equipment', name: 'tricorder', originalName: 'Tricorder', cost: '1' });
const PHASER = card('h2', { type: 'equipment', name: 'phaser', originalName: 'Phaser', cost: '1' });

function table(resolving: CardInstance | null, hand: CardInstance[] = [TRICORDER, PHASER]): TableState {
  return {
    ...initialTableState,
    hand,
    drawDeck: Array.from({ length: 10 }, (_, i) => deckCard(`d${i + 1}`)),
    missions: Array.from({ length: MISSION_SLOTS }, (_, i) => ({
      mission: i === 0 ? card('m0', { type: 'mission', name: 'moab iv', originalName: 'Moab IV', missiontype: 'p' }) : null,
      ships: [],
      awayTeam: i === 0 ? [person('data', 'Data', 4)] : [],
      underMission: [],
    })),
    resolving,
  };
}

const dispatch = (game: GameState, action: Parameters<typeof withShuffleOrders>[1]): GameState =>
  gameReducer(game, withShuffleOrders(game.table, action, game.log));

// The game with the event already played into the resolving zone, as the page dispatches it.
function resolvingGame(t: TableState): GameState {
  const { resolving } = t;
  const before = { ...t, resolving: null, hand: [...t.hand, resolving!] };
  return dispatch(initialGameState(before), { type: 'move', id: resolving!.id, to: 'resolving' });
}

const lastText = (game: GameState) => logEntryText(game.log[game.log.length - 1]);
const stageCount = (steps: EffectStep[]) => stagesOf(steps).length;

describe('the registries as lists of steps (#1863)', () => {
  it('gives no model a kind, and every model its steps', () => {
    for (const model of [...PLAY_MODELS, ...RESOLVE_MODELS]) {
      expect(model).not.toHaveProperty('kind');
      expect(model.steps.length).toBeGreaterThan(0);
    }
  });

  it('keeps the stages of before: Tain 2, the others 1; These Are The Voyages and Miracle Working 2, the other events 1', () => {
    for (const model of PLAY_MODELS) expect([model.title, stageCount(model.steps)]).toEqual([model.title, model.title.startsWith('Enabran Tain') ? 2 : 1]);
    for (const model of RESOLVE_MODELS) {
      const two = model.title === 'These Are The Voyages' || model.title === 'Miracle Working';
      expect([model.title, stageCount(model.steps)]).toEqual([model.title, two ? 2 : 1]);
    }
  });

  it('runs a shuffle and a fixed draw with the step before them, and a first step on its own', () => {
    expect(stagesOf([discardFromHand(1), draw(2)]).map((s) => s.steps.length)).toEqual([2]);
    expect(stagesOf([draw(4), bottomFromHand(3)]).map((s) => recordStepName(s.lead))).toEqual(['draw', 'bottom']);
  });
});

describe('a save from before #1863 (#1863)', () => {
  const TATV = event('tatv', 'These Are The Voyages');
  const at = (game: GameState, entries: LogEntry[]): GameState => ({ ...game, log: [...game.log, ...entries] });
  const stamp = { turn: 1, segment: 'playAndDraw' as const };

  it('reads a resolveDrew mid-way through These Are The Voyages as its first stage, and the next stage applies', () => {
    const start = resolvingGame(table(TATV));
    const old = at(start, [{ kind: 'resolveDrew', event: 'These Are The Voyages', count: 4, personnel: 'Data', personnelCost: 4, ...stamp }]);
    expect(lastText(old)).toBe('Drew 4 cards (These Are The Voyages, Data cost 4)');
    expect(resolveStageOf(old)?.lead.kind).toBe('bottomFromHand');
    const placed = dispatch(old, { type: 'effectStep', ids: ['h1', 'h2'] });
    // The hand holds 2 cards: both go to the bottom.
    expect(placed.table.resolving).toBeNull();
    expect(lastText(placed)).toBe('Put 2 cards on the bottom of the draw deck, and These Are The Voyages went to the discard pile');
  });

  it('prints the old final entries as before', () => {
    const texts = (
      [
        { kind: 'resolveBottom', event: 'Miracle Working', count: 3 },
        { kind: 'resolveDiscardDraw', event: 'Days of Atonement', discarded: 'Tricorder', count: 2 },
        { kind: 'resolveDownloaded', event: 'Second Edition', personnel: 'Data', count: 1, removed: true },
        { kind: 'resolveExchanged', event: 'The Crossing', fromHand: 'Hal', fromTable: 'Cru', replaced: true },
      ] as const
    ).map((e) => ({ ...e, ...stamp }) as LogEntry);
    expect(texts.every((e) => isLogEntry(JSON.parse(JSON.stringify(e))))).toBe(true);
    expect(texts.map(logEntryText)).toEqual([
      'Put 3 cards on the bottom of the draw deck, and Miracle Working went to the discard pile',
      'Discarded Tricorder, drew 2 cards, and Days of Atonement went to the discard pile',
      'Downloaded Data (Second Edition), shuffled the draw deck, drew 1 card, and Second Edition was removed from the game',
      'Replaced Cru with Hal, Cru went to the discard pile, and The Crossing went to the discard pile',
    ]);
  });

  it('reads the old step names of a play record, and its next stage applies', () => {
    const tain = person('tain', 'Enabran Tain "Retired" Spymaster', 3);
    const t = table(null, [TRICORDER, PHASER, tain]);
    const played = dispatch(initialGameState(t), { type: 'move', id: 'tain', to: { zone: 'missionPile', missionIndex: 0, pile: 'awayTeam' } });
    const last = played.log[played.log.length - 1];
    if (last.kind !== 'move') throw new Error('no move');
    // The record as a save from before #1863 holds it, the draw step taken.
    const old: GameState = { ...played, log: [...played.log.slice(0, -1), { ...last, moves: [{ ...last.moves[0], effects: [{ steps: [{ step: 'draw', count: 0 }] }] }] }] };
    expect(pendingPlayEffectOf(old)?.stage.lead.kind).toBe('discardFromHand');
    const discarded = dispatch(old, { type: 'effectStep', ids: ['h1', 'h2'] });
    expect(pendingPlayEffectOf(discarded)).toBeNull();
    expect(lastText(discarded)).toMatch(/; drew 0 cards, then discarded Tricorder and Phaser$/);
  });
});

describe('a new order of existing steps is a data row (#1863)', () => {
  it('plays a "when you play" row of a discard, then a draw, in one stage that amends the play', () => {
    const t = table(null, [TRICORDER, PHASER, person('inv', 'Invented Discarder', 2)]);
    const played = dispatch(initialGameState(t), { type: 'move', id: 'inv', to: { zone: 'missionPile', missionIndex: 0, pile: 'awayTeam' } });
    expect(pendingPlayEffectOf(played)?.stage.steps.map((s) => s.kind)).toEqual(['discardFromHand', 'draw']);
    // No Skip of a first stage that is no "may" while the hand holds a card.
    expect(dispatch(played, { type: 'effectSkip' })).toBe(played);
    const after = dispatch(played, { type: 'effectStep', ids: ['h2'] });
    expect(after.table.hand.map((c) => c.id)).toEqual(['h1', 'd1', 'd2']);
    expect(after.log).toHaveLength(played.log.length);
    expect(lastText(after)).toMatch(/; discarded Phaser, drew 2 cards$/);
    expect(pendingPlayEffectOf(after)).toBeNull();
    expect(gameReducer(after, { type: 'undo' }).table.hand.map((c) => c.id)).toEqual(['h1', 'h2', 'inv']);
  });

  it('resolves an event row of a draw of up to 3, then a card to the bottom, one entry and one undo each', () => {
    const start = resolvingGame(table(event('ins', 'Invented Insight')));
    expect(resolveStageOf(start)?.lead).toEqual(drawUpTo(3, false));
    const drew = dispatch(start, { type: 'effectStep', count: 2 });
    expect(drew.table.hand.map((c) => c.id)).toEqual(['h1', 'h2', 'd1', 'd2']);
    expect(lastText(drew)).toBe('Drew 2 cards (Invented Insight)');
    expect(resolveStageOf(drew)?.lead).toEqual(bottomFromHand(1));
    const placed = dispatch(drew, { type: 'effectStep', ids: ['d1'] });
    expect(placed.table.resolving).toBeNull();
    expect(placed.table.drawDeck.map((c) => c.id).slice(-1)).toEqual(['d1']);
    expect(placed.table.discard.map((c) => c.id)).toEqual(['ins']);
    expect(lastText(placed)).toBe('Put 1 card on the bottom of the draw deck, and Invented Insight went to the discard pile');
    expect(isLogEntry(JSON.parse(JSON.stringify(placed.log[placed.log.length - 1])))).toBe(true);
    expect(gameReducer(placed, { type: 'undo' }).table).toBe(drew.table);
  });
});
