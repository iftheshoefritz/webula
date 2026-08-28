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

// Capture the onSignIn/mode props passed to DrivePickerModal
let capturedOnSignIn: (() => void) | null = null;
let capturedMode: string | null = null;
jest.mock('../../components/DrivePickerModal', () => ({
  DrivePickerModal: (props: { onSignIn?: () => void; mode?: string }) => {
    capturedOnSignIn = props.onSignIn ?? null;
    capturedMode = props.mode ?? null;
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

  it('shows save button even when not logged in and triggers signIn with drive scope when clicked', async () => {
    await act(async () => {
      render(<DeckBuilderClient data={[]} columns={[]} />);
    });

    const buttons = screen.getAllByRole('button');
    const saveButton = buttons.find(
      (b) => b.getAttribute('data-tooltip-content') === 'Save to G Drive'
    );
    expect(saveButton).not.toBeUndefined();

    await act(async () => {
      fireEvent.click(saveButton!);
    });

    expect(signIn).toHaveBeenCalledWith(
      'google',
      expect.objectContaining({ callbackUrl: '/decks' }),
      expect.objectContaining({
        scope: expect.stringContaining('https://www.googleapis.com/auth/drive.appdata'),
        include_granted_scopes: 'true',
      })
    );
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
      expect.objectContaining({ callbackUrl: '/decks?openPicker=true&pickerMode=load' }),
      expect.objectContaining({
        scope: expect.stringContaining('https://www.googleapis.com/auth/drive.appdata'),
        include_granted_scopes: 'true',
      })
    );
  });

  it('encodes compare mode in the signIn callbackUrl when opening the compare deck picker', async () => {
    await act(async () => {
      render(<DeckBuilderClient data={[]} columns={[]} />);
    });

    const buttons = screen.getAllByRole('button');
    const compareButton = buttons.find((b) => b.textContent?.includes('Compare deck'));
    expect(compareButton).not.toBeUndefined();
    await act(async () => {
      fireEvent.click(compareButton!);
    });

    expect(capturedOnSignIn).not.toBeNull();
    act(() => {
      capturedOnSignIn!();
    });

    expect(signIn).toHaveBeenCalledWith(
      'google',
      expect.objectContaining({ callbackUrl: '/decks?openPicker=true&pickerMode=compare' }),
      expect.objectContaining({
        scope: expect.stringContaining('https://www.googleapis.com/auth/drive.appdata'),
        include_granted_scopes: 'true',
      })
    );
  });

  it('restores compare picker mode after the Google OAuth redirect', async () => {
    const originalLocation = window.location;
    // @ts-expect-error - overriding window.location for the test
    delete window.location;
    window.location = { ...originalLocation, search: '?openPicker=true&pickerMode=compare' } as Location;

    await act(async () => {
      render(<DeckBuilderClient data={[]} columns={[]} />);
    });

    expect(capturedMode).toBe('compare');

    window.location = originalLocation;
  });
});
