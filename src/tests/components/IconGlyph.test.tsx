import React from 'react';
import { render } from '@testing-library/react';
import IconGlyph from '../../components/IconGlyph';
import { CARD_ICON_IMAGES } from '../../lib/missionRequirements';

describe('IconGlyph', () => {
  it('renders an img for a known icon', () => {
    const { getByRole } = render(<IconGlyph icon="Cmd" />);
    const img = getByRole('img', { name: 'Cmd' });
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', CARD_ICON_IMAGES['cmd']);
  });

  it('icon lookup is case-insensitive', () => {
    const { getByRole } = render(<IconGlyph icon="TNG" />);
    const img = getByRole('img', { name: 'TNG' });
    expect(img).toHaveAttribute('src', CARD_ICON_IMAGES['tng']);
  });

  it('renders bracketed bold text when no image mapping exists', () => {
    const { getByText, queryByRole } = render(<IconGlyph icon="UnknownIcon" />);
    expect(getByText('[UnknownIcon]')).toBeInTheDocument();
    expect(queryByRole('img')).toBeNull();
  });
});
