'use client';

import { useMemo, useRef, useState } from 'react';
import SearchBar from './SearchBar';
import SearchPills from './SearchPills';
import SearchResults from './SearchResults';
import useFilterData from '../hooks/useFilterData';
import useScrollVisibility from '../hooks/useScrollVisibility';
import type { CardData } from '../lib/loadCards';

interface CardSearchClientProps {
  data: CardData[];
  columns: string[];
}

export default function CardSearchClient({ data, columns }: CardSearchClientProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const filteredData = useFilterData(false, data, columns, searchQuery);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isVisible = useScrollVisibility({ target: scrollRef });

  const overlayStyle = useMemo(
    () => ({
      position: 'fixed' as const,
      top: 0,
      left: 0,
      right: 0,
      zIndex: 50,
      opacity: isVisible ? 1 : 0,
      transform: isVisible ? 'translateY(0)' : 'translateY(-8px)',
      transition: 'opacity 300ms ease, transform 300ms ease',
      pointerEvents: (isVisible ? 'auto' : 'none') as React.CSSProperties['pointerEvents'],
    }),
    [isVisible]
  );

  const scrollContentStyle = useMemo(
    () => ({
      paddingTop: isVisible ? '7rem' : '0',
      transition: 'padding-top 300ms ease',
    }),
    [isVisible]
  );

  return (
    <div className="page-container h-screen">
      <div style={overlayStyle} className="px-4 py-4">
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

      <div ref={scrollRef} className="page-scroll">
        <div className="max-w-7xl mx-auto h-full" style={scrollContentStyle}>
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
