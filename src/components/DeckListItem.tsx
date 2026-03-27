// a typescript version of the DeckListItem component
import React, { SyntheticEvent } from 'react';
import { FaMinus, FaPlus } from 'react-icons/fa';
import CardPreviewModal from './CardPreviewModal';

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
  const [isTapped, setIsTapped] = React.useState(false);
  const [imageStyle, setImageStyle] = React.useState({
    top: '100%',
    bottom: 'auto'
  });

  const handleHover = (event: SyntheticEvent) => {
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

  const handleTouchStart = () => {
    setIsTapped(true);
  }

  return (
    <li
      className="flex relative justify-between h-9 px-1 text-text-secondary hover:bg-white/[0.04] rounded transition-colors"
      key={collectorsinfo}
    >
      <div className="flex gap-x-2 items-center">
        <div className="flex items-center self-stretch gap-x-1">
          <button
            onClick={decrementIncluded}
            className="flex items-center justify-center w-8 h-7 cursor-pointer hover:text-text-secondary rounded"
            aria-label="Decrease quantity"
          >
            <FaMinus />
          </button>
          <span className="w-6 text-center">{count}x</span>
          <button
            onClick={incrementIncluded}
            className="flex items-center justify-center w-8 h-7 cursor-pointer hover:text-text-secondary rounded"
            aria-label="Increase quantity"
          >
            <FaPlus />
          </button>
        </div>
        <div
          onMouseEnter={handleHover}
          onMouseLeave={handleUnhover}
          onTouchStart={handleTouchStart}
          className="text-sm"
        >
          {unique && <span>·</span>}
          {name}
        </div>
      </div>

      {isHovering && (
        <div
          className="absolute left-0 z-50"
          style={imageStyle}
        >
          <div className="relative">
            <img
              src={`/cardimages/${imagefile}.jpg`}
              alt={name}
              width={288}
              height={400}
              loading="lazy"
              className="rounded-xl block"
            />
            <div className="absolute inset-0 rounded-xl shadow-[inset_0_0_0_6px_black] pointer-events-none" />
          </div>
        </div>
      )}

      {isTapped && (
        <CardPreviewModal
          imagefile={imagefile}
          name={name}
          onClose={() => setIsTapped(false)}
        />
      )}
    </li>
  );
}

export default DeckListItem;
