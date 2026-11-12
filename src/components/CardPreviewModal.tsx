import React, { useEffect } from 'react';
import ReactDOM from 'react-dom';
import { showCardMissing } from '../lib/cardImageUrl';

type CardPreviewModalProps = {
  // The image URL, from `cardImageUrl` (#1614).
  imageSrc: string;
  name: string;
  // A z-index class; the default `z-50` sits below a modal of the practice table (#899).
  layer?: string;
  onClose: () => void;
};

const CardPreviewModal: React.FC<CardPreviewModalProps> = ({ imageSrc, name, layer = 'z-50', onClose }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const modal = (
    <div className={`fixed inset-0 ${layer} flex items-end justify-center`} onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative pb-6 px-4 flex justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative">
          <img
            src={imageSrc}
            onError={showCardMissing}
            alt={name}
            width={288}
            height={400}
            loading="lazy"
            className="rounded-xl block"
          />
          <div className="absolute inset-0 rounded-xl shadow-[inset_0_0_0_6px_black] pointer-events-none" />
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(modal, document.body);
};

export default CardPreviewModal;
