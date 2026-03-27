// hooks/useDataFetching.js
import { useState, useEffect } from 'react';
import * as d3 from 'd3';
import posthog from 'posthog-js';

const nonFilterColumns = ['ImageFile'];

const useDataFetching = () => {
  const [data, setData] = useState<any[]>([]);
  const [unparsedData, setUnparsedData] = useState('')
  const [filteredData, setFilteredData] = useState<any[]>([]);
  const [columns, setColumns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log(`useEffect ${nonFilterColumns}`);
    const fetchData = async () => {
      posthog.capture('useDataFetch.fetchCardsStart');
      console.log('fetchData');
      const response = await fetch('/cards_with_processed_columns.txt');
      posthog.capture('useDataFetch.fetchCardsFinish');
      const text = await response.text();
      setUnparsedData(text);
      setLoading(false);
    };
    fetchData();
  }, [nonFilterColumns]);

  useEffect(() => {
    if (!loading) {
      posthog.capture('useDataFetch.parseDataStart');
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
      const dataWithSingleImageFile = dataWithDotlessCommanderKeywords.map((row) => {
        const imageFile = row.imagefile;
        row.imagefile = imageFile.split(',')[0];
        return row
      })
      const dataWithSeparatedTypes = dataWithSingleImageFile.map((row) => {
        const type = (row.type as string).toLowerCase();
        row.missiontype = type === 'mission' ? ((row.mission as string) ?? '') : '';
        delete (row as Record<string, unknown>).mission;
        if (type !== 'dilemma')  row.dilemmatype = '';
        return row;
      });
      setData(dataWithSeparatedTypes);
      setFilteredData(formattedData);

      // Extract column names
      if (parsedData.length > 0) {
        setColumns(Object.keys(parsedData[0]).map((key) => key.toLowerCase()));
      }
      posthog.capture('useDataFetching.parseDataFinish');
    }
  }, [unparsedData])

  return { data, filteredData, setFilteredData, columns, loading };
};

export default useDataFetching;
