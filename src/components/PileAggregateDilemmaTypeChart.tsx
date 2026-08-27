import BarChart from '../components/BarChart';
import { useMemo } from 'react';
import { unionAlignValues, unionSortedLabels } from '../lib/chartAggregation';

interface PileAggregateDilemmaTypeChartProps {
  currentDeckRows: Array<Record<string, any>>;
  compareDeckRows?: Array<Record<string, any>>;
  compareLabel?: string;
}

const DILEMMA_TYPE_LABELS: Record<string, string> = {
  p: 'Planet',
  s: 'Space',
  d: 'Dual',
};

function dilemmaTypeCounts(rows: Array<Record<string, any>>) {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    if (row.pile === 'dilemma' && row.dilemmatype) {
      counts[row.dilemmatype] = (counts[row.dilemmatype] || 0) + row.count;
    }
  }
  return counts;
}

export default function PileAggregateDilemmaTypeChart({
  currentDeckRows,
  compareDeckRows,
  compareLabel
}: PileAggregateDilemmaTypeChartProps) {
  const { labels, values, compareValues } = useMemo(() => {
    const primaryCounts = dilemmaTypeCounts(currentDeckRows);
    const compareCounts = compareDeckRows ? dilemmaTypeCounts(compareDeckRows) : undefined;
    const rawLabels = unionSortedLabels(primaryCounts, compareCounts, (a, b) => a.localeCompare(b));
    const { values, compareValues } = unionAlignValues(primaryCounts, compareCounts, rawLabels);
    const labels = rawLabels.map((type) => DILEMMA_TYPE_LABELS[type] ?? type);
    return { labels, values, compareValues };
  }, [currentDeckRows, compareDeckRows]);

  return (
      <BarChart labels={labels} values={values} compareValues={compareValues} compareLabel={compareLabel}/>
  );
}
