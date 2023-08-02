import BarChart from '../components/BarChart';
import { useMemo } from 'react';

export default function PileAggregateCostChart({
  currentDeckRows,
  filterFunction
}) {
  const values = useMemo(() => {
    const costMatrix = currentDeckRows
          .filter(filterFunction)
          .reduce((acc, row) => {acc[row.cost] = (acc[row.cost] || 0) + row.count; return acc}, {});

    const sortedMatrix = Object.values(
      Object.fromEntries(
        Object.entries(
          costMatrix
        ).sort()
      )
    );
    return sortedMatrix;
  }, [currentDeckRows]);

  const labels = [...new Set(currentDeckRows.filter(filterFunction).map((row) => row.cost))].sort();

  return (
      <BarChart labels={labels} values={values}/>
  );
}
