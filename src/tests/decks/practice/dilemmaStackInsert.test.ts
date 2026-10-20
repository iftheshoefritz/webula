// #956: the insertion mark of a reorder drag in the dilemma stack's panel must show where the
// drop puts the card. Each case checks the slot the helper predicts against the index the
// dragged card has after the reducer's own `reorder`.
import { initialTableState, tableReducer, CardInstance } from '../../../app/decks/practice/tableReducer';
import {
  DILEMMA_STACK_ROW_END,
  dilemmaStackInsertPoint,
  dilemmaStackRowInsertPoint,
  dilemmaStackRowSlotId,
  dilemmaStackRowTarget,
} from '../../../app/decks/practice/dilemmaStackInsert';

const ids = ['d0', 'd1', 'd2', 'd3', 'd4'];
const stack = ids.map(
  (id) => ({ id, card: { collectorsinfo: id, name: id }, face: 'down', stopped: false }) as unknown as CardInstance
);

const indexAfterDrop = (id: string, overId: string) =>
  tableReducer({ ...initialTableState, dilemmaStack: stack }, { type: 'reorder', zone: 'dilemmaStack', id, overId })
    .dilemmaStack.map((c) => c.id)
    .indexOf(id);

describe('dilemmaStackInsertPoint (#956)', () => {
  it.each([
    ['a move to the right', 'd1', 'd3', 4],
    ['a move to the left', 'd3', 'd1', 1],
    ['a move to the first card', 'd4', 'd0', 0],
    ['a move to the last card', 'd0', 'd4', 5],
    ['a move one place right', 'd2', 'd3', 4],
    ['a move one place left', 'd2', 'd1', 1],
  ])('agrees with the reducer on %s', (_, activeId, overId, boundary) => {
    const point = dilemmaStackInsertPoint(ids, activeId, overId);

    expect(point).toEqual({ slot: indexAfterDrop(activeId, overId), boundary });
  });

  it('marks nothing over the dragged card itself', () => {
    expect(dilemmaStackInsertPoint(ids, 'd2', 'd2')).toBeNull();
  });

  it('marks nothing for an id outside the stack', () => {
    expect(dilemmaStackInsertPoint(ids, 'd2', 'core')).toBeNull();
    expect(dilemmaStackInsertPoint(ids, 'x', 'd2')).toBeNull();
  });

  it('marks nothing with no drag or no over', () => {
    expect(dilemmaStackInsertPoint(ids, null, 'd2')).toBeNull();
    expect(dilemmaStackInsertPoint(ids, 'd2', null)).toBeNull();
  });
});

// #1204: the face-up row of the dilemma choice. Its targets carry ids of their own, and a card
// from outside the stack goes in before the card it is over, or last on the end.
describe('dilemmaStackRowInsertPoint (#1204)', () => {
  const slot = dilemmaStackRowSlotId;

  it('reads a card or the end out of a target id, and nothing out of any other id', () => {
    expect(dilemmaStackRowTarget(slot('d2'))).toEqual({ cardId: 'd2' });
    expect(dilemmaStackRowTarget(DILEMMA_STACK_ROW_END)).toBe('end');
    expect(dilemmaStackRowTarget('d2')).toBeNull();
    expect(dilemmaStackRowTarget(null)).toBeNull();
  });

  it('moves a card of the stack as the panel does', () => {
    expect(dilemmaStackRowInsertPoint(ids, 'd1', slot('d3'))).toEqual(dilemmaStackInsertPoint(ids, 'd1', 'd3'));
    expect(dilemmaStackRowInsertPoint(ids, 'd3', slot('d1'))).toEqual(dilemmaStackInsertPoint(ids, 'd3', 'd1'));
    expect(dilemmaStackRowInsertPoint(ids, 'd2', slot('d2'))).toBeNull();
  });

  it('moves a card of the stack last on the end, or on the zone', () => {
    expect(dilemmaStackRowInsertPoint(ids, 'd1', DILEMMA_STACK_ROW_END)).toEqual({ slot: 4, boundary: 5 });
    expect(dilemmaStackRowInsertPoint(ids, 'd1', 'dilemmaStack')).toEqual({ slot: 4, boundary: 5 });
    expect(dilemmaStackRowInsertPoint(ids, 'd4', DILEMMA_STACK_ROW_END)).toBeNull();
  });

  it('puts a card from outside before the card it is over', () => {
    expect(dilemmaStackRowInsertPoint(ids, 'x', slot('d0'))).toEqual({ slot: 0, boundary: 0 });
    expect(dilemmaStackRowInsertPoint(ids, 'x', slot('d3'))).toEqual({ slot: 3, boundary: 3 });
  });

  it('puts a card from outside last on the end, or on the zone', () => {
    expect(dilemmaStackRowInsertPoint(ids, 'x', DILEMMA_STACK_ROW_END)).toEqual({ slot: 5, boundary: 5 });
    expect(dilemmaStackRowInsertPoint(ids, 'x', 'dilemmaStack')).toEqual({ slot: 5, boundary: 5 });
    expect(dilemmaStackRowInsertPoint([], 'x', 'dilemmaStack')).toEqual({ slot: 0, boundary: 0 });
  });

  it('marks nothing over another target, or with no drag', () => {
    expect(dilemmaStackRowInsertPoint(ids, 'x', 'core')).toBeNull();
    expect(dilemmaStackRowInsertPoint(ids, 'x', 'd2')).toBeNull();
    expect(dilemmaStackRowInsertPoint(ids, 'x', null)).toBeNull();
    expect(dilemmaStackRowInsertPoint(ids, null, slot('d2'))).toBeNull();
  });
});
