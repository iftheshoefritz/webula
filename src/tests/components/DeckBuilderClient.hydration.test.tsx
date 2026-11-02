// ── Mocks (must precede imports) ────────────────────────────────────────────

jest.mock('posthog-js', () => ({ capture: jest.fn(), identify: jest.fn(), init: jest.fn() }));

let mockSearchParamsValue = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  useSearchParams: () => mockSearchParamsValue,
}));

jest.mock('next-auth/react', () => ({
  getSession: jest.fn().mockResolvedValue(null),
  signIn: jest.fn(),
}));

jest.mock('react-icons/fa', () =>
  new Proxy({}, { get: () => () => null })
);

jest.mock('react-tooltip', () => ({ Tooltip: () => null }));

jest.mock('../../hooks/useFilterData', () => ({
  __esModule: true,
  default: jest.fn().mockReturnValue([]),
}));

jest.mock('../../components/SearchResults', () => () => null);
jest.mock('../../components/SearchBar', () => () => null);
jest.mock('../../components/SearchPills', () => () => null);
jest.mock('../../components/DeckListPile', () => () => null);
jest.mock('../../components/DeckUploader', () => () => null);
jest.mock('../../components/Help', () => () => null);
jest.mock('../../components/SkillsChart', () => () => null);
jest.mock('../../components/PileAggregateCostChart', () => () => null);
jest.mock('../../components/IconPill', () => () => null);
jest.mock('../../components/DrivePickerModal', () => ({
  DrivePickerModal: () => null,
}));

jest.mock('next/link', () =>
  function MockLink({ children, href }: { children: React.ReactNode; href: string }) {
    return <a href={href}>{children}</a>;
  }
);


// ── Imports ──────────────────────────────────────────────────────────────────

import React, { act } from 'react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import DeckBuilderClient from '../../components/DeckBuilderClient';
import { makeCardData } from '../fixtures/makeCardData';

// ── Tests ────────────────────────────────────────────────────────────────────

const riker = makeCardData({ collectorsinfo: '1P2', name: 'william t. riker', originalName: 'William T. Riker', type: 'personnel' });

describe('DeckBuilderClient – hydration with a saved deck (#1456)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    document.body.innerHTML = '';
    mockSearchParamsValue = new URLSearchParams();
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: async () => [] })) as unknown as typeof fetch;
  });

  it('hydrates with no error, then restores the title and the deck without the dirty marker', async () => {
    localStorage.setItem('currentDeck', JSON.stringify({ '1P2': { count: 1, row: { ...riker, count: 1, pile: 'draw' } } }));
    localStorage.setItem('deckTitle', JSON.stringify('My deck'));
    const consoleError = jest.spyOn(console, 'error');

    const element = <DeckBuilderClient data={[riker]} columns={[]} />;
    const html = renderToString(element);
    expect(html).not.toContain('My deck');

    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);
    const onRecoverableError = jest.fn();
    await act(async () => {
      hydrateRoot(container, element, { onRecoverableError });
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalledWith(expect.stringContaining('Hydration'), expect.anything());
    expect((container.querySelector('#deckTitle') as HTMLInputElement).value).toBe('My deck');
    expect(container.textContent).toContain('Deck');
    expect(container.textContent).not.toContain('Deck *');
    expect(JSON.parse(localStorage.getItem('deckTitle')!)).toBe('My deck');
    consoleError.mockRestore();
  });
});
