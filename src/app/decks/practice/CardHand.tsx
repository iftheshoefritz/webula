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
// Issue #604 reuses this component for the dilemma hand.

import React from 'react';
import { createPortal } from 'react-dom';
import { useDraggable } from '@dnd-kit/core';
import { CardInstance } from './tableReducer';
import { offsetFor } from './overlapOffset';
import CountBadge from './CountBadge';

const CARD_WIDTH = 56; // px, matches the w-14 card images used across the table
const CARD_HEIGHT = 80; // px, matches the h-20 empty-zone placeholders

// Both the closed row and the open fan bound their total width regardless of card count, by
// shrinking the offset between overlapping card edges as the hand grows, rather than letting
// the row grow without bound. This keeps the bottom row (discard, draw pile, hand, core, brig,
// dilemma pile) inside a 568 x 320 viewport.
const CLOSED_MAX_WIDTH = 80;
const CLOSED_MAX_OFFSET = 10;
const OPEN_MAX_WIDTH = 460;
const OPEN_MAX_OFFSET = 60;
const OPEN_BOTTOM = 16; // px above the viewport's bottom edge, so the fan covers the zones

function DraggableFanCard({
  instance,
  left,
  zIndex,
  onClick,
}: {
  instance: CardInstance;
  left: number;
  zIndex: number;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: instance.id });
  const { card } = instance;

  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      data-card-id={instance.id}
      className="absolute focus:outline-none touch-none"
      style={{
        left,
        zIndex: isDragging ? 100 : zIndex,
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
        className="rounded-lg shadow-md w-14 h-auto"
      />
    </button>
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
}: {
  instances: CardInstance[];
  open: boolean;
  dragging?: boolean;
  portalContainer?: HTMLElement | null;
  onOpen: () => void;
  onClose: () => void;
  onCardClick: (id: string) => void;
  zone?: string;
  label?: string;
}) {
  const closedOffset = offsetFor(instances.length, CARD_WIDTH, CLOSED_MAX_WIDTH, CLOSED_MAX_OFFSET);
  const closedWidth = instances.length === 0 ? CARD_WIDTH : CARD_WIDTH + closedOffset * (instances.length - 1);
  const openOffset = offsetFor(instances.length, CARD_WIDTH, OPEN_MAX_WIDTH, OPEN_MAX_OFFSET);
  const openWidth = instances.length === 0 ? CARD_WIDTH : CARD_WIDTH + openOffset * (instances.length - 1);
  const count = instances.length;
  const showFan = open || dragging;

  return (
    <>
      {/* Closed row. Stays in the layout (as a hidden, inert placeholder) while open, so the
          bottom row keeps its width and nothing else shifts. */}
      <button
        type="button"
        data-zone={open ? undefined : zone}
        onClick={onOpen}
        disabled={open || count === 0}
        aria-label={`${label}, ${count} card${count === 1 ? '' : 's'}, tap to open`}
        className="relative focus:outline-none disabled:cursor-default"
        style={{ width: closedWidth, height: CARD_HEIGHT, visibility: open ? 'hidden' : 'visible' }}
      >
        {instances.map((instance, idx) => (
          <img
            key={instance.id}
            src={`/cardimages/${instance.card.imagefile}.jpg`}
            width={120}
            height={167}
            alt=""
            className="absolute top-0 rounded-lg shadow-md w-14 h-auto"
            style={{ left: idx * closedOffset, zIndex: idx + 1 }}
          />
        ))}
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
                onClick={onClose}
                aria-label={`Close ${label}`}
              />
            )}
            <div
              data-zone={open ? zone : undefined}
              aria-hidden={open ? undefined : true}
              className="fixed left-1/2 -translate-x-1/2 z-40 flex"
              style={{
                bottom: OPEN_BOTTOM,
                height: CARD_HEIGHT + 10,
                width: openWidth,
                visibility: open ? 'visible' : 'hidden',
                pointerEvents: open ? undefined : 'none',
              }}
            >
              {instances.map((instance, idx) => (
                <DraggableFanCard
                  key={instance.id}
                  instance={instance}
                  left={idx * openOffset}
                  zIndex={idx + 1}
                  onClick={() => onCardClick(instance.id)}
                />
              ))}
            </div>
          </>,
          portalContainer ?? document.body,
        )}
    </>
  );
}
