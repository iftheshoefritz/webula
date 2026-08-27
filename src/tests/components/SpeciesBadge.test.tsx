import React from 'react';
import { render } from '@testing-library/react';
import SpeciesBadge from '../../components/SpeciesBadge';

describe('SpeciesBadge', () => {
  describe('compareCount', () => {
    it('renders no delta when compareCount is not provided', () => {
      const { queryByText } = render(<SpeciesBadge species="Vulcan" count={4} />);
      expect(queryByText(/\(\+|\(-|\(0\)/)).toBeNull();
    });

    it('renders a delta relative to compareCount', () => {
      const { getByText } = render(<SpeciesBadge species="Vulcan" count={4} compareCount={4} />);
      expect(getByText('(0)')).toBeInTheDocument();
    });
  });
});
