import { useState, useEffect } from 'react';
import { track } from '@vercel/analytics';
import { filterCards } from '../lib/filterCards';

type CardRow = Record<string, any>;

const useFilterData = (loading: boolean, data: CardRow[], columns: string[], searchQuery: string): CardRow[] => {
  console.log('starting useFilterData');
  const [filteredData, setFilteredData] = useState<CardRow[]>([]);

  useEffect(() => {
    console.log(searchQuery);
    const filtered = filterCards(data, columns, searchQuery);

    if (JSON.stringify(filtered) !== JSON.stringify(filteredData)) {
      track('deckBuilder.setFiltered', {q: searchQuery})
      setFilteredData(filtered);
    }
  }, [searchQuery, columns, data]);

  return filteredData;
}

export default useFilterData;
