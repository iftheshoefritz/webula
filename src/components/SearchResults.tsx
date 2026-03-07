import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { VirtuosoGrid } from "react-virtuoso";
import { CardDef, Deck } from "../types";

const DEFAULT_GRID_CLASS =
  "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4";

type SearchResultsProps = {
  filteredData: any[];
  onCardSelected?: (row: CardDef) => void;
  onCardDeselected?: (event: any, row: CardDef) => void;
  currentDeck?: Deck;
  withHover?: boolean;
  useWindowScroll?: boolean;
  gridClassName?: string;
  variant?: 'legacy' | 'styled';
};

export default function SearchResults({
  filteredData,
  onCardSelected,
  onCardDeselected,
  currentDeck,
  withHover,
  useWindowScroll = true,
  gridClassName,
  variant = 'legacy',
}: SearchResultsProps) {
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [imageStyle, setImageStyle] = useState({});
  const [mounted, setMounted] = useState(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // SSR guard: document.body doesn't exist during server-side rendering
  useEffect(() => {
    setMounted(true);
  }, []);

  const handleHover = useCallback(
    (
      collectorsinfo: string,
      event: React.MouseEvent<HTMLImageElement, MouseEvent>,
    ): void => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
      const imageHeight = 230;
      const imageWidth = 458;
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      const targetRect = event.currentTarget.getBoundingClientRect();

      setHoveredItem(collectorsinfo);

      // Start by positioning to the right of the card
      let topPosition = targetRect.top + 5;
      let leftPosition = targetRect.right + 10;

      // If image extends past right edge, position to the left instead
      if (leftPosition + imageWidth > viewportWidth) {
        leftPosition = targetRect.left - imageWidth - 10;
      }

      // If image extends past bottom edge, position above instead
      if (topPosition + imageHeight > viewportHeight) {
        topPosition = targetRect.top - imageHeight - 10;
      }

      // If image now extends past top edge, position below instead
      if (topPosition < 0) {
        topPosition = targetRect.bottom + 10;
      }

      // Final safety check: if still extends past bottom, clamp to bottom
      if (topPosition + imageHeight > viewportHeight) {
        topPosition = Math.max(0, viewportHeight - imageHeight - 10);
      }

      setImageStyle({
        position: "fixed",
        top: topPosition,
        left: leftPosition,
        zIndex: 50,
      });
    },
    [],
  );

  const handleUnhover = useCallback((): void => {
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredItem(null);
      setImageStyle({ display: "none" });
    }, 100);
  }, []);

  const handleLargeHover = useCallback(() => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
  }, []);

  const handleLargeUnhover = useCallback(() => {
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredItem(null);
      setImageStyle({ display: "none" });
    }, 100);
  }, []);

  const styledGridClass = "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 px-4 py-4";
  const listClassName = variant === 'styled'
    ? styledGridClass
    : (gridClassName || DEFAULT_GRID_CLASS);

  const itemContent = useCallback(
    (index: number) => {
      const row: CardDef = filteredData[index];
      const isStyled = variant === 'styled';

      const cardWrapperClass = isStyled
        ? "relative rounded-lg overflow-hidden transition-transform duration-150 hover:scale-[1.02] hover:shadow-lg"
        : "relative";

      const badgeClass = isStyled
        ? "absolute top-2 right-2 bg-gradient-to-br from-[#4a6a4a] to-[#3a5a3a] text-text-primary text-sm font-mono font-medium rounded-full w-6 h-6 flex items-center justify-center"
        : "absolute top-0 right-0 bg-black bg-opacity-50 text-white rounded-full px-2 py-1";

      return (
        <div className={cardWrapperClass}>
          <img
            src={`/cardimages/${row.imagefile}.jpg`}
            width={165}
            height={229}
            loading="lazy"
            alt={row.name}
            className="w-full h-auto rounded-xl"
            onClick={() => onCardSelected && onCardSelected(row)}
            onContextMenu={(event) =>
              onCardDeselected && onCardDeselected(event, row)
            }
            onMouseEnter={(event) => handleHover(row.collectorsinfo, event)}
            onMouseLeave={handleUnhover}
          />
          {currentDeck && (
            <div className={badgeClass}>
              {currentDeck[row.collectorsinfo]?.row?.count || 0}
            </div>
          )}
          {withHover &&
            hoveredItem == row.collectorsinfo &&
            mounted &&
            createPortal(
              <div style={imageStyle}>
                <img
                  src={`/cardimages/${row.imagefile}.jpg`}
                  width={230}
                  height={458}
                  loading="lazy"
                  alt={row.name}
                  className="rounded-xl"
                  onMouseEnter={handleLargeHover}
                  onMouseLeave={handleLargeUnhover}
                  onClick={() => onCardSelected && onCardSelected(row)}
                  onContextMenu={(event) =>
                    onCardDeselected && onCardDeselected(event, row)
                  }
                />
                {currentDeck && (
                  <div className="absolute top-0 right-0 bg-black bg-opacity-50 text-white rounded-full px-2 py-1">
                    {currentDeck[row.collectorsinfo]?.row?.count || 0}
                  </div>
                )}
              </div>,
              document.body,
            )}
        </div>
      );
    },
    [
      filteredData,
      onCardSelected,
      onCardDeselected,
      currentDeck,
      withHover,
      hoveredItem,
      mounted,
      imageStyle,
      handleHover,
      handleUnhover,
      handleLargeHover,
      handleLargeUnhover,
      variant,
    ],
  );

  // When not using window scroll, VirtuosoGrid needs explicit height styling
  // to fill available space in scrollable containers
  const containerStyle = useWindowScroll ? undefined : { height: "100%", flex: "1 1 auto" };

  return (
    <VirtuosoGrid
      style={containerStyle}
      totalCount={filteredData.length}
      useWindowScroll={useWindowScroll}
      listClassName={listClassName}
      itemContent={itemContent}
    />
  );
}
