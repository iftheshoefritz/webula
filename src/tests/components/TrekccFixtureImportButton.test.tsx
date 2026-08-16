// ── Mocks (must precede imports) ────────────────────────────────────────────

jest.mock('next-auth/react', () => ({
  getSession: jest.fn(),
  signIn: jest.fn(),
}));

// ── Imports ──────────────────────────────────────────────────────────────────

import React from 'react';
import { render, act, screen } from '@testing-library/react';
import { getSession, signIn } from 'next-auth/react';
import TrekccFixtureImportButton from '../../components/TrekccFixtureImportButton';

// ── Tests ────────────────────────────────────────────────────────────────────

describe('TrekccFixtureImportButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('redirects to sign-in with Drive scope when the session lacks Drive access', async () => {
    (getSession as jest.Mock).mockResolvedValue({
      expires: new Date(Date.now() + 3600 * 1000).toISOString(),
      hasDriveScope: false,
    });
    const mockFetch = jest.fn();
    global.fetch = mockFetch as any;

    await act(async () => {
      render(<TrekccFixtureImportButton />);
    });

    await act(async () => {
      screen.getByText('Import 3 test decks').click();
    });

    expect(signIn).toHaveBeenCalledWith(
      'google',
      expect.objectContaining({ callbackUrl: '/import-trekcc' }),
      expect.objectContaining({ scope: expect.stringContaining('drive.appdata') })
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('calls the bulk import API when the session has Drive scope, and shows failure reasons', async () => {
    (getSession as jest.Mock).mockResolvedValue({
      expires: new Date(Date.now() + 3600 * 1000).toISOString(),
      hasDriveScope: true,
    });
    const mockFetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        results: [{ trekccDeckId: '1', title: 'Deck One', status: 'failed', error: 'Save failed' }],
      }),
    }));
    global.fetch = mockFetch as any;

    await act(async () => {
      render(<TrekccFixtureImportButton />);
    });

    await act(async () => {
      screen.getByText('Import 3 test decks').click();
    });

    expect(signIn).not.toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledWith('/api/drive/bulk', expect.objectContaining({ method: 'POST' }));
    expect(await screen.findByText('Save failed')).toBeInTheDocument();
  });
});
