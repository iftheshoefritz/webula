import BarChart from '../components/BarChart';
import { useMemo } from 'react';

interface PileAggregateCostChartProps {
  currentDeckRows: Array<Record<string, any>>;
  filterFunction: (row: Record<string, any>) => boolean;
}

export default function PileAggregateCostChart({
  currentDeckRows,
  filterFunction
}: PileAggregateCostChartProps) {
  const values = useMemo(() => {
    const costMatrix = currentDeckRows
          .filter(filterFunction)
          .reduce<Record<string, number>>((acc, row) => {acc[row.cost] = (acc[row.cost] || 0) + row.count; return acc}, {});

    const sortedMatrix = Object.values(
      Object.fromEntries(
        Object.entries(
          costMatrix
        ).sort()
      )
    );
    return sortedMatrix;
  }, [currentDeckRows]);

  const labels = Array.from(new Set(currentDeckRows.filter(filterFunction).map((row) => row.cost))).sort();

  return (
      <BarChart labels={labels} values={values}/>
  );
}
