'use client';

import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQueryState] = useState(() => searchParams.get('q') ?? '');
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const setSearchQuery = useCallback(
    (query: string) => {
      setSearchQueryState(query);
      const params = new URLSearchParams(searchParams.toString());
      if (query) {
        params.set('q', query);
      } else {
        params.delete('q');
      }
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );
  const filteredData = useFilterData(false, data, columns, searchQuery);
  const isVisible = useScrollVisibility({ suspended: isPopoverOpen });
  const overlayRef = useRef<HTMLDivElement>(null);
  const [overlayHeight, setOverlayHeight] = useState(112); // 7rem fallback

  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const size = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
      setOverlayHeight(size);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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
      <div ref={overlayRef} style={overlayStyle} className="bg-gradient-page px-4 py-4">
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

      <div className="max-w-7xl mx-auto" style={{ paddingTop: overlayHeight }}>
        <SearchResults
          filteredData={filteredData}
          variant="styled"
          useWindowScroll={true}
        />
      </div>
    </div>
  );
}
