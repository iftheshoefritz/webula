import React from 'react';
import { LAYER_CHARGE_CHIP, LAYER_MODAL, LAYER_MODAL_BACKDROP } from '../../../lib/layers';
import { choiceDiscardTop, countedCost, isCountedChoice, isDownloadChoice, isPersonnelChoice, type CostUse, type PendingDiscount } from '../../../lib/costModels/model';
import { pendingDiscountText } from '../../../lib/costModels/registry';
import { useEscapeLayer } from './useEscapeLayer';
import { ChargeTarget, LogCharge, TurnCounters } from './gameLog';
import type { TurnSegment } from './tableReducer';
import { SAFE_INSET_CSS, safeModalMaxHeight, safeModalWidth } from './useSafeAreaInsets';
import { ruleWarningText, type RuleWarning } from './playRules';

// The counters of the turn (#1607): the chip of the last charge and the list of the turn's charges.
// The table's charge is a suggestion, so each one has Free, minus and plus. The UI word for a charge
// of nothing is "Free": "place" already means a card placed on another card.

// How long the chip shows after a charge, or after a correction through it.
export const CHARGE_CHIP_MS = 5000;

// "Draw" for a draw, the card's name for a play, "A card" for an unseen one.
export const chargeLabel = (charge: LogCharge): string => (charge.draw ? 'Draw' : (charge.card ?? 'A card'));

const targetKey = (target: ChargeTarget): string => `${target.entry}-${target.move ?? ''}-${target.card ?? ''}`;

const SMALL_BUTTON = 'btn-icon h-7 w-7 disabled:cursor-default disabled:opacity-40';

// A correction of a charge: its target, the cost it sets, the title of the model whose choice it
// takes (#1654), and the count of a counted choice (#1695).
type OnCorrect = (target: ChargeTarget, cost: number, source?: string, count?: number) => void;

// A choice that raises the turn's limit (#1655): the charge that offered it, the counters it adds and
// the model's title.
type OnRaiseLimit = (target: ChargeTarget, delta: number, source: string) => void;

// A choice of personnel (#1712): the charge that offered it and the model's title. The page opens the picker.
type OnChoosePersonnel = (target: ChargeTarget, source: string) => void;
// A choice that names a dilemma (#1761): the page asks for the title, then sets `cost` with it.
type OnNameDilemma = (target: ChargeTarget, source: string, cost: number) => void;

// A use of a card on the table for a play (#1713): the charge, and the instance id of the card. With it,
// whether that card still stands where the use needs it.
export interface UseHandlers {
  onUse: (target: ChargeTarget, id: string) => void;
  available: (use: CostUse) => boolean;
}

// A choice that discards the top of the draw deck (#1744), Type III Galor's: the charge and the model's
// title, and the cards the draw deck holds, which disable the choice while it holds fewer than it discards.
export interface DeckDiscardHandlers {
  onDiscard: (target: ChargeTarget, source: string) => void;
  deckCount: number;
}

// The smallest cap on the limit (#1704), when it holds the limit below what it would be, or at it.
const holdingCap = (counters: TurnCounters) => {
  const caps = counters.caps ?? [];
  if (!caps.length) return null;
  const cap = caps.reduce((low, c) => (c.amount < low.amount ? c : low));
  return counters.limit >= cap.amount ? cap : null;
};

// "capped at 7 (Code of the Ushaan)", when a cap holds the limit (#1704).
const capText = (counters: TurnCounters): string | null => {
  const cap = holdingCap(counters);
  return cap ? `capped at ${cap.amount} (${cap.title})` : null;
};

// "7 + 1 Surprise Party": the limit's parts, or null with no grant. Under a cap that holds the limit
// (#1704): "7 + 1 Surprise Party, capped at 7 (Code of the Ushaan)".
export const limitPartsText = (counters: TurnCounters): string | null => {
  const uncapped = counters.uncapped ?? counters.limit;
  const grants = counters.grants.length
    ? `${uncapped - counters.grants.reduce((sum, g) => sum + g.amount, 0)} + ${counters.grants
        .map((g) => `${g.amount} ${g.title}`)
        .join(' + ')}`
    : null;
  const cap = capText(counters);
  if (!cap) return grants;
  return `${grants ?? uncapped}, ${cap}`;
};

