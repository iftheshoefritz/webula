import React from 'react';
import { render, screen } from '@testing-library/react';
import BarChart from '../../components/BarChart';

let capturedBarProps: any = null;
jest.mock('react-chartjs-2', () => ({
  Bar: (props: any) => {
    capturedBarProps = props;
    return null;
  },
}));

beforeEach(() => {
  capturedBarProps = null;
});

describe('BarChart', () => {
  it('renders a single bar dataset and no legend when there is no comparison series', () => {
    render(<BarChart labels={['a', 'b']} values={[1, 2]} />);
    expect(capturedBarProps.data.datasets).toHaveLength(1);
    expect(capturedBarProps.data.datasets[0]).toMatchObject({ type: 'bar', data: [1, 2] });
    expect(screen.queryByText('Comparison deck')).not.toBeInTheDocument();
  });

  it('renders a second, line-type dataset when compareValues is provided', () => {
    render(<BarChart labels={['a', 'b']} values={[1, 2]} compareValues={[3, 4]} />);
    expect(capturedBarProps.data.datasets).toHaveLength(2);
    expect(capturedBarProps.data.datasets[0].type).toBe('bar');
    expect(capturedBarProps.data.datasets[1]).toMatchObject({ type: 'line', data: [3, 4] });
    expect(capturedBarProps.data.datasets[1].borderColor).not.toBe(capturedBarProps.data.datasets[0].borderColor);
  });

  it('shows a legend row with the comparison label when compareValues is provided', () => {
    render(<BarChart labels={['a']} values={[1]} compareValues={[2]} compareLabel="My other deck" />);
    expect(screen.getByText('My other deck')).toBeInTheDocument();
  });

  it('defaults the comparison label to "Comparison deck" when not provided', () => {
    render(<BarChart labels={['a']} values={[1]} compareValues={[2]} />);
    expect(screen.getByText('Comparison deck')).toBeInTheDocument();
  });
});
