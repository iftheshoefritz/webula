// hooks/useDataFetching.js
import { useState, useEffect } from 'react';
import * as d3 from 'd3';
import { track } from '@vercel/analytics';
import { CardDef } from '../types';

const useDataFetching = () => {
  const [data, setData] = useState<any[]>([]);
  const [unparsedData, setUnparsedData] = useState('')
  const [filteredData, setFilteredData] = useState<any[]>([]);
  const [columns, setColumns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const nonFilterColumns = ['ImageFile'];

  useEffect(() => {
    console.log(`useEffect ${nonFilterColumns}`);
    const fetchData = async () => {
      track('useDataFetch.fetchCardsStart');
      console.log('fetchData');
      const response = await fetch('/cards_with_processed_columns.txt');
      track('useDataFetch.fetchCardsFinish');
      const text = await response.text();
      setUnparsedData(text);
      setLoading(false);
    };
    fetchData();
  }, [nonFilterColumns]);

  useEffect(() => {
    if (!loading) {
      track('useDataFetch.parseDataStart');
      const parsedData = d3.tsvParse(unparsedData);
      const formattedData = parsedData.map((row) => {
        const newRow = Object.fromEntries(
          Object.entries(row).map(([key, value]) =>
            nonFilterColumns.includes(key)
              ? [key.toLowerCase(), value as number]
              : [key.toLowerCase(), (value as string).toLowerCase()],
          ),
        )
        newRow.originalName = row.Name
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

  track('useDataFetching.parseDataFinish');
  return { data, filteredData, setFilteredData, columns, loading };
};

export default useDataFetching;
