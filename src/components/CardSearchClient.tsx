'use client';

import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import SearchBar, { extractTextPortion } from './SearchBar';
import SearchPills, { parseFilters } from './SearchPills';
import SearchResults from './SearchResults';
import useFilterData from '../hooks/useFilterData';
import useScrollVisibility from '../hooks/useScrollVisibility';
import type { CardData } from '../lib/loadCards';
import { PreviewBanner } from './PreviewBanner';

interface CardSearchClientProps {
  data: CardData[];
  columns: string[];
  isPreview?: boolean;
}

export default function CardSearchClient({ data, columns, isPreview = false }: CardSearchClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQueryState] = useState(() => searchParams.get('q') ?? '');
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const searchParamsRef = useRef(searchParams);
  useEffect(() => {
    searchParamsRef.current = searchParams;
  });

  const setSearchQuery = useCallback(
    (query: string) => {
      setSearchQueryState(query);
      const params = new URLSearchParams(searchParamsRef.current.toString());
      if (query) {
        params.set('q', query);
      } else {
        params.delete('q');
      }
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router]
  );
  const filteredData = useFilterData(false, data, columns, searchQuery);
  const isVisible = useScrollVisibility({ suspended: isPopoverOpen });
  const overlayRef = useRef<HTMLDivElement>(null);
  const compactBarRef = useRef<HTMLDivElement>(null);
  const [overlayHeight, setOverlayHeight] = useState(112); // 7rem fallback
  const [compactBarHeight, setCompactBarHeight] = useState(52); // fallback
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    setIsMobile(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

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

  useEffect(() => {
    const el = compactBarRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const size = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
      if (size > 0) setCompactBarHeight(size);
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

  // Compact bar summary text
  const compactBarSummary = useMemo(() => {
    const textPortion = extractTextPortion(searchQuery);
    const fieldFilters = parseFilters(searchQuery).filter(f => f.key !== '');
    const parts: string[] = [];
    if (textPortion) parts.push(`"${textPortion}"`);
    if (fieldFilters.length > 0) parts.push(`${fieldFilters.length} filter${fieldFilters.length !== 1 ? 's' : ''}`);
    return parts.join(' · ');
  }, [searchQuery]);

  const paddingTop = isMobile ? compactBarHeight : overlayHeight;

  return (
    // Use inline utilities rather than 'page-container' because that class applies
    // overflow-hidden which would prevent window-level scroll (needed for VirtuosoGrid
    // useWindowScroll=true and scroll detection in useScrollVisibility).
    <div className="min-h-screen bg-gradient-page font-body text-text-primary">
      {/* Desktop overlay - hidden on mobile */}
      <div ref={overlayRef} style={overlayStyle} className="bg-gradient-page hidden sm:block">
        <PreviewBanner isPreview={isPreview} />
        <div className="px-4 py-4">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <SearchBar
                  searchQuery={searchQuery}
                  setSearchQuery={setSearchQuery}
                  variant="styled"
                />
              </div>
            </div>
            <SearchPills
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              onPopoverOpenChange={setIsPopoverOpen}
            />
          </div>
        </div>
      </div>

      {/* Mobile compact bar - always visible on mobile, hidden on desktop */}
      <div
        ref={compactBarRef}
        className="fixed top-0 left-0 right-0 z-50 bg-gradient-page sm:hidden px-4 py-2"
      >
        <PreviewBanner isPreview={isPreview} />
        <button
          onClick={() => setIsMobileSearchOpen(true)}
          className="w-full flex items-center gap-2 px-3 py-2.5 bg-white/[0.05] border border-white/15 rounded-lg text-left"
          aria-label="Open search"
        >
          <span className="text-text-muted">⌕</span>
          <span className={`flex-1 text-sm truncate ${compactBarSummary ? 'text-text-primary' : 'text-text-muted'}`}>
            {compactBarSummary || 'Search cards...'}
          </span>
          <span className="text-text-muted text-xs">▾</span>
        </button>
      </div>

      {/* Mobile expanded search panel */}
      {isMobileSearchOpen && (
        <div className="fixed inset-0 z-[60] bg-gradient-page sm:hidden flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <span className="text-sm font-medium text-text-primary">Search</span>
            <button
              onClick={() => setIsMobileSearchOpen(false)}
              className="text-sm text-accent hover:text-accent/80 transition-colors px-2 py-1"
            >
              Done
            </button>
          </div>
          <div className="px-4 py-4 overflow-y-auto flex-1">
            <SearchBar
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              variant="styled"
              autoFocus
            />
            <SearchPills
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              onPopoverOpenChange={setIsPopoverOpen}
            />
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto" style={{ paddingTop }}>
        <SearchResults
          filteredData={filteredData}
          variant="styled"
          useWindowScroll={true}
        />
      </div>
    </div>
  );
}
