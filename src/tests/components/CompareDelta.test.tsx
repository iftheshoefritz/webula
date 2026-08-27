import React from 'react';
import { render } from '@testing-library/react';
import CompareDelta from '../../components/CompareDelta';

describe('CompareDelta', () => {
  it('renders nothing when compareCount is undefined', () => {
    const { container } = render(<CompareDelta count={3} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a positive delta when count exceeds compareCount', () => {
    const { getByText } = render(<CompareDelta count={5} compareCount={3} />);
    expect(getByText('(+2)')).toBeInTheDocument();
  });

  it('renders a negative delta when count is below compareCount', () => {
    const { getByText } = render(<CompareDelta count={2} compareCount={5} />);
    expect(getByText('(-3)')).toBeInTheDocument();
  });

  it('renders a zero delta when counts are equal', () => {
    const { getByText } = render(<CompareDelta count={4} compareCount={4} />);
    expect(getByText('(0)')).toBeInTheDocument();
  });
});
