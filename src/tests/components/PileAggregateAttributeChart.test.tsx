import React from 'react';
import { render } from '@testing-library/react';
import PileAggregateAttributeChart from '../../components/PileAggregateAttributeChart';

// Capture props passed to BarChart so we can assert on labels/values
let capturedBarChartProps: { labels: any[]; values: any[] } | null = null;
jest.mock('../../components/BarChart', () => (props: { labels: any[]; values: any[] }) => {
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
      expect(capturedBarChartProps!.values).toEqual([]);
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
      expect(capturedBarChartProps!.values).toEqual([5]);
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
      expect(capturedBarChartProps!.values).toEqual([1, 2]);
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
      expect(capturedBarChartProps!.values).toEqual([3, 2, 1]);
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
      expect(capturedBarChartProps!.values).toEqual([1]);
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
      expect(capturedBarChartProps!.values).toEqual([2]);
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
      expect(capturedBarChartProps!.values).toEqual([1]);
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
      expect(capturedBarChartProps!.values).toEqual([2]);
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
});
