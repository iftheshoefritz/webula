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

    fireEvent.click(screen.getByRole('button', { name: 'Deck A' }));

    const rows = screen.getAllByRole('row').slice(1);
    const iconCells = rows.map((r) => within(r).getByRole('img').getAttribute('alt'));
    expect(iconCells).toEqual(['tng', 'stf', 'cmd']);
  });
});
