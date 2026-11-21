// The resolving event (#1728): the modal panel that shows the event of `TableState.resolving` while its
// text resolves, and the small card it collapses to under View table or Escape.
//
// The panel shows the event as a whole card, with Resolved → Discard, Cancel and View table, and first of
// them Resolved → Remove from game for an event whose text removes it from the game (#1730). Its card,
// and the small card, drag out under `panelDraggableId` like a card list panel's, so the page's drag
// handlers find the card in `resolving` and the drop lands wherever any drop of it lands. The panel is no
// drop target. It follows the card list panel's `hidden` convention: during a drag it stays mounted, with
// no visibility and no pointer events, so every target on the table can be reached.
//
// Its subject is the card whose play text is resolving: the event of `TableState.resolving`, or else the
// personnel or ship whose "when you play" effect is pending (#1800, `pendingPlayEffectOf`). A played card
// stands on the table, so its card here previews on a hold and does not drag, and the panel shows the effect's
// text, its condition, and Done and Skip in place of Resolved → Discard, Remove from game and Cancel.
//
// The backdrop and the panel sit below the charge chip (`LAYER_RESOLVING_PANEL`), so the chip of the
// play and its choices stay reachable, and below the game menu splash, which covers them.

import React, { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { LAYER_RESOLVING_MINI, LAYER_RESOLVING_PANEL } from '../../../lib/layers';
import { cardDisplayName } from '../../../lib/cardCount';
import { cardImageUrl, showCardMissing } from '../../../lib/cardImageUrl';
import { panelDraggableId } from './panelDragId';
import { CardInstance } from './tableReducer';
import { CARD_IMAGE_HEIGHT, CARD_IMAGE_WIDTH } from './viewerCardSize';
import { NO_CALLOUT_STYLE, useCardHold } from './useCardHold';
import { useEscapeLayer } from './useEscapeLayer';
import { PREVIEW_MAX_HEIGHT } from './previewSize';
import { SAFE_INSET_CSS, safeAreaMargins } from './useSafeAreaInsets';
import { PANEL_SURFACE_CLASSNAME } from './CardListPanel';
import { LandedRing, useLandedNonce } from './LandedZoneContext';
import { PersonnelCandidate, PersonnelCandidateGroup } from './personnelChoice';
import { printedCost } from '../../../lib/playCost';

// The height of the panel's card: the native height of the image at most, and what the screen leaves
// once the panel's padding and the insets are off, so the card and its buttons fit 667×375.
const PANEL_CARD_HEIGHT = `min(${PREVIEW_MAX_HEIGHT}px, calc(100dvh - 48px - ${SAFE_INSET_CSS.top} - ${SAFE_INSET_CSS.bottom}))`;
// While a step of the resolve model shows (#1739), the card gives up width to the step's list: at most
// 26% of the screen's width.
const STEP_CARD_HEIGHT = `min(${PANEL_CARD_HEIGHT}, calc(26vw * ${CARD_IMAGE_HEIGHT} / ${CARD_IMAGE_WIDTH}))`;
// The width of a card of the step's hand row.
const STEP_THUMB_WIDTH = 52; // px

/**
 * A step of the resolving event's resolve model (#1739), which the page derives from the log
 * (`resolveStepOf`). `'draw'`: the free draw, of the printed cost of a personnel of `groups`, or of the
 * model's `fixed` number with no choice. `'bottom'`: `count` cards of `hand` to the bottom of the draw deck.
 * `'discardDraw'` (#1745): one card of `hand` discarded to draw `draw` cards free. `'download'` (#1746): a
 * personnel of `groups` whose copy (`available`) the draw deck holds, downloaded.
 */
export type ResolveStep =
  | { step: 'draw'; groups: PersonnelCandidateGroup[]; fixed?: number; onDraw: (personnelId?: string) => void }
  | { step: 'bottom'; count: number; hand: CardInstance[]; onPlace: (ids: string[]) => void }
  | { step: 'discardDraw'; draw: number; hand: CardInstance[]; onDiscardDraw: (id: string) => void }
  | { step: 'download'; groups: PersonnelCandidateGroup[]; available: (id: string) => boolean; onDownload: (personnelId: string) => void }
  | { step: 'exchange'; hand: CardInstance[]; groups: PersonnelCandidateGroup[]; onExchange: (handId: string, tableId: string) => void }
  // The "may draw up to N" step of a played card (#1800): a stepper from 0 to `max`, at most what the deck holds.
  | { step: 'drawUpTo'; max: number; deck: number; onDraw: (count: number) => void }
  // The "discard N cards from hand" step of a played card (#1800): `count` cards of `hand`.
  | { step: 'discardFromHand'; count: number; hand: CardInstance[]; onDiscard: (ids: string[]) => void }
  // The score of a played card (#1812): `points` to the score.
  | { step: 'score'; points: number; onScore: () => void }
  // The examine of the top of the draw deck of a played card (#1809): the `examined` cards, of which the player
  // takes from `min` to `max` that pass `takes`, and orders the rest for the bottom of the draw deck.
  | {
      step: 'examineTake';
      examined: CardInstance[];
      min: number;
      max: number;
      takes: (instance: CardInstance) => boolean;
      testText?: string;
      onApply: (take: string[], bottom: string[]) => void;
    };

/** The played card of a pending "when you play" effect (#1800), the panel's other subject. */
export interface PlayedSubject {
  // The effect's text, "You may draw up to seven cards, then discard two cards from hand."
  text: string;
  // "Condition met: …", or null for a model with no condition.
  condition: string | null;
  // Whether a step was taken already: Done then ends the effect, and before it Skip does.
  started: boolean;
  // Whether Done or Skip shows: not before a first step that is no "may" (#1808), while the hand holds a card.
  endable: boolean;
  // Whether the step is a "may", so the button before it reads Skip rather than Done.
  skippable: boolean;
  onEnd: () => void;
}

// The small card of View table, the size of a pile card at scale 1.
export const RESOLVING_MINI_WIDTH = 56; // px
const MINI_HEIGHT = Math.round((RESOLVING_MINI_WIDTH * CARD_IMAGE_HEIGHT) / CARD_IMAGE_WIDTH);

// The event's card, a drag source and a hold preview, with `data-card-id` inside a `data-zone` of
// `resolving` for `practice_drag.sh`. No `useDroppable`.
function ResolvingCard({
  instance,
  onTap,
  imageStyle,
  testId,
}: {
  instance: CardInstance;
  onTap?: () => void;
  imageStyle: React.CSSProperties;
  testId: string;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: panelDraggableId(instance.id) });
  const holdListeners = useCardHold(instance.id, listeners);
  const name = cardDisplayName(instance.card);
  // A drop on the Play target (#1729) plays the landed cue here.
  const landedNonce = useLandedNonce('resolving');
  return (
    <div data-zone="resolving" data-testid={testId} data-landed={landedNonce !== null || undefined} className="relative shrink-0 rounded-md">
      <button
        ref={setNodeRef}
        type="button"
        data-card-id={instance.id}
        onClick={onTap}
        {...attributes}
        {...holdListeners}
        className="block touch-none rounded-md focus:outline-hidden"
        style={{ ...NO_CALLOUT_STYLE, opacity: isDragging ? 0.5 : 1 }}
        aria-label={onTap ? `Show ${name}` : name}
      >
        <img
          draggable={false}
          src={cardImageUrl(instance.card)}
          onError={showCardMissing}
          width={CARD_IMAGE_WIDTH}
          height={CARD_IMAGE_HEIGHT}
          alt={name}
          className="rounded-md shadow-md"
          style={{ ...NO_CALLOUT_STYLE, ...imageStyle }}
        />
      </button>
      <LandedRing nonce={landedNonce} />
    </div>
  );
}

