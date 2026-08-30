import React from 'react';
import { Radar } from 'react-chartjs-2';
import { Chart } from 'chart.js';
import { RadarController, RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Title } from 'chart.js';
import { PALETTE } from './BarChart';

Chart.register(RadarController, RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Title);

const options = {
  scales: {
    r: {
      beginAtZero: true,
      min: 0,
      max: 1,
      ticks: { display: false },
    },
  },
  plugins: {
    tooltip: {
      callbacks: {
        label: (context: any) => {
          const raw = context.dataset.rawValues?.[context.dataIndex];
          const value = raw === undefined ? context.formattedValue : Math.round(raw * 10) / 10;
          return `${context.dataset.label}: ${value}`;
        },
      },
    },
  },
};

interface RadarChartSeries {
  label: string;
  values: number[];
  rawValues: number[];
}

interface RadarChartProps {
  labels: string[];
  series: RadarChartSeries[];
}

const RadarChart = ({ labels, series }: RadarChartProps) => {
  const datasets = series.map((s, i) => {
    const color = PALETTE[i % PALETTE.length];
    return {
      label: s.label,
      data: s.values,
      rawValues: s.rawValues,
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
      <Radar data={{ labels, datasets }} options={options} />
    </>
  );
};

export default RadarChart;