// One charge: its card and cost, then Free, minus and plus. Minus and Free stop at 0. A cost the table
// suggested names its source under the card, marked as the table's own (#1654), and a choice of its
// model shows as one more button, disabled once taken. A choice of the limit raises the turn's limit (#1655).
// A counted choice (#1695) shows as a stepper: its label, the count, and minus and plus, which set the
// cost of the next count. A choice of personnel (#1712) opens the page's picker. Below the choice, one
// button per use a card on the table offers for the play (#1713), disabled once used or while its card
// is no longer where the use needs it. Only the title gives way to a narrow chip: the cost keeps its
// width after it (#1797), and a hover shows the whole title.
function ChargeRow({
  charge,
  onCorrect,
  onRaiseLimit,
  onChoosePersonnel,
  onChooseDownload,
  onNameDilemma,
  uses,
  deckDiscard,
}: {
  charge: LogCharge;
  onCorrect: OnCorrect;
  onRaiseLimit: OnRaiseLimit;
  onChoosePersonnel?: OnChoosePersonnel;
  /** Opens the picker of a download choice (#1762, K'mtar). */
  onChooseDownload?: OnChoosePersonnel;
  onNameDilemma?: OnNameDilemma;
  uses?: UseHandlers;
  deckDiscard?: DeckDiscardHandlers;
}) {
  const label = chargeLabel(charge);
  const { source } = charge;
  const choice = source?.choice;
  const discardTop = choiceDiscardTop(choice);
  const deckShort = !charge.choiceTaken && discardTop > 0 && (deckDiscard?.deckCount ?? 0) < discardTop;
  return (
    <div data-testid="charge-row" className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <span className="min-w-0 flex-1 text-sm text-text-primary">
          <span className="flex min-w-0 items-baseline gap-1">
            <span data-testid="charge-label" title={label} className="min-w-0 truncate">
              {label}
            </span>{' '}
            <span data-testid="charge-cost" className="shrink-0 font-semibold">
              {charge.cost}
            </span>
          </span>
          {source && (
            <span
              data-testid="charge-source"
              title="The table's suggestion"
              className="block truncate text-[11px] text-text-muted"
            >
              Table: {source.title}, {source.reason}
            </span>
          )}
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
      {source && isCountedChoice(choice) ? (
        <div data-testid="charge-choice-count" className="flex items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-xs text-text-muted">
            {choice.label}:{' '}
            <span data-testid="charge-choice-count-value" className="font-semibold text-text-primary">
              {charge.choiceCount ?? 0}
            </span>
          </span>
          <button
            type="button"
            data-testid="charge-choice-minus"
            onClick={() => {
              const n = (charge.choiceCount ?? 0) - 1;
              onCorrect(charge.target, countedCost(choice, n), source.title, n);
            }}
            disabled={(charge.choiceCount ?? 0) <= 0}
            aria-label={`${label}: ${choice.label}, one less`}
            className={SMALL_BUTTON}
          >
            −
          </button>
          <button
            type="button"
            data-testid="charge-choice-plus"
            onClick={() => {
              const n = (charge.choiceCount ?? 0) + 1;
              onCorrect(charge.target, countedCost(choice, n), source.title, n);
            }}
            disabled={(charge.choiceCount ?? 0) >= choice.max}
            aria-label={`${label}: ${choice.label}, one more`}
            className={SMALL_BUTTON}
          >
            +
          </button>
        </div>
      ) : (
        source &&
        choice &&
        choice.step === undefined && (
          <button
            type="button"
            data-testid="charge-choice"
            data-taken={charge.choiceTaken ? 'true' : undefined}
            onClick={() =>
              discardTop > 0
                ? deckDiscard?.onDiscard(charge.target, source.title)
                : isPersonnelChoice(choice)
                ? onChoosePersonnel?.(charge.target, source.title)
                : isDownloadChoice(choice)
                ? onChooseDownload?.(charge.target, source.title)
                : 'nameDilemma' in choice && choice.nameDilemma && choice.cost !== undefined
                  ? onNameDilemma?.(charge.target, source.title, choice.cost)
                  : choice.limit !== undefined
                  ? onRaiseLimit(charge.target, choice.limit, source.title)
                  : choice.cost !== undefined && onCorrect(charge.target, choice.cost, source.title)
            }
            disabled={charge.choiceTaken || deckShort}
            aria-label={`${label}: ${choice.label}${charge.choiceTaken ? ', taken' : deckShort ? ', not available' : ''}`}
            className="btn-icon h-7 w-auto self-start px-2 text-xs disabled:cursor-default disabled:opacity-60"
          >
            {choice.label}
            {charge.choiceTaken ? ' (taken)' : ''}
          </button>
        )
      )}
      {(charge.uses ?? []).map((use) => {
        const gone = !use.used && !(uses?.available(use) ?? true);
        return (
          <button
            key={use.id}
            type="button"
            data-testid="charge-use"
            data-use-card={use.id}
            data-used={use.used ? 'true' : undefined}
            onClick={() => uses?.onUse(charge.target, use.id)}
            disabled={use.used || gone}
            aria-label={`${label}: ${use.label}${use.used ? ', used' : gone ? ', not available' : ''}`}
            className="btn-icon h-7 w-auto self-start px-2 text-xs disabled:cursor-default disabled:opacity-60"
          >
            {use.label}
            {use.used ? ' (used)' : ''}
          </button>
        );
      })}
    </div>
  );
}

