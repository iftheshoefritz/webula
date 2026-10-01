'use client';

// A reusable closed/open hand of cards (see the parent design in issue #130). Closed, it is a
// tight row of overlapping card edges; a tap opens it as a fan, and a tap outside the fan
// closes it again. Cards are only draggable while the hand is open — starting a drag closes
// the hand at once (the page listens for `DndContext`'s `onDragStart` and flips `open` to
// false), and the page's `DragOverlay` carries the dragged card under the pointer from then on.
//
// The fan stays mounted, but hidden, for the rest of that drag. On touch screens the browser
// keeps sending the touch's events to the element where the touch started. If that element
// leaves the document, the events no longer bubble to the document, where dnd-kit listens,
// so the drop never happens. Chromium retargets the events, but WebKit (iOS Safari) does not.
// Issue #604 reuses this component for the dilemma hand. Issue #638: a tap on the draw pile
// still draws a card while a hand is open, rather than only closing the hand — see
// `passthroughZone` below. Issue #644: the closed row is also a real `useDroppable` drop target,
// so a card dragged from anywhere on the table can land back in the hand. Issue #691: the open
// fan's cards carry the same select checkbox a card list panel's cards do (#677, `CardListPanel.tsx`), so
// a drag started from a selected card picks up the rest of the hand's own selection too — see
// `DraggableFanCard` below.

import React from 'react';
import { LAYER_HAND_BACKDROP, LAYER_HAND_FAN } from '../../../lib/layers';
import { createPortal } from 'react-dom';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { CardInstance } from './tableReducer';
import { offsetFor } from './overlapOffset';
import OverlapRow from './OverlapRow';
import { fullCardHeight, viewerCardSize, VIEWER_TOP_INSET } from './viewerCardSize';
import CountBadge from './CountBadge';
import { useDraggedCardType } from './DraggedCardTypeContext';
import { highlightClassName, highlightState } from './zoneAccepts';
import { LandedRing, useLandedNonce } from './LandedZoneContext';
import { NO_CALLOUT_STYLE, useCardHold } from './useCardHold';
import { PILE_CARD_BORDER_STYLE, cardBorderStyle } from './TableCard';
import { BoxSelectRect, useBoxSelect } from './useBoxSelect';

const CARD_WIDTH = 56; // px, matches the w-14 card images used across the table
const CARD_HEIGHT = 80; // px, matches the h-20 empty-zone placeholders

// Issue #802: the open fan's cards are the viewer size every card list panel uses, 1.5x the shared
// table card (`viewerCardSize.ts`), not a size of the fan's own. The fan draws the full card
// image, and so does every card list panel since #806, so both take their height from the shared
// `fullCardHeight`.

// Both the closed row and the open fan bound their total width regardless of card count, by
// shrinking the offset between overlapping card edges as the hand grows, rather than letting
// the row grow without bound. The closed row keeps the bottom row (discard, draw pile, hand,
// core, brig, dilemma pile) inside a 568 x 320 viewport. The open fan measures its own width
// (`OverlapRow`), so a long hand never hangs off the screen (#802).
const CLOSED_MAX_WIDTH = 80;
// The height of the row of "→ top"/"→ bottom" buttons above the open fan (#994), with its gap.
const HAND_CONTROLS_HEIGHT = 44;
const CLOSED_MAX_OFFSET = 10;
// The fan may leave a small gap between two cards, at the ratio #642 set (60 px for a 56 px card).
const openMaxOffset = (width: number) => Math.round((width * 60) / 56);

