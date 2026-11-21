import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { initialTableState, CardInstance, TableState, MISSION_SLOTS } from '../../../app/decks/practice/tableReducer';
import {
  GameState,
  gameReducer,
  initialGameState,
  isLogEntry,
  logEntryText,
  pendingPlayEffectOf,
  withShuffleOrders,
} from '../../../app/decks/practice/gameLog';
import { ResolvingPanel } from '../../../app/decks/practice/ResolvingPanel';
import {
  examineCount,
  examineTakeMax,
  examineTakeMin,
  examineTakes,
  ExamineTakeModel,
  playModelOf,
  playStepsOf,
} from '../../../lib/playModels';

// Issue #1809: the "when you play" kind "examine the top N, take one into hand, place the rest on the bottom",
// with Requisitions Drone, Lenara Kahn and Keiko O'Brien. With invented deck cards, and the real titles, the
// keys of their models.

const card = (id: string, row: Record<string, unknown>, extra: Partial<CardInstance> = {}): CardInstance => ({
  id,
  card: { collectorsinfo: id, imagefile: id, ...row } as CardInstance['card'],
  face: 'up',
  ...extra,
});
const deckCard = (id: string, type: string, cost: number, keywords = '') =>
  card(id, { type, name: `card ${id}`, originalName: `Card ${id}`, cost: String(cost), keywords }, { face: 'down' });
const personnel = (id: string, name: string) => card(id, { type: 'personnel', name: name.toLowerCase(), originalName: name, cost: '2' });
const DRONE = personnel('drone', 'Requisitions Drone');
const LENARA = personnel('lenara', 'Lenara Kahn Wormhole Theorist');
const KEIKO = personnel('keiko', "Keiko O'Brien Botanist");

// The top four: an equipment of cost 1, an event of cost 2, a personnel of cost 4, an interrupt of cost 0.
const DECK = [
  deckCard('d1', 'equipment', 1),
  deckCard('d2', 'event', 2),
  deckCard('d3', 'personnel', 4),
  deckCard('d4', 'interrupt', 0),
  deckCard('d5', 'event', 5),
  deckCard('d6', 'ship', 3),
];

const mission = (i: number) => card(`m${i}`, { type: 'mission', name: `mission ${i}`, originalName: `Mission ${i}`, missiontype: 'p', skills: '' });

function table(drawDeck: CardInstance[] = DECK): TableState {
  return {
    ...initialTableState,
    hand: [DRONE, LENARA, KEIKO],
    drawDeck,
    missions: Array.from({ length: MISSION_SLOTS }, (_, i) => ({ mission: mission(i), ships: [], awayTeam: [], underMission: [] })),
  };
}

const AWAY_TEAM = { zone: 'missionPile', missionIndex: 0, pile: 'awayTeam' } as const;
const dispatch = (game: GameState, action: Parameters<typeof withShuffleOrders>[1]): GameState =>
  gameReducer(game, withShuffleOrders(game.table, action, game.log));
const played = (id = 'drone', t: TableState = table()): GameState => dispatch(initialGameState(t), { type: 'move', id, to: AWAY_TEAM });
const lastText = (game: GameState) => logEntryText(game.log[game.log.length - 1]);
const ids = (cards: CardInstance[]) => cards.map((c) => c.id);
const model = (name: string) => playModelOf(name) as ExamineTakeModel;

