import React, { useState } from 'react';
import Image from 'next/image';

export default function SearchResults({ filteredData, onCardSelected, onCardDeselected, currentDeck, withHover, containerDimensions }) {
  
  const [hoveredItem, setHoveredItem] = useState(null);
  const [imageStyle, setImageStyle] = useState({});

  let hoverTimeout;

  const handleHover = (collectorsinfo, event) => {
    console.log('hover');
    clearTimeout(hoverTimeout);
    console.log('containerDimensions:');
    console.log(containerDimensions);
    console.log('target that we want scrollInfo for:');
    console.log(event.currentTarget);
    const imageHeight = 320;
    const imageWidth = 230;
    const viewportHeight = window.innerHeight;
    const containerWidth = containerDimensions.width;
    const targetRect = event.currentTarget.getBoundingClientRect();
    const scrollTop = window.scrollY || window.pageYOffset;
    const cursorY = event.pageY;

    setHoveredItem(collectorsinfo);
    const topPosition = targetRect.top + scrollTop + 5;
    let leftPosition = targetRect.left;

    // Check if the image would appear off the right edge of the screen
    // If so, adjust the left position so it appears to the left of the cursor instead
    if (leftPosition + imageWidth > containerWidth) {
        leftPosition = containerWidth - imageWidth - 5;
    }
    console.log(`width: ${containerWidth} leftPosition: ${leftPosition} imageWidth ${imageWidth} scrollTop ${scrollTop} pageYOffset ${window.pageYOffset} target.offsetTop: ${event.currentTarget.offsetTop}`);
    console.log(`rekt top: ${targetRect.top} bottom ${targetRect.bottom} left ${targetRect.left} right ${targetRect.right}`);
    console.log(`cursorY ${cursorY} viewportHeight ${viewportHeight}`);

    // Check if the image would appear off the bottom edge of the screen
    // If so, adjust the top position so it appears above the cursor instead
    let finalTopPosition = topPosition;
    if ((cursorY + imageHeight) > ( viewportHeight )) {
        finalTopPosition = viewportHeight - imageHeight - 5;
    }
    console.log(`finalTopPosition= ${finalTopPosition}`);

    setImageStyle({ position: 'fixed', top: finalTopPosition, left: leftPosition, maxWidth: 'none' });
  }

  const handleUnhover = () => {
    console.log('unhover');
    hoverTimeout = setTimeout(() => {
      setHoveredItem(null);
      setImageStyle({display: 'none'});
    }, 100);
  }

  const handleLargeHover = () => {
    clearTimeout(hoverTimeout); // clear the timeout when entering the large image
  }

  const handleLargeUnhover = () => {
    hoverTimeout = setTimeout(() => {
      setHoveredItem(null);
      setImageStyle({display: 'none'});
    }, 100);
  }

  return (
    <>
      {filteredData.map((row, index) => (
          <div className="relative" key={index}>
            <Image
              src={`/cardimages/${row.imagefile}.jpg`}
              width={165}
              height={229}
              placeholder='blur'
              blurDataURL='/cardimages/cardback.jpg'
              alt={row.name}
              className='w-full h-auto'
              onClick={() => (onCardSelected(row))}
              onContextMenu={() => (onCardDeselected(row))}
              onMouseEnter={(event) => handleHover(row.collectorsinfo, event)}
              onMouseLeave={handleUnhover}
            />
            { currentDeck &&
            <div className="absolute top-0 right-0 bg-black bg-opacity-50 text-white rounded-full px-2 py-1">
              { currentDeck[row.collectorsinfo]?.row?.count || 0}
            </div>
            }
            {( withHover && hoveredItem == row.collectorsinfo ) && (
              <div
                className='absolute left-0 z-10'
                style={imageStyle}
              >
                <Image
                  src={`/cardimages/${row.imagefile}.jpg`}
                  width={230}
                  height={458}
                  placeholder='blur'
                  blurDataURL='/cardimages/cardback.jpg'
                  alt={name}
                  onMouseEnter={handleLargeHover}
                  onMouseLeave={handleLargeUnhover}
                  onClick={() => (onCardSelected(row))}
                  onContextMenu={(event) => (onCardDeselected(event, row))}
                />
                { currentDeck &&
                  <div className="absolute top-0 right-0 bg-black bg-opacity-50 text-white rounded-full px-2 py-1">
                  { currentDeck[row.collectorsinfo]?.row?.count || 0}
                  </div>
                }
              </div>
            )}
        </div>
      ))}
    </>
  );
}
