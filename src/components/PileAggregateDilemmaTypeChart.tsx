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
  const { labels, series } = useMemo(() => {
    const primaryCounts = dilemmaTypeCounts(currentDeckRows);
    const compareCounts = compareDeckRows ? dilemmaTypeCounts(compareDeckRows) : undefined;
    const seriesCounts = compareCounts ? [primaryCounts, compareCounts] : [primaryCounts];
    const rawLabels = unionSortedLabels(seriesCounts, (a, b) => a.localeCompare(b));
    const values = unionAlignValues(seriesCounts, rawLabels);
    const labels = rawLabels.map((type) => DILEMMA_TYPE_LABELS[type] ?? type);
    const series = values.map((v, i) => ({
      label: i === 0 ? '# of Occurrences' : compareLabel ?? 'Comparison deck',
      values: v,
    }));
    return { labels, series };
  }, [currentDeckRows, compareDeckRows, compareLabel]);

  return (
      <BarChart labels={labels} series={series}/>
  );
}
