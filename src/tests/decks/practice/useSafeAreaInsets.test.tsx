import { renderHook } from '@testing-library/react';
import { insetsFromStyle, parseInsetPx, useSafeAreaInsets } from '../../../app/decks/practice/useSafeAreaInsets';

// Issue #1383: the safe-area insets, read from the computed paddings of a probe element.
describe('parseInsetPx', () => {
  it.each([
    ['34px', 34],
    ['21.5px', 21.5],
    ['0px', 0],
    ['', 0],
    ['env(safe-area-inset-bottom)', 0],
    [undefined, 0],
  ])('reads %p as %p', (value, expected) => {
    expect(parseInsetPx(value)).toBe(expected);
  });
});

describe('insetsFromStyle', () => {
  it('reads the four paddings', () => {
    expect(insetsFromStyle({ paddingTop: '0px', paddingRight: '47px', paddingBottom: '21px', paddingLeft: '' })).toEqual({
      top: 0,
      right: 47,
      bottom: 21,
      left: 0,
    });
  });
});

describe('useSafeAreaInsets', () => {
  it('gives 0 on every side in jsdom, and removes its probe on unmount', () => {
    const probe = () => document.querySelector('[data-testid="safe-area-probe"]');
    const { result, unmount } = renderHook(() => useSafeAreaInsets());
    expect(result.current).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    expect(probe()).not.toBeNull();
    unmount();
    expect(probe()).toBeNull();
  });
});
