// The trigger offers of the table (#1904, part 2 of #1867): a stack of chips at the top centre, below the charge
// chip, laid out with it as the resolve prompt is (`useChargeChipBottom`), so both show at once. Each chip names its
// card, quotes the trigger, and holds Use and Skip; the player takes them in any order, and the table never forces
// one. The offers are derived from the log (`pendingTriggersOf`), so an undo and a reload agree. Escape collapses
// the stack to one small button, which a tap opens again; it never skips. The stack disables no other control.

import React, { useState } from 'react';
import { LAYER_TRIGGER_OFFERS } from '../../../lib/layers';
import { PROMPT_GAP, useChargeChipBottom } from './ResolvePrompt';
import type { TriggerOffer } from './triggers';
import { useEscapeLayer } from './useEscapeLayer';
import { SAFE_INSET_CSS } from './useSafeAreaInsets';

const offerKey = (o: TriggerOffer): string => `${o.target.entry}:${o.target.source}:${o.target.row}:${o.target.event}`;

export function TriggerOffers({
  offers,
  chipShown,
  hidden,
  escapeActive,
  onUse,
  onSkip,
}: {
  offers: TriggerOffer[];
  // Whether the charge chip shows, so the stack sits below it.
  chipShown: boolean;
  // During a drag: mounted, with no visibility and no pointer events.
  hidden: boolean;
  escapeActive: boolean;
  onUse: (offer: TriggerOffer) => void;
  onSkip: (offer: TriggerOffer) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  // A new set of offers opens the stack again.
  const key = offers.map(offerKey).join('|');
  const [prevKey, setPrevKey] = useState(key);
  if (key !== prevKey) {
    setPrevKey(key);
    setCollapsed(false);
  }
  useEscapeLayer(() => {
    if (!hidden) setCollapsed(true);
  }, escapeActive && offers.length > 0 && !collapsed);
  const chipBottom = useChargeChipBottom(chipShown);
  if (!offers.length) return null;
  const style: React.CSSProperties = {
    top: chipBottom !== null ? chipBottom + PROMPT_GAP : `calc(0.5rem + ${SAFE_INSET_CSS.top})`,
    visibility: hidden ? 'hidden' : 'visible',
    pointerEvents: hidden ? 'none' : undefined,
  };
  if (collapsed)
    return (
      <button
        type="button"
        data-testid="trigger-offers-collapsed"
        className={`fixed left-1/2 -translate-x-1/2 ${LAYER_TRIGGER_OFFERS} btn-primary h-7 whitespace-nowrap px-2 text-xs`}
        style={style}
        onClick={() => setCollapsed(false)}
      >
        {offers.length === 1 ? '1 trigger' : `${offers.length} triggers`}
      </button>
    );
  return (
    <div
      data-testid="trigger-offers"
      className={`fixed left-1/2 -translate-x-1/2 ${LAYER_TRIGGER_OFFERS} flex flex-col gap-1`}
      style={{ ...style, width: 'min(20rem, calc(100vw - 9rem))' }}
    >
      {offers.map((offer) => (
        <div
          key={offerKey(offer)}
          role="status"
          data-testid="trigger-offer"
          data-trigger-title={offer.row.title}
          className="flex items-center gap-2 rounded-md border border-amber-400/40 bg-bg-secondary/95 px-2 py-1 shadow-lg"
        >
          <div className="min-w-0 flex-1">
            <p data-testid="trigger-offer-name" className="truncate text-xs font-semibold text-text-primary">
              {offer.name}
            </p>
            <p data-testid="trigger-offer-text" className="line-clamp-2 text-[10px] leading-3 text-text-secondary">
              {offer.row.text}
            </p>
          </div>
          <button type="button" data-testid="trigger-offer-use" className="btn-primary h-7 shrink-0 px-2 text-xs" onClick={() => onUse(offer)}>
            Use
          </button>
          <button
            type="button"
            data-testid="trigger-offer-skip"
            className="btn-primary h-7 shrink-0 bg-none bg-white/[0.05] px-2 text-xs"
            onClick={() => onSkip(offer)}
          >
            Skip
          </button>
        </div>
      ))}
    </div>
  );
}