describe('the examine models (#1809)', () => {
  it('Requisitions Drone, its *VP too, examines four and must take one of any card', () => {
    const drone = model('Requisitions Drone *VP');
    expect(drone).toMatchObject({ kind: 'examineTake', examine: 4, mustTake: true });
    expect(playStepsOf(drone)).toEqual([{ step: 'examine', may: true }]);
    expect(DECK.slice(0, 4).every((c) => examineTakes(drone, c.card))).toBe(true);
    expect(examineTakeMin(drone, DECK.slice(0, 4).map((c) => c.card), 1)).toBe(1);
  });

  it('Lenara Kahn takes only an event, and may take none', () => {
    const lenara = model('Lenara Kahn Wormhole Theorist');
    expect(DECK.slice(0, 4).filter((c) => examineTakes(lenara, c.card)).map((c) => c.id)).toEqual(['d2']);
    expect(examineTakeMin(lenara, DECK.map((c) => c.card), 1)).toBe(0);
  });

  it("Keiko O'Brien takes only a card with a cost of 4 or more", () => {
    const keiko = model("Keiko O'Brien Botanist");
    expect(DECK.filter((c) => examineTakes(keiko, c.card)).map((c) => c.id)).toEqual(['d3', 'd5']);
  });

  it('Harry Kim takes an interrupt or a Temporal card, and Sobi one card for each different Commodity of the core', () => {
    const kim = model('Harry Kim Remorseful Survivor');
    expect(examineTakes(kim, deckCard('x', 'interrupt', 1).card)).toBe(true);
    expect(examineTakes(kim, deckCard('x', 'event', 1, 'Temporal.').card)).toBe(true);
    expect(examineTakes(kim, deckCard('x', 'event', 1).card)).toBe(false);
    const sobi = model('Sobi Felicium Dealer');
    const commodity = (title: string) => ({ title, type: 'event', keywords: ['commodity'], cost: 0 });
    expect(examineTakeMax(sobi, { coreCards: [commodity('Felicium'), commodity('Felicium'), commodity('Tulaberry Wine')] })).toBe(2);
    expect(examineTakeMax(sobi, {})).toBe(0);
  });

  it('a deck shorter than four examines what it holds', () => {
    expect(examineCount(model('Requisitions Drone'), 2)).toBe(2);
    expect(examineCount(model('Requisitions Drone'), 0)).toBe(0);
  });
});

describe('the examine step (#1809)', () => {
  it('a play of Requisitions Drone leaves it in the away team with its examine pending', () => {
    const game = played();
    expect(ids(game.table.missions[0].awayTeam)).toEqual(['drone']);
    expect(pendingPlayEffectOf(game)).toMatchObject({ id: 'drone', step: { step: 'examine' } });
  });

  it('take one and order the rest: the card goes to the hand, the rest to the bottom in order, one entry, one undo', () => {
    const start = played();
    const before = start.undo[start.undo.length - 1];
    const done = dispatch(start, { type: 'playEffectExamine', take: ['d2'], bottom: ['d4', 'd1', 'd3'] });
    expect(done.log).toHaveLength(1);
    expect(ids(done.table.hand)).toEqual(['lenara', 'keiko', 'd2']);
    expect(done.table.hand[2].face).toBe('up');
    expect(ids(done.table.drawDeck)).toEqual(['d5', 'd6', 'd4', 'd1', 'd3']);
    expect(pendingPlayEffectOf(done)).toBeNull();
    expect(lastText(done)).toBe('Played Requisitions Drone at Mission 0 (cost 2); took Card d2, placed 3 on the bottom');
    expect(isLogEntry(JSON.parse(JSON.stringify(done.log[0])))).toBe(true);

    const undone = gameReducer(done, { type: 'undo' });
    expect(undone.table).toBe(before);
    expect(ids(undone.table.hand)).toEqual(['drone', 'lenara', 'keiko']);
    expect(ids(undone.table.drawDeck)).toEqual(ids(DECK));
  });

  it('Skip leaves the draw deck as it was, in one entry', () => {
    const start = played();
    const skipped = dispatch(start, { type: 'playEffectSkip' });
    expect(skipped.log).toHaveLength(1);
    expect(skipped.table.drawDeck).toBe(start.table.drawDeck);
    expect(lastText(skipped)).toBe('Played Requisitions Drone at Mission 0 (cost 2); skipped its play text');
  });

  it('a deck shorter than four examines what it holds', () => {
    const start = played('drone', table(DECK.slice(0, 2)));
    const done = dispatch(start, { type: 'playEffectExamine', take: ['d1'], bottom: ['d2'] });
    expect(ids(done.table.drawDeck)).toEqual(['d2']);
    expect(lastText(done)).toContain('; took Card d1, placed 1 on the bottom');
  });

  it('refuses a card the test does not allow, a missing take for the Drone, two takes and a wrong set of cards', () => {
    const lenara = played('lenara');
    expect(gameReducer(lenara, { type: 'playEffectExamine', take: ['d1'], bottom: ['d2', 'd3', 'd4'] })).toBe(lenara);
    const none = gameReducer(lenara, { type: 'playEffectExamine', take: [], bottom: ['d4', 'd3', 'd2', 'd1'] });
    expect(ids(none.table.drawDeck)).toEqual(['d5', 'd6', 'd4', 'd3', 'd2', 'd1']);
    expect(lastText(none)).toContain('; took no card, placed 4 on the bottom');

    const drone = played();
    expect(gameReducer(drone, { type: 'playEffectExamine', take: [], bottom: ['d1', 'd2', 'd3', 'd4'] })).toBe(drone);
    expect(gameReducer(drone, { type: 'playEffectExamine', take: ['d1', 'd2'], bottom: ['d3', 'd4'] })).toBe(drone);
    expect(gameReducer(drone, { type: 'playEffectExamine', take: ['d1'], bottom: ['d2', 'd3', 'd5'] })).toBe(drone);
    expect(gameReducer(drone, { type: 'playEffectExamine', take: ['d1'], bottom: ['d2', 'd3'] })).toBe(drone);

    const keiko = played('keiko');
    expect(gameReducer(keiko, { type: 'playEffectExamine', take: ['d2'], bottom: ['d1', 'd3', 'd4'] })).toBe(keiko);
    expect(ids(gameReducer(keiko, { type: 'playEffectExamine', take: ['d3'], bottom: ['d1', 'd2', 'd4'] }).table.hand)).toContain('d3');
  });
});

