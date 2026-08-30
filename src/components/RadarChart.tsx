import React, { useState } from 'react';
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

  const datasets = series.map((s, i) => {
    const color = PALETTE[i % PALETTE.length];
    return {
      label: s.label,
      data: s.values,
      rawValues: s.rawValues,
      backgroundColor: color.background,
      borderColor: color.border,
      borderWidth: 1,
      hidden: hiddenLabels.has(s.label),
    };
  });

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
      <Radar data={{ labels, datasets }} options={options} />
    </>
  );
};

export default RadarChart;
