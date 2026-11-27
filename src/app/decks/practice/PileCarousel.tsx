'use client';

// The search of a pile as a carousel (#1898, the draw deck spike #1899), in place of the grid of
// `CardListPanel`, behind the setting "Search piles in a carousel" (`PILE_CAROUSEL_KEY`). One card
// sits large in the middle; its neighbours sit on each side, smaller and turned away
// (`carouselLayout`). A tap on a side card brings it to the middle, and a tap on the middle card
// selects or deselects it. A hold previews any card shown (`useCardHold`). Only the middle card
// drags out onto the table, under `panelDraggableId` as a panel card does, and the carousel hides
// during the drag as the panel does. A slider runs over the whole pile, with a mark for each
// selected card, and the actions act on the selection in pile order. The carousel covers the
// bottom row too: it hides during a drag, so every zone of the table is open to the drop.
//
// The grid keeps `data-testid="card-list-panel-<location>"`, so the scripts and the tests find it
// as they find the panel. Like the panel's grid it is no drop target.

import React, { useEffect, useRef, useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { LAYER_CARD_LIST_PANEL } from '../../../lib/layers';
import { cardDisplayName } from '../../../lib/cardCount';
import { cardImageUrl, showCardMissing } from '../../../lib/cardImageUrl';
import { useEscapeLayer } from './useEscapeLayer';
import { panelDraggableId } from './panelDragId';
import { CardInstance } from './tableReducer';
import { RemovedFromGameLabel, STOPPED_IMAGE_CLASSNAME, cardBorderStyle } from './TableCard';
import { CARD_IMAGE_HEIGHT, CARD_IMAGE_WIDTH, VIEWER_TOP_INSET } from './viewerCardSize';
import { NO_CALLOUT_STYLE, useCardHold } from './useCardHold';
import { safeAreaMargins } from './useSafeAreaInsets';
import PanelCloseButton from './PanelCloseButton';
import { useFinePointer } from './useFinePointer';
import { CarouselSlot, carouselLayout } from './pileCarouselLayout';

// The piles a search shows as a carousel: the draw deck (#1899), the dilemma pile (#1900) and the
// discard pile (#1901).
export type CarouselPile = 'drawDeck' | 'dilemmaPile' | 'discard';

const PILE_TITLE: Record<CarouselPile, string> = {
  drawDeck: 'Search draw deck',
  dilemmaPile: 'Search dilemma pile',
  discard: 'Search discard pile',
};

const PILE_NAME: Record<CarouselPile, string> = {
  drawDeck: 'draw deck',
  dilemmaPile: 'dilemma pile',
  discard: 'discard pile',
};

// The size of a pile, which its panel's title shows: the table draws no count on the pile (#1937).
export function pileSizeLabel(count: number): string {
  return `${count} ${count === 1 ? 'card' : 'cards'}`;
}

// The labels of the two ends of the slider. The discard pile's carousel shows the newest card first
// (`PracticeTable` passes it reversed), so its first end is the newest.
const PILE_ENDS: Record<CarouselPile, [string, string]> = {
  drawDeck: ['Top', 'Bottom'],
  dilemmaPile: ['Top', 'Bottom'],
  discard: ['Newest', 'Oldest'],
};

// The middle card's index after a change of the pile: the same index, kept inside the pile.
export function clampCarouselIndex(index: number, count: number): number {
  return Math.max(0, Math.min(Math.max(0, count - 1), index));
}

// The selected cards of the pile, in pile order: the order every action takes them in.
export function selectedInPileOrder(cards: CardInstance[], selectedIds: string[]): string[] {
  return cards.filter((instance) => selectedIds.includes(instance.id)).map((instance) => instance.id);
}

function useElementSize(ref: React.RefObject<HTMLElement | null>): { width: number; height: number } {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

// An element's rendered height (`offsetHeight`, 0 in jsdom), re-read when it resizes.
function useOffsetHeight(ref: React.RefObject<HTMLElement | null>): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setHeight(el.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return height;
}

// The room the middle card keeps above and below it for its ring and its ✓.
const CARD_RING_ROOM = 16;
// The gap between the actions row, the cards and the slider bar (`gap-2`).
const BODY_GAP = 8;

function CarouselCard({
  instance,
  slot,
  selected,
  cardWidth,
  cardHeight,
  onTap,
}: {
  instance: CardInstance;
  slot: CarouselSlot;
  selected: boolean;
  cardWidth: number;
  cardHeight: number;
  onTap: () => void;
}) {
  const middle = slot.distance === 0;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: panelDraggableId(instance.id),
    disabled: !middle,
  });
  const holdListeners = useCardHold(instance.id, middle ? listeners : undefined);
  const name = cardDisplayName(instance.card);
  const label = middle ? `${selected ? 'Deselect' : 'Select'} ${name}` : `Show ${name}`;
  const greyed = instance.removedFromGame;
  return (
    <div
      data-testid="pile-carousel-card"
      data-carousel-index={slot.index}
      data-carousel-distance={slot.distance}
      className="absolute left-1/2 top-1/2 transition-[transform,opacity] duration-200 ease-out"
      style={{
        width: cardWidth,
        height: cardHeight,
        marginLeft: -cardWidth / 2,
        marginTop: -cardHeight / 2,
        transform: `translateX(${slot.x}px) rotateY(${slot.rotate}deg) scale(${slot.scale})`,
        opacity: isDragging ? 0.5 : slot.opacity,
        zIndex: slot.zIndex,
      }}
    >
      <button
        ref={middle ? setNodeRef : undefined}
        type="button"
        data-card-id={middle ? instance.id : undefined}
        onClick={onTap}
        {...(middle ? attributes : {})}
        {...holdListeners}
        aria-label={label}
        aria-pressed={middle ? selected : undefined}
        tabIndex={middle ? 0 : -1}
        className={`relative block w-full h-full rounded-md touch-none focus:outline-hidden ${
          selected ? 'ring-4 ring-accent' : ''
        }`}
        style={NO_CALLOUT_STYLE}
      >
        <img
          draggable={false}
          src={cardImageUrl(instance.card)}
          onError={showCardMissing}
          width={CARD_IMAGE_WIDTH}
          height={CARD_IMAGE_HEIGHT}
          alt={name}
          className={`rounded-md shadow-xl ${greyed ? STOPPED_IMAGE_CLASSNAME : ''}`}
          style={{ ...NO_CALLOUT_STYLE, ...cardBorderStyle(cardWidth), width: cardWidth, height: cardHeight }}
        />
        {instance.removedFromGame && <RemovedFromGameLabel />}
      </button>
      {selected && (
        <span
          aria-hidden="true"
          data-testid="pile-carousel-selected-mark"
          className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-accent text-white text-xs font-bold flex items-center justify-center shadow pointer-events-none"
        >
          ✓
        </span>
      )}
    </div>
  );
}

