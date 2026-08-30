import React, { useState } from 'react';
import { Bar } from 'react-chartjs-2';
import { Chart } from 'chart.js';
import type { ChartDataset } from 'chart.js';
import {
  BarController,
  LinearScale,
  CategoryScale,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
  Title,
} from 'chart.js';

Chart.register(
  BarController,
  LinearScale,
  CategoryScale,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
  Title
);

const barOptions = {
  scales: {
    y: {
      beginAtZero: true,
    },
  },
};

const lineOptions = {
  ...barOptions,
  interaction: {
    mode: 'index' as const,
    intersect: false,
  },
  plugins: {
    tooltip: {
      mode: 'index' as const,
    },
  },
};

/** Palette of distinct colors assigned to bar series by index. */
export const PALETTE = [
  { background: 'rgba(54, 162, 235, 0.5)', border: 'rgba(54, 162, 235, 1)' },
  { background: 'rgba(251, 191, 36, 0.5)', border: 'rgba(251, 191, 36, 1)' },
  { background: 'rgba(75, 192, 192, 0.5)', border: 'rgba(75, 192, 192, 1)' },
  { background: 'rgba(255, 99, 132, 0.5)', border: 'rgba(255, 99, 132, 1)' },
  { background: 'rgba(153, 102, 255, 0.5)', border: 'rgba(153, 102, 255, 1)' },
];

interface BarChartSeries {
  label: string;
  values: number[];
}

interface BarChartProps {
  labels: (string | number)[];
  series: BarChartSeries[];
  type?: 'bar' | 'line';
}

const BarChart = ({ labels, series, type = 'bar' }: BarChartProps) => {
  const [hiddenLabels, setHiddenLabels] = useState<Set<string>>(new Set());

  const toggleSeries = (label: string) => {
    setHiddenLabels((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  };

  // Chart.js supports mixing dataset types (e.g. line datasets on a bar
  // chart) at runtime via a per-dataset `type` override, but
  // react-chartjs-2's typed `Bar` component only accepts `ChartDataset<'bar'>`.
  // Cast to that type here since the actual `type` field still drives
  // rendering correctly regardless of this static type.
  const datasets = series.map((s, i) => {
    const color = PALETTE[i % PALETTE.length];
    const hidden = hiddenLabels.has(s.label);
    if (type === 'line') {
      return {
        type: 'line' as const,
        label: s.label,
        data: s.values,
        backgroundColor: color.background,
        borderColor: color.border,
        fill: false,
        tension: 0,
        hidden,
      };
    }
    return {
      type: 'bar' as const,
      label: s.label,
      data: s.values,
      backgroundColor: color.background,
      borderColor: color.border,
      borderWidth: 1,
      hidden,
    };
  }) as ChartDataset<'bar', number[]>[];

  return (
    <>
      {series.length > 1 && (
        <div className="flex gap-4 text-xs text-text-secondary mb-2">
          {series.map((s, i) => {
            const hidden = hiddenLabels.has(s.label);
            return (
              <button
                key={s.label}
                type="button"
                onClick={() => toggleSeries(s.label)}
                aria-pressed={!hidden}
                aria-label={`${s.label}, ${hidden ? 'hidden' : 'shown'}, click to toggle`}
                className={`flex items-center gap-1 ${hidden ? 'opacity-40' : ''}`}
              >
                <span
                  className="inline-block w-3 h-3 rounded-sm"
                  style={{ backgroundColor: PALETTE[i % PALETTE.length].border }}
                />
                {s.label}
              </button>
            );
          })}
        </div>
      )}
      <Bar data={{ labels, datasets }} options={type === 'line' ? lineOptions : barOptions} />
    </>
  );
};

export default BarChart;
