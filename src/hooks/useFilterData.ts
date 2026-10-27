import { useEffect, useMemo, useRef } from 'react';
import posthog from 'posthog-js';
import { filterCards } from '../lib/filterCards';

type CardRow = Record<string, any>;

const useFilterData = (loading: boolean, data: CardRow[], columns: string[], searchQuery: string, deckRows?: CardRow[]): CardRow[] => {
  console.log('starting useFilterData');
  const filteredData = useMemo(() => {
    console.log(searchQuery);
    return filterCards(data, columns, searchQuery, deckRows);
  }, [searchQuery, columns, data, deckRows]);

  // Reports a change of the filtered rows' content. The JSON of the last report starts as
  // that of no rows, so a first result with no rows reports nothing, as before.
  const reportedJson = useRef(JSON.stringify([]));
  useEffect(() => {
    const json = JSON.stringify(filteredData);
    if (json !== reportedJson.current) {
      reportedJson.current = json;
      posthog.capture('deckBuilder.setFiltered', {q: searchQuery});
    }
  }, [filteredData, searchQuery]);

  return filteredData;
}

export default useFilterData;
