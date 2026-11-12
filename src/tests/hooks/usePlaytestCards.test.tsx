jest.mock('d3', () => ({
  tsvParse: (text: string) => {
    const lines = text.split('\n').filter(Boolean);
    if (lines.length < 2) return [];
    const headers = lines[0].split('\t');
    return lines.slice(1).map((line) => {
      const values = line.split('\t');
      return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']));
    });
  },
}));

const mockUseSession = jest.fn();
jest.mock('next-auth/react', () => ({
  useSession: () => mockUseSession(),
}));

import { render, screen, waitFor } from '@testing-library/react';
import { PlaytestCardsProvider, useWithPlaytestCards } from '../../hooks/usePlaytestCards';
import { cardImageUrl, playtestImageVersion, setPlaytestImageVersion } from '../../lib/cardImageUrl';
import { filterCards } from '../../lib/filterCards';
import type { CardData } from '../../lib/loadCards';

// Invented cards only: no playtest card is ever committed (#1614).
const HEADERS = ['Name', 'Set', 'ImageFile', 'Unique', 'CollectorsInfo', 'Type', 'Keywords', 'Mission', 'DilemmaType'];
const tsvOf = (rows: string[][]) => [HEADERS.join('\t'), ...rows.map((r) => r.join('\t'))].join('\n');
const PLAYTEST_TSV = tsvOf([
  ['Zed Quill', 'Owner Set', 'PT-ZedQuill', 'Y', 'PT1', 'Personnel', '', '', ''],
  ['Widget Array', 'Playtest', 'PT-Widget', 'N', 'PT2', 'Equipment', '', '', ''],
]);

const publicData = [
  { name: 'public one', originalName: 'Public One', collectorsinfo: '1r1', imagefile: 'p1', set: 'premiere', type: 'event' },
] as unknown as CardData[];

function Names() {
  const data = useWithPlaytestCards(publicData);
  return (
    <ul>
      {data.map((row) => (
        <li key={row.collectorsinfo} data-testid="row" data-unique={row.unique} data-set={String(row.set)}>
          {row.originalName}
        </li>
      ))}
    </ul>
  );
}

const renderTree = () => render(<PlaytestCardsProvider><Names /></PlaytestCardsProvider>);
const names = () => screen.getAllByTestId('row').map((li) => li.textContent);

const signedIn = { status: 'authenticated', data: { user: { email: 'tester@example.com' } } };

let fetchMock: jest.Mock;
beforeEach(() => {
  fetchMock = jest.fn();
  global.fetch = fetchMock;
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  setPlaytestImageVersion(null);
  jest.restoreAllMocks();
});

describe('PlaytestCardsProvider and useWithPlaytestCards (#1614)', () => {
  it('sends no request when signed out, and gives the public cards alone', async () => {
    mockUseSession.mockReturnValue({ status: 'unauthenticated', data: null });
    renderTree();
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(names()).toEqual(['Public One']);
  });

  it('gives the public cards alone on a 404, with no error and no log', async () => {
    mockUseSession.mockReturnValue(signedIn);
    fetchMock.mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: 'not_found' }) });
    renderTree();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/playtest/cards'));
    await Promise.resolve();
    expect(names()).toEqual(['Public One']);
    expect(console.error).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalled();
    expect(playtestImageVersion()).toBeNull();
  });

  it('merges the playtest cards after the public cards on a 200', async () => {
    mockUseSession.mockReturnValue(signedIn);
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ version: 5, tsv: PLAYTEST_TSV }) });
    renderTree();
    await waitFor(() => expect(names()).toEqual(['Public One', 'Zed Quill', 'Widget Array']));
    const rows = screen.getAllByTestId('row');
    // A playtest personnel is unique `y`, and every playtest row has the set `playtest`.
    expect(rows[1]).toHaveAttribute('data-unique', 'y');
    expect(rows[1]).toHaveAttribute('data-set', 'playtest');
    expect(rows[2]).toHaveAttribute('data-set', 'playtest');
    expect(playtestImageVersion()).toBe(5);
    expect(cardImageUrl({ imagefile: 'PT-ZedQuill', set: 'playtest' } as never)).toBe('/api/playtest/images/PT-ZedQuill.jpg?v=5');
  });

  it('treats version 0 with an empty TSV as no playtest cards', async () => {
    mockUseSession.mockReturnValue(signedIn);
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ version: 0, tsv: '' }) });
    renderTree();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await Promise.resolve();
    expect(names()).toEqual(['Public One']);
  });

  it('still gives the public cards when the request fails', async () => {
    mockUseSession.mockReturnValue(signedIn);
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    renderTree();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await Promise.resolve();
    expect(names()).toEqual(['Public One']);
  });

  it('drops the playtest cards on a sign-out', async () => {
    mockUseSession.mockReturnValue(signedIn);
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ version: 2, tsv: PLAYTEST_TSV }) });
    const { rerender } = renderTree();
    await waitFor(() => expect(names()).toHaveLength(3));
    mockUseSession.mockReturnValue({ status: 'unauthenticated', data: null });
    rerender(<PlaytestCardsProvider><Names /></PlaytestCardsProvider>);
    await waitFor(() => expect(names()).toEqual(['Public One']));
    expect(playtestImageVersion()).toBeNull();
  });
});

describe('set:playtest (#1614)', () => {
  it('finds the merged playtest rows', async () => {
    const { playtestRowsOf } = await import('../../hooks/usePlaytestCards');
    const rows = await playtestRowsOf(PLAYTEST_TSV);
    const found = filterCards([...publicData, ...rows], ['name', 'set'], 'set:playtest');
    expect(found.map((row) => row.originalName)).toEqual(['Zed Quill', 'Widget Array']);
  });
});
