'use client'

import '../styles/globals.css'

import { useState } from 'react';
import SearchBar from '../components/SearchBar';
import SearchResults from '../components/SearchResults';
import Help from '../components/Help';
import useDataFetching from '../hooks/useDataFetching';
import useFilterData from '../hooks/useFilterData';

export default function Home() {
  const { data, columns, loading } = useDataFetching();
  const [searchQuery, setSearchQuery] = useState('');
  const filteredData = useFilterData(loading, data, columns, searchQuery);

  return (
    <div>
      {loading ? (
        <p>Loading data...</p>
      ) : (
        <>
        <div className="container mx-auto p-8">
          <SearchBar searchQuery={searchQuery} setSearchQuery={setSearchQuery} />
          <Help/>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            <SearchResults filteredData={filteredData}/>
          </div>
        </div>
        </>
      )}
    </div>
  );
}