describe('the examine panel (#1809)', () => {
  it('takes one allowed card, orders the rest, and applies both', () => {
    const onApply = jest.fn();
    const lenara = model('Lenara Kahn Wormhole Theorist');
    const examined = DECK.slice(0, 4);
    render(
      <DndContext>
        <ResolvingPanel
          instance={LENARA}
          hidden={false}
          escapeActive={false}
          onViewTable={jest.fn()}
          step={{ step: 'examineTake', examined, min: 0, max: 1, takes: (c) => examineTakes(lenara, c.card), testText: 'an event', onApply }}
          played={{ text: lenara.text, condition: null, started: false, onEnd: jest.fn() }}
        />
      </DndContext>
    );
    const cards = screen.getAllByTestId('resolve-examine-card');
    expect(cards.map((c) => c.hasAttribute('disabled'))).toEqual([true, false, true, true]);
    expect(screen.getByTestId('resolve-examine-apply')).toHaveTextContent('Place 4 on bottom');
    fireEvent.click(cards[1]);
    expect(screen.getAllByTestId('resolve-order-card').map((c) => c.getAttribute('data-card-choice'))).toEqual(['d1', 'd3', 'd4']);
    fireEvent.click(screen.getAllByTestId('resolve-order-down')[0]);
    fireEvent.click(screen.getByTestId('resolve-examine-apply'));
    expect(onApply).toHaveBeenCalledWith(['d2'], ['d3', 'd1', 'd4']);
  });

  it('a "take one" disables the button until a card is taken', () => {
    const drone = model('Requisitions Drone');
    render(
      <DndContext>
        <ResolvingPanel
          instance={DRONE}
          hidden={false}
          escapeActive={false}
          onViewTable={jest.fn()}
          step={{ step: 'examineTake', examined: DECK.slice(0, 2), min: 1, max: 1, takes: () => true, onApply: jest.fn() }}
          played={{ text: drone.text, condition: null, started: false, onEnd: jest.fn() }}
        />
      </DndContext>
    );
    expect(screen.getByTestId('resolve-examine-apply')).toBeDisabled();
    fireEvent.click(screen.getAllByTestId('resolve-examine-card')[0]);
    expect(screen.getByTestId('resolve-examine-apply')).toHaveTextContent('Take 1, place 1 on bottom');
    expect(screen.getByTestId('resolve-examine-apply')).toBeEnabled();
  });
});
