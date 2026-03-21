import React from 'react';
import { render, screen } from '@testing-library/react';
import IconPill from '../../components/IconPill';
import { CARD_ICON_IMAGES } from '../../lib/missionRequirements';

describe('IconPill', () => {
  describe('known icons', () => {
    it('renders an img for a known icon', () => {
      render(<IconPill icon="Cmd" count={1} />);
      const img = screen.getByRole('img', { name: 'Cmd' });
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('src', CARD_ICON_IMAGES['cmd']);
    });

    it('icon lookup is case-insensitive', () => {
      render(<IconPill icon="TNG" count={1} />);
      const img = screen.getByRole('img', { name: 'TNG' });
      expect(img).toHaveAttribute('src', CARD_ICON_IMAGES['tng']);
    });
  });

  describe('unknown icons', () => {
    it('renders bracketed bold text when no image mapping exists', () => {
      render(<IconPill icon="UnknownIcon" count={1} />);
      expect(screen.getByText('[UnknownIcon]')).toBeInTheDocument();
      expect(screen.queryByRole('img')).toBeNull();
    });
  });

  describe('count', () => {
    it('displays the count prefix', () => {
      render(<IconPill icon="Cmd" count={4} />);
      expect(screen.getByText(/4x/)).toBeInTheDocument();
    });
  });
});
