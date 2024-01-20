import Image from "next/image";
import React, { useState } from "react";
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
    const scrollTop = window.scrollY || window.pageYOffset;
    const scrollLeft = window.scrollX || window.pageXOffset;

    setHoveredItem(collectorsinfo);
    const topPosition = targetRect.top + scrollTop + 5;
    let leftPosition = targetRect.left + scrollLeft + 5;

    // Check if the image would appear off the right edge of the screen
    // If so, adjust the left position so it appears to the left of the cursor instead
    if (leftPosition + imageWidth > viewportWidth) {
      leftPosition = targetRect.left + scrollLeft - imageWidth - 5;
    }

    // Check if the image would appear off the bottom edge of the screen
    // If so, adjust the top position so it appears above the cursor instead
    let finalTopPosition = topPosition;
    if (topPosition + imageHeight > viewportHeight + scrollTop) {
      finalTopPosition = targetRect.top + scrollTop - imageHeight - 5;
    }

    setImageStyle({
      position: "fixed",
      top: finalTopPosition,
      left: leftPosition,
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
          <Image
            src={`/cardimages/${row.imagefile}.jpg`}
            width={165}
            height={229}
            placeholder="blur"
            blurDataURL="/cardimages/cardback.jpg"
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
          {withHover && hoveredItem == row.collectorsinfo && (
            <div className="absolute left-0 z-10" style={imageStyle}>
              <Image
                src={`/cardimages/${row.imagefile}.jpg`}
                width={230}
                height={458}
                placeholder="blur"
                blurDataURL="/cardimages/cardback.jpg"
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
            </div>
          )}
        </div>
      ))}
    </>
  );
}
