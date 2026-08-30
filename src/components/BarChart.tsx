import React from 'react';
import { Bar } from 'react-chartjs-2';
import { Chart } from 'chart.js';
import { BarController, LinearScale, CategoryScale, BarElement, Tooltip, Title } from 'chart.js';

Chart.register(BarController, LinearScale, CategoryScale, BarElement, Tooltip, Title);

const options = {
  scales: {
    y: {
      beginAtZero: true,
    },
  },
};

/** Palette of distinct colors assigned to bar series by index. */
const PALETTE = [
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
}

const BarChart = ({ labels, series }: BarChartProps) => {
  const datasets = series.map((s, i) => {
    const color = PALETTE[i % PALETTE.length];
    return {
      type: 'bar' as const,
      label: s.label,
      data: s.values,
      backgroundColor: color.background,
      borderColor: color.border,
      borderWidth: 1,
    };
  });

  return (
    <>
      {series.length > 1 && (
        <div className="flex gap-4 text-xs text-text-secondary mb-2">
          {series.map((s, i) => (
            <span key={s.label} className="flex items-center gap-1">
              <span
                className="inline-block w-3 h-3 rounded-sm"
                style={{ backgroundColor: PALETTE[i % PALETTE.length].border }}
              />
              {s.label}
            </span>
          ))}
        </div>
      )}
      <Bar data={{ labels, datasets }} options={options} />
    </>
  );
};

export default BarChart;
