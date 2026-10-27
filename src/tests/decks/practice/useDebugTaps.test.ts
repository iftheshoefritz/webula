import { renderHook } from '@testing-library/react';
import { DEBUG_TAPS_KEY, useDebugTaps } from '../../../app/decks/practice/TapDebugOverlay';

describe('useDebugTaps (#1155, #1308)', () => {
  beforeEach(() => localStorage.clear());

  it('turns on and stores the choice for debugTaps=1 on empty storage', () => {
    const { result } = renderHook(() => useDebugTaps('1'));
    expect(result.current).toBe(true);
    expect(localStorage.getItem(DEBUG_TAPS_KEY)).toBe('1');
  });

  it('turns off and forgets the choice for debugTaps=0 with the key stored', () => {
    localStorage.setItem(DEBUG_TAPS_KEY, '1');
    const { result } = renderHook(() => useDebugTaps('0'));
    expect(result.current).toBe(false);
    expect(localStorage.getItem(DEBUG_TAPS_KEY)).toBeNull();
  });

  it('keeps the stored choice with no parameter', () => {
    localStorage.setItem(DEBUG_TAPS_KEY, '1');
    expect(renderHook(() => useDebugTaps(null)).result.current).toBe(true);
    localStorage.clear();
    expect(renderHook(() => useDebugTaps(null)).result.current).toBe(false);
  });

  it('follows a change of the parameter', () => {
    const { result, rerender } = renderHook(({ param }) => useDebugTaps(param), {
      initialProps: { param: '1' as string | null },
    });
    expect(result.current).toBe(true);
    rerender({ param: '0' });
    expect(result.current).toBe(false);
  });
});
