import {
  PREVIEW_MAX_HEIGHT,
  previewEnlarges,
  previewEnlargesElement,
  previewHeightFor,
  wholeCardHeight,
} from '../../../app/decks/practice/previewSize';
import { fullCardHeight } from '../../../app/decks/practice/viewerCardSize';
import { FINE_POINTER_QUERY } from '../../../app/decks/practice/useFinePointer';

// #1458: on a desktop a preview opens only when it is clearly larger than the card on the screen.
describe('previewEnlarges (#1458)', () => {
  it('opens a 499 px preview over a 214 px wide art crop', () => {
    expect(previewEnlarges({ width: 214, height: 190 }, 499, true)).toBe(true);
  });

  it('opens none over a whole card 600 px tall', () => {
    expect(previewEnlarges({ width: 431, height: 600 }, 499, true)).toBe(false);
  });

  it('opens none over a card exactly at the threshold', () => {
    const height = 400; // 400 x 1.25 = 500
    expect(previewEnlarges({ width: 287, height }, 500, true)).toBe(false);
    expect(previewEnlarges({ width: 287, height: height - 1 }, 500, true)).toBe(true);
  });

  it('measures an art crop as the whole card at its width', () => {
    expect(wholeCardHeight({ width: 300, height: 260 })).toBe(fullCardHeight(300));
    // A crop 300 px wide stands for a card 418 px tall: 418 x 1.25 is more than 499.
    expect(previewEnlarges({ width: 300, height: 260 }, 499, true)).toBe(false);
  });

  it('measures a turned mission by its long side', () => {
    expect(wholeCardHeight({ width: 370, height: 266, turned: true })).toBe(370);
    expect(previewEnlarges({ width: 370, height: 266, turned: true }, 499, true)).toBe(true);
    expect(previewEnlarges({ width: 420, height: 302, turned: true }, 499, true)).toBe(false);
  });

  it('always opens one with a coarse pointer', () => {
    expect(previewEnlarges({ width: 431, height: 600 }, 499, false)).toBe(true);
    expect(previewEnlarges({ width: 2000, height: 2000 }, 10, false)).toBe(true);
  });

  it('caps the desktop preview at 499 px, and 90% of a short window', () => {
    expect(PREVIEW_MAX_HEIGHT).toBe(499);
    expect(previewHeightFor(1080, true)).toBe(499);
    expect(previewHeightFor(500, true)).toBe(450);
    expect(previewHeightFor(1080, false)).toBe(972);
  });
});

describe('previewEnlargesElement (#1458)', () => {
  const original = window.matchMedia;
  afterEach(() => {
    (window as { matchMedia?: typeof window.matchMedia }).matchMedia = original;
  });

  function setFinePointer(fine: boolean) {
    (window as { matchMedia?: typeof window.matchMedia }).matchMedia = ((query: string) => ({
      matches: query === FINE_POINTER_QUERY && fine,
    })) as unknown as typeof window.matchMedia;
  }

  function element(w: number, h: number, rect: { width: number; height: number }) {
    const el = document.createElement('div');
    Object.defineProperty(el, 'offsetWidth', { value: w });
    Object.defineProperty(el, 'offsetHeight', { value: h });
    el.getBoundingClientRect = () => ({ ...rect, x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0 }) as DOMRect;
    return el;
  }

  it('reads a turned card from its layout size and its rectangle', () => {
    setFinePointer(true);
    // A mission card 200 x 279, turned and scaled by 1.5: its long side, 418, is too large.
    expect(previewEnlargesElement(element(200, 279, { width: 418.5, height: 300 }))).toBe(false);
    // The same rectangle upright would be a crop 418 px wide, larger still; a small turned card opens one.
    expect(previewEnlargesElement(element(200, 279, { width: 279, height: 200 }))).toBe(true);
  });

  it('opens one over a large card with a coarse pointer, and over an element with no layout', () => {
    setFinePointer(false);
    expect(previewEnlargesElement(element(431, 600, { width: 431, height: 600 }))).toBe(true);
    setFinePointer(true);
    expect(previewEnlargesElement(element(0, 0, { width: 0, height: 0 }))).toBe(true);
    expect(previewEnlargesElement(element(431, 600, { width: 431, height: 600 }))).toBe(false);
  });
});
