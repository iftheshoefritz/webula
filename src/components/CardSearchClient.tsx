'use client';

import { useMemo, useState } from 'react';
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
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const filteredData = useFilterData(false, data, columns, searchQuery);
  const isVisible = useScrollVisibility({ suspended: isPopoverOpen });

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

  return (
    // Use inline utilities rather than 'page-container' because that class applies
    // overflow-hidden which would prevent window-level scroll (needed for VirtuosoGrid
    // useWindowScroll=true and scroll detection in useScrollVisibility).
    <div className="min-h-screen bg-gradient-page font-body text-text-primary">
      <div style={overlayStyle} className="bg-gradient-page px-4 py-4">
        <div className="max-w-7xl mx-auto">
          <SearchBar
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            variant="styled"
          />
          <SearchPills
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            onPopoverOpenChange={setIsPopoverOpen}
          />
        </div>
      </div>

      {/* pt-28 (7rem) matches the fixed overlay height so content is never hidden beneath it */}
      <div className="max-w-7xl mx-auto pt-28">
        <SearchResults
          filteredData={filteredData}
          variant="styled"
          useWindowScroll={true}
        />
      </div>
    </div>
  );
}
