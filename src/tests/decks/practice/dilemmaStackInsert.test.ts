// #956: the insertion mark of a reorder drag in the dilemma stack's panel must show where the
// drop puts the card. Each case checks the slot the helper predicts against the index the
// dragged card has after the reducer's own `reorderDilemmaStack`.
import { initialTableState, tableReducer, CardInstance } from '../../../app/decks/practice/tableReducer';
import { dilemmaStackInsertPoint } from '../../../app/decks/practice/dilemmaStackInsert';

const ids = ['d0', 'd1', 'd2', 'd3', 'd4'];
const stack = ids.map(
  (id) => ({ id, card: { collectorsinfo: id, name: id }, face: 'down', stopped: false }) as unknown as CardInstance
);

const indexAfterDrop = (id: string, overId: string) =>
  tableReducer({ ...initialTableState, dilemmaStack: stack }, { type: 'reorderDilemmaStack', id, overId })
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
