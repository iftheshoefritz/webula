import { useEffect, useMemo, useRef } from 'react';
import { filterCards } from '../lib/filterCards';
import { queryFields, track } from '../lib/analytics';

// A result reports once it has stood this long, so a report is a search and not a keystroke.
export const SEARCH_SETTLE_MS = 1500;

type CardRow = Record<string, any>;

const useFilterData = (loading: boolean, data: CardRow[], columns: string[], searchQuery: string, deckRows?: CardRow[]): CardRow[] => {
  console.log('starting useFilterData');
  const filteredData = useMemo(() => {
    console.log(searchQuery);
    return filterCards(data, columns, searchQuery, deckRows);
  }, [searchQuery, columns, data, deckRows]);

  // Reports a change of the filtered rows' content, once the result settles. The JSON of the
  // last report starts as that of no rows, so a first result with no rows reports nothing, as
  // before. The report names the fields of the query, never its text (#1408).
  const reportedJson = useRef(JSON.stringify([]));
  useEffect(() => {
    const timer = setTimeout(() => {
      const json = JSON.stringify(filteredData);
      if (json !== reportedJson.current) {
        reportedJson.current = json;
        track('deckBuilder.setFiltered', { ...queryFields(searchQuery), results: filteredData.length });
      }
    }, SEARCH_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [filteredData, searchQuery]);

  return filteredData;
}

export default useFilterData;