export default function PileCarousel({
  pile,
  cards,
  selectedIds,
  onToggleSelect,
  onSelectIds,
  onClose,
  onShuffle,
  onDownload,
  onDiscard,
  onSendToDeck,
  onSetRemovedFromGame,
  hidden = false,
}: {
  pile: CarouselPile;
  cards: CardInstance[];
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onSelectIds: (ids: string[]) => void;
  onClose: () => void;
  onShuffle?: () => void;
  // Each takes the selected ids in pile order. Left out, its button does not show.
  onDownload?: (ids: string[]) => void;
  onDiscard?: (ids: string[]) => void;
  onSendToDeck?: (ids: string[], position: 'top' | 'bottom') => void;
  // The discard pile's Remove from game (#1564): sets `removedFromGame` on the selection, false when
  // every selected card is already removed, so the button reads "Return to game" then.
  onSetRemovedFromGame?: (ids: string[], removedFromGame: boolean) => void;
  hidden?: boolean;
}) {
  const finePointer = useFinePointer();
  const [index, setIndex] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  // Hidden to look at the table (#1899): the carousel keeps its place and its selection, and a
  // button at the top brings it back.
  const [peeking, setPeeking] = useState(false);
  // The actions row, the cards and the slider bar sit together, centred in the body, so the
  // slider is right under the cards however tall the screen is. The cards take the body's height
  // less the two rows, never more than the native image.
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const actionsRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const { width, height } = useElementSize(bodyRef);
  const actionsHeight = useOffsetHeight(actionsRef);
  const bottomHeight = useOffsetHeight(bottomRef);
  const middle = clampCarouselIndex(index, cards.length);
  const cardRoom = Math.max(0, height - actionsHeight - bottomHeight - 2 * BODY_GAP - CARD_RING_ROOM);
  const layout = carouselLayout(width, cardRoom, cards.length, middle);
  const selected = selectedInPileOrder(cards, selectedIds);
  const count = selected.length;
  const name = PILE_NAME[pile];
  const [firstEnd, lastEnd] = PILE_ENDS[pile];
  const allSelectedRemoved =
    count > 0 && cards.every((instance) => !selected.includes(instance.id) || instance.removedFromGame);

  useEscapeLayer(() => {
    if (hidden) return;
    if (peeking) setPeeking(false);
    else if (helpOpen) setHelpOpen(false);
    else onClose();
  });

  const go = (next: number) => setIndex(clampCarouselIndex(next, cards.length));
  const act = (action?: (ids: string[]) => void) => () => {
    if (count > 0) action?.(selected);
  };

  const help =
    `${finePointer ? 'Click' : 'Tap'} the middle card to select it, and again to deselect it. ` +
    `${finePointer ? 'Click' : 'Tap'} a side card, the arrows or the slider to move through the pile; ` +
    'the marks on the slider show where the selected cards are. ' +
    `${finePointer ? 'Hover over' : 'Hold'} a card to preview it, and drag the middle card onto the table to put it anywhere.`;

  const actionClassName = 'btn-primary shrink-0 disabled:opacity-50 disabled:cursor-not-allowed';
  const roundClassName = `shrink-0 ${finePointer ? 'btn-icon' : 'btn-system w-11 h-11'}`;

  return (
    <div
      data-testid="pile-carousel"
      data-pile={pile}
      data-peeking={peeking ? 'true' : undefined}
      className={`fixed inset-0 ${LAYER_CARD_LIST_PANEL}`}
      style={{
        visibility: hidden || peeking ? 'hidden' : 'visible',
        pointerEvents: hidden || peeking ? 'none' : undefined,
      }}
    >
      {peeking && !hidden && (
        // The way back to the search while it is hidden: visible over the table, at the top centre.
        <button
          type="button"
          data-testid="pile-carousel-show"
          onClick={() => setPeeking(false)}
          className="btn-primary absolute left-1/2 -translate-x-1/2 flex items-center gap-2 shadow-lg"
          style={{ top: VIEWER_TOP_INSET, visibility: 'visible', pointerEvents: 'auto', ...safeAreaMargins('top') }}
        >
          <EyeIcon className="w-5 h-5" />
          Back to {PILE_TITLE[pile].toLowerCase()}
          {count > 0 ? ` · ${count} selected` : ''}
        </button>
      )}
      <button
        type="button"
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
        aria-label={`Close ${name}`}
      />
      <div
        className="absolute flex flex-col gap-2 pointer-events-none"
        style={{
          top: VIEWER_TOP_INSET,
          left: VIEWER_TOP_INSET,
          right: VIEWER_TOP_INSET,
          bottom: VIEWER_TOP_INSET,
          ...safeAreaMargins('top', 'left', 'right', 'bottom'),
        }}
      >
        <div data-testid="pile-carousel-top" className="relative shrink-0 flex flex-row items-center gap-2 pointer-events-auto">
          <h2 className="text-sm font-semibold text-text-primary whitespace-nowrap">
            {PILE_TITLE[pile]} · <span data-testid="pile-size">{pileSizeLabel(cards.length)}</span>
          </h2>
          <div className="relative" onMouseLeave={() => finePointer && setHelpOpen(false)}>
            <button
              type="button"
              data-testid="pile-carousel-help"
              onClick={() => setHelpOpen((open) => !open)}
              onMouseEnter={() => finePointer && setHelpOpen(true)}
              aria-label="How to search"
              aria-expanded={helpOpen}
              className="w-8 h-8 flex items-center justify-center"
            >
              <span
                aria-hidden="true"
                className="w-5 h-5 rounded-full border border-text-secondary text-text-secondary text-xs font-bold flex items-center justify-center"
              >
                ?
              </span>
            </button>
            {helpOpen && (
              <div
                role="tooltip"
                data-testid="pile-carousel-help-text"
                className="absolute left-0 top-9 w-72 rounded-md bg-bg-raised text-text-primary text-xs leading-snug p-2 shadow-lg z-10"
              >
                {help}
              </div>
            )}
          </div>
          <div className="grow" />
          <button
            type="button"
            data-testid="pile-carousel-hide"
            onClick={() => {
              setHelpOpen(false);
              setPeeking(true);
            }}
            aria-label="Hide the search to look at the table"
            title="Hide to look at the table"
            className={`shrink-0 flex items-center justify-center ${finePointer ? 'btn-icon w-10 h-10' : 'btn-system w-11 h-11'}`}
          >
            <EyeOffIcon className="w-6 h-6" />
          </button>
          {onShuffle && (
            <button type="button" onClick={onShuffle} className="btn-primary shrink-0">
              Shuffle
            </button>
          )}
          <PanelCloseButton onClose={onClose} />
        </div>

        <div ref={bodyRef} data-testid="pile-carousel-body" className="grow min-h-0 flex flex-col justify-center gap-2">
        <div ref={actionsRef} data-testid="pile-carousel-actions" className="shrink-0 flex flex-row flex-wrap items-center justify-center gap-2 pointer-events-auto">
          <span data-testid="pile-carousel-count" className="text-xs text-text-secondary whitespace-nowrap tabular-nums">
            {count} selected
          </span>
          {/* Always laid out, hidden at 0, so the row keeps its width and stays centred. */}
          <button
            type="button"
            data-testid="pile-carousel-clear"
            onClick={() => onSelectIds([])}
            disabled={count === 0}
            aria-hidden={count === 0}
            tabIndex={count === 0 ? -1 : undefined}
            className={`text-xs underline text-text-secondary px-1 ${count === 0 ? 'invisible' : ''}`}
          >
            Clear
          </button>
          {onDownload && (
            <button type="button" onClick={act(onDownload)} disabled={count === 0} className={actionClassName}>
              Download
            </button>
          )}
          {onDiscard && (
            <button type="button" onClick={act(onDiscard)} disabled={count === 0} className={actionClassName}>
              Discard
            </button>
          )}
          {onSendToDeck && (
            <>
              <button
                type="button"
                onClick={act((ids) => onSendToDeck(ids, 'top'))}
                disabled={count === 0}
                aria-label={`Selected cards to the top of the ${name}`}
                className={actionClassName}
              >
                Top
              </button>
              <button
                type="button"
                onClick={act((ids) => onSendToDeck(ids, 'bottom'))}
                disabled={count === 0}
                aria-label={`Selected cards to the bottom of the ${name}`}
                className={actionClassName}
              >
                Bottom
              </button>
            </>
          )}
          {onSetRemovedFromGame && (
            <button
              type="button"
              data-testid="remove-from-game-button"
              onClick={act((ids) => onSetRemovedFromGame(ids, !allSelectedRemoved))}
              disabled={count === 0}
              className={actionClassName}
            >
              {allSelectedRemoved ? 'Return to game' : 'Remove from game'}
            </button>
          )}
        </div>

        <div
          data-testid={`card-list-panel-${pile}`}
          className="relative shrink-0 pointer-events-auto"
          style={{ perspective: 1200, height: layout.cardHeight + CARD_RING_ROOM }}
        >
          {cards.length === 0 && (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-text-secondary">
              The {name} is empty.
            </p>
          )}
          {layout.slots.map((slot) => {
            const instance = cards[slot.index];
            return (
              <CarouselCard
                key={instance.id}
                instance={instance}
                slot={slot}
                selected={selectedIds.includes(instance.id)}
                cardWidth={layout.cardWidth}
                cardHeight={layout.cardHeight}
                onTap={() => (slot.distance === 0 ? onToggleSelect(instance.id) : go(slot.index))}
              />
            );
          })}
        </div>

        <div
          ref={bottomRef}
          data-testid="pile-carousel-bottom"
          className="shrink-0 self-center flex flex-row items-center justify-center gap-2 pointer-events-auto"
          style={{ width: 'max(50%, 18rem)' }}
        >
          <button type="button" onClick={() => go(middle - 1)} disabled={middle === 0} aria-label="Previous card" className={roundClassName}>
            <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10 3L5 8l5 5" />
            </svg>
          </button>
          <label className="grow min-w-0 flex flex-col gap-0.5">
            <span className="relative block h-5">
              {selected.map((id) => {
                const at = cards.findIndex((instance) => instance.id === id);
                const fraction = cards.length > 1 ? at / (cards.length - 1) : 0;
                return (
                  <span
                    key={id}
                    aria-hidden="true"
                    data-testid="pile-carousel-tick"
                    className="absolute -top-1 w-1 h-1.5 -ml-0.5 rounded-sm bg-accent pointer-events-none"
                    style={{ left: `calc(8px + (100% - 16px) * ${fraction})` }}
                  />
                );
              })}
              <input
                type="range"
                data-testid="pile-carousel-slider"
                min={0}
                max={Math.max(0, cards.length - 1)}
                value={middle}
                onChange={(event) => go(Number(event.target.value))}
                disabled={cards.length <= 1}
                aria-label={`Position in the ${name}`}
                className="absolute inset-0 w-full accent-accent"
              />
            </span>
            <span className="flex justify-between text-[10px] text-text-secondary">
              <span>{firstEnd}</span>
              <span data-testid="pile-carousel-position" className="font-semibold text-text-primary">
                {cards.length === 0 ? '0 of 0' : `${middle + 1} of ${cards.length}`}
              </span>
              <span>{lastEnd}</span>
            </span>
          </label>
          <button type="button" onClick={() => go(middle + 1)} disabled={middle >= cards.length - 1} aria-label="Next card" className={roundClassName}>
            <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 3l5 5-5 5" />
            </svg>
          </button>
        </div>
        </div>
      </div>
    </div>
  );
}

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7c2 0 3.7.6 5.1 1.5M22 12s-3.5 7-10 7c-2 0-3.7-.6-5.1-1.5" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="M3 3l18 18" />
    </svg>
  );
}
