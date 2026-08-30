import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import RadarChart from '../../components/RadarChart';

let capturedRadarProps: any = null;
jest.mock('react-chartjs-2', () => ({
  Radar: (props: any) => {
    capturedRadarProps = props;
    return null;
  },
}));

beforeEach(() => {
  capturedRadarProps = null;
});

describe('RadarChart', () => {
  it('renders a single radar dataset and no legend for a single series', () => {
    render(
      <RadarChart
        labels={['Cost', 'Integrity']}
        series={[{ label: 'Deck', values: [0.5, 1], rawValues: [3, 8] }]}
      />
    );
    expect(capturedRadarProps.data.datasets).toHaveLength(1);
    expect(capturedRadarProps.data.datasets[0]).toMatchObject({ label: 'Deck', data: [0.5, 1], rawValues: [3, 8] });
    expect(screen.queryByText('Deck')).not.toBeInTheDocument();
  });

  it('renders N radar datasets, each colored from the palette by index', () => {
    render(
      <RadarChart
        labels={['Cost', 'Integrity']}
        series={[
          { label: 'Deck 1', values: [0.5, 1], rawValues: [3, 8] },
          { label: 'Deck 2', values: [1, 0.5], rawValues: [6, 4] },
          { label: 'Deck 3', values: [0.2, 0.2], rawValues: [1, 2] },
        ]}
      />
    );
    const datasets = capturedRadarProps.data.datasets;
    expect(datasets).toHaveLength(3);
    const colors = datasets.map((d: any) => d.borderColor);
    expect(new Set(colors).size).toBe(3);
  });

  it('shows a legend row naming every series when there is more than one series', () => {
    render(
      <RadarChart
        labels={['Cost']}
        series={[
          { label: 'My deck', values: [0.5], rawValues: [3] },
          { label: 'My other deck', values: [1], rawValues: [6] },
        ]}
      />
    );
    expect(screen.getByText('My deck')).toBeInTheDocument();
    expect(screen.getByText('My other deck')).toBeInTheDocument();
  });

  it('toggles a radar dataset hidden on legend click and restores it on a second click', () => {
    render(
      <RadarChart
        labels={['Cost']}
        series={[
          { label: 'My deck', values: [0.5], rawValues: [3] },
          { label: 'My other deck', values: [1], rawValues: [6] },
        ]}
      />
    );
    const button = screen.getByRole('button', { name: /My deck/ });
    expect(capturedRadarProps.data.datasets[0].hidden).toBe(false);

    fireEvent.click(button);
    expect(capturedRadarProps.data.datasets[0].hidden).toBe(true);
    expect(capturedRadarProps.data.datasets[1].hidden).toBe(false);

    fireEvent.click(button);
    expect(capturedRadarProps.data.datasets[0].hidden).toBe(false);
  });
});
