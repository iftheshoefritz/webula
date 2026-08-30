import React from 'react';
import { render } from '@testing-library/react';
import PileAggregateDilemmaTypeChart from '../../components/PileAggregateDilemmaTypeChart';

// Capture props passed to BarChart so we can assert on labels/series
let capturedBarChartProps: { labels: any[]; series: { label: string; values: any[] }[] } | null = null;
jest.mock('../../components/BarChart', () => (props: { labels: any[]; series: { label: string; values: any[] }[] }) => {
  capturedBarChartProps = props;
  return null;
});

beforeEach(() => {
  capturedBarChartProps = null;
});

const makeRow = (overrides = {}) => ({
  pile: 'dilemma',
  dilemmatype: 'p',
  count: 1,
  ...overrides,
});

describe('PileAggregateDilemmaTypeChart', () => {
  describe('empty deck', () => {
    it('renders without error when currentDeckRows is empty', () => {
      render(<PileAggregateDilemmaTypeChart currentDeckRows={[]} />);
      expect(capturedBarChartProps).not.toBeNull();
      expect(capturedBarChartProps!.labels).toEqual([]);
      expect(capturedBarChartProps!.series).toEqual([{ label: '# of Occurrences', values: [] }]);
    });
  });

  describe('aggregation', () => {
    it('aggregates counts by dilemma type and maps them to readable labels', () => {
      render(
        <PileAggregateDilemmaTypeChart
          currentDeckRows={[
            makeRow({ dilemmatype: 'p', count: 2 }),
            makeRow({ dilemmatype: 's', count: 3 }),
            makeRow({ dilemmatype: 'd', count: 1 }),
            makeRow({ dilemmatype: 'p', count: 1 }),
          ]}
        />
      );
      expect(capturedBarChartProps!.labels).toEqual(['Dual', 'Planet', 'Space']);
      expect(capturedBarChartProps!.series[0].values).toEqual([1, 3, 3]);
    });
  });

  describe('filtering', () => {
    it('excludes rows that are not in the dilemma pile', () => {
      render(
        <PileAggregateDilemmaTypeChart
          currentDeckRows={[
            makeRow({ pile: 'draw', dilemmatype: '', count: 5 }),
            makeRow({ dilemmatype: 'p', count: 2 }),
          ]}
        />
      );
      expect(capturedBarChartProps!.labels).toEqual(['Planet']);
      expect(capturedBarChartProps!.series[0].values).toEqual([2]);
    });

    it('excludes rows with an empty dilemmatype', () => {
      render(
        <PileAggregateDilemmaTypeChart
          currentDeckRows={[
            makeRow({ dilemmatype: '', count: 4 }),
            makeRow({ dilemmatype: 's', count: 2 }),
          ]}
        />
      );
      expect(capturedBarChartProps!.labels).toEqual(['Space']);
      expect(capturedBarChartProps!.series[0].values).toEqual([2]);
    });
  });

  describe('compareDeckRows', () => {
    it('renders only a single series when compareDeckRows is omitted', () => {
      render(<PileAggregateDilemmaTypeChart currentDeckRows={[makeRow({ dilemmatype: 'p', count: 2 })]} />);
      expect(capturedBarChartProps!.series).toHaveLength(1);
    });

    it('unions and zero-fills labels when the comparison deck has a disjoint dilemma-type set', () => {
      render(
        <PileAggregateDilemmaTypeChart
          currentDeckRows={[makeRow({ dilemmatype: 'p', count: 2 })]}
          compareDeckRows={[makeRow({ dilemmatype: 's', count: 3 })]}
        />
      );
      expect(capturedBarChartProps!.labels).toEqual(['Planet', 'Space']);
      expect(capturedBarChartProps!.series[0].values).toEqual([2, 0]);
      expect(capturedBarChartProps!.series[1].values).toEqual([0, 3]);
    });

    it('aligns values when both decks share the same dilemma types', () => {
      render(
        <PileAggregateDilemmaTypeChart
          currentDeckRows={[makeRow({ dilemmatype: 'p', count: 2 })]}
          compareDeckRows={[makeRow({ dilemmatype: 'p', count: 5 })]}
        />
      );
      expect(capturedBarChartProps!.labels).toEqual(['Planet']);
      expect(capturedBarChartProps!.series[0].values).toEqual([2]);
      expect(capturedBarChartProps!.series[1].values).toEqual([5]);
    });
  });
});
