import React from 'react';
import { useFinePointer } from './useFinePointer';

// The X at the top-right corner of a panel (#1780): a tap closes the panel, as a tap on its
// backdrop does, so a large panel that leaves only a thin band of backdrop is still easy to close.
// Its hit area is 44 px on a touch screen, in the round `btn-system` look of the corner buttons;
// a fine pointer gets the desktop's `btn-icon`. Its name, "Close panel", differs from the
// backdrop's, so the two stay apart for the tests and for a screen reader.
export default function PanelCloseButton({ onClose }: { onClose: () => void }) {
  const finePointer = useFinePointer();
  return (
    <button
      type="button"
      data-testid="panel-close"
      onClick={onClose}
      aria-label="Close panel"
      title="Close"
      className={`shrink-0 ${finePointer ? 'btn-icon' : 'btn-system w-11 h-11'}`}
    >
      <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
        <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
      </svg>
    </button>
  );
}
