import React, { act } from 'react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import { render, screen } from '@testing-library/react';
import useLocalStorage from '../../hooks/useLocalStorage';

const seen: string[] = [];

function Title() {
  const [title] = useLocalStorage<string>('deckTitle', '');
  seen.push(title);
  return <span data-testid="title">{title || 'Set deck title here'}</span>;
}

function Collapsed() {
  // A fresh default object on every render, as a caller may pass.
  const [collapsed, setCollapsed] = useLocalStorage<Record<string, boolean>>('analysisCollapsed', { Keywords: true });
  return (
    <button data-testid="toggle" onClick={() => setCollapsed((prev) => ({ ...prev, Keywords: !prev.Keywords }))}>
      {collapsed.Keywords ? 'collapsed' : 'open'}
    </button>
  );
}

async function hydrate(element: React.ReactElement) {
  // renderToString runs in jsdom, where window exists, so the server snapshot is what makes
  // this markup the default.
  const html = renderToString(element);
  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.appendChild(container);
  const onRecoverableError = jest.fn();
  await act(async () => {
    hydrateRoot(container, element, { onRecoverableError });
  });
  return { html, container, onRecoverableError };
}

describe('useLocalStorage (#1456)', () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    localStorage.clear();
    seen.length = 0;
    document.body.innerHTML = '';
    consoleError = jest.spyOn(console, 'error');
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('hydrates with the default, then shows the stored value, with no hydration error', async () => {
    localStorage.setItem('deckTitle', '"My deck"');
    const { html, container, onRecoverableError } = await hydrate(<Title />);

    expect(html).toContain('Set deck title here');
    expect(seen).toEqual(['', '', 'My deck']);
    expect(container.textContent).toBe('My deck');
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    expect(localStorage.getItem('deckTitle')).toBe('"My deck"');
  });

  it('writes nothing on load when localStorage is empty', async () => {
    const { container } = await hydrate(
      <>
        <Title />
        <Collapsed />
      </>
    );

    expect(container.textContent).toBe('Set deck title herecollapsed');
    expect(Object.keys(localStorage)).toEqual([]);
  });

  it('reads the stored value at once in a client-only render', () => {
    localStorage.setItem('deckTitle', '"My deck"');
    render(<Title />);
    expect(seen).toEqual(['My deck']);
  });

  it('writes through the setter, resolves an updater against the latest value, and keeps two instances in step', () => {
    render(
      <>
        <Collapsed />
        <Collapsed />
      </>
    );
    const [first, second] = screen.getAllByTestId('toggle');
    expect(first.textContent).toBe('collapsed');

    act(() => first.click());
    expect(first.textContent).toBe('open');
    expect(second.textContent).toBe('open');
    expect(JSON.parse(localStorage.getItem('analysisCollapsed')!)).toEqual({ Keywords: false });

    act(() => {
      second.click();
      second.click();
    });
    expect(first.textContent).toBe('open');
    expect(JSON.parse(localStorage.getItem('analysisCollapsed')!)).toEqual({ Keywords: false });
  });

  it('gives the default for bad stored JSON', () => {
    localStorage.setItem('deckTitle', '{not json');
    render(<Title />);
    expect(screen.getByTestId('title').textContent).toBe('Set deck title here');
  });
});
