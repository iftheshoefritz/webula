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
  const { labels, values, compareValues } = useMemo(() => {
    const primaryCounts = costCounts(currentDeckRows, filterFunction);
    const compareCounts = compareDeckRows ? costCounts(compareDeckRows, filterFunction) : undefined;
    const labels = unionSortedLabels(primaryCounts, compareCounts, (a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const { values, compareValues } = unionAlignValues(primaryCounts, compareCounts, labels);
    return { labels, values, compareValues };
  }, [currentDeckRows, filterFunction, compareDeckRows]);

  return (
      <BarChart labels={labels} values={values} compareValues={compareValues} compareLabel={compareLabel}/>
  );
}
