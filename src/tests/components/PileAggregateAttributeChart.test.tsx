import React from 'react';
import { render } from '@testing-library/react';
import PileAggregateAttributeChart from '../../components/PileAggregateAttributeChart';

// Capture props passed to BarChart so we can assert on labels/series
let capturedBarChartProps: { labels: any[]; series: { label: string; values: any[] }[] } | null = null;
jest.mock('../../components/BarChart', () => (props: { labels: any[]; series: { label: string; values: any[] }[] }) => {
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

describe('PileAggregateAttributeChart', () => {
  describe('empty deck', () => {
    it('renders without error when currentDeckRows is empty', () => {
      render(
        <PileAggregateAttributeChart
          currentDeckRows={[]}
          filterFunction={personnelFilter}
          attribute="integrity"
        />
      );
      expect(capturedBarChartProps).not.toBeNull();
      expect(capturedBarChartProps!.labels).toEqual([]);
      expect(capturedBarChartProps!.series).toEqual([{ label: '# of Occurrences', values: [] }]);
    });
  });

  describe('aggregation', () => {
    it('aggregates counts for the same attribute value', () => {
      render(
        <PileAggregateAttributeChart
          currentDeckRows={[
            makeRow({ integrity: '4', count: 2 }),
            makeRow({ integrity: '4', count: 3 }),
          ]}
          filterFunction={personnelFilter}
          attribute="integrity"
        />
      );
      expect(capturedBarChartProps!.labels).toEqual(['4']);
      expect(capturedBarChartProps!.series[0].values).toEqual([5]);
    });

    it('produces separate buckets for different attribute values', () => {
      render(
        <PileAggregateAttributeChart
          currentDeckRows={[
            makeRow({ cunning: '5', count: 1 }),
            makeRow({ cunning: '7', count: 2 }),
          ]}
          filterFunction={personnelFilter}
          attribute="cunning"
        />
      );
      expect(capturedBarChartProps!.labels).toEqual(['5', '7']);
      expect(capturedBarChartProps!.series[0].values).toEqual([1, 2]);
    });
  });

  describe('sorting', () => {
    it('sorts labels and values numerically (not lexicographically)', () => {
      render(
        <PileAggregateAttributeChart
          currentDeckRows={[
            makeRow({ strength: '10', count: 1 }),
            makeRow({ strength: '2', count: 3 }),
            makeRow({ strength: '7', count: 2 }),
          ]}
          filterFunction={personnelFilter}
          attribute="strength"
        />
      );
      expect(capturedBarChartProps!.labels).toEqual(['2', '7', '10']);
      expect(capturedBarChartProps!.series[0].values).toEqual([3, 2, 1]);
    });
  });

  describe('filtering', () => {
    it('excludes rows that do not pass the filterFunction', () => {
      render(
        <PileAggregateAttributeChart
          currentDeckRows={[
            makeRow({ pile: 'mission', type: 'mission', integrity: '6', count: 5 }),
            makeRow({ integrity: '6', count: 1 }),
          ]}
          filterFunction={personnelFilter}
          attribute="integrity"
        />
      );
      // Only the draw-pile personnel row should count
      expect(capturedBarChartProps!.series[0].values).toEqual([1]);
    });

    it('excludes rows where the attribute is empty string', () => {
      render(
        <PileAggregateAttributeChart
          currentDeckRows={[
            makeRow({ integrity: '', count: 3 }),
            makeRow({ integrity: '5', count: 2 }),
          ]}
          filterFunction={personnelFilter}
          attribute="integrity"
        />
      );
      expect(capturedBarChartProps!.labels).toEqual(['5']);
      expect(capturedBarChartProps!.series[0].values).toEqual([2]);
    });

    it('excludes rows where the attribute is null', () => {
      render(
        <PileAggregateAttributeChart
          currentDeckRows={[
            makeRow({ cunning: null, count: 2 }),
            makeRow({ cunning: '6', count: 1 }),
          ]}
          filterFunction={personnelFilter}
          attribute="cunning"
        />
      );
      expect(capturedBarChartProps!.labels).toEqual(['6']);
      expect(capturedBarChartProps!.series[0].values).toEqual([1]);
    });

    it('excludes rows where the attribute is undefined', () => {
      render(
        <PileAggregateAttributeChart
          currentDeckRows={[
            makeRow({ strength: undefined, count: 4 }),
            makeRow({ strength: '8', count: 2 }),
          ]}
          filterFunction={personnelFilter}
          attribute="strength"
        />
      );
      expect(capturedBarChartProps!.labels).toEqual(['8']);
      expect(capturedBarChartProps!.series[0].values).toEqual([2]);
    });
  });

  describe('attribute prop', () => {
    it('reads the correct attribute field based on the attribute prop', () => {
      const rows = [
        makeRow({ integrity: '3', cunning: '7', strength: '9', count: 1 }),
      ];

      const { rerender } = render(
        <PileAggregateAttributeChart
          currentDeckRows={rows}
          filterFunction={personnelFilter}
          attribute="cunning"
        />
      );
      expect(capturedBarChartProps!.labels).toEqual(['7']);

      rerender(
        <PileAggregateAttributeChart
          currentDeckRows={rows}
          filterFunction={personnelFilter}
          attribute="strength"
        />
      );
      expect(capturedBarChartProps!.labels).toEqual(['9']);
    });
  });

  describe('compareDeckRows', () => {
    it('renders only a single series when compareDeckRows is omitted', () => {
      render(
        <PileAggregateAttributeChart
          currentDeckRows={[makeRow({ integrity: '4', count: 2 })]}
          filterFunction={personnelFilter}
          attribute="integrity"
        />
      );
      expect(capturedBarChartProps!.series).toHaveLength(1);
    });

    it('aligns values when the comparison deck has the same label set', () => {
      render(
        <PileAggregateAttributeChart
          currentDeckRows={[makeRow({ integrity: '4', count: 2 })]}
          compareDeckRows={[makeRow({ integrity: '4', count: 5 })]}
          filterFunction={personnelFilter}
          attribute="integrity"
        />
      );
      expect(capturedBarChartProps!.labels).toEqual(['4']);
      expect(capturedBarChartProps!.series[0].values).toEqual([2]);
      expect(capturedBarChartProps!.series[1].values).toEqual([5]);
    });

    it('unions and zero-fills labels when the comparison deck has a disjoint label set', () => {
      render(
        <PileAggregateAttributeChart
          currentDeckRows={[makeRow({ integrity: '4', count: 2 })]}
          compareDeckRows={[makeRow({ integrity: '6', count: 3 })]}
          filterFunction={personnelFilter}
          attribute="integrity"
        />
      );
      expect(capturedBarChartProps!.labels).toEqual(['4', '6']);
      expect(capturedBarChartProps!.series[0].values).toEqual([2, 0]);
      expect(capturedBarChartProps!.series[1].values).toEqual([0, 3]);
    });

    it('unions partially-overlapping label sets and keeps both arrays index-aligned', () => {
      render(
        <PileAggregateAttributeChart
          currentDeckRows={[
            makeRow({ integrity: '4', count: 2 }),
            makeRow({ integrity: '6', count: 1 }),
          ]}
          compareDeckRows={[
            makeRow({ integrity: '6', count: 3 }),
            makeRow({ integrity: '8', count: 4 }),
          ]}
          filterFunction={personnelFilter}
          attribute="integrity"
        />
      );
      expect(capturedBarChartProps!.labels).toEqual(['4', '6', '8']);
      expect(capturedBarChartProps!.series[0].values).toEqual([2, 1, 0]);
      expect(capturedBarChartProps!.series[1].values).toEqual([0, 3, 4]);
    });
  });
});
