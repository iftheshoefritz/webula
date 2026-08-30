import React from 'react';
import { render } from '@testing-library/react';
import PileAggregateRadarChart from '../../components/PileAggregateRadarChart';

// Capture props passed to RadarChart so we can assert on labels/series
let capturedRadarChartProps: { labels: any[]; series: { label: string; values: number[]; rawValues: number[] }[] } | null = null;
jest.mock('../../components/RadarChart', () => (props: any) => {
  capturedRadarChartProps = props;
  return null;
});

beforeEach(() => {
  capturedRadarChartProps = null;
});

const makeRow = (overrides = {}) => ({
  pile: 'draw',
  type: 'personnel',
  cost: '',
  integrity: '',
  cunning: '',
  strength: '',
  count: 1,
  ...overrides,
});

const makeDeck = (id: string, name: string, rows: Array<Record<string, any>>) => ({ id, name, rows });

// Axes order: avgCost, avgIntegrity, avgCunning, avgStrength, drawDeckSize
describe('PileAggregateRadarChart', () => {
  describe('0 decks', () => {
    it('renders no series', () => {
      render(<PileAggregateRadarChart decks={[]} />);
      expect(capturedRadarChartProps).not.toBeNull();
      expect(capturedRadarChartProps!.series).toEqual([]);
      expect(capturedRadarChartProps!.labels).toEqual([
        'Avg. Cost',
        'Avg. Integrity',
        'Avg. Cunning',
        'Avg. Strength',
        'Draw Deck Size',
      ]);
    });
  });

  describe('1 deck', () => {
    it('renders zeros for every axis when the deck has no rows', () => {
      render(<PileAggregateRadarChart decks={[makeDeck('a', 'Deck A', [])]} />);
      const series = capturedRadarChartProps!.series[0];
      expect(series.label).toBe('Deck A');
      expect(series.rawValues).toEqual([0, 0, 0, 0, 0]);
      expect(series.values).toEqual([0, 0, 0, 0, 0]);
    });

    it('computes count-weighted averages and normalizes a single deck to 1 on every axis', () => {
      render(
        <PileAggregateRadarChart
          decks={[
            makeDeck('a', 'Deck A', [
              makeRow({ cost: '2', count: 2 }),
              makeRow({ cost: '4', count: 2 }),
              makeRow({ integrity: '6', cunning: '4', strength: '2', count: 1 }),
              makeRow({ integrity: '2', cunning: '8', strength: '6', count: 1 }),
            ]),
          ]}
        />
      );
      const series = capturedRadarChartProps!.series[0];
      // avgCost = (2*2 + 4*2) / 4 = 3
      // avgIntegrity = (6+2)/2 = 4, avgCunning = (4+8)/2 = 6, avgStrength = (2+6)/2 = 4
      // drawDeckSize = 6
      expect(series.rawValues).toEqual([3, 4, 6, 4, 6]);
      expect(series.values).toEqual([1, 1, 1, 1, 1]);
    });

    it('excludes rows where the attribute is empty string, null, or undefined from attribute averages', () => {
      render(
        <PileAggregateRadarChart
          decks={[
            makeDeck('a', 'Deck A', [
              makeRow({ integrity: '', count: 3 }),
              makeRow({ integrity: null, count: 4 }),
              makeRow({ integrity: undefined, count: 5 }),
              makeRow({ integrity: '5', count: 2 }),
            ]),
          ]}
        />
      );
      const series = capturedRadarChartProps!.series[0];
      expect(series.rawValues[1]).toBe(5); // avgIntegrity
    });

    it('excludes non-draw / non-personnel rows from the relevant axes', () => {
      render(
        <PileAggregateRadarChart
          decks={[
            makeDeck('a', 'Deck A', [
              makeRow({ pile: 'mission', type: 'mission', cost: '9', integrity: '9', count: 5 }),
              makeRow({ cost: '3', integrity: '3', count: 1 }),
            ]),
          ]}
        />
      );
      const series = capturedRadarChartProps!.series[0];
      expect(series.rawValues[0]).toBe(3); // avgCost only counts the draw-pile row
      expect(series.rawValues[1]).toBe(3); // avgIntegrity only counts the personnel row
      expect(series.rawValues[4]).toBe(1); // drawDeckSize only counts the draw-pile row
    });
  });

  describe('multiple decks', () => {
    it('normalizes each axis independently by its max raw value across the loaded decks, with disjoint data', () => {
      render(
        <PileAggregateRadarChart
          decks={[
            makeDeck('a', 'Deck A', [makeRow({ cost: '2', count: 1 })]),
            makeDeck('b', 'Deck B', [makeRow({ integrity: '10', count: 1 })]),
          ]}
        />
      );
      const [a, b] = capturedRadarChartProps!.series;
      expect(a.rawValues).toEqual([2, 0, 0, 0, 1]);
      expect(b.rawValues).toEqual([0, 10, 0, 0, 1]);
      // Deck A has the max (only) cost value -> normalized to 1; Deck B has 0 cost -> 0
      expect(a.values[0]).toBe(1);
      expect(b.values[0]).toBe(0);
      // Deck B has the max (only) integrity value -> normalized to 1; Deck A has 0 integrity -> 0
      expect(a.values[1]).toBe(0);
      expect(b.values[1]).toBe(1);
      // Both decks have equal draw deck size -> both normalize to 1
      expect(a.values[4]).toBe(1);
      expect(b.values[4]).toBe(1);
    });

    it('keeps series index-aligned with deck order across 3+ decks', () => {
      render(
        <PileAggregateRadarChart
          decks={[
            makeDeck('a', 'Deck A', [makeRow({ cost: '2', count: 1 })]),
            makeDeck('b', 'Deck B', [makeRow({ cost: '4', count: 1 })]),
            makeDeck('c', 'Deck C', [makeRow({ cost: '8', count: 1 })]),
          ]}
        />
      );
      const series = capturedRadarChartProps!.series;
      expect(series.map((s) => s.label)).toEqual(['Deck A', 'Deck B', 'Deck C']);
      expect(series[0].values[0]).toBeCloseTo(0.25);
      expect(series[1].values[0]).toBeCloseTo(0.5);
      expect(series[2].values[0]).toBe(1);
    });
  });
});