// The played card of a "when you play" effect (#1800): it stands on the table, so here it previews on a hold
// and a tap, and never drags. No `data-card-id`: the table's card carries it.
function PlayedCard({ instance, onTap, imageStyle, testId }: { instance: CardInstance; onTap?: () => void; imageStyle: React.CSSProperties; testId: string }) {
  const hold = useCardHold(instance.id);
  const name = cardDisplayName(instance.card);
  return (
    <button
      type="button"
      data-testid={testId}
      data-played-card={instance.id}
      onClick={onTap}
      {...hold}
      className="block shrink-0 rounded-md focus:outline-hidden"
      style={NO_CALLOUT_STYLE}
      aria-label={onTap ? `Show ${name}` : name}
    >
      <img
        draggable={false}
        src={cardImageUrl(instance.card)}
        onError={showCardMissing}
        width={CARD_IMAGE_WIDTH}
        height={CARD_IMAGE_HEIGHT}
        alt={name}
        className="rounded-md shadow-md"
        style={{ ...NO_CALLOUT_STYLE, ...imageStyle }}
      />
    </button>
  );
}

// A personnel of the draw step: a toggle with its name and printed cost, and a hold that previews it. The
// download step (#1746) shows `note` in place of the cost, and disables a personnel with no copy to download.
function PersonnelOption({
  candidate,
  selected,
  onSelect,
  note,
  disabled = false,
}: {
  candidate: PersonnelCandidate;
  selected: boolean;
  onSelect: () => void;
  note?: string;
  disabled?: boolean;
}) {
  const hold = useCardHold(candidate.id);
  const cost = printedCost(candidate.card.card);
  return (
    <button
      type="button"
      data-testid="resolve-personnel"
      data-card-choice={candidate.id}
      data-available={disabled ? 'false' : undefined}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
      {...hold}
      style={NO_CALLOUT_STYLE}
      className={`flex min-h-9 items-center gap-2 rounded border px-2 text-left text-sm disabled:cursor-default disabled:opacity-50 ${
        selected ? 'border-blue-400 bg-blue-500/20 text-text-primary' : 'border-white/10 text-text-primary'
      }`}
    >
      <span className="min-w-0 flex-1 truncate">
        {candidate.name}
        {candidate.card.stopped ? <span className="text-text-muted"> (stopped)</span> : null}
      </span>
      <span className="shrink-0 text-xs text-text-muted">{note ?? `cost ${cost}`}</span>
    </button>
  );
}

