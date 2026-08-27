import React from 'react';
import { render } from '@testing-library/react';
import KeywordBadge from '../../components/KeywordBadge';

describe('KeywordBadge', () => {
  describe('compareCount', () => {
    it('renders no delta when compareCount is not provided', () => {
      const { queryByText } = render(<KeywordBadge keyword="Officer" count={4} />);
      expect(queryByText(/\(\+|\(-|\(0\)/)).toBeNull();
    });

    it('renders a delta relative to compareCount', () => {
      const { getByText } = render(<KeywordBadge keyword="Officer" count={4} compareCount={6} />);
      expect(getByText('(-2)')).toBeInTheDocument();
    });
  });
});
