import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { initialTableState, CardInstance, TableState, MISSION_SLOTS } from '../../../app/decks/practice/tableReducer';
import {
  GameAction,
  GameState,
  gameReducer,
  initialGameState,
  isLogEntry,
  logEntryText,
  pendingDiscountsOf,
  turnCharges,
  withShuffleOrders,
} from '../../../app/decks/practice/gameLog';
import { costFactsOf } from '../../../app/decks/practice/costFacts';
import { costModelOf } from '../../../lib/costModels/registry';
import { isDownloadChoice } from '../../../lib/costModels/model';
import { DownloadChoicePanel } from '../../../app/decks/practice/DownloadChoicePanel';

// Issue #1762: K'mtar's play, while each non-headquarters mission of the player requires Diplomacy, offers a
// download of up to two events of the draw deck; each leaves a pending discount of −3 for its own play.
// With invented missions and events.

const card = (id: string, row: Record<string, unknown>, extra: Partial<CardInstance> = {}): CardInstance => ({
  id,
  card: { collectorsinfo: id, imagefile: id, ...row } as CardInstance['card'],
  face: 'up',
  ...extra,
});
const mission = (id: string, type: string, skills: string) =>
  card(id, { type: 'mission', name: `mission ${id}`, originalName: `Mission ${id}`, missiontype: type, skills });
const event = (id: string, cost: number) =>
  card(id, { type: 'event', name: `event ${id}`, originalName: `Event ${id}`, cost: String(cost) }, { face: 'down' });
const KMTAR = card('k', { type: 'personnel', name: "alexander rozhenko k'mtar", originalName: "Alexander Rozhenko K'mtar", cost: '4', affiliation: 'klingon' });
const TRICORDER = card('t', { type: 'equipment', name: 'tricorder', originalName: 'Tricorder', cost: '1' }, { face: 'down' });

const DIPLOMACY = [
  mission('m0', 'Planet', '2 Diplomacy, Honor, and Cunning>30'),
  mission('m1', 'Headquarters', ''),
  mission('m2', 'Space', 'Diplomacy and Navigation or Leadership'),
];

function table(missions = DIPLOMACY): TableState {
  return {
    ...initialTableState,
    hand: [KMTAR],
    drawDeck: [event('e1', 3), TRICORDER, event('e2', 2), event('e3', 1)],
    missions: Array.from({ length: MISSION_SLOTS }, (_, i) => ({ mission: missions[i] ?? null, ships: [], awayTeam: [], underMission: [] })),
  };
}

const play = (state: GameState, ...actions: GameAction[]) => actions.reduce((s, a) => gameReducer(s, withShuffleOrders(s.table, a, s.log)), state);
const toAway: GameAction = { type: 'move', id: 'k', to: { zone: 'missionPile', missionIndex: 0, pile: 'awayTeam' } };
const target = { entry: 0, move: 0, card: 0 };
const download = (ids: string[], order?: string[]): GameAction => ({ type: 'downloadForCharge', ids, source: "K'mtar", target, ...(order ? { order } : {}) });
const toCore = (id: string): GameAction => ({ type: 'move', id, to: 'core' });

describe("the K'mtar model (#1762)", () => {
  const cost = (missions: CardInstance[]) => costModelOf("Alexander Rozhenko K'mtar")!.playCost!({ type: 'personnel', printed: 4 }, costFactsOf(table(missions)));

  it('offers the download while each non-headquarters mission requires Diplomacy, an "or" too, empty slots skipped', () => {
    expect(cost(DIPLOMACY)).toEqual({
      cost: 4,
      reason: 'each non-headquarters mission requires Diplomacy',
      choice: { label: 'Download up to 2 events…', download: 'event', max: 2, discount: 3 },
    });
    expect(cost([mission('m0', 'Space', 'Navigation or Diplomacy')])).not.toBeNull();
  });

  it('offers nothing when a non-headquarters mission does not require Diplomacy', () => {
    expect(cost([...DIPLOMACY, mission('m3', 'Planet', 'Medical and Science')])).toBeNull();
    const state = play(initialGameState(table([mission('m0', 'Planet', 'Medical')])), toAway);
    expect(turnCharges(state.log, 1)[0]).toMatchObject({ cost: 4 });
    expect(turnCharges(state.log, 1)[0].source).toBeUndefined();
  });

  it('reads a malformed choice as no choice', () => {
    expect(isDownloadChoice({ label: 'x', download: 'event', max: 0, discount: 3 })).toBe(false);
    expect(isDownloadChoice({ label: 'x', download: 'card', max: 2, discount: 3 })).toBe(false);
  });
});

