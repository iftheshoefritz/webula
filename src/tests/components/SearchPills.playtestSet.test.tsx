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

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SearchPills from '../../components/SearchPills';
import { PlaytestCardsProvider } from '../../hooks/usePlaytestCards';
import { setPlaytestImageVersion } from '../../lib/cardImageUrl';

// Invented cards only: no playtest card is ever committed (#1614).
const PLAYTEST_TSV = [
  ['Name', 'Set', 'ImageFile', 'Unique', 'CollectorsInfo', 'Type', 'Keywords', 'Mission', 'DilemmaType'].join('\t'),
  ['Zed Quill', 'Owner Set', 'PT-ZedQuill', 'Y', 'PT1', 'Personnel', '', '', ''].join('\t'),
].join('\n');

const signedIn = { status: 'authenticated', data: { user: { email: 'tester@example.com' } } };

let fetchMock: jest.Mock;
beforeEach(() => {
  fetchMock = jest.fn();
  global.fetch = fetchMock;
});
afterEach(() => {
  setPlaytestImageVersion(null);
  jest.restoreAllMocks();
});

const renderPills = (searchQuery = '', setSearchQuery = jest.fn()) =>
  render(
    <PlaytestCardsProvider>
      <SearchPills searchQuery={searchQuery} setSearchQuery={setSearchQuery} />
    </PlaytestCardsProvider>,
  );

const openSetPicker = () => {
  fireEvent.click(screen.getByRole('button', { name: /add filter/i }));
  fireEvent.click(screen.getByRole('button', { name: /^set:$/i }));
};

const optionLabels = () => screen.getAllByRole('option').map((o) => o.textContent);

describe('SearchPills: the Playtest option of the Set picker (#1623)', () => {
  describe('with playtest cards', () => {
    beforeEach(() => {
      mockUseSession.mockReturnValue(signedIn);
      fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ version: 3, tsv: PLAYTEST_TSV }) });
    });

    it('lists Playtest first, above the real sets', async () => {
      renderPills();
      await waitFor(() => expect(fetchMock).toHaveBeenCalled());
      openSetPicker();
      await waitFor(() => expect(optionLabels()[0]).toBe('Playtest'));
      expect(optionLabels().length).toBeGreaterThan(1);
    });

    it('filters with the search box', async () => {
      renderPills();
      openSetPicker();
      await waitFor(() => expect(screen.getByRole('option', { name: 'Playtest' })).toBeInTheDocument());
      fireEvent.change(screen.getByPlaceholderText('Search sets...'), { target: { value: 'play' } });
      expect(optionLabels()).toContain('Playtest');
    });

    it('sets the query to set:playtest', async () => {
      const setSearchQuery = jest.fn();
      renderPills('', setSearchQuery);
      openSetPicker();
      fireEvent.click(await screen.findByRole('option', { name: 'Playtest' }));
      expect(setSearchQuery).toHaveBeenCalledWith('set:playtest');
    });

    it('sets the query to -set:playtest in exclude mode', async () => {
      const setSearchQuery = jest.fn();
      renderPills('', setSearchQuery);
      openSetPicker();
      fireEvent.click(screen.getByRole('button', { name: /− exclude/i }));
      fireEvent.click(await screen.findByRole('option', { name: 'Playtest' }));
      expect(setSearchQuery).toHaveBeenCalledWith('-set:playtest');
    });

    it('labels the pill of an active set:playtest filter Playtest', async () => {
      renderPills('set:playtest');
      await waitFor(() => expect(fetchMock).toHaveBeenCalled());
      expect(screen.getByText('set:Playtest')).toBeInTheDocument();
    });
  });

  describe('with no playtest cards', () => {
    it('has no Playtest option when signed out', async () => {
      mockUseSession.mockReturnValue({ status: 'unauthenticated', data: null });
      renderPills();
      openSetPicker();
      expect(optionLabels().length).toBeGreaterThan(0);
      expect(screen.queryByRole('option', { name: 'Playtest' })).not.toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('has no Playtest option after a 404 from /api/playtest/cards', async () => {
      mockUseSession.mockReturnValue(signedIn);
      fetchMock.mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: 'not_found' }) });
      renderPills();
      await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/playtest/cards'));
      await Promise.resolve();
      openSetPicker();
      expect(optionLabels().length).toBeGreaterThan(0);
      expect(screen.queryByRole('option', { name: 'Playtest' })).not.toBeInTheDocument();
    });
  });
});
