import React from 'react';
import { act, render, renderHook, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { useIsClient, useMediaQuery } from '../../hooks/useMediaQuery';

const QUERY = '(max-width: 639px)';

function setMatchMedia(value: unknown) {
  (window as { matchMedia?: unknown }).matchMedia = value;
}

function mockMatchMedia(initial: boolean) {
  const listeners: (() => void)[] = [];
  const state = { matches: initial };
  setMatchMedia((query: string) => ({
    matches: query === QUERY && state.matches,
    media: query,
    addEventListener: (_: string, l: () => void) => listeners.push(l),
    removeEventListener: (_: string, l: () => void) => listeners.splice(listeners.indexOf(l), 1),
  }));
  return { listeners, state };
}

function Probe({ serverValue }: { serverValue: boolean | null }) {
  return <span data-testid="value">{String(useMediaQuery(QUERY, serverValue))}</span>;
}

describe('useMediaQuery (#1308)', () => {
  const original = window.matchMedia;
  afterEach(() => setMatchMedia(original));

  it('reads the query and follows a change', () => {
    const { listeners, state } = mockMatchMedia(true);
    render(<Probe serverValue={false} />);
    expect(screen.getByTestId('value')).toHaveTextContent('true');
    state.matches = false;
    act(() => listeners.forEach((l) => l()));
    expect(screen.getByTestId('value')).toHaveTextContent('false');
    state.matches = true;
    act(() => listeners.forEach((l) => l()));
    expect(screen.getByTestId('value')).toHaveTextContent('true');
  });

  it('is false when the browser has no matchMedia', () => {
    setMatchMedia(undefined);
    const { result } = renderHook(() => useMediaQuery(QUERY, null));
    expect(result.current).toBe(false);
  });

  it('does not throw on a MediaQueryList with no addEventListener', () => {
    setMatchMedia(() => ({ matches: true }));
    const { result, unmount } = renderHook(() => useMediaQuery(QUERY, false));
    expect(result.current).toBe(true);
    expect(() => unmount()).not.toThrow();
  });

  it('returns the server value in a server render', () => {
    mockMatchMedia(true);
    expect(renderToString(<Probe serverValue={false} />)).toContain('>false<');
    expect(renderToString(<Probe serverValue={null} />)).toContain('>null<');
  });
});

describe('useIsClient (#1308)', () => {
  function ClientProbe() {
    return <span>{String(useIsClient())}</span>;
  }

  it('is false in a server render and true on the client', () => {
    expect(renderToString(<ClientProbe />)).toContain('>false<');
    const { result } = renderHook(() => useIsClient());
    expect(result.current).toBe(true);
  });
});
