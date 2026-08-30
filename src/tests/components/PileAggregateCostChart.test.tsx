import React from 'react';
import { render } from '@testing-library/react';
import PileAggregateCostChart from '../../components/PileAggregateCostChart';

// Capture props passed to BarChart so we can assert on labels/series
let capturedBarChartProps: { labels: any[]; series: { label: string; values: any[] }[] } | null = null;
jest.mock('../../components/BarChart', () => (props: { labels: any[]; series: { label: string; values: any[] }[] }) => {
  capturedBarChartProps = props;
  return null;
});

beforeEach(() => {
  capturedBarChartProps = null;
});

const drawFilter = (row: Record<string, any>) => row.pile === 'draw';

const makeRow = (overrides = {}) => ({
  pile: 'draw',
  cost: '3',
  count: 1,
  ...overrides,
});

const makeDeck = (id: string, name: string, rows: Array<Record<string, any>>) => ({ id, name, rows });

describe('PileAggregateCostChart', () => {
  describe('0 decks', () => {
    it('renders no labels or series', () => {
      render(<PileAggregateCostChart decks={[]} filterFunction={drawFilter} />);
      expect(capturedBarChartProps).not.toBeNull();
      expect(capturedBarChartProps!.labels).toEqual([]);
      expect(capturedBarChartProps!.series).toEqual([]);
    });
  });

  describe('1 deck', () => {
    it('renders without error when the deck has no rows', () => {
      render(<PileAggregateCostChart decks={[makeDeck('a', 'Deck A', [])]} filterFunction={drawFilter} />);
      expect(capturedBarChartProps!.labels).toEqual([]);
      expect(capturedBarChartProps!.series).toEqual([{ label: 'Deck A', values: [] }]);
    });

    it('aggregates counts for the same cost', () => {
      render(
        <PileAggregateCostChart
          decks={[makeDeck('a', 'Deck A', [makeRow({ cost: '2', count: 2 }), makeRow({ cost: '2', count: 3 })])]}
          filterFunction={drawFilter}
        />
      );
      expect(capturedBarChartProps!.labels).toEqual(['2']);
      expect(capturedBarChartProps!.series).toEqual([{ label: 'Deck A', values: [5] }]);
    });

    it('excludes rows that do not pass the filterFunction', () => {
      render(
        <PileAggregateCostChart
          decks={[makeDeck('a', 'Deck A', [makeRow({ pile: 'dilemma', cost: '4', count: 5 }), makeRow({ cost: '4', count: 1 })])]}
          filterFunction={drawFilter}
        />
      );
      expect(capturedBarChartProps!.series[0].values).toEqual([1]);
    });
  });

  describe('multiple decks', () => {
    it('unions and zero-fills labels when decks have disjoint cost sets', () => {
      render(
        <PileAggregateCostChart
          decks={[
            makeDeck('a', 'Deck A', [makeRow({ cost: '2', count: 2 })]),
            makeDeck('b', 'Deck B', [makeRow({ cost: '5', count: 3 })]),
          ]}
          filterFunction={drawFilter}
        />
      );
      expect(capturedBarChartProps!.labels).toEqual(['2', '5']);
      expect(capturedBarChartProps!.series).toEqual([
        { label: 'Deck A', values: [2, 0] },
        { label: 'Deck B', values: [0, 3] },
      ]);
    });

    it('keeps value arrays index-aligned with a shared label list across 3+ decks', () => {
      render(
        <PileAggregateCostChart
          decks={[
            makeDeck('a', 'Deck A', [makeRow({ cost: '2', count: 2 }), makeRow({ cost: '4', count: 1 })]),
            makeDeck('b', 'Deck B', [makeRow({ cost: '4', count: 3 }), makeRow({ cost: '6', count: 4 })]),
            makeDeck('c', 'Deck C', [makeRow({ cost: '2', count: 5 })]),
          ]}
          filterFunction={drawFilter}
        />
      );
      expect(capturedBarChartProps!.labels).toEqual(['2', '4', '6']);
      expect(capturedBarChartProps!.series.map((s) => s.label)).toEqual(['Deck A', 'Deck B', 'Deck C']);
      expect(capturedBarChartProps!.series[0].values).toEqual([2, 1, 0]);
      expect(capturedBarChartProps!.series[1].values).toEqual([0, 3, 4]);
      expect(capturedBarChartProps!.series[2].values).toEqual([5, 0, 0]);
    });
  });
});
