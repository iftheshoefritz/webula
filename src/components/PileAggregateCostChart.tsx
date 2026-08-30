import BarChart from '../components/BarChart';
import { useMemo } from 'react';
import { unionAlignValues, unionSortedLabels } from '../lib/chartAggregation';

interface PileAggregateCostChartProps {
  currentDeckRows: Array<Record<string, any>>;
  filterFunction: (row: Record<string, any>) => boolean;
  compareDeckRows?: Array<Record<string, any>>;
  compareLabel?: string;
}

function costCounts(rows: Array<Record<string, any>>, filterFunction: (row: Record<string, any>) => boolean) {
  return rows
    .filter(filterFunction)
    .reduce<Record<string, number>>((acc, row) => { acc[row.cost] = (acc[row.cost] || 0) + row.count; return acc }, {});
}

export default function PileAggregateCostChart({
  currentDeckRows,
  filterFunction,
  compareDeckRows,
  compareLabel
}: PileAggregateCostChartProps) {
  const { labels, series } = useMemo(() => {
    const primaryCounts = costCounts(currentDeckRows, filterFunction);
    const compareCounts = compareDeckRows ? costCounts(compareDeckRows, filterFunction) : undefined;
    const seriesCounts = compareCounts ? [primaryCounts, compareCounts] : [primaryCounts];
    const labels = unionSortedLabels(seriesCounts, (a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const values = unionAlignValues(seriesCounts, labels);
    const series = values.map((v, i) => ({
      label: i === 0 ? '# of Occurrences' : compareLabel ?? 'Comparison deck',
      values: v,
    }));
    return { labels, series };
  }, [currentDeckRows, filterFunction, compareDeckRows, compareLabel]);

  return (
      <BarChart labels={labels} series={series}/>
  );
}
