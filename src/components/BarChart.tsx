import React from 'react';
import { Bar } from 'react-chartjs-2';
import { Chart } from 'chart.js';
import { BarController, LinearScale, CategoryScale, PointElement, BarElement, Tooltip, Title } from 'chart.js';

Chart.register(BarController, LinearScale, CategoryScale, PointElement, BarElement, Tooltip, Title);

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
}

const BarChart = ({ labels, values }: BarChartProps) => (
    <>
    <Bar data={{
      labels: labels,
      datasets: [{
          label: '# of Occurrences',
          data: values,
          backgroundColor: 'rgba(54, 162, 235, 0.5)',
          borderColor: 'rgba(54, 162, 235, 1)',
          borderWidth: 1,
        }],
      }}
      options={options}
    />
    </>
);

export default BarChart;