// Issue #691: carries the same select checkbox `CardListPanelCard` (`CardListPanel.tsx`) already has, as
// a sibling of the card's own draggable button rather than nested inside it, for the same reason
// `CardListPanelCard` gives — a `<button>` cannot nest inside another `<button>`. A tap on the
// checkbox toggles this card in or out of `selectedIds`, owned by the page (`page.tsx`), not this
// component, so a drag started from a selected card can pick up the rest of the hand's selection
// (`handleDragStart`). A tap on the card itself toggles it the same way; a press and hold
// previews it (`useCardHold`).
function DraggableFanCard({
  instance,
  width,
  selected,
  onToggleSelect,
}: {
  instance: CardInstance;
  width: number;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: instance.id });
  const holdListeners = useCardHold(instance.id, listeners);
  const { card } = instance;

  return (
    <div className="relative pointer-events-auto">
      <button
        ref={setNodeRef}
        {...holdListeners}
        {...attributes}
        data-card-id={instance.id}
        className={`block focus:outline-none touch-none rounded-lg ${selected ? 'ring-2 ring-accent' : ''}`}
        style={{
          ...NO_CALLOUT_STYLE,
          transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
          opacity: isDragging ? 0.5 : 1,
        }}
        onClick={onToggleSelect}
        aria-label={card.name}
      >
        <img
          src={`/cardimages/${card.imagefile}.jpg`}
          width={120}
          height={167}
          alt={card.name}
          className="rounded-lg shadow-md h-auto"
          style={{ ...NO_CALLOUT_STYLE, ...cardBorderStyle(width), width }}
        />
      </button>
      <button
        type="button"
        onClick={onToggleSelect}
        aria-pressed={selected}
        aria-label={selected ? `Deselect ${card.name}` : `Select ${card.name}`}
        className={`absolute top-0.5 right-0.5 w-4 h-4 rounded border flex items-center justify-center text-[9px] leading-none focus:outline-none ${
          selected ? 'bg-accent border-accent text-white' : 'bg-black/50 border-white/50 text-transparent'
        }`}
      >
        ✓
      </button>
    </div>
  );
}

