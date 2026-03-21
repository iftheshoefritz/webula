import React from 'react';
import { render, screen } from '@testing-library/react';
import PileAggregate from '../../components/PileAggregate';
import { CARD_ICON_IMAGES } from '../../lib/missionRequirements';

// Replicate the render logic from DeckBuilderClient's Icons section
function renderIconEntry([icon, count]: [string, number]) {
  const iconSrc = CARD_ICON_IMAGES[icon.toLowerCase()];
  return (
    <div key={icon} className="m-2 p-2 border border-white/[0.06] rounded surface-hover">
      <span className="px-1 text-text-secondary flex items-center gap-1">
        {count}x{' '}
        {iconSrc
          ? <img src={iconSrc} alt={icon} title={icon} className="inline h-4 w-4" />
          : <b className="text-text-primary">[{icon}]</b>
        }
      </span>
    </div>
  );
}

const makeRow = (overrides = {}) => ({
  pile: 'draw',
  type: 'personnel',
  icons: '',
  count: 1,
  ...overrides,
});

function renderIconsSection(rows: ReturnType<typeof makeRow>[]) {
  return render(
    <PileAggregate
      currentDeckRows={rows}
      characteristicName="icons"
      filterFunction={(row) => row.pile === 'draw' && row.type === 'personnel'}
      splitFunction={(icons) =>
        icons
          .split(/[\[\]]/)
          .map((k: string) => k.trim())
          .filter((k: string) => k.length > 0)
      }
      assembleCounts={(counts, icon, count) => {
        counts[icon] = (counts[icon] || 0) + count;
        return counts;
      }}
    >
      {renderIconEntry}
    </PileAggregate>
  );
}

describe('Icons section in deck builder analysis', () => {
  describe('known icons render as images', () => {
    it('renders an img tag for a known icon (Cmd)', () => {
      renderIconsSection([makeRow({ icons: '[Cmd]', count: 1 })]);
      const img = screen.getByRole('img', { name: 'Cmd' });
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('src', CARD_ICON_IMAGES['cmd']);
    });

    it('renders an img tag for a known icon (Stf)', () => {
      renderIconsSection([makeRow({ icons: '[Stf]', count: 2 })]);
      const img = screen.getByRole('img', { name: 'Stf' });
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('src', CARD_ICON_IMAGES['stf']);
    });

    it('icon lookup is case-insensitive', () => {
      renderIconsSection([makeRow({ icons: '[TNG]', count: 1 })]);
      const img = screen.getByRole('img', { name: 'TNG' });
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('src', CARD_ICON_IMAGES['tng']);
    });
  });

  describe('unknown icons fall back to text', () => {
    it('renders [UnknownIcon] as bold text when no image mapping exists', () => {
      renderIconsSection([makeRow({ icons: '[UnknownIcon]', count: 1 })]);
      expect(screen.getByText('[UnknownIcon]')).toBeInTheDocument();
      expect(screen.queryByRole('img')).toBeNull();
    });
  });

  describe('icon counts', () => {
    it('displays the count prefix', () => {
      renderIconsSection([makeRow({ icons: '[Cmd]', count: 3 })]);
      expect(screen.getByText(/3x/)).toBeInTheDocument();
    });

    it('aggregates the same icon across multiple personnel', () => {
      renderIconsSection([
        makeRow({ icons: '[Cmd]', count: 2 }),
        makeRow({ icons: '[Cmd]', count: 3 }),
      ]);
      expect(screen.getByText(/5x/)).toBeInTheDocument();
    });
  });

  describe('filtering', () => {
    it('ignores non-personnel cards', () => {
      renderIconsSection([
        makeRow({ type: 'ship', icons: '[Cmd]', count: 5 }),
      ]);
      expect(screen.queryByRole('img')).toBeNull();
    });

    it('ignores non-draw-pile cards', () => {
      renderIconsSection([
        makeRow({ pile: 'dilemma', type: 'personnel', icons: '[Cmd]', count: 5 }),
      ]);
      expect(screen.queryByRole('img')).toBeNull();
    });
  });
});
