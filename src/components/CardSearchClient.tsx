'use client';

import { useState } from 'react';
import SearchBar from './SearchBar';
import SearchResults from './SearchResults';
import Help from './Help';
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
    <div className="container mx-auto p-8">
      <SearchBar searchQuery={searchQuery} setSearchQuery={setSearchQuery} />
      <Help />
      <SearchResults filteredData={filteredData} />
    </div>
  );
}
