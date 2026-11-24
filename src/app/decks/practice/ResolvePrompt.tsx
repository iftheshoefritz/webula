// The prompt mode of a resolving event (#1870, a spike of #1849): These Are The Voyages resolves in place,
// with no modal panel. A thin bar at the top centre, below the charge chip, holds the task, the count of the
// pick, the confirm button and Cancel; the draw step shows a row of the candidate personnel above the bottom
// row, and the bottom step picks the cards in the hand arc (`CardHand`'s `choice`). `presentationOf` is the
// one place that decides between the panel and the prompt, so every other event and step keeps the panel.
//
// The picks are the page's `resolveChoice`, in tap order, never `selectedCardIds`. The prompt dispatches the
// step's own `onDraw` and `onPlace`, the actions the panel dispatches, so the models, the log and the
// reducers do not change.

import React, { useLayoutEffect, useState } from 'react';
import { LAYER_RESOLVE_PROMPT } from '../../../lib/layers';
import { printedCost } from '../../../lib/playCost';
import type { ResolveModel } from '../../../lib/resolveModels';
import { RESOLVING_MINI_WIDTH, type ResolveStep } from './ResolvingPanel';
import { NO_CALLOUT_STYLE, useCardHold } from './useCardHold';
import { useEscapeLayer } from './useEscapeLayer';
import { SAFE_INSET_CSS, safeAreaMargins } from './useSafeAreaInsets';
import { TABLE_CARD_ART_HEIGHT, TABLE_CARD_WIDTH, TableCardImage } from './TableCard';
import type { PersonnelCandidate } from './personnelChoice';
import { TOUCH_CONTROLS_COLUMN } from './tableScale';

// The events that resolve in the prompt. The spike holds one; Miracle Working, of the same kind, keeps the panel.
const PROMPT_TITLES = new Set(['These Are The Voyages']);

/** Whether the step of the resolving event shows in the modal panel or in the prompt (#1870). */
export function presentationOf(model: ResolveModel | undefined, step: ResolveStep | undefined): 'panel' | 'prompt' {
  if (!model || !step || !PROMPT_TITLES.has(model.title)) return 'panel';
  return (step.step === 'draw' && step.fixed === undefined) || step.step === 'bottom' ? 'prompt' : 'panel';
}

// The gap between the charge chip and the prompt, and the prompt's top with no chip.
export const PROMPT_GAP = 4; // px

