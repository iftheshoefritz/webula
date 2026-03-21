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

jest.mock('next/link', () =>
  function MockLink({ children, href }: { children: React.ReactNode; href: string }) {
    return <a href={href}>{children}</a>;
  }
);

// Capture the onSignIn prop passed to DrivePickerModal
let capturedOnSignIn: (() => void) | null = null;
jest.mock('../../components/DrivePickerModal', () => ({
  DrivePickerModal: (props: { onSignIn?: () => void }) => {
    capturedOnSignIn = props.onSignIn ?? null;
    return null;
  },
}));

// ── Imports ──────────────────────────────────────────────────────────────────

import React from 'react';
import { render, act, screen, fireEvent } from '@testing-library/react';
import { signIn } from 'next-auth/react';
import DeckBuilderClient from '../../components/DeckBuilderClient';

// ── Tests ────────────────────────────────────────────────────────────────────

describe('DeckBuilderClient – Drive scope signIn', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    capturedOnSignIn = null;
    mockSearchParamsValue = new URLSearchParams();
  });

  it('calls signIn with drive scope in authorizationParams (third arg) when onSignIn is invoked', async () => {
    await act(async () => {
      render(<DeckBuilderClient data={[]} columns={[]} />);
    });

    // Open the deck picker (sets showDrivePicker=true, which renders DrivePickerModal)
    const buttons = screen.getAllByRole('button');
    const loadButton = buttons.find(
      (b) => b.getAttribute('data-tooltip-content') === 'Load decks'
    );
    expect(loadButton).not.toBeUndefined();
    await act(async () => {
      fireEvent.click(loadButton!);
    });

    expect(capturedOnSignIn).not.toBeNull();
    act(() => {
      capturedOnSignIn!();
    });

    expect(signIn).toHaveBeenCalledWith(
      'google',
      expect.objectContaining({ callbackUrl: '/decks?openPicker=true' }),
      expect.objectContaining({
        scope: expect.stringContaining('https://www.googleapis.com/auth/drive.appdata'),
        include_granted_scopes: 'true',
      })
    );
  });
});