// The brief chip after a play or a draw that the table charged, at the top centre of the screen,
// clear of the hand arc and the bottom row. The page removes it after `CHARGE_CHIP_MS`, so it needs
// no tap.
export function ChargeChip({
  charges,
  onCorrect,
  onRaiseLimit,
  onChoosePersonnel,
  onChooseDownload,
  onNameDilemma,
  uses,
  deckDiscard,
  missionSpend,
  warnings = [],
}: {
  charges: LogCharge[];
  onCorrect: OnCorrect;
  onRaiseLimit: OnRaiseLimit;
  onChoosePersonnel?: OnChoosePersonnel;
  /** Opens the picker of a download choice (#1762, K'mtar). */
  onChooseDownload?: OnChoosePersonnel;
  onNameDilemma?: OnNameDilemma;
  uses?: UseHandlers;
  deckDiscard?: DeckDiscardHandlers;
  // Earth's offer after the play the chip shows (#1754), "Spend 1: draw 2".
  missionSpend?: { label: string; onSpend: () => void };
  // The play rules the entry broke (#1821), a line each below the charges. With Counters off the chip
  // shows them alone.
  warnings?: RuleWarning[];
}) {
  return (
    <div
      role="status"
      data-testid="charge-chip"
      className={`fixed left-1/2 -translate-x-1/2 ${LAYER_CHARGE_CHIP} flex flex-col gap-1 rounded-md border border-white/10 bg-bg-secondary/95 px-2 py-1.5 shadow-lg`}
      style={{ top: `calc(0.5rem + ${SAFE_INSET_CSS.top})`, width: 'min(16rem, calc(100vw - 9rem))' }}
    >
      {charges.map((charge) => (
        <ChargeRow
          key={targetKey(charge.target)}
          charge={charge}
          onCorrect={onCorrect}
          onRaiseLimit={onRaiseLimit}
          onChoosePersonnel={onChoosePersonnel}
          onChooseDownload={onChooseDownload}
          onNameDilemma={onNameDilemma}
          uses={uses}
          deckDiscard={deckDiscard}
        />
      ))}
      {missionSpend && (
        <button
          type="button"
          data-testid="charge-mission-spend"
          onClick={missionSpend.onSpend}
          aria-label={missionSpend.label}
          className="btn-icon h-7 w-auto self-start px-2 text-xs"
        >
          Spend 1: draw 2
        </button>
      )}
      {warnings.map((warning, i) => (
        <p key={i} data-testid="charge-warning" data-rule={warning.rule} className="text-xs text-amber-300">
          {ruleWarningText(warning)}
        </p>
      ))}
    </div>
  );
}

