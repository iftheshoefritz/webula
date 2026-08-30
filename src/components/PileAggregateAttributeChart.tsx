import BarChart from '../components/BarChart';
import { useMemo } from 'react';
import { unionAlignValues, unionSortedLabels } from '../lib/chartAggregation';

interface Deck {
  id: string;
  name: string;
  rows: Array<Record<string, any>>;
}

interface PileAggregateAttributeChartProps {
  decks: Deck[];
  filterFunction: (row: Record<string, any>) => boolean;
  attribute: 'integrity' | 'cunning' | 'strength';
  type?: 'bar' | 'line';
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

export default function PileAggregateAttributeChart({ decks, filterFunction, attribute, type }: PileAggregateAttributeChartProps) {
  const { labels, series } = useMemo(() => {
    const seriesCounts = decks.map((deck) => attributeCounts(deck.rows, filterFunction, attribute));
    const labels = unionSortedLabels(seriesCounts, (a, b) => Number(a) - Number(b));
    const values = unionAlignValues(seriesCounts, labels);
    const series = values.map((v, i) => ({
      label: decks[i].name,
      values: v,
    }));
    return { labels, series };
  }, [decks, filterFunction, attribute]);

  return (
      <BarChart labels={labels} series={series} type={type}/>
  );
}
