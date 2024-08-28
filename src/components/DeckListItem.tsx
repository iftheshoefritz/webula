// a typescript version of the DeckListItem component
import React, { Component, SyntheticEvent } from 'react';
import Image from 'next/image';
import { FaChevronUp, FaChevronDown } from 'react-icons/fa';

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
      className="flex relative justify-between h-14 px-1"
      key={collectorsinfo}
    >
      <div className="flex gap-x-2 items-center mt-2">
        <div className="flex flex-col items-center justify-center">
          <div
            onClick={incrementIncluded}
          >
            <FaChevronUp className="cursor-pointer hover:text-gray-500" />
          </div>
          <div >{count}x</div>
          <div
            onClick={decrementIncluded}
          >
            <FaChevronDown className="cursor-pointer hover:text-gray-500" />
          </div>
        </div>
        <div
          onMouseEnter={handleHover}
          onMouseLeave={handleUnhover}
          onTouchStart={handleHover}
          onTouchEnd={handleUnhover}
          className="text-lg"
        >
          {unique && <span>·</span>}
          {name}
        </div>
      </div>
      <div className="flex gap-x-2 items-center">
        <div>{collectorsinfo}</div>
      </div>
      {isHovering && (
        <div
          className="absolute left-0 z-50"
          style={imageStyle}
        >
          <Image
            src={`/cardimages/${imagefile}.jpg`}
            alt={name}
            width={288}
            height={400}
            placeholder='blur'
            blurDataURL='/cardimages/cardback.jpg'
            className="z-50"
          />
        </div>
      )}
    </li>
  );
}

export default DeckListItem;
