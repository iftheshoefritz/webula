'use client';

import React from 'react';
import { LAYER_MODAL, LAYER_MODAL_BACKDROP } from '../../../lib/layers';
import { useEscapeLayer } from './useEscapeLayer';
import { safeModalMaxHeight, safeModalWidth } from './useSafeAreaInsets';

// The picker of Nimbus III's download (#1754): one entry per title of Caithlin Dar, Korrd and St. John
// Talbot in the draw deck. A choice hands the card's id to the page, which spends 3 counters, puts the
// card in Nimbus III's away team and shuffles the draw deck. The backdrop and Escape close it with no change.
export function MissionSpendPicker({
  title,
  choices,
  onChoose,
  onClose,
}: {
  title: string;
  choices: { id: string; name: string }[];
  onChoose: (id: string) => void;
  onClose: () => void;
}) {
  useEscapeLayer(onClose);
  return (
    <>
      <button
        type="button"
        className={`fixed inset-0 ${LAYER_MODAL_BACKDROP} bg-black/40`}
        onClick={onClose}
        aria-label="Cancel the download"
      />
      <div
        role="dialog"
        aria-label={`${title}: spend 3 counters to download`}
        data-testid="mission-spend-picker"
        className={`fixed left-1/2 top-1/2 ${LAYER_MODAL} flex -translate-x-1/2 -translate-y-1/2 flex-col gap-2 overflow-y-auto rounded-md border border-white/10 bg-bg-secondary p-3 shadow-lg`}
        style={{ maxHeight: safeModalMaxHeight(90), width: safeModalWidth('20rem') }}
      >
        <h2 className="text-sm font-semibold text-text-primary">{title}: spend 3 to download</h2>
        {choices.map((c) => (
          <button
            key={c.id}
            type="button"
            data-testid="mission-spend-choice"
            data-card-choice={c.id}
            onClick={() => onChoose(c.id)}
            className="flex min-h-11 items-center rounded border border-white/10 px-2 text-left text-sm text-text-primary"
          >
            {c.name}
          </button>
        ))}
        <div className="flex justify-end border-t border-white/10 pt-2">
          <button type="button" data-testid="mission-spend-cancel" onClick={onClose} className="btn-icon min-h-11 w-auto px-3 text-sm">
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}
