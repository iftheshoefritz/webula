import React from 'react';
import { render, screen } from '@testing-library/react';
import IconsAggregate from '../../components/IconsAggregate';
import { CARD_ICON_IMAGES } from '../../lib/missionRequirements';

const makeRow = (overrides = {}) => ({
  pile: 'draw',
  type: 'personnel',
  icons: '',
  count: 1,
  ...overrides,
});

describe('IconsAggregate', () => {
  describe('known icons render as images', () => {
    it('renders an img tag for a known icon (Cmd)', () => {
      render(<IconsAggregate currentDeckRows={[makeRow({ icons: '[Cmd]' })]} />);
      const img = screen.getByRole('img', { name: 'Cmd' });
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('src', CARD_ICON_IMAGES['cmd']);
    });

    it('renders an img tag for a known icon (Stf)', () => {
      render(<IconsAggregate currentDeckRows={[makeRow({ icons: '[Stf]', count: 2 })]} />);
      const img = screen.getByRole('img', { name: 'Stf' });
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('src', CARD_ICON_IMAGES['stf']);
    });

    it('icon lookup is case-insensitive', () => {
      render(<IconsAggregate currentDeckRows={[makeRow({ icons: '[TNG]' })]} />);
      const img = screen.getByRole('img', { name: 'TNG' });
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('src', CARD_ICON_IMAGES['tng']);
    });
  });

  describe('unknown icons fall back to text', () => {
    it('renders [UnknownIcon] as bold text when no image mapping exists', () => {
      render(<IconsAggregate currentDeckRows={[makeRow({ icons: '[UnknownIcon]' })]} />);
      expect(screen.getByText('[UnknownIcon]')).toBeInTheDocument();
      expect(screen.queryByRole('img')).toBeNull();
    });
  });

  describe('icon counts', () => {
    it('displays the count prefix', () => {
      render(<IconsAggregate currentDeckRows={[makeRow({ icons: '[Cmd]', count: 3 })]} />);
      expect(screen.getByText(/3x/)).toBeInTheDocument();
    });

    it('aggregates the same icon across multiple personnel', () => {
      render(
        <IconsAggregate
          currentDeckRows={[
            makeRow({ icons: '[Cmd]', count: 2 }),
            makeRow({ icons: '[Cmd]', count: 3 }),
          ]}
        />
      );
      expect(screen.getByText(/5x/)).toBeInTheDocument();
    });
  });

  describe('filtering', () => {
    it('ignores non-personnel cards', () => {
      render(<IconsAggregate currentDeckRows={[makeRow({ type: 'ship', icons: '[Cmd]', count: 5 })]} />);
      expect(screen.queryByRole('img')).toBeNull();
    });

    it('ignores non-draw-pile cards', () => {
      render(
        <IconsAggregate
          currentDeckRows={[makeRow({ pile: 'dilemma', type: 'personnel', icons: '[Cmd]', count: 5 })]}
        />
      );
      expect(screen.queryByRole('img')).toBeNull();
    });
  });
});
