import React from 'react';
import { render } from '@testing-library/react';
import PileAggregateAttributeChart from '../../components/PileAggregateAttributeChart';

// Capture props passed to BarChart so we can assert on labels/series
let capturedBarChartProps: { labels: any[]; series: { label: string; values: any[] }[]; type?: string } | null = null;
jest.mock('../../components/BarChart', () => (props: { labels: any[]; series: { label: string; values: any[] }[]; type?: string }) => {
  capturedBarChartProps = props;
  return null;
});

beforeEach(() => {
  capturedBarChartProps = null;
});

const personnelFilter = (row: Record<string, any>) =>
  row.pile === 'draw' && row.type === 'personnel';

const makeRow = (overrides = {}) => ({
  pile: 'draw',
  type: 'personnel',
  integrity: '',
  cunning: '',
  strength: '',
  count: 1,
  ...overrides,
});

const makeDeck = (id: string, name: string, rows: Array<Record<string, any>>) => ({ id, name, rows });

describe('PileAggregateAttributeChart', () => {
  it('does not request a chart type from BarChart by default', () => {
    render(<PileAggregateAttributeChart decks={[]} filterFunction={personnelFilter} attribute="integrity" />);
    expect(capturedBarChartProps!.type).toBeUndefined();
  });

  it('forwards an explicit type prop to BarChart', () => {
    render(<PileAggregateAttributeChart decks={[]} filterFunction={personnelFilter} attribute="integrity" type="line" />);
    expect(capturedBarChartProps!.type).toBe('line');
  });

  describe('0 decks', () => {
    it('renders no labels or series', () => {
      render(<PileAggregateAttributeChart decks={[]} filterFunction={personnelFilter} attribute="integrity" />);
      expect(capturedBarChartProps).not.toBeNull();
      expect(capturedBarChartProps!.labels).toEqual([]);
      expect(capturedBarChartProps!.series).toEqual([]);
    });
  });

  describe('1 deck', () => {
    it('renders without error when the deck has no rows', () => {
      render(
        <PileAggregateAttributeChart
          decks={[makeDeck('a', 'Deck A', [])]}
          filterFunction={personnelFilter}
          attribute="integrity"
        />
      );
      expect(capturedBarChartProps!.labels).toEqual([]);
      expect(capturedBarChartProps!.series).toEqual([{ label: 'Deck A', values: [] }]);
    });

    it('aggregates counts for the same attribute value', () => {
      render(
        <PileAggregateAttributeChart
          decks={[makeDeck('a', 'Deck A', [makeRow({ integrity: '4', count: 2 }), makeRow({ integrity: '4', count: 3 })])]}
          filterFunction={personnelFilter}
          attribute="integrity"
        />
      );
      expect(capturedBarChartProps!.labels).toEqual(['4']);
      expect(capturedBarChartProps!.series).toEqual([{ label: 'Deck A', values: [5] }]);
    });

    it('sorts labels and values numerically (not lexicographically)', () => {
      render(
        <PileAggregateAttributeChart
          decks={[
            makeDeck('a', 'Deck A', [
              makeRow({ strength: '10', count: 1 }),
              makeRow({ strength: '2', count: 3 }),
              makeRow({ strength: '7', count: 2 }),
            ]),
          ]}
          filterFunction={personnelFilter}
          attribute="strength"
        />
      );
      expect(capturedBarChartProps!.labels).toEqual(['2', '7', '10']);
      expect(capturedBarChartProps!.series[0].values).toEqual([3, 2, 1]);
    });

    it('excludes rows that do not pass the filterFunction', () => {
      render(
        <PileAggregateAttributeChart
          decks={[
            makeDeck('a', 'Deck A', [
              makeRow({ pile: 'mission', type: 'mission', integrity: '6', count: 5 }),
              makeRow({ integrity: '6', count: 1 }),
            ]),
          ]}
          filterFunction={personnelFilter}
          attribute="integrity"
        />
      );
      expect(capturedBarChartProps!.series[0].values).toEqual([1]);
    });

    it('excludes rows where the attribute is empty string, null, or undefined', () => {
      render(
        <PileAggregateAttributeChart
          decks={[
            makeDeck('a', 'Deck A', [
              makeRow({ integrity: '', count: 3 }),
              makeRow({ integrity: null, count: 4 }),
              makeRow({ integrity: undefined, count: 5 }),
              makeRow({ integrity: '5', count: 2 }),
            ]),
          ]}
          filterFunction={personnelFilter}
          attribute="integrity"
        />
      );
      expect(capturedBarChartProps!.labels).toEqual(['5']);
      expect(capturedBarChartProps!.series[0].values).toEqual([2]);
    });

    it('reads the correct attribute field based on the attribute prop', () => {
      const rows = [makeRow({ integrity: '3', cunning: '7', strength: '9', count: 1 })];
      const { rerender } = render(
        <PileAggregateAttributeChart decks={[makeDeck('a', 'Deck A', rows)]} filterFunction={personnelFilter} attribute="cunning" />
      );
      expect(capturedBarChartProps!.labels).toEqual(['7']);

      rerender(
        <PileAggregateAttributeChart decks={[makeDeck('a', 'Deck A', rows)]} filterFunction={personnelFilter} attribute="strength" />
      );
      expect(capturedBarChartProps!.labels).toEqual(['9']);
    });
  });

  describe('multiple decks', () => {
    it('unions and zero-fills labels when decks have a disjoint label set', () => {
      render(
        <PileAggregateAttributeChart
          decks={[
            makeDeck('a', 'Deck A', [makeRow({ integrity: '4', count: 2 })]),
            makeDeck('b', 'Deck B', [makeRow({ integrity: '6', count: 3 })]),
          ]}
          filterFunction={personnelFilter}
          attribute="integrity"
        />
      );
      expect(capturedBarChartProps!.labels).toEqual(['4', '6']);
      expect(capturedBarChartProps!.series).toEqual([
        { label: 'Deck A', values: [2, 0] },
        { label: 'Deck B', values: [0, 3] },
      ]);
    });

    it('unions partially-overlapping label sets and keeps arrays index-aligned across 3+ decks', () => {
      render(
        <PileAggregateAttributeChart
          decks={[
            makeDeck('a', 'Deck A', [makeRow({ integrity: '4', count: 2 }), makeRow({ integrity: '6', count: 1 })]),
            makeDeck('b', 'Deck B', [makeRow({ integrity: '6', count: 3 }), makeRow({ integrity: '8', count: 4 })]),
            makeDeck('c', 'Deck C', [makeRow({ integrity: '4', count: 5 })]),
          ]}
          filterFunction={personnelFilter}
          attribute="integrity"
        />
      );
      expect(capturedBarChartProps!.labels).toEqual(['4', '6', '8']);
      expect(capturedBarChartProps!.series.map((s) => s.label)).toEqual(['Deck A', 'Deck B', 'Deck C']);
      expect(capturedBarChartProps!.series[0].values).toEqual([2, 1, 0]);
      expect(capturedBarChartProps!.series[1].values).toEqual([0, 3, 4]);
      expect(capturedBarChartProps!.series[2].values).toEqual([5, 0, 0]);
    });
  });
});
