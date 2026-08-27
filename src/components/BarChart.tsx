import React from 'react';
import { Bar } from 'react-chartjs-2';
import { Chart } from 'chart.js';
import { BarController, LinearScale, CategoryScale, PointElement, BarElement, LineController, LineElement, Tooltip, Title } from 'chart.js';

Chart.register(BarController, LinearScale, CategoryScale, PointElement, BarElement, LineController, LineElement, Tooltip, Title);

const options = {
  scales: {
    y: {
      beginAtZero: true,
    },
  },
};

interface BarChartProps {
  labels: (string | number)[];
  values: number[];
  /** Optional second series (e.g. a comparison deck), rendered as a line overlay rather than a second bar dataset. */
  compareValues?: number[];
  compareLabel?: string;
}

const BarChart = ({ labels, values, compareValues, compareLabel = 'Comparison deck' }: BarChartProps) => {
  const hasCompare = !!compareValues;

  const datasets: any[] = [{
    type: 'bar' as const,
    label: '# of Occurrences',
    data: values,
    backgroundColor: 'rgba(54, 162, 235, 0.5)',
    borderColor: 'rgba(54, 162, 235, 1)',
    borderWidth: 1,
  }];

  if (hasCompare) {
    datasets.push({
      type: 'line' as const,
      label: compareLabel,
      data: compareValues,
      borderColor: 'rgba(251, 191, 36, 1)',
      backgroundColor: 'rgba(251, 191, 36, 1)',
      borderWidth: 2,
      pointRadius: 3,
      fill: false,
      tension: 0,
    });
  }

  return (
    <>
      {hasCompare && (
        <div className="flex gap-4 text-xs text-text-secondary mb-2">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-sm bg-blue-500/70" />
            # of Occurrences
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-0.5 bg-amber-400" />
            {compareLabel}
          </span>
        </div>
      )}
      <Bar data={{ labels, datasets }} options={options} />
    </>
  );
};

export default BarChart;
