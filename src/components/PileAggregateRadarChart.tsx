import RadarChart from './RadarChart';
import { useMemo } from 'react';

interface Deck {
  id: string;
  name: string;
  rows: Array<Record<string, any>>;
}

interface PileAggregateRadarChartProps {
  decks: Deck[];
}

const isDraw = (row: Record<string, any>) => row.pile === 'draw';
const isDrawPersonnel = (row: Record<string, any>) => row.pile === 'draw' && row.type === 'personnel';

/** Mean of `attribute` over rows passing `filterFunction`, weighted by `row.count`. */
function weightedAverage(
  rows: Array<Record<string, any>>,
  filterFunction: (row: Record<string, any>) => boolean,
  attribute: string
) {
  const filtered = rows
    .filter(filterFunction)
    .filter((row) => row[attribute] !== null && row[attribute] !== undefined && row[attribute] !== '');
  const totalCount = filtered.reduce((sum, row) => sum + row.count, 0);
  if (totalCount === 0) return 0;
  const totalValue = filtered.reduce((sum, row) => sum + Number(row[attribute]) * row.count, 0);
  return totalValue / totalCount;
}

const AXES: { key: string; label: string; compute: (rows: Array<Record<string, any>>) => number }[] = [
  { key: 'avgCost', label: 'Avg. Cost', compute: (rows) => weightedAverage(rows, isDraw, 'cost') },
  { key: 'avgIntegrity', label: 'Avg. Integrity', compute: (rows) => weightedAverage(rows, isDrawPersonnel, 'integrity') },
  { key: 'avgCunning', label: 'Avg. Cunning', compute: (rows) => weightedAverage(rows, isDrawPersonnel, 'cunning') },
  { key: 'avgStrength', label: 'Avg. Strength', compute: (rows) => weightedAverage(rows, isDrawPersonnel, 'strength') },
  { key: 'drawDeckSize', label: 'Draw Deck Size', compute: (rows) => rows.filter(isDraw).reduce((sum, row) => sum + row.count, 0) },
];

export default function PileAggregateRadarChart({ decks }: PileAggregateRadarChartProps) {
  const { labels, series } = useMemo(() => {
    const labels = AXES.map((axis) => axis.label);
    const rawByDeck = decks.map((deck) => AXES.map((axis) => axis.compute(deck.rows)));
    const maxes = AXES.map((_, axisIndex) => Math.max(0, ...rawByDeck.map((raw) => raw[axisIndex])));
    const series = decks.map((deck, i) => {
      const rawValues = rawByDeck[i];
      const values = rawValues.map((v, axisIndex) => (maxes[axisIndex] > 0 ? v / maxes[axisIndex] : 0));
      return { label: deck.name, values, rawValues };
    });
    return { labels, series };
  }, [decks]);

  return <RadarChart labels={labels} series={series} />;
}
