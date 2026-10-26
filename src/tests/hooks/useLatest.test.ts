import { renderHook } from '@testing-library/react';
import { useLatest } from '../../hooks/useLatest';

describe('useLatest', () => {
  it('returns the same ref on every render, holding the latest value', () => {
    const { result, rerender } = renderHook(({ value }) => useLatest(value), { initialProps: { value: 1 } });
    const first = result.current;
    expect(first.current).toBe(1);
    rerender({ value: 2 });
    expect(result.current).toBe(first);
    expect(first.current).toBe(2);
  });

  it('keeps the last value after unmount', () => {
    const { result, rerender, unmount } = renderHook(({ value }) => useLatest(value), { initialProps: { value: 'a' } });
    rerender({ value: 'b' });
    const ref = result.current;
    unmount();
    expect(ref.current).toBe('b');
  });
});
