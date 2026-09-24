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
// fan's cards carry the same select checkbox a pile panel's cards do (#677, `PilePanel.tsx`), so
// a drag started from a selected card picks up the rest of the hand's own selection too — see
// `DraggableFanCard` below.

import React from 'react';
import { createPortal } from 'react-dom';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { CardInstance } from './tableReducer';
import { offsetFor } from './overlapOffset';
import CountBadge from './CountBadge';
import { useDraggedCardType } from './DraggedCardTypeContext';
import { highlightClassName, highlightState } from './zoneAccepts';

const CARD_WIDTH = 56; // px, matches the w-14 card images used across the table
const CARD_HEIGHT = 80; // px, matches the h-20 empty-zone placeholders

// Issue #642: the open fan's cards are 30% larger than the closed row's, so they are easier to
// read. The width drives the height too, since the card images scale with `h-auto`.
const OPEN_CARD_WIDTH = Math.round(CARD_WIDTH * 1.3);
const OPEN_CARD_HEIGHT = Math.round(CARD_HEIGHT * 1.3);

// Both the closed row and the open fan bound their total width regardless of card count, by
// shrinking the offset between overlapping card edges as the hand grows, rather than letting
// the row grow without bound. This keeps the bottom row (discard, draw pile, hand, core, brig,
// dilemma pile) inside a 568 x 320 viewport.
const CLOSED_MAX_WIDTH = 80;
const CLOSED_MAX_OFFSET = 10;
const OPEN_MAX_WIDTH = Math.round(460 * 1.3);
const OPEN_MAX_OFFSET = Math.round(60 * 1.3);
const OPEN_BOTTOM = 16; // px above the viewport's bottom edge, so the fan covers the zones

