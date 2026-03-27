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

import React from 'react';
import { render, act, screen, fireEvent } from '@testing-library/react';
import DeckBuilderClient from '../../components/DeckBuilderClient';

// ── Tests ────────────────────────────────────────────────────────────────────

// The deckPanel is rendered in two places in the DOM (desktop sidebar + mobile
// full-page view, both visible when activeView='deck' and mobileView='deck').
// The mobile title editing input has id="deckTitleMobile", distinct from the
// always-visible desktop input id="deckTitle".
//
// JSDOM NOTE: The mobile input has `autoFocus`. In jsdom, calling focus() on
// an element when the window is not focused fires an immediate blur, which
// would reset the mobileTitleEditing state. We stub focus() to prevent that.

describe('DeckBuilderClient – Mobile title editing', () => {
  let restoreFocus: () => void;

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    mockSearchParamsValue = new URLSearchParams();
    // Prevent autoFocus from causing an immediate blur event in jsdom
    const originalFocus = HTMLElement.prototype.focus;
    HTMLElement.prototype.focus = jest.fn();
    restoreFocus = () => { HTMLElement.prototype.focus = originalFocus; };
  });

  afterEach(() => {
    restoreFocus();
  });

  it('shows the Edit deck title button(s) when not editing', async () => {
    await act(async () => {
      render(<DeckBuilderClient data={[]} columns={[]} />);
    });

    const editButtons = screen.getAllByRole('button', { name: 'Edit deck title' });
    expect(editButtons.length).toBeGreaterThan(0);
    // Mobile editing input should not yet exist
    expect(document.getElementById('deckTitleMobile')).toBeNull();
  });

  it('clicking the Edit deck title button reveals the mobile title input', async () => {
    await act(async () => {
      render(<DeckBuilderClient data={[]} columns={[]} />);
    });

    const editButtons = screen.getAllByRole('button', { name: 'Edit deck title' });
    fireEvent.click(editButtons[0]);

    // The mobile-specific input should now exist
    expect(document.getElementById('deckTitleMobile')).not.toBeNull();
    // The edit button should be gone (editing mode replaces it)
    expect(screen.queryAllByRole('button', { name: 'Edit deck title' }).length).toBe(0);
  });

  it('blurring the mobile title input hides the input and shows the display button again', async () => {
    await act(async () => {
      render(<DeckBuilderClient data={[]} columns={[]} />);
    });

    const editButtons = screen.getAllByRole('button', { name: 'Edit deck title' });
    fireEvent.click(editButtons[0]);

    const input = document.getElementById('deckTitleMobile') as HTMLInputElement;
    expect(input).not.toBeNull();

    fireEvent.blur(input);

    // After blur: mobile input gone, display button(s) back
    expect(document.getElementById('deckTitleMobile')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Edit deck title' }).length).toBeGreaterThan(0);
  });

  it('typing in the mobile title input updates the displayed title', async () => {
    await act(async () => {
      render(<DeckBuilderClient data={[]} columns={[]} />);
    });

    const editButtons = screen.getAllByRole('button', { name: 'Edit deck title' });
    fireEvent.click(editButtons[0]);

    const input = document.getElementById('deckTitleMobile') as HTMLInputElement;
    expect(input).not.toBeNull();

    fireEvent.change(input, { target: { value: 'My New Deck' } });
    fireEvent.blur(input);

    // The new title should be visible in the display button span(s)
    expect(screen.getAllByText('My New Deck').length).toBeGreaterThan(0);
  });

  it('shows existing deck title in the display button', async () => {
    localStorage.setItem('deckTitle', JSON.stringify('Existing Deck'));

    await act(async () => {
      render(<DeckBuilderClient data={[]} columns={[]} />);
    });

    expect(screen.getAllByText('Existing Deck').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Edit deck title' }).length).toBeGreaterThan(0);
  });
});
