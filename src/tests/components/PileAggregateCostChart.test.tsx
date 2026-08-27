import React from 'react';
import { render } from '@testing-library/react';
import PileAggregateCostChart from '../../components/PileAggregateCostChart';

// Capture props passed to BarChart so we can assert on labels/values
let capturedBarChartProps: { labels: any[]; values: any[]; compareValues?: any[]; compareLabel?: string } | null = null;
jest.mock('../../components/BarChart', () => (props: { labels: any[]; values: any[]; compareValues?: any[]; compareLabel?: string }) => {
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
      expect(capturedBarChartProps!.values).toEqual([]);
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
      expect(capturedBarChartProps!.values).toEqual([5]);
    });

    it('excludes rows that do not pass the filterFunction', () => {
      render(
        <PileAggregateCostChart
          currentDeckRows={[makeRow({ pile: 'dilemma', cost: '4', count: 5 }), makeRow({ cost: '4', count: 1 })]}
          filterFunction={drawFilter}
        />
      );
      expect(capturedBarChartProps!.values).toEqual([1]);
    });
  });

  describe('compareDeckRows', () => {
    it('does not pass compareValues when compareDeckRows is omitted', () => {
      render(<PileAggregateCostChart currentDeckRows={[makeRow({ cost: '2', count: 2 })]} filterFunction={drawFilter} />);
      expect(capturedBarChartProps!.compareValues).toBeUndefined();
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
      expect(capturedBarChartProps!.values).toEqual([2, 0]);
      expect(capturedBarChartProps!.compareValues).toEqual([0, 3]);
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
      expect(capturedBarChartProps!.values).toEqual([2, 1, 0]);
      expect(capturedBarChartProps!.compareValues).toEqual([0, 3, 4]);
    });
  });
});
