// ── Mocks (must precede imports) ────────────────────────────────────────────

// jsdom doesn't provide TextEncoder/TextDecoder globally; the component uses them to read the
// bulk-import endpoint's streamed NDJSON response body.
import { TextEncoder, TextDecoder } from 'util';
(global as any).TextEncoder = TextEncoder;
(global as any).TextDecoder = TextDecoder;

let mockSearchParamsValue = new URLSearchParams({ share: 'BATCH123' });
jest.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParamsValue,
}));

jest.mock('next-auth/react', () => ({
  getSession: jest.fn(),
  signIn: jest.fn(),
}));

jest.mock('next/link', () =>
  function MockLink({ children, href }: { children: React.ReactNode; href: string }) {
    return <a href={href}>{children}</a>;
  }
);

// ── Imports ──────────────────────────────────────────────────────────────────

import React from 'react';
import { render, act, screen } from '@testing-library/react';
import { getSession, signIn } from 'next-auth/react';
import BulkImportClient from '../../components/BulkImportClient';

// ── Helpers ──────────────────────────────────────────────────────────────────

// Builds a fetch Response-like object whose body streams one NDJSON line per object, mirroring
// the real /api/drive/bulk endpoint's streamed response.
function ndjsonResponse(objects: unknown[]) {
  const encoder = new TextEncoder();
  let i = 0;
  return {
    ok: true,
    body: {
      getReader() {
        return {
          async read() {
            if (i < objects.length) {
              const chunk = encoder.encode(JSON.stringify(objects[i]) + '\n');
              i++;
              return { done: false, value: chunk };
            }
            return { done: true, value: undefined };
          },
        };
      },
    },
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('BulkImportClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParamsValue = new URLSearchParams({ share: 'BATCH123' });
  });

  it('loads the batch, saves signed-in users automatically, and shows the per-deck summary', async () => {
    (getSession as jest.Mock).mockResolvedValue({
      expires: new Date(Date.now() + 3600 * 1000).toISOString(),
      hasDriveScope: true,
    });

    const decks = [
      { trekccDeckId: '1', title: 'Deck One', content: 'x' },
      { trekccDeckId: '2', title: 'Deck Two', content: 'y' },
    ];
    const mockFetch = jest.fn(async (url: string) => {
      if (url.includes('/api/share')) return { ok: true, json: async () => ({ content: JSON.stringify(decks) }) };
      if (url.includes('/api/drive/bulk')) {
        return ndjsonResponse([
          { trekccDeckId: '1', title: 'Deck One', status: 'created' },
          { trekccDeckId: '2', title: 'Deck Two', status: 'updated' },
        ]);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    global.fetch = mockFetch as any;

    await act(async () => {
      render(<BulkImportClient />);
    });

    expect(await screen.findByText('Deck One')).toBeInTheDocument();
    expect(screen.getByText('created')).toBeInTheDocument();
    expect(screen.getByText('Deck Two')).toBeInTheDocument();
    expect(screen.getByText('updated')).toBeInTheDocument();
    expect(screen.getByText('Import complete:')).toBeInTheDocument();
  });

  it('prompts sign-in when there is no session, then saves after the user signs in', async () => {
    (getSession as jest.Mock).mockResolvedValue(null);

    const decks = [{ trekccDeckId: '1', title: 'Deck One', content: 'x' }];
    const mockFetch = jest.fn(async (url: string) => {
      if (url.includes('/api/share')) return { ok: true, json: async () => ({ content: JSON.stringify(decks) }) };
      throw new Error(`Unexpected fetch: ${url}`);
    });
    global.fetch = mockFetch as any;

    await act(async () => {
      render(<BulkImportClient />);
    });

    expect(await screen.findByText('Sign in with Google')).toBeInTheDocument();

    await act(async () => {
      screen.getByText('Sign in with Google').click();
    });

    expect(signIn).toHaveBeenCalledWith(
      'google',
      expect.objectContaining({ callbackUrl: '/import-trekcc/bulk?share=BATCH123' }),
      expect.objectContaining({ scope: expect.stringContaining('drive.appdata') })
    );
  });

  it('prompts sign-in when the session lacks Drive scope, without calling the bulk import API', async () => {
    (getSession as jest.Mock).mockResolvedValue({
      expires: new Date(Date.now() + 3600 * 1000).toISOString(),
      hasDriveScope: false,
    });

    const decks = [{ trekccDeckId: '1', title: 'Deck One', content: 'x' }];
    const mockFetch = jest.fn(async (url: string) => {
      if (url.includes('/api/share')) return { ok: true, json: async () => ({ content: JSON.stringify(decks) }) };
      throw new Error(`Unexpected fetch: ${url}`);
    });
    global.fetch = mockFetch as any;

    await act(async () => {
      render(<BulkImportClient />);
    });

    expect(await screen.findByText('Sign in with Google')).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalledWith(expect.stringContaining('/api/drive/bulk'), expect.anything());
  });

  it('shows the failure reason for a failed deck', async () => {
    (getSession as jest.Mock).mockResolvedValue({
      expires: new Date(Date.now() + 3600 * 1000).toISOString(),
      hasDriveScope: true,
    });

    const decks = [{ trekccDeckId: '1', title: 'Deck One', content: 'x' }];
    const mockFetch = jest.fn(async (url: string) => {
      if (url.includes('/api/share')) return { ok: true, json: async () => ({ content: JSON.stringify(decks) }) };
      if (url.includes('/api/drive/bulk')) {
        return ndjsonResponse([{ trekccDeckId: '1', title: 'Deck One', status: 'failed', error: 'Save failed' }]);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    global.fetch = mockFetch as any;

    await act(async () => {
      render(<BulkImportClient />);
    });

    expect(await screen.findByText('Save failed')).toBeInTheDocument();
  });

  it('shows live progress and moves to needs-signin when a drive_scope_missing line arrives mid-stream', async () => {
    (getSession as jest.Mock).mockResolvedValue({
      expires: new Date(Date.now() + 3600 * 1000).toISOString(),
      hasDriveScope: true,
    });

    const decks = [
      { trekccDeckId: '1', title: 'Deck One', content: 'x' },
      { trekccDeckId: '2', title: 'Deck Two', content: 'y' },
    ];
    const mockFetch = jest.fn(async (url: string) => {
      if (url.includes('/api/share')) return { ok: true, json: async () => ({ content: JSON.stringify(decks) }) };
      if (url.includes('/api/drive/bulk')) {
        return ndjsonResponse([
          { trekccDeckId: '1', title: 'Deck One', status: 'created' },
          { error: 'drive_scope_missing' },
        ]);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    global.fetch = mockFetch as any;

    await act(async () => {
      render(<BulkImportClient />);
    });

    expect(await screen.findByText('Sign in with Google')).toBeInTheDocument();
  });
});
