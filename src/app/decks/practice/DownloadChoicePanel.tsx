import React, { useRef, useState } from 'react';
import { LAYER_MODAL, LAYER_MODAL_BACKDROP } from '../../../lib/layers';
import { cardDisplayName } from '../../../lib/cardCount';
import { useEscapeLayer } from './useEscapeLayer';
import { panelScrollClassName, useScrollsVertically } from './CardListPanel';
import { ScrollIndicator } from './ScrollIndicator';
import { CardInstance } from './tableReducer';
import { safeModalMaxHeight, safeModalWidth } from './useSafeAreaInsets';
import { printedCost } from '../../../lib/playCost';
import { NO_CALLOUT_STYLE, useCardHold } from './useCardHold';

// One card of the picker: a toggle with its name and printed cost, and a hold that previews it.
export function DownloadOption({ card, on, disabled, onToggle }: { card: CardInstance; on: boolean; disabled: boolean; onToggle: () => void }) {
  const hold = useCardHold(card.id);
  return (
    <button
      type="button"
      data-testid="download-choice-card"
      data-card-choice={card.id}
      aria-pressed={on}
      disabled={disabled}
      onClick={onToggle}
      {...hold}
      style={NO_CALLOUT_STYLE}
      className={`flex min-h-11 items-center gap-2 rounded border px-2 text-left text-sm disabled:cursor-default disabled:opacity-50 ${
        on ? 'border-blue-400 bg-blue-500/20 text-text-primary' : 'border-white/10 text-text-primary'
      }`}
    >
      <span className="min-w-0 flex-1 truncate">{cardDisplayName(card.card)}</span>
      <span className="shrink-0 text-xs text-text-muted">cost {printedCost(card.card)}</span>
    </button>
  );
}

// The download choice of a play (#1762, K'mtar's "download up to two events"): the cards of the draw deck the
// choice may take, face up, since the player searches the deck, each a toggle, at most `max` on. Confirm
// hands the chosen ids to the page, Cancel, the backdrop and Escape close it with no change; Confirm with none
// chosen is disabled, since a download of nothing changes nothing.
export function DownloadChoicePanel({
  title,
  label,
  cards,
  max,
  discount,
  onConfirm,
  onClose,
}: {
  title: string;
  label: string;
  cards: CardInstance[];
  max: number;
  discount: number;
  onConfirm: (ids: string[]) => void;
  onClose: () => void;
}) {
  useEscapeLayer(onClose);
  const [chosen, setChosen] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrolls = useScrollsVertically(scrollRef, cards.length > 0, [cards.length]);
  const picked = chosen.filter((id) => cards.some((c) => c.id === id));
  const toggle = (id: string) => setChosen((ids) => (ids.includes(id) ? ids.filter((i) => i !== id) : ids.length < max ? [...ids, id] : ids));
  return (
    <>
      <button type="button" className={`fixed inset-0 ${LAYER_MODAL_BACKDROP} bg-black/40`} onClick={onClose} aria-label="Cancel the download" />
      <div
        role="dialog"
        aria-label={`${title}: ${label}`}
        data-testid="download-choice"
        className={`fixed left-1/2 top-1/2 ${LAYER_MODAL} flex -translate-x-1/2 -translate-y-1/2 flex-col gap-2 rounded-md border border-white/10 bg-bg-secondary p-3 shadow-lg`}
        style={{ maxHeight: safeModalMaxHeight(90), width: safeModalWidth('22rem') }}
      >
        <h2 className="text-sm font-semibold text-text-primary">
          {title}: download up to {max} {max === 1 ? 'event' : 'events'}
        </h2>
        <p data-testid="download-choice-summary" className="text-xs text-text-muted">
          {picked.length} of {max} chosen; each plays at cost −{discount} this turn
        </p>
        <div className="relative flex min-h-0 flex-col">
          <div ref={scrollRef} className={`flex min-h-0 flex-col gap-1 overscroll-contain ${panelScrollClassName(scrolls)}`}>
            {cards.length === 0 ? (
              <p className="text-sm text-text-muted">No event in the draw deck.</p>
            ) : (
              cards.map((c) => (
                <DownloadOption
                  key={c.id}
                  card={c}
                  on={picked.includes(c.id)}
                  disabled={!picked.includes(c.id) && picked.length >= max}
                  onToggle={() => toggle(c.id)}
                />
              ))
            )}
          </div>
          <ScrollIndicator scrollerRef={scrollRef} scrolls={scrolls} deps={[cards.length]} />
        </div>
        <div className="flex justify-end gap-2 border-t border-white/10 pt-2">
          <button type="button" data-testid="download-choice-cancel" onClick={onClose} className="btn-icon min-h-11 w-auto px-3 text-sm">
            Cancel
          </button>
          <button
            type="button"
            data-testid="download-choice-confirm"
            disabled={picked.length === 0}
            onClick={() => onConfirm(picked)}
            className="btn-icon min-h-11 w-auto px-3 text-sm disabled:cursor-default disabled:opacity-50"
          >
            Download
          </button>
        </div>
      </div>
    </>
  );
}
