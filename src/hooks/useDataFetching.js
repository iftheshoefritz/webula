// hooks/useDataFetching.js
import { useState, useEffect } from 'react';
import * as d3 from 'd3';

const useDataFetching = () => {
  const [data, setData] = useState([]);
  const [unparsedData, setUnparsedData] = useState('')
  const [filteredData, setFilteredData] = useState([]);
  const [columns, setColumns] = useState([]);
  const [loading, setLoading] = useState(true);
  const nonFilterColumns = ['ImageFile'];

  useEffect(() => {
    console.log(`useEffect ${nonFilterColumns}`);
    const fetchData = async () => {
      console.log('fetchData');
      const response = await fetch('/cards_with_processed_columns.txt');
      const text = await response.text();
      setUnparsedData(text);
      setLoading(false);
    };
    fetchData();
  }, [nonFilterColumns]);

  useEffect(() => {
    console.log('parsing useEffect')
    if (!loading) {
      console.log('parsing useEffect: not loading');
      const parsedData = d3.tsvParse(unparsedData);
      const formattedData = parsedData.map((row) => {
        const newRow = Object.fromEntries(
          Object.entries(row).map(([key, value]) =>
            nonFilterColumns.includes(key)
              ? [key.toLowerCase(), value]
              : [key.toLowerCase(), value.toLowerCase()],
          ),
        )
        //console.log(`rowname= ${row.name}`);
        newRow.originalName = row.name
        //console.log(`original= ${row.originalName}`);
        return newRow;
      });
      const dataWithStrippedCollectorsInfo = formattedData.map((row) => {
        const paddedCollectorsInfo = row.collectorsinfo;
        row.collectorsinfo = paddedCollectorsInfo.replace(/(^|[^0-9])0+(\d+)/g, '$1$2');
        return row
      });
      const dataWithDotlessCommanderKeywords = dataWithStrippedCollectorsInfo.map((row) => {
        const dottedCommanderKeywords = row.keywords;
        row.keywords = dottedCommanderKeywords
          .replace(/U\.S\.S./i, 'uss')
          .replace(/I\.K\.S\./i, 'iks');
        return row
      });
      setData(dataWithDotlessCommanderKeywords);
      setFilteredData(formattedData);

      // Extract column names
      if (parsedData.length > 0) {
        setColumns(Object.keys(parsedData[0]).map((key) => key.toLowerCase()));
      }
    }
  }, [unparsedData])

  return { data, filteredData, setFilteredData, columns, loading };
};

export default useDataFetching;
