import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { CardDef, Deck } from "../types";

type SearchResultsProps = {
  filteredData: any[];
  onCardSelected?: (row: CardDef) => void;
  onCardDeselected?: (event: any, row: CardDef) => void;
  currentDeck?: Deck;
  withHover?: boolean;
};

export default function SearchResults({
  filteredData,
  onCardSelected,
  onCardDeselected,
  currentDeck,
  withHover,
}: SearchResultsProps) {
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [imageStyle, setImageStyle] = useState({});
  const [mounted, setMounted] = useState(false);

  // SSR guard: document.body doesn't exist during server-side rendering
  useEffect(() => {
    setMounted(true);
  }, []);

  let hoverTimeout: NodeJS.Timeout;

  const handleHover = (
    collectorsinfo: string,
    event: React.MouseEvent<HTMLImageElement, MouseEvent>,
  ): void => {
    console.log("hover");
    clearTimeout(hoverTimeout);
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
  };

  const handleUnhover = (): void => {
    console.log("unhover");
    hoverTimeout = setTimeout(() => {
      setHoveredItem(null);
      setImageStyle({ display: "none" });
    }, 100);
  };

  const handleLargeHover = () => {
    clearTimeout(hoverTimeout); // clear the timeout when entering the large image
  };

  const handleLargeUnhover = () => {
    hoverTimeout = setTimeout(() => {
      setHoveredItem(null);
      setImageStyle({ display: "none" });
    }, 100);
  };

  return (
    <>
      {filteredData.map((row: CardDef, index: number) => (
        <div className="relative" key={index}>
          <img
            src={`/cardimages/${row.imagefile}.jpg`}
            width={165}
            height={229}
            loading="lazy"
            alt={row.name}
            className="w-full h-auto"
            onClick={() => onCardSelected && onCardSelected(row)}
            onContextMenu={(event) => onCardDeselected && onCardDeselected(event, row)}
            onMouseEnter={(event) => handleHover(row.collectorsinfo, event)}
            onMouseLeave={handleUnhover}
          />
          {currentDeck && (
            <div className="absolute top-0 right-0 bg-black bg-opacity-50 text-white rounded-full px-2 py-1">
              {currentDeck[row.collectorsinfo]?.row?.count || 0}
            </div>
          )}
          {withHover && hoveredItem == row.collectorsinfo && mounted && createPortal(
            <div style={imageStyle}>
              <img
                src={`/cardimages/${row.imagefile}.jpg`}
                width={230}
                height={458}
                loading="lazy"
                alt={row.name}
                onMouseEnter={handleLargeHover}
                onMouseLeave={handleLargeUnhover}
                onClick={() => onCardSelected && onCardSelected(row)}
                onContextMenu={(event) => onCardDeselected && onCardDeselected(event, row)}
              />
              {currentDeck && (
                <div className="absolute top-0 right-0 bg-black bg-opacity-50 text-white rounded-full px-2 py-1">
                  {currentDeck[row.collectorsinfo]?.row?.count || 0}
                </div>
              )}
            </div>,
            document.body
          )}
        </div>
      ))}
    </>
  );
}
