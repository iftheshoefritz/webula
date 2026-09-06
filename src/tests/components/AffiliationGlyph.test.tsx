import React from 'react';
import { render } from '@testing-library/react';
import AffiliationGlyph from '../../components/AffiliationGlyph';
import { AFFILIATION_ICONS } from '../../lib/missionRequirements';

describe('AffiliationGlyph', () => {
  it('renders an img for a known affiliation', () => {
    const { getByRole } = render(<AffiliationGlyph affiliation="Federation" />);
    const img = getByRole('img', { name: 'Federation' });
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', AFFILIATION_ICONS['federation']);
  });

  it('affiliation lookup is case-insensitive', () => {
    const { getByRole } = render(<AffiliationGlyph affiliation="KLINGON" />);
    const img = getByRole('img', { name: 'KLINGON' });
    expect(img).toHaveAttribute('src', AFFILIATION_ICONS['klingon']);
  });

  it('renders bracketed bold text when no image mapping exists', () => {
    const { getByText, queryByRole } = render(<AffiliationGlyph affiliation="Xindi" />);
    expect(getByText('[Xindi]')).toBeInTheDocument();
    expect(queryByRole('img')).toBeNull();
  });
});
