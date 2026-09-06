import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import IconCompareTable from '../../components/IconCompareTable';
import { CARD_ICON_IMAGES } from '../../lib/missionRequirements';

const makeRow = (overrides = {}) => ({
  pile: 'draw',
  type: 'personnel',
  icons: '',
  count: 1,
  ...overrides,
});

const iconProps = {
  label: 'Icon',
  characteristicName: 'icons',
  filterFunction: (row: any) => row.pile === 'draw' && row.type === 'personnel',
  splitFunction: (icons: string) =>
    icons
      .split(/[[\]]/)
      .map((k) => k.trim())
      .filter((k) => k.length > 0),
  assembleCounts: (counts: Record<string, number>, icon: string, count: number) => {
    counts[icon] = (counts[icon] || 0) + count;
    return counts;
  },
};

describe('IconCompareTable', () => {
  it('renders an img for a known icon key in the row label', () => {
    render(
      <IconCompareTable
        decks={[{ id: 'a', name: 'Deck A', rows: [makeRow({ icons: '[cmd]', count: 2 })] }]}
        {...iconProps}
      />
    );
    const img = screen.getByRole('img', { name: 'cmd' });
    expect(img).toHaveAttribute('src', CARD_ICON_IMAGES['cmd']);
    const row = img.closest('tr')!;
    expect(within(row).getByText('2')).toBeInTheDocument();
  });

  it('falls back to bracketed text for an unmapped icon key', () => {
    render(
      <IconCompareTable
        decks={[{ id: 'a', name: 'Deck A', rows: [makeRow({ icons: '[unknownicon]', count: 1 })] }]}
        {...iconProps}
      />
    );
    expect(screen.getByText('[unknownicon]')).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('applies hover/rounded row styling matching the deck builder list rows', () => {
    render(
      <IconCompareTable
        decks={[{ id: 'a', name: 'Deck A', rows: [makeRow({ icons: '[cmd]', count: 1 })] }]}
        {...iconProps}
      />
    );
    const img = screen.getByRole('img', { name: 'cmd' });
    const row = img.closest('tr')!;
    expect(row.className).toContain('group');
    const cells = within(row).getAllByRole('cell');
    expect(cells[0].className).toContain('group-hover:bg-white/[0.04]');
    expect(cells[0].className).toContain('rounded-l');
    expect(cells[cells.length - 1].className).toContain('rounded-r');
  });

  it('sorts rows by a deck column descending on first header click', () => {
    render(
      <IconCompareTable
        decks={[
          {
            id: 'a',
            name: 'Deck A',
            rows: [
              makeRow({ icons: '[cmd]', count: 1 }),
              makeRow({ icons: '[tng]', count: 5 }),
              makeRow({ icons: '[stf]', count: 3 }),
            ],
          },
        ]}
        {...iconProps}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Deck A (9)' }));

    const rows = screen.getAllByRole('row').slice(1);
    const iconCells = rows.map((r) => within(r).getByRole('img').getAttribute('alt'));
    expect(iconCells).toEqual(['tng', 'stf', 'cmd']);
  });

  it('shows draw-pile card count in header, counting non-personnel but excluding non-draw piles', () => {
    render(
      <IconCompareTable
        decks={[
          {
            id: 'a',
            name: 'Deck A',
            rows: [
              makeRow({ icons: '[cmd]', count: 2 }),
              makeRow({ icons: '[tng]', count: 3, type: 'ship' }),
              makeRow({ icons: '[stf]', count: 10, pile: 'dilemma' }),
            ],
          },
        ]}
        {...iconProps}
      />
    );

    expect(screen.getByText('Deck A (5)')).toBeInTheDocument();
  });

  it('uses a custom renderIcon function to render the row label when provided', () => {
    render(
      <IconCompareTable
        decks={[{ id: 'a', name: 'Deck A', rows: [makeRow({ icons: '[cmd]', count: 1 })] }]}
        {...iconProps}
        renderIcon={(key) => <span data-testid="custom-icon">{key}</span>}
      />
    );
    expect(screen.getByTestId('custom-icon')).toHaveTextContent('cmd');
    expect(screen.queryByRole('img')).toBeNull();
  });
});
