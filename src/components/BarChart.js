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

const BarChart = ({labels, values}) => (
    <>
    <Bar data={{
      labels: labels,
      datasets: [{
          label: '# of Occurrences',
          data: values,
          borderWidth: 1,
        }],
      }}
      options={options}
    />
    </>
);

export default BarChart;
