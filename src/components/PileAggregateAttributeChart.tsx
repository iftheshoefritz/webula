import BarChart from '../components/BarChart';
import { useMemo } from 'react';
import { unionAlignValues, unionSortedLabels } from '../lib/chartAggregation';

interface PileAggregateAttributeChartProps {
  currentDeckRows: Array<Record<string, any>>;
  filterFunction: (row: Record<string, any>) => boolean;
  attribute: 'integrity' | 'cunning' | 'strength';
  compareDeckRows?: Array<Record<string, any>>;
  compareLabel?: string;
}

function attributeCounts(
  rows: Array<Record<string, any>>,
  filterFunction: (row: Record<string, any>) => boolean,
  attribute: 'integrity' | 'cunning' | 'strength'
) {
  return rows
    .filter(filterFunction)
    .filter((row) => row[attribute] !== null && row[attribute] !== undefined && row[attribute] !== '')
    .reduce<Record<string, number>>((acc, row) => {
      const val = row[attribute];
      acc[val] = (acc[val] || 0) + row.count;
      return acc;
    }, {});
}

export default function PileAggregateAttributeChart({
  currentDeckRows,
  filterFunction,
  attribute,
  compareDeckRows,
  compareLabel
}: PileAggregateAttributeChartProps) {
  const { labels, values, compareValues } = useMemo(() => {
    const primaryCounts = attributeCounts(currentDeckRows, filterFunction, attribute);
    const compareCounts = compareDeckRows ? attributeCounts(compareDeckRows, filterFunction, attribute) : undefined;
    const labels = unionSortedLabels(primaryCounts, compareCounts, (a, b) => Number(a) - Number(b));
    const { values, compareValues } = unionAlignValues(primaryCounts, compareCounts, labels);
    return { labels, values, compareValues };
  }, [currentDeckRows, filterFunction, attribute, compareDeckRows]);

  return (
      <BarChart labels={labels} values={values} compareValues={compareValues} compareLabel={compareLabel}/>
  );
}