export default function CardHand({
  instances,
  open,
  onOpen,
  onClose,
  dragging = false,
  portalContainer,
  zone = 'hand',
  label = 'hand',
  selectedIds = [],
  onToggleSelect = () => {},
  onSelectIds,
  passthroughZone,
  openCardWidth = viewerCardSize(1).width,
  bottomInset = VIEWER_TOP_INSET,
  onSendSelected,
  deckLabel = 'draw deck',
}: {
  instances: CardInstance[];
  open: boolean;
  dragging?: boolean;
  portalContainer?: HTMLElement | null;
  onOpen: () => void;
  onClose: () => void;
  zone?: 'hand' | 'dilemmaHand';
  label?: string;
  // The cards checked in this hand (#691), owned by the page (`page.tsx`), the same as a pile
  // panel's own `selectedIds`/`onToggleSelect` (`CardListPanel.tsx`). Default to "nothing selected"
  // and a no-op toggle so a caller that does not care about multi-select (existing tests) does
  // not have to pass them.
  selectedIds?: string[];
  onToggleSelect?: (id: string) => void;
  // Replaces the selection with a list of ids (#993), for the box a mouse drag from the backdrop
  // draws (`useBoxSelect.tsx`). Left out, no box starts.
  onSelectIds?: (ids: string[]) => void;
  // The `data-zone`(s) of other controls that stay tappable through the full-screen backdrop
  // while this hand is open (issue #638: the draw pile, so the player can draw without closing
  // an open hand first; issue #741: also the dilemma pile's two halves, so a tap there behaves
  // the same way, whichever hand is open). The backdrop covers the whole screen, including
  // those controls, so a real tap always lands on the backdrop's own element, not the control
  // underneath it. Rather than reworking the table's stacking contexts so the control paints
  // above the backdrop, the backdrop hit-tests the tap's coordinates against each named
  // control's current bounding box, in order, and on the first hit forwards the tap to it
  // (`.click()`) instead of closing the hand — the control keeps its own click handling
  // (including its own `disabled` state) unchanged. A single string is also accepted for a
  // caller with only one passthrough target.
  passthroughZone?: string | string[];
  // The width of an open fan card (#802), the viewer size `page.tsx` derives from the shared
  // `scale`. Defaults to that size at scale 1.
  openCardWidth?: number;
  // The fan's bottom inset (#895): the same inset a card list panel takes (`bottomInset`,
  // `CardListPanel.tsx`), which `page.tsx` measures with `usePanelBottomInset` so the fan's bottom
  // edge sits just above the bottom row (#828).
  bottomInset?: number;
  // Sends the selected cards of this hand to the top or the bottom of its deck (#994): the draw
  // deck for the hand, the dilemma pile for the dilemma hand. Left out, the two buttons do not show.
  onSendSelected?: (position: 'top' | 'bottom') => void;
  // The name of that deck, for the accessible names of the two buttons.
  deckLabel?: string;
}) {
  const closedOffset = offsetFor(instances.length, CARD_WIDTH, CLOSED_MAX_WIDTH, CLOSED_MAX_OFFSET);
  const closedWidth = instances.length === 0 ? CARD_WIDTH : CARD_WIDTH + closedOffset * (instances.length - 1);
  const openCardHeight = fullCardHeight(openCardWidth);
  const count = instances.length;
  const showFan = open || dragging;

  // Issue #644: the closed row is a real drop target — a card dragged from anywhere on the
  // table lands in this hand. The open fan is not a drop target: a drag always closes its own
  // hand at once (`page.tsx`'s `handleDragStart`), so only the closed row is ever visible during
  // a drag.
  const { setNodeRef, isOver } = useDroppable({ id: zone });
  const draggedType = useDraggedCardType();
  const highlight = highlightState(zone, draggedType, isOver);
  // The open fan is not the drop target, so only the closed row shows the landed cue (#778).
  const zoneLandedNonce = useLandedNonce(zone);
  const landedNonce = open ? null : zoneLandedNonce;
  const fanRef = React.useRef<HTMLDivElement | null>(null);
  const boxSelect = useBoxSelect(fanRef, selectedIds, onSelectIds);
  const hasSelection = instances.some((instance) => selectedIds.includes(instance.id));

  const handleBackdropClick = (event: React.MouseEvent) => {
    const passthroughZones = passthroughZone
      ? Array.isArray(passthroughZone)
        ? passthroughZone
        : [passthroughZone]
      : [];
    for (const zoneName of passthroughZones) {
      const target = document.querySelector<HTMLElement>(`[data-zone="${zoneName}"]`);
      if (!target) continue;
      const rect = target.getBoundingClientRect();
      if (
        rect.width > 0 &&
        rect.height > 0 &&
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom
      ) {
        target.click();
        return;
      }
    }
    onClose();
  };

  return (
    <>
      {/* Closed row. Stays in the layout (as a hidden, inert placeholder) while open, so the
          bottom row keeps its width and nothing else shifts. Every card shows as a face-down
          back (issue #639): one visible card face in the closed row would give the player an
          advantage the closed hand should not. The open fan below still shows the card faces. */}
      <button
        ref={setNodeRef}
        type="button"
        data-zone={open ? undefined : zone}
        data-highlight={open ? undefined : highlight}
        data-landed={landedNonce !== null || undefined}
        onClick={onOpen}
        disabled={open || count === 0}
        aria-label={`${label}, ${count} card${count === 1 ? '' : 's'}, tap to open`}
        className={`relative focus:outline-none disabled:cursor-default ${open ? '' : highlightClassName(highlight)}`}
        style={{ width: closedWidth, height: CARD_HEIGHT, visibility: open ? 'hidden' : 'visible' }}
      >
        {count === 0 ? (
          // The empty marker shows only while a drag runs (#929), when it tells the player where
          // the card can go. The button keeps its size either way, so nothing moves in the bottom
          // row as the marker appears and disappears.
          dragging && (
            <div className="w-14 h-20 rounded-lg border-2 border-dashed border-white/20 flex items-center justify-center text-text-muted text-xs">
              Empty
            </div>
          )
        ) : (
          instances.map((instance, idx) => (
            <img
              key={instance.id}
              src="/cardimages/cardback.jpg"
              width={120}
              height={167}
              alt=""
              className="absolute top-0 rounded-lg shadow-md w-14 h-auto"
              style={{ ...PILE_CARD_BORDER_STYLE, left: idx * closedOffset, zIndex: idx + 1 }}
            />
          ))
        )}
        {count > 0 && <CountBadge count={count} landedNonce={landedNonce} />}
        <LandedRing nonce={landedNonce} />
      </button>

      {/* Open fan. It goes in a portal (the page's game layer, or else document.body): the
          bottom row has a CSS transform, which would make `fixed` relative to the row and trap
          the fan's z-index in the row. In the game layer, the large preview stays on top.
          A full-screen backdrop sits behind the cards, so a tap outside the fan closes it, but
          a tap on a card (on top of the backdrop) selects that card instead. The fan anchors its
          bottom edge just above the bottom row (#895), with the same gap a card list panel keeps
          (`bottomInset`, #828), so it leaves the mission rows visible. At the top of the screen it
          covered the missions; at the very bottom it covered the draw pile and the dilemma pile,
          the two taps the player needs while a hand is open.
          The fan's container spans the screen, less a small inset at each side, and `OverlapRow`
          packs the cards into that measured width (#802).
          Issue #750: the backdrop's and the fan's z-index sit in the gap between a pile
          `CountBadge`'s `z-[140]` and the card list panel's `z-[150]`, so the open hand draws above
          every pile's count badge (the draw pile, the discard pile, the dilemma pile, and the
          drag-group badge in the page's `DragOverlay`), including the other hand's closed badge,
          while staying below the card list panel and the card preview. */}
      {showFan &&
        typeof document !== 'undefined' &&
        createPortal(
          <>
            {open && (
              <button
                type="button"
                className={`fixed inset-0 ${LAYER_HAND_BACKDROP} bg-black/30`}
                onClick={handleBackdropClick}
                onPointerDown={boxSelect.onPointerDown}
                aria-label={`Close ${label}`}
              />
            )}
            <div
              ref={fanRef}
              data-zone={open ? zone : undefined}
              aria-hidden={open ? undefined : true}
              className={`fixed inset-x-2 ${LAYER_HAND_FAN} flex`}
              style={{
                bottom: bottomInset,
                height: openCardHeight,
                visibility: open ? 'visible' : 'hidden',
                // The fan's own bounding box no longer reaches the bottom row, but a tap that
                // misses every card must still reach the backdrop, and the backdrop's own
                // hit-test still forwards a tap on a passthrough zone (issue #638's draw pile,
                // issue #741's dilemma pile). `pointer-events: none` here lets a tap that misses
                // every card fall through this whole container to the backdrop beneath it, so
                // the backdrop's own hit-test (`handleBackdropClick`) still runs. Each
                // `DraggableFanCard` re-enables its own pointer events (`pointer-events-auto`),
                // so the cards themselves stay clickable and draggable.
                pointerEvents: 'none',
              }}
            >
              <OverlapRow
                items={instances}
                keyFor={(instance) => instance.id}
                cardWidth={openCardWidth}
                height={openCardHeight}
                maxOffset={openMaxOffset(openCardWidth)}
                centered
                renderAside={(fanWidth) =>
                  /* The "→ top" and "→ bottom" buttons (#994) show while a card of the open hand
                     is selected. They sit just above the fan, and the right end of the row lines
                     up with the right end of the fan (#1013): the outer box spans the fan's own
                     `inset-x-2`, and the inner box takes the width the fan's cards take, centred
                     as they are. A row wider than a short fan grows to the left, so it stays on
                     the screen. On a screen too short for a row above the fan, `max()` keeps them
                     at the top inset, over the top edge of the fan. The row is `fixed` like the
                     fan around it (neither has a transform), so it places itself on the viewport.
                     Neither box takes a tap: the fan's `pointer-events: none` reaches them, and
                     only the buttons turn it back on. */
                  open &&
                  hasSelection &&
                  onSendSelected && (
                    <div
                      className="fixed inset-x-2 flex justify-center"
                      style={{ top: `max(${VIEWER_TOP_INSET}px, calc(100% - ${bottomInset + openCardHeight + HAND_CONTROLS_HEIGHT}px))` }}
                    >
                      <div data-testid={`${zone}-controls`} className="flex flex-row justify-end gap-2" style={{ width: fanWidth }}>
                        <button
                          type="button"
                          onClick={() => onSendSelected('top')}
                          aria-label={`Selected cards to the top of the ${deckLabel}`}
                          className="btn-primary shrink-0 pointer-events-auto"
                        >
                          → top
                        </button>
                        <button
                          type="button"
                          onClick={() => onSendSelected('bottom')}
                          aria-label={`Selected cards to the bottom of the ${deckLabel}`}
                          className="btn-primary shrink-0 pointer-events-auto"
                        >
                          → bottom
                        </button>
                      </div>
                    </div>
                  )
                }
                renderCard={(instance) => (
                  <DraggableFanCard
                    instance={instance}
                    width={openCardWidth}
                    selected={selectedIds.includes(instance.id)}
                    onToggleSelect={() => onToggleSelect(instance.id)}
                  />
                )}
              />
            </div>
            <BoxSelectRect box={boxSelect.box} className={LAYER_HAND_FAN} />
          </>,
          portalContainer ?? document.body,
        )}
    </>
  );
}
