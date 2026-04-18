import BarChart from '../components/BarChart';
import { useMemo } from 'react';

interface PileAggregateAttributeChartProps {
  currentDeckRows: Array<Record<string, any>>;
  filterFunction: (row: Record<string, any>) => boolean;
  attribute: 'integrity' | 'cunning' | 'strength';
}

export default function PileAggregateAttributeChart({
  currentDeckRows,
  filterFunction,
  attribute
}: PileAggregateAttributeChartProps) {
  const values = useMemo(() => {
    const attrMatrix = currentDeckRows
          .filter(filterFunction)
          .filter((row) => row[attribute] !== null && row[attribute] !== undefined && row[attribute] !== '')
          .reduce<Record<string, number>>((acc, row) => {
            const val = row[attribute];
            acc[val] = (acc[val] || 0) + row.count;
            return acc;
          }, {});

    const sortedMatrix = Object.values(
      Object.fromEntries(
        Object.entries(attrMatrix).sort((a, b) => Number(a[0]) - Number(b[0]))
      )
    );
    return sortedMatrix;
  }, [currentDeckRows, filterFunction, attribute]);

  const labels = Array.from(
    new Set(
      currentDeckRows
        .filter(filterFunction)
        .filter((row) => row[attribute] !== null && row[attribute] !== undefined && row[attribute] !== '')
        .map((row) => row[attribute])
    )
  ).sort((a, b) => Number(a) - Number(b));

  return (
      <BarChart labels={labels} values={values}/>
  );
}
