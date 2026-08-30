import BarChart from '../components/BarChart';
import { useMemo } from 'react';
import { unionAlignValues, unionSortedLabels } from '../lib/chartAggregation';

interface Deck {
  id: string;
  name: string;
  rows: Array<Record<string, any>>;
}

interface PileAggregateCostChartProps {
  decks: Deck[];
  filterFunction: (row: Record<string, any>) => boolean;
  type?: 'bar' | 'line';
}

function costCounts(rows: Array<Record<string, any>>, filterFunction: (row: Record<string, any>) => boolean) {
  return rows
    .filter(filterFunction)
    .reduce<Record<string, number>>((acc, row) => { acc[row.cost] = (acc[row.cost] || 0) + row.count; return acc }, {});
}

export default function PileAggregateCostChart({ decks, filterFunction, type }: PileAggregateCostChartProps) {
  const { labels, series } = useMemo(() => {
    const seriesCounts = decks.map((deck) => costCounts(deck.rows, filterFunction));
    const labels = unionSortedLabels(seriesCounts, (a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const values = unionAlignValues(seriesCounts, labels);
    const series = values.map((v, i) => ({
      label: decks[i].name,
      values: v,
    }));
    return { labels, series };
  }, [decks, filterFunction]);

  return (
      <BarChart labels={labels} series={series} type={type}/>
  );
}