// The bottom of the charge chip, measured while it shows and on every resize of it, or null with no chip. The
// trigger offers (#1904) sit below it the same way.
export function useChargeChipBottom(chipShown: boolean): number | null {
  const [bottom, setBottom] = useState<number | null>(null);
  useLayoutEffect(() => {
    const chip = chipShown ? document.querySelector<HTMLElement>('[data-testid="charge-chip"]') : null;
    if (!chip) return;
    const measure = () => setBottom(chip.getBoundingClientRect().bottom);
    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(chip);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [chipShown]);
  return chipShown ? bottom : null;
}

// The bar of a prompt (#1870, #1928): the task, the count of the picks, the confirm button and an optional Cancel,
// at the top centre, below the charge chip. `prefix` names its test ids: `resolve-prompt`, `discard-prompt`.
function PromptBar({
  prefix,
  dataStep,
  task,
  done,
  count,
  confirm,
  onConfirm,
  onCancel,
  chipShown,
  hidden,
}: {
  prefix: string;
  dataStep?: string;
  task: string;
  done: number;
  count: number;
  confirm: string;
  onConfirm: () => void;
  onCancel?: () => void;
  chipShown: boolean;
  hidden: boolean;
}) {
  const chipBottom = useChargeChipBottom(chipShown);
  return (
    <div
      role="status"
      data-testid={prefix}
      data-step={dataStep}
      className={`fixed left-1/2 -translate-x-1/2 ${LAYER_RESOLVE_PROMPT} flex items-center gap-2 rounded-md border border-white/10 bg-bg-secondary/95 px-2 py-1 shadow-lg`}
      style={{
        top: chipBottom !== null ? chipBottom + PROMPT_GAP : `calc(0.5rem + ${SAFE_INSET_CSS.top})`,
        maxWidth: 'calc(100vw - 9rem)',
        visibility: hidden ? 'hidden' : 'visible',
        pointerEvents: hidden ? 'none' : undefined,
      }}
    >
      <span data-testid={`${prefix}-task`} className="min-w-0 truncate text-xs text-text-primary">
        {task}
      </span>
      <span data-testid={`${prefix}-count`} className="shrink-0 text-xs text-text-muted">
        {done} of {count}
      </span>
      <button
        type="button"
        data-testid={`${prefix}-done`}
        className="btn-primary h-7 shrink-0 whitespace-nowrap px-2 text-xs"
        disabled={done !== count}
        onClick={onConfirm}
      >
        {confirm}
      </button>
      {onCancel && (
        <button
          type="button"
          data-testid={`${prefix}-cancel`}
          className="btn-primary h-7 shrink-0 whitespace-nowrap bg-none bg-white/[0.05] px-2 text-xs"
          onClick={onCancel}
        >
          Cancel
        </button>
      )}
    </div>
  );
}

export function ResolvePrompt({
  step,
  picks,
  chipShown,
  hidden,
  escapeActive,
  onCollapse,
  onCancel,
}: {
  step: Extract<ResolveStep, { step: 'draw' | 'bottom' }>;
  // The page's `resolveChoice`, already cut to the cards still in play: the one personnel of the draw step, or
  // the cards of the hand in tap order.
  picks: string[];
  // Whether the charge chip shows, so the prompt sits below it.
  chipShown: boolean;
  // During a drag: mounted, with no visibility and no pointer events, as the panel.
  hidden: boolean;
  escapeActive: boolean;
  onCollapse: () => void;
  onCancel: () => void;
}) {
  // Escape collapses the prompt to the small card and never cancels; during a drag it does nothing.
  useEscapeLayer(() => {
    if (!hidden) onCollapse();
  }, escapeActive);
  const draw = step.step === 'draw';
  const chosen = draw ? step.groups.flatMap((g) => g.cards).find((c) => c.id === picks[0]) : undefined;
  const count = draw ? 1 : step.count;
  return (
    <PromptBar
      prefix="resolve-prompt"
      dataStep={step.step}
      task={draw ? 'Choose one of your personnel: draw its cost' : `Choose ${count} ${count === 1 ? 'card' : 'cards'} of your hand for the bottom`}
      done={draw ? (chosen ? 1 : 0) : picks.length}
      count={count}
      confirm={draw ? (chosen ? `Draw ${printedCost(chosen.card.card)}` : 'Draw') : 'Place on bottom'}
      onConfirm={() => (draw ? step.onDraw(chosen?.id) : step.onPlace(picks))}
      // Cancel shows before the draw only, as the panel's: after it, Cancel would leave the free draws in the hand.
      onCancel={draw ? onCancel : undefined}
      chipShown={chipShown}
      hidden={hidden}
    />
  );
}

/**
 * The prompt of the discard segment (#1928): while the turn is in the discard segment and the hand holds more than
 * the hand limit, the player picks the excess cards in the hand arc, in tap order, and Discard moves them to the
 * discard pile in one log entry. It never advances the turn. Cancel and Escape close it and leave the segment as it
 * is, free to drag cards by hand.
 */
export function DiscardPrompt({
  count,
  picks,
  chipShown,
  hidden,
  escapeActive,
  onDiscard,
  onCancel,
}: {
  // The cards over the hand limit.
  count: number;
  // The picks still in the hand, in tap order.
  picks: string[];
  chipShown: boolean;
  hidden: boolean;
  escapeActive: boolean;
  onDiscard: (ids: string[]) => void;
  onCancel: () => void;
}) {
  useEscapeLayer(() => {
    if (!hidden) onCancel();
  }, escapeActive);
  return (
    <PromptBar
      prefix="discard-prompt"
      task={`Discard ${count} ${count === 1 ? 'card' : 'cards'}`}
      done={picks.length}
      count={count}
      confirm={`Discard ${count}`}
      onConfirm={() => onDiscard(picks)}
      onCancel={onCancel}
      chipShown={chipShown}
      hidden={hidden}
    />
  );
}

// The label under a candidate, its place and its printed cost.
const LABEL_HEIGHT = 26; // px

// A card of the candidate row: the cropped table card, its place and its printed cost. A tap picks it, a hold
// previews it. It is no draggable: the same instance is a card of the table, and of a card list panel.
function CandidateCard({ candidate, place, picked, onPick }: { candidate: PersonnelCandidate; place: string; picked: boolean; onPick: () => void }) {
  const hold = useCardHold(candidate.id);
  const cost = printedCost(candidate.card.card);
  return (
    <button
      type="button"
      data-testid="resolve-candidate"
      data-card-id={candidate.id}
      data-place={place}
      aria-pressed={picked}
      aria-label={`${candidate.name}, ${place}, cost ${cost}`}
      onClick={onPick}
      {...hold}
      style={{ ...NO_CALLOUT_STYLE, width: TABLE_CARD_WIDTH }}
      className={`flex shrink-0 flex-col rounded-md border-2 text-left ${picked ? 'border-blue-400 bg-blue-500/20' : 'border-transparent'}`}
    >
      <TableCardImage instance={candidate.card} width={TABLE_CARD_WIDTH} height={TABLE_CARD_ART_HEIGHT} showFace />
      <span className="flex w-full items-baseline gap-1 px-0.5 text-[9px] leading-3 text-text-secondary" style={{ height: LABEL_HEIGHT }}>
        <span data-testid="resolve-candidate-place" className="line-clamp-2 min-w-0 flex-1">
          {place}
        </span>
        <span data-testid="resolve-candidate-cost" className="shrink-0 font-semibold text-text-primary">
          {cost}
        </span>
      </span>
    </button>
  );
}

// The row of the draw step's candidates, above the bottom row (`bottom`, the inset a card list panel keeps),
// right of the left column and left of the small card (`ResolvingMini`). One row that scrolls sideways, so it fits 667×375 with any number of personnel.
export function ResolveCandidates({
  step,
  picked,
  bottom,
  hidden,
  onPick,
}: {
  step: Extract<ResolveStep, { step: 'draw' }>;
  picked: string | null;
  bottom: number;
  hidden: boolean;
  onPick: (id: string) => void;
}) {
  const candidates = step.groups.flatMap((g) => g.cards.map((c) => ({ candidate: c, place: g.place ?? g.label })));
  return (
    <div
      data-testid="resolve-candidates"
      className={`fixed ${LAYER_RESOLVE_PROMPT} flex gap-1 overflow-x-auto overscroll-contain rounded-md bg-black/60 p-1`}
      style={{
        bottom,
        left: TOUCH_CONTROLS_COLUMN + 8,
        // Clear of the small card at the right side, its width and its padding.
        right: RESOLVING_MINI_WIDTH + 24,
        ...safeAreaMargins('left', 'right'),
        visibility: hidden ? 'hidden' : 'visible',
        pointerEvents: hidden ? 'none' : undefined,
      }}
    >
      {candidates.length === 0 && <p className="px-1 text-xs text-text-muted">No personnel on the table.</p>}
      {candidates.map(({ candidate, place }) => (
        <CandidateCard
          key={candidate.id}
          candidate={candidate}
          place={place}
          picked={candidate.id === picked}
          onPick={() => onPick(candidate.id)}
        />
      ))}
    </div>
  );
}
