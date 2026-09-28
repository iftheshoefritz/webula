// a typescript version of the DeckListItem component
import React, { SyntheticEvent } from 'react';
import ReactDOM from 'react-dom';
import { FaMinus, FaPlus } from 'react-icons/fa';
import CardPreviewModal from './CardPreviewModal';

type DeckListItemProps = {
  // With neither handler the row is read-only, as in the practice decklist (#899): the count
  // shows without the plus and minus buttons.
  incrementIncluded?: () => void;
  decrementIncluded?: (e: React.MouseEvent) => void;
  collectorsinfo: string;
  count: number;
  name: string;
  imagefile: string;
  unique: boolean;
  // A z-index class for the card image, for a row inside a modal (#899). The image then leaves
  // the row for `document.body`, so the modal's scroll box does not clip it, and it takes this
  // layer, so it draws above the modal.
  previewLayer?: string;
}

// a typescript and functional version of the DeckListItem component
const DeckListItem: React.FC<DeckListItemProps> = ({
  incrementIncluded,
  decrementIncluded,
  collectorsinfo,
  count,
  name,
  imagefile,
  unique,
  previewLayer,
}) => {
  const [isHovering, setIsHovering] = React.useState(false);
  const [isTapped, setIsTapped] = React.useState(false);
  const [imageStyle, setImageStyle] = React.useState<React.CSSProperties>({
    top: '100%',
    bottom: 'auto'
  });

  const handleHover = (event: SyntheticEvent) => {
    const viewportHeight = window.innerHeight;
    const liRect = event.currentTarget.getBoundingClientRect();
    const liCenter = liRect.top + liRect.height / 2;

    if (previewLayer) {
      // The image is fixed to the viewport, so place it from the row's own rect.
      setImageStyle(liCenter < viewportHeight / 2
        ? { left: liRect.left, top: liRect.bottom }
        : { left: liRect.left, bottom: viewportHeight - liRect.top });
    } else if (liCenter < viewportHeight / 2) {
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

  const hoverImage = (
    <div
      className={previewLayer ? `fixed ${previewLayer} pointer-events-none` : 'absolute left-0 z-50'}
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
  );

  return (
    <li
      className="flex relative justify-between h-9 px-1 text-text-secondary hover:bg-white/[0.04] rounded transition-colors"
      key={collectorsinfo}
    >
      <div className="flex gap-x-2 items-center">
        {incrementIncluded && decrementIncluded ? (
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
        ) : (
          <span className="w-6 text-center">{count}x</span>
        )}
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

      {isHovering && (previewLayer ? ReactDOM.createPortal(hoverImage, document.body) : hoverImage)}

      {isTapped && (
        <CardPreviewModal
          imagefile={imagefile}
          name={name}
          layer={previewLayer}
          onClose={() => setIsTapped(false)}
        />
      )}
    </li>
  );
}

export default DeckListItem;
