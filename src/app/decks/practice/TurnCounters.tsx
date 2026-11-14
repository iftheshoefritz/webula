import React from 'react';
import { LAYER_CHARGE_CHIP, LAYER_MODAL, LAYER_MODAL_BACKDROP } from '../../../lib/layers';
import { useEscapeLayer } from './useEscapeLayer';
import { ChargeTarget, LogCharge, TurnCounters } from './gameLog';
import type { TurnSegment } from './tableReducer';
import { SAFE_INSET_CSS, safeModalMaxHeight, safeModalWidth } from './useSafeAreaInsets';

// The counters of the turn (#1607): the chip of the last charge and the list of the turn's charges.
// The table's charge is a suggestion, so each one has Free, minus and plus. The UI word for a charge
// of nothing is "Free": "place" already means a card placed on another card.

// How long the chip shows after a charge, or after a correction through it.
export const CHARGE_CHIP_MS = 5000;

// "Draw" for a draw, the card's name for a play, "A card" for an unseen one.
export const chargeLabel = (charge: LogCharge): string => (charge.draw ? 'Draw' : (charge.card ?? 'A card'));

const targetKey = (target: ChargeTarget): string => `${target.entry}-${target.move ?? ''}-${target.card ?? ''}`;

const SMALL_BUTTON = 'btn-icon h-7 w-7 disabled:cursor-default disabled:opacity-40';

// One charge: its card and cost, then Free, minus and plus. Minus and Free stop at 0.
function ChargeRow({ charge, onCorrect }: { charge: LogCharge; onCorrect: (target: ChargeTarget, cost: number) => void }) {
  const label = chargeLabel(charge);
  return (
    <div data-testid="charge-row" className="flex items-center gap-1.5">
      <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
        {label} <span data-testid="charge-cost" className="font-semibold">{charge.cost}</span>
      </span>
      <button
        type="button"
        data-testid="charge-free"
        onClick={() => onCorrect(charge.target, 0)}
        disabled={charge.cost === 0}
        aria-label={`${label}: Free`}
        className="btn-icon h-7 w-auto px-2 text-xs disabled:cursor-default disabled:opacity-40"
      >
        Free
      </button>
      <button
        type="button"
        data-testid="charge-minus"
        onClick={() => onCorrect(charge.target, charge.cost - 1)}
        disabled={charge.cost === 0}
        aria-label={`${label}: one counter less`}
        className={SMALL_BUTTON}
      >
        −
      </button>
      <button
        type="button"
        data-testid="charge-plus"
        onClick={() => onCorrect(charge.target, charge.cost + 1)}
        aria-label={`${label}: one counter more`}
        className={SMALL_BUTTON}
      >
        +
      </button>
    </div>
  );
}

// The brief chip after a play or a draw that the table charged, at the top centre of the screen,
// clear of the hand arc and the bottom row. The page removes it after `CHARGE_CHIP_MS`, so it needs
// no tap.
export function ChargeChip({
  charges,
  onCorrect,
}: {
  charges: LogCharge[];
  onCorrect: (target: ChargeTarget, cost: number) => void;
}) {
  return (
    <div
      role="status"
      data-testid="charge-chip"
      className={`fixed left-1/2 -translate-x-1/2 ${LAYER_CHARGE_CHIP} flex flex-col gap-1 rounded-md border border-white/10 bg-bg-secondary/95 px-2 py-1.5 shadow-lg`}
      style={{ top: `calc(0.5rem + ${SAFE_INSET_CSS.top})`, width: 'min(16rem, calc(100vw - 9rem))' }}
    >
      {charges.map((charge) => (
        <ChargeRow key={targetKey(charge.target)} charge={charge} onCorrect={onCorrect} />
      ))}
    </div>
  );
}

// The list of the turn's charges, opened by a tap on the counter, with minus and plus for the turn's
// limit under them. A tap on the backdrop or Escape closes it.
export function TurnCountersList({
  charges,
  counters,
  onCorrect,
  onAdjustLimit,
  onClose,
}: {
  charges: LogCharge[];
  counters: TurnCounters;
  onCorrect: (target: ChargeTarget, cost: number) => void;
  onAdjustLimit: (delta: number) => void;
  onClose: () => void;
}) {
  useEscapeLayer(onClose);
  return (
    <>
      <button
        type="button"
        className={`fixed inset-0 ${LAYER_MODAL_BACKDROP} bg-black/40`}
        onClick={onClose}
        aria-label="Close the counters"
      />
      <div
        role="dialog"
        aria-label="Counters of this turn"
        data-testid="turn-counters-list"
        className={`fixed left-1/2 top-1/2 ${LAYER_MODAL} flex -translate-x-1/2 -translate-y-1/2 flex-col gap-2 rounded-md border border-white/10 bg-bg-secondary p-3 shadow-lg`}
        style={{ maxHeight: safeModalMaxHeight(85), width: safeModalWidth('20rem') }}
      >
        <h2 className="text-sm font-semibold text-text-primary">
          Counters: {counters.spent}/{counters.limit}
        </h2>
        <div className="flex flex-col gap-1 overflow-y-auto">
          {charges.length === 0 ? (
            <p className="text-sm text-text-muted">Nothing charged this turn.</p>
          ) : (
            charges.map((charge) => <ChargeRow key={targetKey(charge.target)} charge={charge} onCorrect={onCorrect} />)
          )}
        </div>
        <div data-testid="turn-counters-limit" className="flex items-center gap-1.5 border-t border-white/10 pt-2">
          <span className="flex-1 text-sm text-text-primary">
            Limit <span data-testid="turn-counters-limit-value" className="font-semibold">{counters.limit}</span>
          </span>
          <button
            type="button"
            data-testid="turn-counters-limit-minus"
            onClick={() => onAdjustLimit(-1)}
            disabled={counters.limit === 0}
            aria-label="One counter less this turn"
            className={SMALL_BUTTON}
          >
            −
          </button>
          <button
            type="button"
            data-testid="turn-counters-limit-plus"
            onClick={() => onAdjustLimit(1)}
            aria-label="One counter more this turn"
            className={SMALL_BUTTON}
          >
            +
          </button>
        </div>
      </div>
    </>
  );
}

// The counters spent and the limit of the turn (#1607), "4/7". Past the limit it goes on counting,
// in amber with `data-over`, and never stops a move. Outside play and draw it marks the counters left
// unspent, and nothing blocks the advance. A tap opens the list of the turn's charges.
export function TurnCounterButton({
  counters,
  segment,
  className,
  onOpen,
}: {
  counters: TurnCounters;
  segment: TurnSegment;
  className: string;
  onOpen: () => void;
}) {
  const { spent, limit } = counters;
  const over = spent > limit;
  const unspent = segment !== 'playAndDraw' && spent < limit ? limit - spent : 0;
  const text = over
    ? `Counters ${spent} of ${limit}, ${spent - limit} over`
    : unspent
      ? `Counters ${spent} of ${limit}, ${unspent} ${unspent === 1 ? 'counter' : 'counters'} unspent`
      : `Counters ${spent} of ${limit}`;
  return (
    <button
      type="button"
      data-testid="turn-counters"
      data-over={over ? 'true' : undefined}
      data-unspent={unspent ? 'true' : undefined}
      onClick={onOpen}
      aria-label={text}
      title={text}
      className={`${className} min-w-0 flex-1 px-0 text-[10px] font-semibold tabular-nums ${
        over ? 'text-amber-300' : unspent ? 'text-text-muted opacity-70' : 'text-text-primary'
      }`}
    >
      {spent}/{limit}
    </button>
  );
}
