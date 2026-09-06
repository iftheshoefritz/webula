import React from 'react';
import { render } from '@testing-library/react';
import AffiliationBadge from '../../components/AffiliationBadge';

describe('AffiliationBadge', () => {
  describe('compareCount', () => {
    it('renders no delta when compareCount is not provided', () => {
      const { queryByText } = render(<AffiliationBadge affiliation="Federation" count={4} />);
      expect(queryByText(/\(\+|\(-|\(0\)/)).toBeNull();
    });

    it('renders a delta relative to compareCount', () => {
      const { getByText } = render(<AffiliationBadge affiliation="Federation" count={4} compareCount={4} />);
      expect(getByText('(0)')).toBeInTheDocument();
    });
  });
});
