// hooks/useDataFetching.js
import { useState, useEffect } from 'react';
import * as d3 from 'd3';

const useDataFetching = () => {
  const [data, setData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [columns, setColumns] = useState([]);
  const [loading, setLoading] = useState(true);
  const nonFilterColumns = ['ImageFile']; // Replace with your actual column names

  useEffect(() => {
    const fetchData = async () => {
      const response = await fetch('/cards_with_processed_columns.txt');
      const text = await response.text();
      const parsedData = d3.tsvParse(text);
      const formattedData = parsedData.map((row) =>
        Object.fromEntries(
          Object.entries(row).map(([key, value]) =>
            nonFilterColumns.includes(key)
              ? [key.toLowerCase(), value]
              : [key.toLowerCase(), value.toLowerCase()],
          ),
        ),
      );
      const dataWithStrippedCollectorsInfo = formattedData.map((row) => {
        const paddedCollectorsInfo = row.collectorsinfo;
        row.collectorsinfo = paddedCollectorsInfo.replace(/(^|[^0-9])0+(\d+)/g, '$1$2');
        return row
      });
      setData(dataWithStrippedCollectorsInfo);
      setFilteredData(formattedData);

      // Extract column names
      if (parsedData.length > 0) {
        setColumns(Object.keys(parsedData[0]).map((key) => key.toLowerCase()));
      }
      setLoading(false);
    };
    fetchData();
  }, []);

  return { data, filteredData, setFilteredData, columns, loading };
};

export default useDataFetching;
