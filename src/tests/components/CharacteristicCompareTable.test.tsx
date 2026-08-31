import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import CharacteristicCompareTable from '../../components/CharacteristicCompareTable';

const makeRow = (overrides = {}) => ({
  pile: 'draw',
  type: 'personnel',
  keywords: '',
  count: 1,
  ...overrides,
});

const keywordProps = {
  label: 'Keyword',
  characteristicName: 'keywords',
  filterFunction: (row: any) => row.pile === 'draw' && row.type === 'personnel',
  splitFunction: (keywords: string) =>
    keywords
      .split('.')
      .map((k) => k.trim())
      .filter((k) => k.length > 0),
  assembleCounts: (counts: Record<string, number>, keyword: string, count: number) => {
    counts[keyword] = (counts[keyword] || 0) + count;
    return counts;
  },
};

describe('CharacteristicCompareTable', () => {
  it('renders an empty table with no decks selected', () => {
    render(<CharacteristicCompareTable decks={[]} {...keywordProps} />);
    expect(screen.getByText('Keyword')).toBeInTheDocument();
    expect(screen.queryAllByRole('columnheader')).toHaveLength(1);
    expect(screen.queryAllByRole('row')).toHaveLength(1); // header row only
  });

  it('renders a single data column for one deck', () => {
    render(
      <CharacteristicCompareTable
        decks={[{ id: 'a', name: 'Deck A', rows: [makeRow({ keywords: 'Diplomat', count: 3 })] }]}
        {...keywordProps}
      />
    );
    expect(screen.getByText('Deck A')).toBeInTheDocument();
    const row = screen.getByText('Diplomat').closest('tr')!;
    expect(within(row).getByText('3')).toBeInTheDocument();
  });

  it('renders one column per deck with correct aggregated counts', () => {
    render(
      <CharacteristicCompareTable
        decks={[
          { id: 'a', name: 'Deck A', rows: [makeRow({ keywords: 'Diplomat', count: 2 })] },
          {
            id: 'b',
            name: 'Deck B',
            rows: [makeRow({ keywords: 'Diplomat', count: 3 }), makeRow({ keywords: 'Diplomat', count: 4 })],
          },
        ]}
        {...keywordProps}
      />
    );
    expect(screen.getByText('Deck A')).toBeInTheDocument();
    expect(screen.getByText('Deck B')).toBeInTheDocument();
    const row = screen.getByText('Diplomat').closest('tr')!;
    const cells = within(row).getAllByRole('cell');
    expect(cells[1]).toHaveTextContent('2');
    expect(cells[2]).toHaveTextContent('7');
  });

  it('splits multi-value characteristic strings', () => {
    render(
      <CharacteristicCompareTable
        decks={[{ id: 'a', name: 'Deck A', rows: [makeRow({ keywords: 'Diplomat.Scientist', count: 1 })] }]}
        {...keywordProps}
      />
    );
    expect(screen.getByText('Diplomat').closest('tr')).not.toBeNull();
    expect(screen.getByText('Scientist').closest('tr')).not.toBeNull();
  });

  it('shows zero for a deck with no cards for a value another deck has', () => {
    render(
      <CharacteristicCompareTable
        decks={[
          { id: 'a', name: 'Deck A', rows: [makeRow({ keywords: 'Diplomat', count: 1 })] },
          { id: 'b', name: 'Deck B', rows: [makeRow({ keywords: 'Scientist', count: 1 })] },
        ]}
        {...keywordProps}
      />
    );
    const row = screen.getByText('Diplomat').closest('tr')!;
    const cells = within(row).getAllByRole('cell');
    expect(cells[1]).toHaveTextContent('1');
    expect(cells[2]).toHaveTextContent('0');
  });

  it('sorts rows by a deck column descending on first header click', () => {
    render(
      <CharacteristicCompareTable
        decks={[
          {
            id: 'a',
            name: 'Deck A',
            rows: [
              makeRow({ keywords: 'Diplomat', count: 1 }),
              makeRow({ keywords: 'Scientist', count: 5 }),
              makeRow({ keywords: 'Officer', count: 3 }),
            ],
          },
        ]}
        {...keywordProps}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Deck A' }));

    const rows = screen.getAllByRole('row').slice(1);
    const keywordCells = rows.map((r) => within(r).getAllByRole('cell')[0].textContent);
    expect(keywordCells).toEqual(['Scientist', 'Officer', 'Diplomat']);
  });

  it('toggles to ascending on a second click of the same header', () => {
    render(
      <CharacteristicCompareTable
        decks={[
          {
            id: 'a',
            name: 'Deck A',
            rows: [
              makeRow({ keywords: 'Diplomat', count: 1 }),
              makeRow({ keywords: 'Scientist', count: 5 }),
              makeRow({ keywords: 'Officer', count: 3 }),
            ],
          },
        ]}
        {...keywordProps}
      />
    );

    const header = screen.getByRole('button', { name: 'Deck A' });
    fireEvent.click(header);
    fireEvent.click(header);

    const rows = screen.getAllByRole('row').slice(1);
    const keywordCells = rows.map((r) => within(r).getAllByRole('cell')[0].textContent);
    expect(keywordCells).toEqual(['Diplomat', 'Officer', 'Scientist']);
  });
});
