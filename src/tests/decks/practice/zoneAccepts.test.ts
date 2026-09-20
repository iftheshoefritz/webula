import { highlightState } from '../../../app/decks/practice/zoneAccepts';

// A browser drag's collision detection (`pointerWithin`/`rectIntersection` in page.tsx) is purely
// geometric: the pointer can sit over a zone's rectangle while dragging a card type that zone
// rejects. Issue #644's acceptance check caught this for the closed dilemma hand — a personnel
// card dragged over it must not highlight the hand as a valid drop target, even though `isOver`
// is true for it. A real browser drag is the only way to hold the pointer still over a zone
// (`AGENTS.md`'s "mid-drag" technique), so this exercises `highlightState` directly instead.
describe('highlightState', () => {
  it('shows no highlight when the pointer is over a zone that rejects the dragged type', () => {
    expect(highlightState('dilemmaHand', 'personnel', true)).toBeUndefined();
    expect(highlightState('brig', 'ship', true)).toBeUndefined();
  });

  it('shows "over" when the pointer is over a zone that accepts the dragged type', () => {
    expect(highlightState('dilemmaHand', 'dilemma', true)).toBe('over');
    expect(highlightState('hand', 'personnel', true)).toBe('over');
  });

  it('shows "valid" when the zone accepts the dragged type but the pointer is elsewhere', () => {
    expect(highlightState('dilemmaHand', 'dilemma', false)).toBe('valid');
  });

  it('shows no highlight when the zone rejects the dragged type and the pointer is elsewhere', () => {
    expect(highlightState('dilemmaHand', 'personnel', false)).toBeUndefined();
  });
});
