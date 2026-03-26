import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import IconPill from '../../components/IconPill';
import { CARD_ICON_IMAGES } from '../../lib/missionRequirements';

describe('IconPill', () => {
  describe('known icons', () => {
    it('renders an img for a known icon', () => {
      const { getByRole } = render(<IconPill icon="Cmd" count={1} />);
      const img = getByRole('img', { name: 'Cmd' });
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('src', CARD_ICON_IMAGES['cmd']);
    });

    it('icon lookup is case-insensitive', () => {
      const { getByRole } = render(<IconPill icon="TNG" count={1} />);
      const img = getByRole('img', { name: 'TNG' });
      expect(img).toHaveAttribute('src', CARD_ICON_IMAGES['tng']);
    });
  });

  describe('unknown icons', () => {
    it('renders bracketed bold text when no image mapping exists', () => {
      const { getByText, queryByRole } = render(<IconPill icon="UnknownIcon" count={1} />);
      expect(getByText('[UnknownIcon]')).toBeInTheDocument();
      expect(queryByRole('img')).toBeNull();
    });
  });

  describe('count', () => {
    it('displays the count prefix', () => {
      const { getByText } = render(<IconPill icon="Cmd" count={4} />);
      expect(getByText(/4x/)).toBeInTheDocument();
    });
  });

  describe('search button', () => {
    const hqOptions = [
      { label: 'Bajor', value: 'bajor' },
      { label: 'Cardassia Prime', value: 'cardassia prime' },
    ];

    it('renders no + button when onSearch is not provided', () => {
      const { queryByRole } = render(<IconPill icon="Cmd" count={1} />);
      expect(queryByRole('button')).toBeNull();
    });

    it('renders a + button when onSearch is provided', () => {
      const { getByRole } = render(
        <IconPill icon="Cmd" count={1} onSearch={jest.fn()} />
      );
      expect(getByRole('button', { name: /search personnel with cmd/i })).toBeInTheDocument();
    });

    it('calls onSearch(icon, null) directly when clicked with no hqOptions', () => {
      const onSearch = jest.fn();
      const { getByRole } = render(
        <IconPill icon="Stf" count={2} onSearch={onSearch} />
      );
      fireEvent.click(getByRole('button', { name: /search personnel with stf/i }));
      expect(onSearch).toHaveBeenCalledWith('Stf', null);
    });

    it('opens an overlay menu when clicked with hqOptions', () => {
      const { getByRole } = render(
        <IconPill icon="Cmd" count={1} onSearch={jest.fn()} hqOptions={hqOptions} />
      );
      fireEvent.click(getByRole('button', { name: /search personnel with cmd/i }));
      expect(getByRole('menu')).toBeInTheDocument();
    });

    it('calls onSearch with hq value when an overlay option is selected', () => {
      const onSearch = jest.fn();
      const { getByRole } = render(
        <IconPill icon="Cmd" count={1} onSearch={onSearch} hqOptions={hqOptions} />
      );
      fireEvent.click(getByRole('button', { name: /search personnel with cmd/i }));
      fireEvent.click(getByRole('menuitem', { name: 'Bajor' }));
      expect(onSearch).toHaveBeenCalledWith('Cmd', 'bajor');
    });

    it('calls onSearch with null when "Any HQ" is selected', () => {
      const onSearch = jest.fn();
      const { getByRole } = render(
        <IconPill icon="Cmd" count={1} onSearch={onSearch} hqOptions={hqOptions} />
      );
      fireEvent.click(getByRole('button', { name: /search personnel with cmd/i }));
      fireEvent.click(getByRole('menuitem', { name: 'Any HQ' }));
      expect(onSearch).toHaveBeenCalledWith('Cmd', null);
    });
  });
});
