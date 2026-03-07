'use client';

import { useState } from 'react';
import SearchBar from './SearchBar';
import SearchPills from './SearchPills';
import SearchResults from './SearchResults';
import useFilterData from '../hooks/useFilterData';
import type { CardData } from '../lib/loadCards';

interface CardSearchClientProps {
  data: CardData[];
  columns: string[];
}

export default function CardSearchClient({ data, columns }: CardSearchClientProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const filteredData = useFilterData(false, data, columns, searchQuery);

  return (
    <div className="page-container h-screen">
      <div className="px-4 py-4 flex-shrink-0">
        <div className="max-w-7xl mx-auto">
          <SearchBar
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            variant="styled"
          />
          <SearchPills
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
          />
        </div>
      </div>

      <div className="page-scroll">
        <div className="max-w-7xl mx-auto h-full">
          <SearchResults
            filteredData={filteredData}
            variant="styled"
            useWindowScroll={false}
          />
        </div>
      </div>
    </div>
  );
}