describe("K'mtar's download (#1762)", () => {
  const played = () => play(initialGameState(table()), toAway);

  it('moves the chosen events to the hand and shuffles in the carried order, in one entry and one undo', () => {
    const before = played();
    expect(turnCharges(before.log, 1)[0]).toMatchObject({ cost: 4, source: { title: "K'mtar" } });
    const after = play(before, download(['e1', 'e3'], ['e2', 't']));
    expect(after.table.hand.map((c) => c.id)).toEqual(['e1', 'e3']);
    expect(after.table.drawDeck.map((c) => c.id)).toEqual(['e2', 't']);
    expect(after.log).toHaveLength(2);
    expect(logEntryText(after.log[1])).toBe("Downloaded Event e1 and Event e3 (K'mtar), then shuffled the draw deck");
    expect(isLogEntry(JSON.parse(JSON.stringify(after.log[1])))).toBe(true);
    expect(turnCharges(after.log, 1)[0].choiceTaken).toBe(true);

    const undone = play(after, { type: 'undo' });
    expect(undone.table).toBe(before.table);
    expect(turnCharges(undone.log, 1)[0].choiceTaken).toBeUndefined();
  });

  it('chooses the shuffle on the page: an order of the draw deck less the chosen', () => {
    const state = played();
    const action = withShuffleOrders(state.table, download(['e1']), state.log);
    expect(action.type === 'downloadForCharge' && [...action.order!].sort()).toEqual(['e2', 'e3', 't']);
  });

  it('refuses no card, 3 cards, a repeat, a non-event, a card not in the deck, a wrong source, a second download', () => {
    const state = played();
    for (const ids of [[], ['e1', 'e2', 'e3'], ['e1', 'e1'], ['t'], ['k']]) expect(play(state, download(ids))).toBe(state);
    expect(play(state, { ...download(['e1']), source: 'Another' } as GameAction)).toBe(state);
    expect(play(state, { ...download(['e1']), target: { entry: 0, move: 0, card: 1 } } as GameAction)).toBe(state);
    const once = play(state, download(['e1']));
    expect(play(once, download(['e2']))).toBe(once);
    const plain = play(initialGameState(table([mission('m0', 'Planet', 'Medical')])), toAway);
    expect(play(plain, download(['e1']))).toBe(plain);
  });

  it('leaves one discount of −3 per card, each for that card alone, never below 0', () => {
    const after = play(played(), download(['e1', 'e3']));
    expect(pendingDiscountsOf(after.log, 1)).toEqual([
      expect.objectContaining({ title: "K'mtar", label: 'downloaded Event e1', amount: 3, origin: { entry: 1, card: 0 } }),
      expect.objectContaining({ title: "K'mtar", label: 'downloaded Event e3', amount: 3, origin: { entry: 1, card: 1 } }),
    ]);
    const e3 = play(after, toCore('e3'));
    expect(turnCharges(e3.log, 1)[1]).toMatchObject({ cost: 0, source: { title: "K'mtar", discount: { entry: 1, card: 1 } } });
    expect(pendingDiscountsOf(e3.log, 1).map((d) => d.label)).toEqual(['downloaded Event e1']);
    const e1 = play(e3, toCore('e1'));
    expect(turnCharges(e1.log, 1)[2]).toMatchObject({ cost: 0 });
    expect(pendingDiscountsOf(e1.log, 1)).toEqual([]);
  });

  it('gives no discount to another event, closes one by a dismiss, and none in the next turn', () => {
    const after = play(played(), download(['e1']));
    const drawn = { ...after, table: { ...after.table, hand: [...after.table.hand, event('x', 2)] } };
    const other = play(drawn, toCore('x'));
    expect(turnCharges(other.log, 1)[1]).toMatchObject({ cost: 2 });
    expect(turnCharges(other.log, 1)[1].source).toBeUndefined();
    const dismissed = play(after, { type: 'dismissDiscount', target: { entry: 1, card: 0 } });
    expect(pendingDiscountsOf(dismissed.log, 1)).toEqual([]);
    expect(logEntryText(dismissed.log[2])).toBe("Dismissed the discount of K'mtar");
    const next = play(after, { type: 'nextTurn' });
    expect(pendingDiscountsOf(next.log, next.table.turn)).toEqual([]);
  });

  it('reads a malformed entry with its defaults', () => {
    const entry = { kind: 'eventsDownloaded', cards: [{ id: 3 }], turn: 1, segment: 'playAndDraw' } as unknown as GameState['log'][number];
    expect(logEntryText(entry)).toBe('Downloaded no card, then shuffled the draw deck');
    expect(pendingDiscountsOf([entry], 1)).toEqual([]);
  });
});

describe('the download picker (#1762)', () => {
  const cards = [event('e1', 3), event('e2', 2), event('e3', 1)].map((c) => ({ ...c, face: 'up' as const }));

  it('allows at most 2, and confirms the chosen ids', () => {
    const onConfirm = jest.fn();
    render(<DownloadChoicePanel title="K'mtar" label="Download up to 2 events…" cards={cards} max={2} discount={3} onConfirm={onConfirm} onClose={jest.fn()} />);
    const confirm = screen.getByTestId('download-choice-confirm');
    expect(confirm).toBeDisabled();
    const rows = screen.getAllByTestId('download-choice-card');
    fireEvent.click(rows[0]);
    fireEvent.click(rows[2]);
    expect(rows[1]).toBeDisabled();
    expect(screen.getByTestId('download-choice-summary')).toHaveTextContent('2 of 2 chosen; each plays at cost −3 this turn');
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith(['e1', 'e3']);
  });

  it('cancels with no change', () => {
    const onClose = jest.fn();
    render(<DownloadChoicePanel title="K'mtar" label="x" cards={[]} max={2} discount={3} onConfirm={jest.fn()} onClose={onClose} />);
    expect(screen.getByText('No event in the draw deck.')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('download-choice-cancel'));
    expect(onClose).toHaveBeenCalled();
  });
});
