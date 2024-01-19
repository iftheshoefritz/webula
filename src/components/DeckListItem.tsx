// a typescript version of the DeckListItem component
import React, { Component, SyntheticEvent } from 'react';
import Image from 'next/image';

type DeckListItemProps = {
  incrementIncluded: () => void;
  decrementIncluded: (e: React.MouseEvent) => void;
  collectorsinfo: string;
  count: number;
  name: string;
  imagefile: string;
  unique: boolean;
}

// a typescript and functional version of the DeckListItem component
const DeckListItem: React.FC<DeckListItemProps> = ({
  incrementIncluded,
  decrementIncluded,
  collectorsinfo,
  count,
  name,
  imagefile,
  unique
}) => {
  const [isHovering, setIsHovering] = React.useState(false);
  const [imageStyle, setImageStyle] = React.useState({
    top: '100%',
    bottom: 'auto'
  });

  const handleHover = (event: SyntheticEvent) => {
    const imageHeight = 403;
    const viewportHeight = window.innerHeight;
    const liRect = event.currentTarget.getBoundingClientRect();
    const liCenter = liRect.top + liRect.height / 2;

    if (liCenter < viewportHeight / 2) {
      // If the center of the li is in the top half of the viewport,
      // position the image below the li
      setImageStyle({ top: '100%', bottom: 'auto' });
    } else {
      // Otherwise, position the image above the li
      setImageStyle({ bottom: '100%', top: 'auto' });
    }

    setIsHovering(true);
  }

  const handleUnhover = () => {
    setIsHovering(false);
  }

  return (
    <li
      className="flex gap-x-2 relative"
      key={collectorsinfo}
    >
      <div>{count}x</div>
      <div
        onMouseEnter={handleHover}
        onMouseLeave={handleUnhover}
        onTouchStart={handleHover}
        onTouchEnd={handleUnhover}
      >
        {unique && <span>· </span>}
        {name}
      </div>
      <div>{collectorsinfo}</div>
      <div
        className="font-semibold"
        onClick={incrementIncluded}
      >+</div>
      <div
        className="font-semibold"
        onClick={decrementIncluded}
      >-</div>
      {isHovering && (
        <div
          className="absolute left-0 z-10"
          style={imageStyle}
        >
          <Image
            src={`/cardimages/${imagefile}.jpg`}
            alt={name}
            width={288}
            height={400}
            placeholder='blur'
            blurDataURL='/cardimages/cardback.jpg'
          />
        </div>
      )}
    </li>
  );
}

export default DeckListItem;