// A card of a step's hand row: a toggle, its place in the chosen order as a badge (the bottom step's), and a
// hold that previews it. `badge` false shows the pick by its border alone (#1745).
function HandOption({
  instance,
  order,
  onToggle,
  pickedLabel,
  badge = true,
  testId = 'resolve-hand-card',
  disabled = false,
}: {
  instance: CardInstance;
  order: number | null;
  onToggle: () => void;
  pickedLabel?: string;
  badge?: boolean;
  testId?: string;
  disabled?: boolean;
}) {
  const hold = useCardHold(instance.id);
  const name = cardDisplayName(instance.card);
  return (
    <button
      type="button"
      data-testid={testId}
      data-card-choice={instance.id}
      data-available={disabled ? 'false' : undefined}
      disabled={disabled}
      aria-pressed={order !== null}
      aria-label={order !== null ? `${name}, ${pickedLabel ?? `${order + 1} of the cards to put on the bottom`}` : name}
      onClick={onToggle}
      {...hold}
      style={NO_CALLOUT_STYLE}
      className={`relative shrink-0 rounded-md border-2 disabled:cursor-default disabled:opacity-40 ${order !== null ? 'border-blue-400' : 'border-transparent'}`}
    >
      <img
        draggable={false}
        src={cardImageUrl(instance.card)}
        onError={showCardMissing}
        alt=""
        className="rounded"
        style={{ ...NO_CALLOUT_STYLE, width: STEP_THUMB_WIDTH, height: Math.round((STEP_THUMB_WIDTH * CARD_IMAGE_HEIGHT) / CARD_IMAGE_WIDTH) }}
      />
      {order !== null && badge && (
        <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-[11px] font-semibold text-white">
          {order + 1}
        </span>
      )}
    </button>
  );
}

