'use client';

import React, { useMemo, useState } from 'react';
import { LAYER_MODAL, LAYER_MODAL_BACKDROP } from '../../../lib/layers';
import { useEscapeLayer } from './useEscapeLayer';
import { safeModalMaxHeight, safeModalWidth } from './useSafeAreaInsets';

// The picker of a dilemma title for Tristan Adams's "+2: name a dilemma" (#1761): a search box over the
// titles (`nameableDilemmaTitles`: the bot's pile in a bot game, every dilemma title otherwise), at most
// `SHOWN` at a time. A choice hands the title to the page, which charges +2 and keeps the title in one log
// entry. The backdrop, Cancel and Escape close it with no change.

const SHOWN = 50;

export function DilemmaNamePicker({
  title,
  titles,
  onChoose,
  onClose,
}: {
  title: string;
  titles: string[];
  onChoose: (title: string) => void;
  onClose: () => void;
}) {
  useEscapeLayer(onClose);
  const [query, setQuery] = useState('');
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? titles.filter((t) => t.toLowerCase().includes(q)) : titles;
  }, [query, titles]);
  return (
    <>
      <button type="button" className={`fixed inset-0 ${LAYER_MODAL_BACKDROP} bg-black/40`} onClick={onClose} aria-label="Cancel naming a dilemma" />
      <div
        role="dialog"
        aria-label={`${title}: name a dilemma`}
        data-testid="dilemma-name-picker"
        className={`fixed left-1/2 top-1/2 ${LAYER_MODAL} flex -translate-x-1/2 -translate-y-1/2 flex-col gap-2 rounded-md border border-white/10 bg-bg-secondary p-3 shadow-lg`}
        style={{ maxHeight: safeModalMaxHeight(90), width: safeModalWidth('22rem') }}
      >
        <h2 className="text-sm font-semibold text-text-primary">{title}: name a dilemma (+2)</h2>
        <input
          type="search"
          data-testid="dilemma-name-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search dilemmas"
          aria-label="Search dilemmas"
          className="min-h-11 rounded border border-white/10 bg-bg-primary px-2 text-sm text-text-primary"
        />
        <div className="flex min-h-0 flex-col gap-1 overflow-y-auto">
          {matches.slice(0, SHOWN).map((t) => (
            <button
              key={t}
              type="button"
              data-testid="dilemma-name-choice"
              data-dilemma-title={t}
              onClick={() => onChoose(t)}
              className="flex min-h-11 shrink-0 items-center rounded border border-white/10 px-2 text-left text-sm text-text-primary"
            >
              {t}
            </button>
          ))}
          {matches.length === 0 && <p className="text-sm text-text-secondary">No dilemma matches.</p>}
          {matches.length > SHOWN && <p className="text-xs text-text-secondary">{matches.length - SHOWN} more: narrow the search.</p>}
        </div>
        <div className="flex justify-end border-t border-white/10 pt-2">
          <button type="button" data-testid="dilemma-name-cancel" onClick={onClose} className="btn-icon min-h-11 w-auto px-3 text-sm">
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}