// The list of the turn's charges, opened by a tap on the counter, with minus and plus for the turn's
// limit under them. The pending discounts of the turn come first, each with Dismiss (#1656). A tap on
// the backdrop or Escape closes it.
export function TurnCountersList({
  charges,
  counters,
  onCorrect,
  onRaiseLimit,
  onChoosePersonnel,
  onChooseDownload,
  onNameDilemma,
  uses,
  deckDiscard,
  onAdjustLimit,
  onTurnChoice,
  pending = [],
  onDismiss,
  onClose,
}: {
  charges: LogCharge[];
  counters: TurnCounters;
  onCorrect: OnCorrect;
  onRaiseLimit: OnRaiseLimit;
  onChoosePersonnel?: OnChoosePersonnel;
  /** Opens the picker of a download choice (#1762, K'mtar). */
  onChooseDownload?: OnChoosePersonnel;
  onNameDilemma?: OnNameDilemma;
  uses?: UseHandlers;
  deckDiscard?: DeckDiscardHandlers;
  onAdjustLimit: (delta: number) => void;
  onTurnChoice?: (delta: number, source: string) => void;
  pending?: PendingDiscount[];
  onDismiss?: (target: ChargeTarget) => void;
  onClose: () => void;
}) {
  useEscapeLayer(onClose);
  const parts = limitPartsText(counters);
  const choices = counters.choices ?? [];
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
        {choices.length > 0 && (
          <div data-testid="turn-choices" className="flex flex-col gap-1 border-b border-white/10 pb-2">
            {choices.map((choice) => (
              <button
                key={`${choice.title}-${choice.label}`}
                type="button"
                data-testid="turn-choice"
                data-source={choice.title}
                data-taken={choice.taken ? 'true' : undefined}
                onClick={() => onTurnChoice?.(choice.limit, choice.title)}
                disabled={choice.taken}
                aria-label={`${choice.title}: ${choice.label}${choice.taken ? ', taken' : ''}`}
                className="btn-icon h-7 w-auto self-start px-2 text-xs disabled:cursor-default disabled:opacity-60"
              >
                {choice.title}: {choice.label}
                {choice.taken ? ' (taken)' : ''}
              </button>
            ))}
          </div>
        )}
        {pending.length > 0 && (
          <div data-testid="pending-discounts" className="flex flex-col gap-1 border-b border-white/10 pb-2">
            {pending.map((discount) => {
              const text = pendingDiscountText(discount);
              return (
                <div key={targetKey(discount.origin)} data-testid="pending-discount" className="flex items-center gap-1.5">
                  <span className="flex min-w-0 flex-1 items-baseline gap-1 text-sm text-text-primary">
                    <span data-testid="pending-discount-label" title={text} className="min-w-0 truncate">
                      {discount.title}: {discount.label}
                    </span>{' '}
                    <span className="shrink-0">−{discount.amount}</span>
                  </span>
                  <button
                    type="button"
                    data-testid="pending-discount-dismiss"
                    onClick={() => onDismiss?.(discount.origin)}
                    aria-label={`Dismiss ${text}`}
                    className="btn-icon h-7 w-auto px-2 text-xs"
                  >
                    Dismiss
                  </button>
                </div>
              );
            })}
          </div>
        )}
        <div className="flex flex-col gap-1 overflow-y-auto">
          {charges.length === 0 ? (
            <p className="text-sm text-text-muted">Nothing charged this turn.</p>
          ) : (
            charges.map((charge) => (
              <ChargeRow
                key={targetKey(charge.target)}
                charge={charge}
                onCorrect={onCorrect}
                onRaiseLimit={onRaiseLimit}
                onChoosePersonnel={onChoosePersonnel}
                onChooseDownload={onChooseDownload}
                onNameDilemma={onNameDilemma}
                uses={uses}
                deckDiscard={deckDiscard}
              />
            ))
          )}
        </div>
        <div data-testid="turn-counters-limit" className="flex items-center gap-1.5 border-t border-white/10 pt-2">
          <span className="flex-1 text-sm text-text-primary">
            Limit <span data-testid="turn-counters-limit-value" className="font-semibold">{counters.limit}</span>
            {parts && (
              <span data-testid="turn-counters-limit-parts" className="block text-[11px] text-text-muted">
                {parts}
              </span>
            )}
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
            disabled={holdingCap(counters) !== null}
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
// in amber with `data-over`, and never stops a move. It shows in the play and draw segment only
// (#1679), on the segment's row, so it marks no counters left unspent. A tap opens the list of the
// turn's charges.
export function TurnCounterButton({
  counters,
  className,
  style,
  muted = false,
  onOpen,
}: {
  counters: TurnCounters;
  className: string;
  // The height and the text size of the column's tap rows (#1790).
  style?: React.CSSProperties;
  // Outside play and draw (#1848): what the turn spent, in a muted look, still tappable.
  muted?: boolean;
  onOpen: () => void;
}) {
  const { spent, limit } = counters;
  const over = spent > limit;
  // "0/8 (Surprise Party +1)": the grants to the limit (#1655).
  const grants = counters.grants.length ? ` (${counters.grants.map((g) => `${g.title} +${g.amount}`).join(', ')})` : '';
  const counted = over ? `Counters ${spent} of ${limit}, ${spent - limit} over` : `Counters ${spent} of ${limit}`;
  // ", capped at 7 (Code of the Ushaan)" (#1704).
  const cap = capText(counters);
  const text = `${counted}${grants}${cap ? `, ${cap}` : ''}`;
  return (
    <button
      type="button"
      data-testid="turn-counters"
      data-over={over ? 'true' : undefined}
      data-granted={grants ? 'true' : undefined}
      data-muted={muted ? 'true' : undefined}
      onClick={onOpen}
      aria-label={text}
      title={text}
      style={style}
      className={`${className} min-w-0 flex-1 px-0 font-semibold tabular-nums ${
        muted ? 'text-text-muted opacity-60' : over ? 'text-amber-300' : 'text-text-primary'
      }`}
    >
      {spent}/{limit}
    </button>
  );
}