// The draw step (#1739): the personnel to choose from, or the fixed number, and Draw N. Its selection is
// its own state, so a new step or a new resolving card, which remount it, start empty.
function DrawStep({ step }: { step: Extract<ResolveStep, { step: 'draw' }> }) {
  const [selected, setSelected] = useState<string | null>(null);
  const candidates = step.groups.flatMap((g) => g.cards);
  const chosen = candidates.find((c) => c.id === selected) ?? null;
  const n = step.fixed ?? (chosen ? printedCost(chosen.card.card) : null);
  return (
    <div data-testid="resolve-step-draw" className="flex min-h-0 flex-col gap-2">
      <p className="text-sm text-text-primary">
        {step.fixed !== undefined ? `Draw ${step.fixed} cards` : 'Choose one of your personnel: draw its cost'}
      </p>
      {step.fixed === undefined && (
        <div className="flex min-h-0 flex-col gap-1 overflow-y-auto overscroll-contain pr-1">
          {candidates.length === 0 && <p className="text-xs text-text-muted">No personnel on the table.</p>}
          {step.groups.map((group) => (
            <div key={group.key} className="flex flex-col gap-1">
              <h3 className="text-[11px] text-text-muted">{group.label}</h3>
              {group.cards.map((c) => (
                <PersonnelOption key={c.id} candidate={c} selected={c.id === selected} onSelect={() => setSelected(c.id)} />
              ))}
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        data-testid="resolve-draw"
        className="btn-primary w-full whitespace-nowrap text-sm"
        disabled={n === null}
        onClick={() => step.onDraw(chosen?.id)}
      >
        {n === null ? 'Draw' : `Draw ${n}`}
      </button>
    </div>
  );
}

// The order of the cards for the bottom of the draw deck (#1739), with buttons that move one earlier or later:
// the first goes nearest the top, the last to the very bottom. The examine of a played card (#1809) shares it.
function BottomOrder({ ids, nameOf, onShift }: { ids: string[]; nameOf: (id: string) => string; onShift: (from: number, to: number) => void }) {
  return (
    <ol data-testid="resolve-order" className="flex flex-col gap-1 overflow-y-auto text-xs text-text-primary">
      {ids.map((id, i) => (
        <li key={id} data-testid="resolve-order-card" data-card-choice={id} className="flex items-center gap-1">
          <span className="w-4 shrink-0 text-text-muted">{i + 1}.</span>
          <span className="min-w-0 flex-1 truncate">{nameOf(id)}</span>
          <button
            type="button"
            data-testid="resolve-order-up"
            aria-label="Nearer the top"
            className="btn-icon-sm"
            disabled={i === 0}
            onClick={() => onShift(i, i - 1)}
          >
            ↑
          </button>
          <button
            type="button"
            data-testid="resolve-order-down"
            aria-label="Nearer the bottom"
            className="btn-icon-sm"
            disabled={i === ids.length - 1}
            onClick={() => onShift(i, i + 1)}
          >
            ↓
          </button>
        </li>
      ))}
      <li className="text-[11px] text-text-muted">The last goes to the very bottom.</li>
    </ol>
  );
}

// The bottom step (#1739): the hand as a row that scrolls sideways, a tap picks a card up to `count`, the
// picked cards in their order with buttons that move one earlier or later, and Place on bottom once
// exactly `count` are picked. The first of the order goes nearest the top, the last to the very bottom.
function BottomStep({ step }: { step: Extract<ResolveStep, { step: 'bottom' }> }) {
  const [order, setOrder] = useState<string[]>([]);
  const inHand = new Map(step.hand.map((c) => [c.id, c]));
  const picked = order.filter((id) => inHand.has(id));
  const toggle = (id: string) =>
    setOrder((ids) => (ids.includes(id) ? ids.filter((i) => i !== id) : ids.filter((i) => inHand.has(i)).length < step.count ? [...ids, id] : ids));
  const shift = (from: number, to: number) => setOrder(() => arrayMove(picked, from, to));
  const what = step.count === 1 ? 'card' : 'cards';
  return (
    <div data-testid="resolve-step-bottom" className="flex min-h-0 min-w-0 flex-col gap-2">
      <p className="text-sm text-text-primary">
        Choose {step.count} {what} of your hand for the bottom of the draw deck
      </p>
      <div data-testid="resolve-hand" className="flex min-w-0 gap-1 overflow-x-auto overscroll-contain pb-1 pt-1.5 pr-1.5">
        {step.hand.map((c) => {
          const at = picked.indexOf(c.id);
          return <HandOption key={c.id} instance={c} order={at >= 0 ? at : null} onToggle={() => toggle(c.id)} />;
        })}
      </div>
      {picked.length > 0 && <BottomOrder ids={picked} nameOf={(id) => cardDisplayName(inHand.get(id)!.card)} onShift={shift} />}
      <button
        type="button"
        data-testid="resolve-place-bottom"
        className="btn-primary w-full whitespace-nowrap text-sm"
        disabled={picked.length !== step.count}
        onClick={() => step.onPlace(picked)}
      >
        Place on bottom
      </button>
    </div>
  );
}

// The step of Second Edition (#1746): the personnel the player commands by place, those with a copy in the
// draw deck to choose from and the others disabled, and Download. With none available the step says so, and
// the player ends with Resolved → Discard or Cancel.
function DownloadStep({ step }: { step: Extract<ResolveStep, { step: 'download' }> }) {
  const [selected, setSelected] = useState<string | null>(null);
  const candidates = step.groups.flatMap((g) => g.cards);
  const chosen = selected !== null && candidates.some((c) => c.id === selected) && step.available(selected) ? selected : null;
  const anyAvailable = candidates.some((c) => step.available(c.id));
  return (
    <div data-testid="resolve-step-download" className="flex min-h-0 flex-col gap-2">
      <p className="text-sm text-text-primary">Choose one of your personnel: download a copy from the draw deck</p>
      <div className="flex min-h-0 flex-col gap-1 overflow-y-auto overscroll-contain pr-1">
        {!anyAvailable && (
          <p data-testid="resolve-download-none" className="text-xs text-text-muted">
            No personnel you command has a copy in the draw deck.
          </p>
        )}
        {step.groups.map((group) => (
          <div key={group.key} className="flex flex-col gap-1">
            <h3 className="text-[11px] text-text-muted">{group.label}</h3>
            {group.cards.map((c) => {
              const available = step.available(c.id);
              return (
                <PersonnelOption
                  key={c.id}
                  candidate={c}
                  selected={c.id === chosen}
                  onSelect={() => setSelected(c.id)}
                  disabled={!available}
                  note={available ? 'copy in deck' : 'no copy in the draw deck'}
                />
              );
            })}
          </div>
        ))}
      </div>
      <button
        type="button"
        data-testid="resolve-download"
        className="btn-primary w-full whitespace-nowrap text-sm"
        disabled={chosen === null}
        onClick={() => chosen && step.onDownload(chosen)}
      >
        Download
      </button>
    </div>
  );
}

// The step of Vidiian Organ Bank (#1765): one [Vid] personnel of the hand, as a row of cards, and one
// unstopped [Vid] personnel on the table, by place; a tap picks, another tap moves the pick. With either side
// empty the step says which and shows no button: Resolved → Discard or Cancel ends it.
function ExchangeStep({ step }: { step: Extract<ResolveStep, { step: 'exchange' }> }) {
  const [handPick, setHandPick] = useState<string | null>(null);
  const [tablePick, setTablePick] = useState<string | null>(null);
  const handChosen = step.hand.some((c) => c.id === handPick) ? handPick : null;
  const tableChosen = step.groups.some((g) => g.cards.some((c) => c.id === tablePick)) ? tablePick : null;
  const empty =
    step.hand.length === 0
      ? 'No [Vid] personnel in your hand: nothing to exchange.'
      : step.groups.length === 0
        ? 'No unstopped [Vid] personnel you command: nothing to exchange.'
        : null;
  return (
    <div data-testid="resolve-step-exchange" className="flex min-h-0 min-w-0 flex-col gap-2">
      {empty !== null ? (
        <p data-testid="resolve-exchange-empty" className="text-sm text-text-primary">
          {empty}
        </p>
      ) : (
        <>
          <p className="text-sm text-text-primary">Exchange a [Vid] personnel of your hand with one you command</p>
          <div data-testid="resolve-hand" className="flex min-w-0 shrink-0 gap-1 overflow-x-auto overscroll-contain pb-1 pt-1.5 pr-1.5">
            {step.hand.map((c) => (
              <HandOption
                key={c.id}
                instance={c}
                order={c.id === handChosen ? 0 : null}
                badge={false}
                pickedLabel="to put on the table"
                onToggle={() => setHandPick((id) => (id === c.id ? null : c.id))}
              />
            ))}
          </div>
          <div className="flex min-h-0 flex-col gap-1 overflow-y-auto overscroll-contain pr-1">
            {step.groups.map((group) => (
              <div key={group.key} className="flex flex-col gap-1">
                <h3 className="text-[11px] text-text-muted">{group.label}</h3>
                {group.cards.map((c) => (
                  <PersonnelOption
                    key={c.id}
                    candidate={c}
                    selected={c.id === tableChosen}
                    onSelect={() => setTablePick((id) => (id === c.id ? null : c.id))}
                    note="to the hand"
                  />
                ))}
              </div>
            ))}
          </div>
          <button
            type="button"
            data-testid="resolve-exchange"
            className="btn-primary w-full whitespace-nowrap text-sm"
            disabled={handChosen === null || tableChosen === null}
            onClick={() => handChosen && tableChosen && step.onExchange(handChosen, tableChosen)}
          >
            Exchange
          </button>
        </>
      )}
    </div>
  );
}

// The step of a "discard a card from hand to draw" event (#1745): the hand as a row, a tap picks one card
// (another tap moves the pick), and one button discards it and draws. An empty hand shows a note and no
// button: the discard is the cost of the draw, so the player ends with Resolved → Discard or Cancel.
function DiscardDrawStep({ step }: { step: Extract<ResolveStep, { step: 'discardDraw' }> }) {
  const [picked, setPicked] = useState<string | null>(null);
  const chosen = step.hand.some((c) => c.id === picked) ? picked : null;
  const what = step.draw === 1 ? 'card' : 'cards';
  return (
    <div data-testid="resolve-step-discard-draw" className="flex min-h-0 min-w-0 flex-col gap-2">
      {step.hand.length === 0 ? (
        <p data-testid="resolve-hand-empty" className="text-sm text-text-primary">
          Your hand is empty: no card to discard, so no draw.
        </p>
      ) : (
        <>
          <p className="text-sm text-text-primary">
            Discard 1 card of your hand to draw {step.draw} {what}
          </p>
          <div data-testid="resolve-hand" className="flex min-w-0 gap-1 overflow-x-auto overscroll-contain pb-1 pt-1.5 pr-1.5">
            {step.hand.map((c) => (
              <HandOption
                key={c.id}
                instance={c}
                order={c.id === chosen ? 0 : null}
                badge={false}
                pickedLabel="to discard"
                onToggle={() => setPicked((id) => (id === c.id ? null : c.id))}
              />
            ))}
          </div>
          <button
            type="button"
            data-testid="resolve-discard-draw"
            className="btn-primary w-full whitespace-nowrap text-sm"
            disabled={chosen === null}
            onClick={() => chosen && step.onDiscardDraw(chosen)}
          >
            Discard and draw {step.draw}
          </button>
        </>
      )}
    </div>
  );
}

// The "may draw up to N" step of a played card (#1800): a stepper from 0 to the most the deck allows, and
// Draw N. Its count is its own state, so a new subject, which remounts it, starts at the most.
function DrawUpToStep({ step }: { step: Extract<ResolveStep, { step: 'drawUpTo' }> }) {
  const most = Math.min(step.max, step.deck);
  const [count, setCount] = useState(most);
  const n = Math.max(0, Math.min(count, most));
  return (
    <div data-testid="resolve-step-draw-up-to" className="flex min-h-0 flex-col gap-2">
      <p className="text-sm text-text-primary">
        Draw up to {step.max} cards{step.deck < step.max ? ` (the draw deck holds ${step.deck})` : ''}
      </p>
      <div className="flex items-center justify-center gap-2">
        <button type="button" data-testid="resolve-draw-minus" aria-label="One fewer" className="btn-icon-sm" disabled={n <= 0} onClick={() => setCount(n - 1)}>
          −
        </button>
        <span data-testid="resolve-draw-count" className="w-6 text-center text-lg font-semibold text-text-primary">
          {n}
        </span>
        <button type="button" data-testid="resolve-draw-plus" aria-label="One more" className="btn-icon-sm" disabled={n >= most} onClick={() => setCount(n + 1)}>
          +
        </button>
      </div>
      <button type="button" data-testid="resolve-draw" className="btn-primary w-full whitespace-nowrap text-sm" onClick={() => step.onDraw(n)}>
        Draw {n}
      </button>
    </div>
  );
}

// The "discard N cards from hand" step of a played card (#1800): the hand as a row, a tap picks a card up to
// `count`, and Discard once exactly `count` are picked. An empty hand discards nothing.
function DiscardFromHandStep({ step }: { step: Extract<ResolveStep, { step: 'discardFromHand' }> }) {
  const [order, setOrder] = useState<string[]>([]);
  const inHand = new Set(step.hand.map((c) => c.id));
  const picked = order.filter((id) => inHand.has(id));
  const toggle = (id: string) =>
    setOrder((ids) => (ids.includes(id) ? ids.filter((i) => i !== id) : ids.filter((i) => inHand.has(i)).length < step.count ? [...ids, id] : ids));
  const what = step.count === 1 ? 'card' : 'cards';
  return (
    <div data-testid="resolve-step-discard" className="flex min-h-0 min-w-0 flex-col gap-2">
      <p className="text-sm text-text-primary">
        {step.count === 0 ? 'Your hand is empty: nothing to discard.' : `Discard ${step.count} ${what} from your hand`}
      </p>
      <div data-testid="resolve-hand" className="flex min-w-0 gap-1 overflow-x-auto overscroll-contain pb-1 pt-1.5 pr-1.5">
        {step.hand.map((c) => (
          <HandOption
            key={c.id}
            instance={c}
            order={picked.includes(c.id) ? picked.indexOf(c.id) : null}
            badge={false}
            pickedLabel="to discard"
            onToggle={() => toggle(c.id)}
          />
        ))}
      </div>
      <button
        type="button"
        data-testid="resolve-discard"
        className="btn-primary w-full whitespace-nowrap text-sm"
        disabled={picked.length !== step.count}
        onClick={() => step.onDiscard(picked)}
      >
        Discard {step.count}
      </button>
    </div>
  );
}

// The score of a played card (#1812): the points, and one button that adds them to the score.
function ScoreStep({ step }: { step: Extract<ResolveStep, { step: 'score' }> }) {
  return (
    <div data-testid="resolve-step-score" className="flex min-h-0 flex-col gap-2">
      <p className="text-sm text-text-primary">Score {step.points} points</p>
      <button type="button" data-testid="resolve-score" className="btn-primary w-full whitespace-nowrap text-sm" onClick={step.onScore}>
        Score {step.points}
      </button>
    </div>
  );
}

// The examine of a played card (#1809): the examined cards as a row, a tap takes a card that passes the test up
// to `max` (a second tap puts it back), the rest in the order for the bottom, and one button that applies both.
// Its picks are its own state, so a new subject, which remounts it, starts with none taken.
function ExamineTakeStep({ step }: { step: Extract<ResolveStep, { step: 'examineTake' }> }) {
  const examinedIds = step.examined.map((c) => c.id);
  const [taken, setTaken] = useState<string[]>([]);
  const [order, setOrder] = useState<string[]>(examinedIds);
  const byId = new Map(step.examined.map((c) => [c.id, c]));
  const picked = taken.filter((id) => byId.has(id));
  // The rest in the chosen order, then any examined card the order does not hold yet.
  const rest = [...order, ...examinedIds.filter((id) => !order.includes(id))].filter((id) => byId.has(id) && !picked.includes(id));
  const toggle = (id: string) => {
    if (picked.includes(id)) {
      setTaken(picked.filter((i) => i !== id));
      setOrder([...rest, id]);
    } else if (step.max === 1) {
      setTaken([id]);
      setOrder([...rest.filter((i) => i !== id), ...picked]);
    } else if (picked.length < step.max) {
      setTaken([...picked, id]);
      setOrder(rest.filter((i) => i !== id));
    }
  };
  const shift = (from: number, to: number) => setOrder(arrayMove(rest, from, to));
  const n = step.examined.length;
  const take = step.max === 0 ? 'no card to take' : step.max === 1 ? `take ${step.testText ?? 'one'}` : `take up to ${step.max}`;
  return (
    <div data-testid="resolve-step-examine" className="flex min-h-0 min-w-0 flex-col gap-2">
      <p className="text-sm text-text-primary">
        {n === 0 ? 'Your draw deck is empty: nothing to examine.' : `The top ${n === 1 ? 'card' : `${n} cards`} of your draw deck: ${take}`}
      </p>
      <div data-testid="resolve-examined" className="flex min-w-0 gap-1 overflow-x-auto overscroll-contain pb-1 pt-1.5 pr-1.5">
        {step.examined.map((c) => (
          <HandOption
            key={c.id}
            instance={c}
            testId="resolve-examine-card"
            order={picked.includes(c.id) ? picked.indexOf(c.id) : null}
            badge={false}
            pickedLabel="to take into hand"
            disabled={!step.takes(c) || step.max === 0}
            onToggle={() => toggle(c.id)}
          />
        ))}
      </div>
      {rest.length > 0 && <BottomOrder ids={rest} nameOf={(id) => cardDisplayName(byId.get(id)!.card)} onShift={shift} />}
      <button
        type="button"
        data-testid="resolve-examine-apply"
        className="btn-primary w-full text-sm leading-tight"
        disabled={picked.length < step.min || picked.length > step.max}
        onClick={() => step.onApply(picked, rest)}
      >
        {picked.length ? `Take ${picked.length}, place ${rest.length} on bottom` : `Place ${rest.length} on bottom`}
      </button>
    </div>
  );
}

export function ResolvingPanel({
  instance,
  hidden,
  escapeActive,
  onDiscard,
  onRemoveFromGame,
  onCancel,
  onViewTable,
  step,
  played,
}: {
  instance: CardInstance;
  // During a drag: mounted, with no visibility and no pointer events.
  hidden: boolean;
  // Whether Escape reaches the panel: not while the game menu splash covers it.
  escapeActive: boolean;
  // Absent for a recalled event (#1764), which ends removed from the game.
  onDiscard?: () => void;
  // Shown only for an event that removes itself from the game (`removesItselfFromGame`).
  onRemoveFromGame?: () => void;
  // Absent for a played card (#1800), which has no Cancel: Skip and undo cover it.
  onCancel?: () => void;
  onViewTable: () => void;
  // The step of the event's resolve model (#1739), or none for an event the player resolves by hand.
  // Cancel shows only before the draw: once it drew, Cancel would leave the free draws in the hand.
  step?: ResolveStep;
  // The played card of a pending "when you play" effect (#1800), in place of a resolving event.
  played?: PlayedSubject;
}) {
  // Escape collapses the panel to the small card, and never discards the event; during a drag it does
  // nothing, as a card list panel's does.
  useEscapeLayer(() => {
    if (!hidden) onViewTable();
  }, escapeActive);
  const name = cardDisplayName(instance.card);
  const button = 'btn-primary w-full whitespace-nowrap text-sm';
  const secondary = `${button} bg-none bg-white/[0.05]`;
  return (
    <div
      className={`fixed inset-0 ${LAYER_RESOLVING_PANEL} flex items-center justify-center`}
      style={{ visibility: hidden ? 'hidden' : 'visible', pointerEvents: hidden ? 'none' : undefined }}
    >
      {/* The backdrop takes a tap and does nothing with it: the event resolves by a button. */}
      <div aria-hidden="true" className="absolute inset-0 bg-black/50" />
      <div
        role="dialog"
        aria-label={`Resolving ${name}`}
        data-testid="resolving-panel"
        className={`relative flex flex-row items-center gap-3 rounded-lg ${PANEL_SURFACE_CLASSNAME} p-3`}
        style={safeAreaMargins('top', 'right', 'bottom', 'left')}
      >
        {played ? (
          <PlayedCard
            instance={instance}
            testId="resolving-card"
            imageStyle={{ height: STEP_CARD_HEIGHT, width: 'auto', aspectRatio: `${CARD_IMAGE_WIDTH} / ${CARD_IMAGE_HEIGHT}` }}
          />
        ) : (
          <ResolvingCard
            instance={instance}
            testId="resolving-card"
            imageStyle={{
              height: step ? STEP_CARD_HEIGHT : PANEL_CARD_HEIGHT,
              width: 'auto',
              aspectRatio: `${CARD_IMAGE_WIDTH} / ${CARD_IMAGE_HEIGHT}`,
            }}
          />
        )}
        {(step || played) && (
          <div className="flex min-h-0 w-64 max-w-[38vw] flex-col gap-2 self-stretch" style={{ maxHeight: PANEL_CARD_HEIGHT }}>
            {played && (
              <>
                <p data-testid="resolve-play-text" className="text-xs text-text-secondary">
                  {played.text}
                </p>
                {played.condition && (
                  <p data-testid="resolve-condition" className="text-xs text-text-muted">
                    {played.condition}
                  </p>
                )}
              </>
            )}
            {!step ? null : step.step === 'drawUpTo' ? (
              <DrawUpToStep key={`draw-up-to-${instance.id}`} step={step} />
            ) : step.step === 'score' ? (
              <ScoreStep step={step} />
            ) : step.step === 'examineTake' ? (
              <ExamineTakeStep key={`examine-${instance.id}`} step={step} />
            ) : step.step === 'discardFromHand' ? (
              <DiscardFromHandStep key={`discard-${instance.id}`} step={step} />
            ) : step.step === 'draw' ? (
              <DrawStep key={`draw-${instance.id}`} step={step} />
            ) : step.step === 'discardDraw' ? (
              <DiscardDrawStep key={`discard-draw-${instance.id}`} step={step} />
            ) : step.step === 'download' ? (
              <DownloadStep key={`download-${instance.id}`} step={step} />
            ) : step.step === 'exchange' ? (
              <ExchangeStep key={`exchange-${instance.id}`} step={step} />
            ) : (
              <BottomStep key={`bottom-${instance.id}`} step={step} />
            )}
          </div>
        )}
        <div className="flex w-32 flex-col gap-2">
          <p className="text-xs text-text-muted">Resolving</p>
          {played?.endable && (
            <button
              type="button"
              data-testid={played.started || !played.skippable ? 'resolving-done' : 'resolving-skip'}
              className={played.started || !played.skippable ? button : secondary}
              onClick={played.onEnd}
            >
              {played.started || !played.skippable ? 'Done' : 'Skip'}
            </button>
          )}
          {onRemoveFromGame && (
            <button
              type="button"
              data-testid="resolving-remove-from-game"
              className="btn-primary w-full text-sm leading-tight"
              onClick={onRemoveFromGame}
            >
              Resolved → Remove from game
            </button>
          )}
          {onDiscard && (
            <button type="button" data-testid="resolving-discard" className={button} onClick={onDiscard}>
              Resolved → Discard
            </button>
          )}
          {onCancel && step?.step !== 'bottom' && (
            <button type="button" data-testid="resolving-cancel" className={secondary} onClick={onCancel}>
              Cancel
            </button>
          )}
          <button type="button" data-testid="resolving-view-table" className={secondary} onClick={onViewTable}>
            View table
          </button>
        </div>
      </div>
    </div>
  );
}

// The small card of View table, at the right side of the screen, above the table: a tap brings the panel
// back, a hold previews the event, and it drags out like the panel's card.
// A played card (#1800) does not drag: it stands on the table.
export function ResolvingMini({ instance, onOpen, played = false }: { instance: CardInstance; onOpen: () => void; played?: boolean }) {
  return (
    <div
      className={`fixed ${LAYER_RESOLVING_MINI} flex flex-col items-center gap-0.5 rounded-md bg-black/60 p-1`}
      style={{ right: 8, top: '30%', ...safeAreaMargins('right') }}
    >
      <span className="text-[9px] uppercase tracking-wide leading-3 text-text-secondary">Resolving</span>
      {played ? (
        <PlayedCard instance={instance} testId="resolving-mini" onTap={onOpen} imageStyle={{ width: RESOLVING_MINI_WIDTH, height: MINI_HEIGHT }} />
      ) : (
        <ResolvingCard
          instance={instance}
          testId="resolving-mini"
          onTap={onOpen}
          imageStyle={{ width: RESOLVING_MINI_WIDTH, height: MINI_HEIGHT }}
        />
      )}
    </div>
  );
}
