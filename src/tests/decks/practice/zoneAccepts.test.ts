import { dragPlayPlaces, highlightState, playPlaceEligible } from '../../../app/decks/practice/zoneAccepts';

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

// #1856: the play places of a hand card turn `valid` into `eligible` or `dimmed` on a play-place target.
describe('highlightState with play places', () => {
  const places = { awayTeams: new Set([2]), crews: new Set(['ship-a']), shipRows: new Set([3]) };

  it('shows "eligible" on an eligible target, "dimmed" on any other, and "over" under the pointer on both', () => {
    expect(highlightState('mission', 'personnel', false, true)).toBe('eligible');
    expect(highlightState('mission', 'personnel', false, false)).toBe('dimmed');
    expect(highlightState('mission', 'personnel', true, false)).toBe('over');
    expect(highlightState('mission', 'personnel', true, true)).toBe('over');
  });

  it('keeps the highlight of before with no play places', () => {
    expect(highlightState('mission', 'personnel', false, undefined)).toBe('valid');
    expect(highlightState('shipRow', 'personnel', false, false)).toBeUndefined();
  });

  it('asks the away teams and crews for a personnel or an equipment, the ship rows for a ship', () => {
    expect(playPlaceEligible(places, 'personnel', { kind: 'mission', slot: 2 })).toBe(true);
    expect(playPlaceEligible(places, 'equipment', { kind: 'mission', slot: 0 })).toBe(false);
    expect(playPlaceEligible(places, 'personnel', { kind: 'ship', slot: 0, shipId: 'ship-a' })).toBe(true);
    expect(playPlaceEligible(places, 'personnel', { kind: 'ship', slot: 3, shipId: 'ship-b' })).toBe(false);
    expect(playPlaceEligible(places, 'ship', { kind: 'mission', slot: 3 })).toBe(true);
    expect(playPlaceEligible(places, 'ship', { kind: 'ship', slot: 3, shipId: 'ship-b' })).toBe(true);
    expect(playPlaceEligible(places, 'ship', { kind: 'shipRow', slot: 2 })).toBe(false);
  });

  it('names no play places when the model gives none, so the core and the discard never dim', () => {
    expect(playPlaceEligible(null, 'personnel', { kind: 'mission', slot: 2 })).toBeUndefined();
    expect(dragPlayPlaces(null)).toBeNull();
    expect(dragPlayPlaces({ awayTeams: new Set(), crews: new Set(), shipRows: new Set() })).toBeNull();
    expect(dragPlayPlaces(places)).toBe(places);
    expect(highlightState('core', 'personnel', false)).toBe('valid');
    expect(highlightState('discard', 'ship', false)).toBe('valid');
  });
});
