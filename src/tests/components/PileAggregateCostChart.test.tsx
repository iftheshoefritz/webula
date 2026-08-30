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

describe('PileAggregateCostChart', () => {
  describe('empty deck', () => {
    it('renders without error when currentDeckRows is empty', () => {
      render(<PileAggregateCostChart currentDeckRows={[]} filterFunction={drawFilter} />);
      expect(capturedBarChartProps).not.toBeNull();
      expect(capturedBarChartProps!.labels).toEqual([]);
      expect(capturedBarChartProps!.series).toEqual([{ label: '# of Occurrences', values: [] }]);
    });
  });

  describe('aggregation', () => {
    it('aggregates counts for the same cost', () => {
      render(
        <PileAggregateCostChart
          currentDeckRows={[makeRow({ cost: '2', count: 2 }), makeRow({ cost: '2', count: 3 })]}
          filterFunction={drawFilter}
        />
      );
      expect(capturedBarChartProps!.labels).toEqual(['2']);
      expect(capturedBarChartProps!.series).toEqual([{ label: '# of Occurrences', values: [5] }]);
    });

    it('excludes rows that do not pass the filterFunction', () => {
      render(
        <PileAggregateCostChart
          currentDeckRows={[makeRow({ pile: 'dilemma', cost: '4', count: 5 }), makeRow({ cost: '4', count: 1 })]}
          filterFunction={drawFilter}
        />
      );
      expect(capturedBarChartProps!.series[0].values).toEqual([1]);
    });
  });

  describe('compareDeckRows', () => {
    it('renders only a single series when compareDeckRows is omitted', () => {
      render(<PileAggregateCostChart currentDeckRows={[makeRow({ cost: '2', count: 2 })]} filterFunction={drawFilter} />);
      expect(capturedBarChartProps!.series).toHaveLength(1);
    });

    it('unions and zero-fills labels when the comparison deck has a disjoint cost set', () => {
      render(
        <PileAggregateCostChart
          currentDeckRows={[makeRow({ cost: '2', count: 2 })]}
          compareDeckRows={[makeRow({ cost: '5', count: 3 })]}
          filterFunction={drawFilter}
        />
      );
      expect(capturedBarChartProps!.labels).toEqual(['2', '5']);
      expect(capturedBarChartProps!.series).toEqual([
        { label: '# of Occurrences', values: [2, 0] },
        { label: 'Comparison deck', values: [0, 3] },
      ]);
    });

    it('keeps both value arrays index-aligned with a shared label list', () => {
      render(
        <PileAggregateCostChart
          currentDeckRows={[makeRow({ cost: '2', count: 2 }), makeRow({ cost: '4', count: 1 })]}
          compareDeckRows={[makeRow({ cost: '4', count: 3 }), makeRow({ cost: '6', count: 4 })]}
          filterFunction={drawFilter}
        />
      );
      expect(capturedBarChartProps!.labels).toEqual(['2', '4', '6']);
      expect(capturedBarChartProps!.series[0].values).toEqual([2, 1, 0]);
      expect(capturedBarChartProps!.series[1].values).toEqual([0, 3, 4]);
    });

    it('labels the comparison series using compareLabel when provided', () => {
      render(
        <PileAggregateCostChart
          currentDeckRows={[makeRow({ cost: '2', count: 2 })]}
          compareDeckRows={[makeRow({ cost: '2', count: 3 })]}
          filterFunction={drawFilter}
          compareLabel="My other deck"
        />
      );
      expect(capturedBarChartProps!.series[1].label).toBe('My other deck');
    });
  });
});