// Issue #691: carries the same select checkbox `PilePanelCard` (`PilePanel.tsx`) already has, as
// a sibling of the card's own draggable button rather than nested inside it, for the same reason
// `PilePanelCard` gives — a `<button>` cannot nest inside another `<button>`. A tap on the
// checkbox toggles this card in or out of `selectedIds`, owned by the page (`page.tsx`), not this
// component, so a drag started from a selected card can pick up the rest of the hand's selection
// (`handleDragStart`). A tap on the card itself still opens its preview, unaffected by selection.
function DraggableFanCard({
  instance,
  left,
  zIndex,
  onClick,
  selected,
  onToggleSelect,
}: {
  instance: CardInstance;
  left: number;
  zIndex: number;
  onClick: () => void;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: instance.id });
  const { card } = instance;

  return (
    <div
      className="absolute pointer-events-auto"
      style={{ left, zIndex: isDragging ? 100 : zIndex }}
    >
      <button
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        data-card-id={instance.id}
        className={`block focus:outline-none touch-none rounded-lg ${selected ? 'ring-2 ring-accent' : ''}`}
        style={{
          transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
          opacity: isDragging ? 0.5 : 1,
        }}
        onClick={onClick}
        aria-label={card.name}
      >
        <img
          src={`/cardimages/${card.imagefile}.jpg`}
          width={120}
          height={167}
          alt={card.name}
          className="rounded-lg shadow-md h-auto"
          style={{ width: OPEN_CARD_WIDTH }}
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
  onCardClick,
  dragging = false,
  portalContainer,
  zone = 'hand',
  label = 'hand',
  selectedIds = [],
  onToggleSelect = () => {},
  passthroughZone,
}: {
  instances: CardInstance[];
  open: boolean;
  dragging?: boolean;
  portalContainer?: HTMLElement | null;
  onOpen: () => void;
  onClose: () => void;
  onCardClick: (id: string) => void;
  zone?: 'hand' | 'dilemmaHand';
  label?: string;
  // The cards checked in this hand (#691), owned by the page (`page.tsx`), the same as a pile
  // panel's own `selectedIds`/`onToggleSelect` (`PilePanel.tsx`). Default to "nothing selected"
  // and a no-op toggle so a caller that does not care about multi-select (existing tests) does
  // not have to pass them.
  selectedIds?: string[];
  onToggleSelect?: (id: string) => void;
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
}) {
  const closedOffset = offsetFor(instances.length, CARD_WIDTH, CLOSED_MAX_WIDTH, CLOSED_MAX_OFFSET);
  const closedWidth = instances.length === 0 ? CARD_WIDTH : CARD_WIDTH + closedOffset * (instances.length - 1);
  const openOffset = offsetFor(instances.length, OPEN_CARD_WIDTH, OPEN_MAX_WIDTH, OPEN_MAX_OFFSET);
  const openWidth = instances.length === 0 ? OPEN_CARD_WIDTH : OPEN_CARD_WIDTH + openOffset * (instances.length - 1);
  const count = instances.length;
  const showFan = open || dragging;

  // Issue #644: the closed row is a real drop target — a card dragged from anywhere on the
  // table lands in this hand. The open fan is not a drop target: a drag always closes its own
  // hand at once (`page.tsx`'s `handleDragStart`), so only the closed row is ever visible during
  // a drag.
  const { setNodeRef, isOver } = useDroppable({ id: zone });
  const draggedType = useDraggedCardType();
  const highlight = highlightState(zone, draggedType, isOver);

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
        onClick={onOpen}
        disabled={open || count === 0}
        aria-label={`${label}, ${count} card${count === 1 ? '' : 's'}, tap to open`}
        className={`relative focus:outline-none disabled:cursor-default ${open ? '' : highlightClassName(highlight)}`}
        style={{ width: closedWidth, height: CARD_HEIGHT, visibility: open ? 'hidden' : 'visible' }}
      >
        {count === 0 ? (
          <div className="w-14 h-20 rounded-lg border-2 border-dashed border-white/20 flex items-center justify-center text-text-muted text-xs">
            Empty
          </div>
        ) : (
          instances.map((instance, idx) => (
            <img
              key={instance.id}
              src="/cardimages/cardback.jpg"
              width={120}
              height={167}
              alt=""
              className="absolute top-0 rounded-lg shadow-md w-14 h-auto"
              style={{ left: idx * closedOffset, zIndex: idx + 1 }}
            />
          ))
        )}
        {count > 0 && <CountBadge count={count} />}
      </button>

      {/* Open fan. It goes in a portal (the page's game layer, or else document.body): the
          bottom row has a CSS transform, which would make `fixed` relative to the row and trap
          the fan's z-index in the row. In the game layer, the large preview stays on top.
          A full-screen backdrop sits behind the cards, so a tap outside the fan closes it, but
          a tap on a card (on top of the backdrop) opens the large preview instead. The fan is
          centred at the bottom of the screen, on top of the bottom row, over the core and the brig. */}
      {showFan &&
        typeof document !== 'undefined' &&
        createPortal(
          <>
            {open && (
              <button
                type="button"
                className="fixed inset-0 z-30 bg-black/30"
                onClick={handleBackdropClick}
                aria-label={`Close ${label}`}
              />
            )}
            <div
              data-zone={open ? zone : undefined}
              aria-hidden={open ? undefined : true}
              className="fixed left-1/2 -translate-x-1/2 z-40 flex"
              style={{
                bottom: OPEN_BOTTOM,
                height: OPEN_CARD_HEIGHT + 10,
                width: openWidth,
                visibility: open ? 'visible' : 'hidden',
                // The fan's own bounding box can overlap the passthrough zone (issue #638's
                // draw pile) even in the gaps between the fanned cards, in the narrow 568 px
                // acceptance-check viewport. `pointer-events: none` here lets a tap that misses
                // every card fall through this whole container to the backdrop beneath it, so
                // the backdrop's own hit-test (`handleBackdropClick`) still runs. Each
                // `DraggableFanCard` re-enables its own pointer events (`pointer-events-auto`),
                // so the cards themselves stay clickable and draggable.
                pointerEvents: 'none',
              }}
            >
              {instances.map((instance, idx) => (
                <DraggableFanCard
                  key={instance.id}
                  instance={instance}
                  left={idx * openOffset}
                  zIndex={idx + 1}
                  onClick={() => onCardClick(instance.id)}
                  selected={selectedIds.includes(instance.id)}
                  onToggleSelect={() => onToggleSelect(instance.id)}
                />
              ))}
            </div>
          </>,
          portalContainer ?? document.body,
        )}
    </>
  );
}
