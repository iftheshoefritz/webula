import BarChart from '../components/BarChart';
import { useMemo } from 'react';

interface PileAggregateDilemmaTypeChartProps {
  currentDeckRows: Array<Record<string, any>>;
}

const DILEMMA_TYPE_LABELS: Record<string, string> = {
  p: 'Planet',
  s: 'Space',
  d: 'Dual',
};

export default function PileAggregateDilemmaTypeChart({
  currentDeckRows
}: PileAggregateDilemmaTypeChartProps) {
  const breakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const row of currentDeckRows) {
      if (row.pile === 'dilemma' && row.dilemmatype) {
        counts[row.dilemmatype] = (counts[row.dilemmatype] || 0) + row.count;
      }
    }
    return Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0]));
  }, [currentDeckRows]);

  const labels = breakdown.map(([type]) => DILEMMA_TYPE_LABELS[type] ?? type);
  const values = breakdown.map(([, count]) => count);

  return (
      <BarChart labels={labels} values={values}/>
  );
}
