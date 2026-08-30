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
  it('renders a single bar dataset and no legend for a single series', () => {
    render(<BarChart labels={['a', 'b']} series={[{ label: 'Deck', values: [1, 2] }]} />);
    expect(capturedBarProps.data.datasets).toHaveLength(1);
    expect(capturedBarProps.data.datasets[0]).toMatchObject({ type: 'bar', label: 'Deck', data: [1, 2] });
    expect(screen.queryByText('Deck')).not.toBeInTheDocument();
  });

  it('renders N bar datasets, each colored from the palette by index, and no line-type dataset', () => {
    render(
      <BarChart
        labels={['a', 'b']}
        series={[
          { label: 'Deck 1', values: [1, 2] },
          { label: 'Deck 2', values: [3, 4] },
          { label: 'Deck 3', values: [5, 6] },
        ]}
      />
    );
    const datasets = capturedBarProps.data.datasets;
    expect(datasets).toHaveLength(3);
    datasets.forEach((dataset: any) => {
      expect(dataset.type).toBe('bar');
    });
    const colors = datasets.map((d: any) => d.borderColor);
    expect(new Set(colors).size).toBe(3);
  });

  it('shows a legend row naming every series when there is more than one series', () => {
    render(
      <BarChart
        labels={['a']}
        series={[
          { label: 'My deck', values: [1] },
          { label: 'My other deck', values: [2] },
        ]}
      />
    );
    expect(screen.getByText('My deck')).toBeInTheDocument();
    expect(screen.getByText('My other deck')).toBeInTheDocument();
  });
});
