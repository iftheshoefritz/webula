// hooks/useDataFetching.js
import { useState, useEffect, useMemo } from 'react';
import * as d3 from 'd3';
import { track } from '../lib/analytics';

const nonFilterColumns = ['ImageFile'];

const useDataFetching = () => {
  const [unparsedData, setUnparsedData] = useState('')
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log(`useEffect ${nonFilterColumns}`);
    const fetchData = async () => {
      track('useDataFetch.fetchCardsStart');
      console.log('fetchData');
      try {
        const response = await fetch('/cards_with_processed_columns.txt');
        track('useDataFetch.fetchCardsFinish');
        const text = await response.text();
        setUnparsedData(text);
      } catch (error) {
        // Offline the fetch rejects (#1050). The hook then ends with no data, not stuck loading.
        console.warn('useDataFetching: the card data did not load', error);
      }
      setLoading(false);
    };
    fetchData();
  }, [nonFilterColumns]);

  // The parsed rows are derived from the fetched text, so they are not state of their own.
  const { data, filteredData, columns } = useMemo(() => {
    if (loading) return { data: [] as any[], filteredData: [] as any[], columns: [] as any[] };
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
      // A double-sided mission names two images (#765): the front first, then the back.
      const [front, back] = imageFile.split(',');
      row.imagefile = front;
      row.backimagefile = back ?? '';
      return row
    })
    const dataWithSeparatedTypes = dataWithSingleImageFile.map((row) => {
      const type = (row.type as string).toLowerCase();
      row.missiontype = type === 'mission' ? ((row.mission as string) ?? '') : '';
      delete (row as Record<string, unknown>).mission;
      if (type !== 'dilemma')  row.dilemmatype = '';
      return row;
    });
    // Extract column names
    const columns = parsedData.length > 0 ? Object.keys(parsedData[0]).map((key) => key.toLowerCase()) : [];
    // The later steps mutate the rows of formattedData, so filteredData holds the same rows as data.
    return { data: dataWithSeparatedTypes as any[], filteredData: formattedData as any[], columns };
  }, [unparsedData, loading]);

  // Reports the parse once it has run; the parse itself happens in render.
  useEffect(() => {
    if (loading) return;
    track('useDataFetch.parseDataStart');
    track('useDataFetching.parseDataFinish');
  }, [data, loading]);

  return { data, filteredData, columns, loading };
};

export default useDataFetching;
