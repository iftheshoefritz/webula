'use client';

// A reusable closed/open hand of cards (see the parent design in issue #130). Closed, it is a
// small face-up fan at the bottom edge of the screen, on top of the bottom row (#1489); a tap opens
// it as the full arc, and a tap outside the arc closes it again. Cards are only draggable while the hand is open — starting a drag closes
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
// so a card dragged from anywhere on the table can land back in the hand. Issue #1489: the closed row
// became the small fan, which takes no width in the bottom row and is the drop target over the box
// of its visible cards only. Issue #691: the open
// fan's cards carry the same select checkbox a card list panel's cards do (#677, `CardListPanel.tsx`), so
// a drag started from a selected card picks up the rest of the hand's own selection too — see
// `DraggableFanCard` below.

import React from 'react';
import { LAYER_CLOSED_HAND, LAYER_HAND_BACKDROP, LAYER_HAND_FAN } from '../../../lib/layers';
import { useEscapeLayer } from './useEscapeLayer';
import { useLatest } from '../../../hooks/useLatest';
import { cardDisplayName } from '../../../lib/cardCount';
import { createPortal } from 'react-dom';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { CardInstance } from './tableReducer';
import OverlapRow from './OverlapRow';
import { fullCardHeight, viewerCardSize, VIEWER_TOP_INSET } from './viewerCardSize';
import CountBadge from './CountBadge';
import { useDraggedCardType } from './DraggedCardTypeContext';
import { highlightClassName, highlightState } from './zoneAccepts';
import { LandedRing, useLandedNonce } from './LandedZoneContext';
import {
  DRAG_ACTIVATION_DISTANCE,
  HAND_ARC_ATTRIBUTE,
  NO_CALLOUT_STYLE,
  PREVIEW_CARD_ID_ATTRIBUTE,
  startPressHold,
  swallowClickOf,
  useCardHold,
  useCardHoldCallbacks,
} from './useCardHold';
import { cardBorderStyle } from './TableCard';
import { flatCardWidth, pileCardSize } from './flatRowWidths';
import { BoxSelectRect, useBoxSelect } from './useBoxSelect';
import {
  ARC_DESKTOP_RAISE,
  ARC_TOUCH_OPTIONS,
  CLOSED_FAN_CORE_CARDS,
  CLOSED_FAN_VISIBLE,
  arcTouchMinVisible,
  arcVisibleBox,
  handArcLayout,
} from './handArc';
import { SAFE_INSET_CSS, safeAreaMargins } from './useSafeAreaInsets';

// The highest the controls row above the open hand may sit: `VIEWER_TOP_INSET` below the top safe-area
// inset (#1384).
const SAFE_TOP_CLAMP = `calc(${VIEWER_TOP_INSET}px + ${SAFE_INSET_CSS.top})`;


// Issue #802: the open fan's cards are the viewer size every card list panel uses, 1.5x the shared
// table card (`viewerCardSize.ts`), not a size of the fan's own. The fan draws the full card
// image, and so does every card list panel since #806, so both take their height from the shared
// `fullCardHeight`.

// The open fan bounds its total width regardless of card count, by shrinking the offset between
// overlapping card edges as the hand grows: it measures its own width (`OverlapRow`), so a long
// hand never hangs off the screen (#802). The closed fan has a width of its own (#1489,
// `CLOSED_FAN_CORE_CARDS`).
// The height of the row of "→ top"/"→ bottom" buttons above the open fan (#994), with its gap.
const HAND_CONTROLS_HEIGHT = 44;
// The fan may leave a small gap between two cards, at the ratio #642 set (60 px for a 56 px card).
// The arc caps the step itself, so its neighbours always touch (#1153).
const openMaxOffset = (width: number) => Math.round((width * 60) / 56);
// The gap the arc keeps from each pile (#1125).
const ARC_PILE_GAP = 4;

type ArcBounds = { left: number; right: number; bottom: number };

// Issue #1125: measures the free gap between the two piles `arcBetween` names, and the bottom
// edge of the screen, while `active`, and again on every resize. Without either pile (a test that
// renders the hand alone) the gap is the whole screen, less the fan's usual inset.
function useArcBounds(arcBetween: { left: string; right: string } | undefined, active: boolean): ArcBounds | null {
  const [bounds, setBounds] = React.useState<ArcBounds | null>(null);
  React.useLayoutEffect(() => {
    if (!arcBetween || !active) return;
    const measure = () => {
      const width = window.innerWidth;
      const leftRect = document.querySelector(arcBetween.left)?.getBoundingClientRect();
      const rightRect = document.querySelector(arcBetween.right)?.getBoundingClientRect();
      setBounds({
        left: (leftRect ? leftRect.right : 0) + ARC_PILE_GAP,
        right: (rightRect ? rightRect.left : width) - ARC_PILE_GAP,
        bottom: window.innerHeight,
      });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [arcBetween?.left, arcBetween?.right, active]); // eslint-disable-line react-hooks/exhaustive-deps
  return bounds;
}

// Issue #1489: which part of the anchor the closed fan takes. The dilemma hand takes the right end;
// the hand takes the left end in the dilemma choice, where the dilemma hand shows, and the middle of
// the screen everywhere else (#1496).
export type ClosedFanSide = 'left' | 'right' | 'center';

// Issue #1489, #1496: the left and right edges of the closed fan's gap, `maxWidth` wide at most (and
// no wider than the anchor). `'left'` and `'right'` start at that end of the anchor's rect;
// `'center'` is centred on the middle of the screen, `screenWidth / 2`, and slides inward to stay
// inside the anchor, so the fan never covers the draw deck or the dilemma pile. With no anchor
// rect, or one of no width (jsdom), the screen stands in for it.
export function closedFanSpan(
  side: ClosedFanSide,
  rect: { left: number; right: number; width: number } | null,
  maxWidth: number,
  screenWidth: number,
): { left: number; right: number } {
  const box = rect && rect.width > 0 ? rect : { left: 0, right: screenWidth, width: screenWidth };
  const width = rect && rect.width > 0 ? Math.min(maxWidth, rect.width) : maxWidth;
  if (side === 'center') {
    const ideal = screenWidth / 2 - width / 2;
    const left = Math.max(box.left, Math.min(ideal, box.right - width));
    return { left, right: left + width };
  }
  const from = rect ? (side === 'left' ? rect.left : rect.right) : side === 'left' ? 0 : screenWidth;
  return side === 'left' ? { left: from, right: from + width } : { left: from - width, right: from };
}

// Issue #1489: the gap of the closed fan in the element `anchor` names (the box of the core and the
// brig), placed by `closedFanSpan`, and the bottom edge of the screen. It measures on mount, on every
// resize of the screen or of the anchor, and whenever `deps` change. Without the anchor (a test that
// renders the hand alone) the gap is measured from the screen. jsdom has no layout, so an anchor of
// no width gives the whole `maxWidth`.
function useClosedFanBounds(
  anchor: string | undefined,
  side: ClosedFanSide,
  maxWidth: number,
  deps: unknown[],
): ArcBounds | null {
  const [bounds, setBounds] = React.useState<ArcBounds | null>(null);
  React.useLayoutEffect(() => {
    const measure = () => {
      const el = anchor ? document.querySelector(anchor) : null;
      const rect = el?.getBoundingClientRect();
      const next = {
        ...closedFanSpan(side, rect ?? null, maxWidth, window.innerWidth),
        bottom: window.innerHeight,
      };
      setBounds((prev) =>
        prev && prev.left === next.left && prev.right === next.right && prev.bottom === next.bottom ? prev : next,
      );
    };
    measure();
    window.addEventListener('resize', measure);
    const el = anchor ? document.querySelector(anchor) : null;
    const observer = el && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (el && observer) {
      observer.observe(el);
      if (el.parentElement) observer.observe(el.parentElement);
    }
    return () => {
      window.removeEventListener('resize', measure);
      observer?.disconnect();
    };
  }, [anchor, side, maxWidth, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  return bounds;
}

// Issue #1540: the hold target, if any, of the topmost element at a point beneath the open hand's
// backdrop and fan.
function cardUnderBackdrop(x: number, y: number, backdrop: Element, fan: Element | null): Element | null {
  if (typeof document.elementsFromPoint !== 'function') return null;
  const under = document
    .elementsFromPoint(x, y)
    .find((el) => el !== backdrop && !backdrop.contains(el) && !fan?.contains(el));
  return under?.closest(`[${PREVIEW_CARD_ID_ATTRIBUTE}]`) ?? null;
}

// Issue #1489: one face-up card of the closed fan. It carries no `data-card-id` and is not
// draggable: a card of the closed hand is picked up from the open arc, as before. A tap goes on to
// the closed hand, which opens; a hold previews the card, and its click is swallowed, so the hold
// does not also open the hand. `PREVIEW_CARD_ID_ATTRIBUTE`, which `useCardHold` sets, tells the page
// which card a hover shows.
function ClosedFanCard({ instance, width }: { instance: CardInstance; width: number }) {
  const holdListeners = useCardHold(instance.id);
  return (
    <div {...holdListeners} style={NO_CALLOUT_STYLE}>
      <img
        draggable={false}
        src={`/cardimages/${instance.card.imagefile}.jpg`}
        width={120}
        height={167}
        alt=""
        className="rounded-lg shadow-md h-auto"
        style={{ ...NO_CALLOUT_STYLE, ...cardBorderStyle(width), width }}
      />
    </div>
  );
}

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
        className={`block focus:outline-hidden touch-none rounded-lg ${selected ? 'ring-2 ring-accent' : ''}`}
        style={{
          ...NO_CALLOUT_STYLE,
          transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
          opacity: isDragging ? 0.5 : 1,
        }}
        onClick={onToggleSelect}
        aria-label={cardDisplayName(card)}
      >
        <img
          draggable={false}
          src={`/cardimages/${card.imagefile}.jpg`}
          width={120}
          height={167}
          alt={cardDisplayName(card)}
          className="rounded-lg shadow-md h-auto"
          style={{ ...NO_CALLOUT_STYLE, ...cardBorderStyle(width), width }}
        />
      </button>
      {/* #1015: shown only while the card is selected, as in a card list panel. */}
      {selected && (
        <button
          type="button"
          onClick={onToggleSelect}
          aria-pressed
          aria-label={`Deselect ${cardDisplayName(card)}`}
          className="absolute top-0.5 right-0.5 w-4 h-4 rounded border flex items-center justify-center text-[9px] leading-none focus:outline-hidden bg-accent border-accent text-white"
        >
          ✓
        </button>
      )}
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
  arcBetween,
  finePointer = true,
  safeAreaBottom = 0,
  rowScale = 1,
  closedFanAnchor,
  closedFanSide = 'left',
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
  // caller with only one passthrough target. A name no `data-zone` carries is looked up as a
  // `data-testid` (#1191), for a control that is not a drop target, such as the Draw dilemma button
  // of the attempt strip, so a player keeps drawing with the dilemma hand open.
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
  // Issue #1125: the open hand draws as an arc at the bottom of the screen, nearly the whole
  // card above the bottom edge on a desktop (#1495, #1542) and less on a touch screen, between the elements these two selectors name (the draw deck and
  // the dilemma pile). The practice table gives it to both hands (#1150). Left out, the hand opens
  // as the flat fan above the bottom row.
  arcBetween?: { left: string; right: string };
  // Whether the pointer is fine (`useFinePointer`). With a coarse pointer the arc
  // is flatter, with every card's lowest
  // top corner at least `arcTouchMinVisible(safeAreaBottom)` above the bottom edge (#1380, #1383):
  // 64 px at an inset of 0. With a fine pointer it sits `ARC_DESKTOP_RAISE` of its visible height
  // higher (#1495), no higher than keeps the controls row on the screen. Left out, the arc stays as on
  // a desktop.
  finePointer?: boolean;
  // The bottom safe-area inset (`useSafeAreaInsets`, #1383), the home indicator's. It raises the
  // touch arc's floor; the arc's `bottom` stays the bottom of the screen. Defaults to 0.
  safeAreaBottom?: number;
  // The bottom-row scale (`computeBottomRowScale`, #1465): the closed fan's cards and its width grow
  // by it. Defaults to 1.
  rowScale?: number;
  // Issue #1489: the element the closed fan sits on (the box of the core and the brig), and the part
  // of it the fan takes (`closedFanSpan`): the dilemma hand the right end, the hand the left end in
  // the dilemma choice and the middle of the screen elsewhere (#1496). Left out, the fan sits at that
  // part of the screen.
  closedFanAnchor?: string;
  closedFanSide?: ClosedFanSide;
}) {
  // The closed fan's cards are pile cards (`pileCardSize`) at the bottom-row scale, and the fan
  // spans at most `CLOSED_FAN_CORE_CARDS` cards of the core (#1489).
  const { width: closedCardWidth, height: closedCardHeight } = pileCardSize(rowScale);
  const closedFanWidth = CLOSED_FAN_CORE_CARDS * flatCardWidth(rowScale);
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
  const holdCallbacksRef = useLatest(useCardHoldCallbacks());
  const backdropHoldRef = React.useRef<((press?: PointerEvent) => void) | null>(null);
  React.useEffect(() => () => backdropHoldRef.current?.(), []);
  const hasSelection = instances.some((instance) => selectedIds.includes(instance.id));
  const arcBounds = useArcBounds(arcBetween, showFan);
  const closedBounds = useClosedFanBounds(closedFanAnchor, closedFanSide, closedFanWidth, [count, rowScale, open]);
  // An empty hand lays out one card, the place of the "Empty" marker during a drag.
  const closedFan = closedBounds
    ? handArcLayout({
        count: Math.max(1, count),
        cardWidth: closedCardWidth,
        maxStep: openMaxOffset(closedCardWidth),
        ...closedBounds,
        ...(finePointer ? {} : { sag: ARC_TOUCH_OPTIONS.sag, maxAngle: ARC_TOUCH_OPTIONS.maxAngle }),
        minVisible: Math.max(
          Math.round(CLOSED_FAN_VISIBLE * closedCardHeight),
          finePointer ? 0 : arcTouchMinVisible(safeAreaBottom),
        ),
      })
    : null;
  const closedBox = closedFan && closedBounds ? arcVisibleBox(closedFan, closedBounds.bottom) : null;
  // Escape closes the open hand (#1467), and does nothing during a drag.
  useEscapeLayer(() => {
    if (!dragging) onClose();
  }, open);
  const arc =
    arcBetween && arcBounds
      ? handArcLayout({
          count,
          cardWidth: openCardWidth,
          maxStep: openMaxOffset(openCardWidth),
          ...arcBounds,
          ...(finePointer
            ? { lower: -ARC_DESKTOP_RAISE, maxVisible: arcBounds.bottom - VIEWER_TOP_INSET - HAND_CONTROLS_HEIGHT }
            : { ...ARC_TOUCH_OPTIONS, minVisible: arcTouchMinVisible(safeAreaBottom) }),
        })
      : null;

  const sendButtons = (
    <>
      <button
        type="button"
        onClick={() => onSendSelected?.('top')}
        aria-label={`Selected cards to the top of the ${deckLabel}`}
        className="btn-primary shrink-0 pointer-events-auto"
      >
        → top
      </button>
      <button
        type="button"
        onClick={() => onSendSelected?.('bottom')}
        aria-label={`Selected cards to the bottom of the ${deckLabel}`}
        className="btn-primary shrink-0 pointer-events-auto"
      >
        → bottom
      </button>
    </>
  );

  // Issue #1540: a press and hold on the backdrop previews the table card under it, as the same hold
  // does with no hand open. The press goes to the backdrop, so it finds the hold target beneath it
  // (`PREVIEW_CARD_ID_ATTRIBUTE`, which `useCardHold` sets) and runs the same hold. It only
  // previews: no `pointerdown` reaches the card, so no drag starts. A hold that fires swallows the
  // click of its release, so the hand stays open, and keeps a box from opening; a box that opens
  // first cancels the hold.
  const handleBackdropPointerDown = (event: React.PointerEvent) => {
    backdropHoldRef.current?.(event.nativeEvent);
    let held = false;
    const target = cardUnderBackdrop(event.clientX, event.clientY, event.currentTarget, fanRef.current);
    const id = target?.getAttribute(PREVIEW_CARD_ID_ATTRIBUTE);
    const primary = event.pointerType !== 'mouse' || event.button === 0;
    if (target && id && primary && holdCallbacksRef.current) {
      const down = event.nativeEvent;
      const endBy = startPressHold({
        down,
        id,
        element: target,
        dragDistance: DRAG_ACTIVATION_DISTANCE,
        callbacks: () => holdCallbacksRef.current,
        onFire: () => {
          held = true;
          swallowClickOf(down);
        },
        onCleanup: () => {
          if (backdropHoldRef.current === endBy) backdropHoldRef.current = null;
        },
      });
      backdropHoldRef.current = endBy;
    }
    boxSelect.onPointerDown(event, {
      blocked: () => held,
      onOpen: () => backdropHoldRef.current?.(),
    });
  };

  const handleBackdropClick = (event: React.MouseEvent) => {
    const passthroughZones = passthroughZone
      ? Array.isArray(passthroughZone)
        ? passthroughZone
        : [passthroughZone]
      : [];
    for (const zoneName of passthroughZones) {
      const target =
        document.querySelector<HTMLElement>(`[data-zone="${zoneName}"]`) ??
        document.querySelector<HTMLElement>(`[data-testid="${zoneName}"]`);
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
      {/* Closed fan (#1489): face up, a small arc at the bottom edge of the screen, on top of the
          bottom row and taking no width in it. It goes in the game layer, as the open fan does, and
          sits in its own layer, `LAYER_CLOSED_HAND`: above the zones of the bottom row, below the
          backdrop of an open hand. It is no focus layer: no backdrop, and Escape leaves it alone.
          The button is the drop target of #644 over the box of the visible cards only, so a drop
          beside the fan reaches the core or the brig under it. It hides while its own hand is
          open, as the closed row did. */}
      {typeof document !== 'undefined' &&
        createPortal(
          <button
            ref={setNodeRef}
            type="button"
            data-zone={open ? undefined : zone}
            data-testid={`${zone}-closed-fan`}
            data-highlight={open ? undefined : highlight}
            data-landed={landedNonce !== null || undefined}
            onClick={onOpen}
            disabled={open || count === 0}
            aria-label={`${label}, ${count} card${count === 1 ? '' : 's'}, tap to open`}
            className={`fixed ${LAYER_CLOSED_HAND} focus:outline-hidden disabled:cursor-default rounded-t-lg ${open ? '' : highlightClassName(highlight)}`}
            style={{
              left: closedBox?.left ?? 0,
              top: closedBox?.top ?? 0,
              width: closedBox ? closedBox.right - closedBox.left : closedCardWidth,
              height: closedBox?.height ?? closedCardHeight,
              visibility: open ? 'hidden' : 'visible',
              // An empty hand draws nothing until a drag shows its marker, and takes no tap meant for
              // the core under it.
              pointerEvents: count === 0 ? 'none' : undefined,
            }}
          >
            {closedFan && closedBox && (
              <div className="absolute inset-0 overflow-hidden rounded-t-lg">
                {count === 0
                  ? // The empty marker shows only while a drag runs (#929), when it tells the player
                    // where the card can go.
                    dragging && (
                      <div
                        className="absolute rounded-lg border-2 border-dashed border-white/20 flex items-start justify-center pt-2 text-text-muted text-xs bg-black/30"
                        style={{
                          left: closedFan.cards[0].centerX - closedFan.cardWidth / 2 - closedBox.left,
                          top: closedFan.cards[0].centerY - closedFan.cardHeight / 2 - closedBox.top,
                          width: closedFan.cardWidth,
                          height: closedFan.cardHeight,
                        }}
                      >
                        Empty
                      </div>
                    )
                  : instances.map((instance, idx) => {
                      const placed = closedFan.cards[idx];
                      return (
                        <div
                          key={instance.id}
                          className="absolute"
                          style={{
                            left: placed.centerX - closedFan.cardWidth / 2 - closedBox.left,
                            top: placed.centerY - closedFan.cardHeight / 2 - closedBox.top,
                            width: closedFan.cardWidth,
                            transform: `rotate(${placed.angle}deg)`,
                            zIndex: idx + 1,
                          }}
                        >
                          <ClosedFanCard instance={instance} width={closedFan.cardWidth} />
                        </div>
                      );
                    })}
              </div>
            )}
            {count > 0 && <CountBadge count={count} landedNonce={landedNonce} />}
            <LandedRing nonce={landedNonce} />
          </button>,
          portalContainer ?? document.body,
        )}

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
                onPointerDown={handleBackdropPointerDown}
                aria-label={`Close ${label}`}
              />
            )}
            {arc ? (
              /* Issue #1125: the arc. The container covers the screen and takes no tap, as the
                 flat fan's does, and each card turns on a wrapper of its own, so the card's
                 draggable button keeps dnd-kit's transform. A later card sits on top of the one
                 before it, as in the flat fan. */
              <div
                ref={fanRef}
                data-zone={open ? zone : undefined}
                data-testid={`${zone}-arc`}
                {...{ [HAND_ARC_ATTRIBUTE]: 'true' }}
                aria-hidden={open ? undefined : true}
                className={`fixed inset-0 ${LAYER_HAND_FAN} overflow-hidden`}
                style={{ visibility: open ? 'visible' : 'hidden', pointerEvents: 'none' }}
              >
                {instances.map((instance, idx) => {
                  const placed = arc.cards[idx];
                  return (
                    <div
                      key={instance.id}
                      className="absolute"
                      style={{
                        left: placed.centerX - arc.cardWidth / 2,
                        top: placed.centerY - arc.cardHeight / 2,
                        width: arc.cardWidth,
                        transform: `rotate(${placed.angle}deg)`,
                        zIndex: idx + 1,
                      }}
                    >
                      <DraggableFanCard
                        instance={instance}
                        width={arc.cardWidth}
                        selected={selectedIds.includes(instance.id)}
                        onToggleSelect={() => onToggleSelect(instance.id)}
                      />
                    </div>
                  );
                })}
                {open && hasSelection && onSendSelected && (
                  <div
                    data-testid={`${zone}-controls`}
                    className="absolute flex flex-row justify-center gap-2"
                    style={{
                      left: arcBounds?.left,
                      width: arcBounds ? arcBounds.right - arcBounds.left : undefined,
                      top: `max(${SAFE_TOP_CLAMP}, calc(100% - ${arc.visibleHeight + HAND_CONTROLS_HEIGHT}px))`,
                      zIndex: count + 2,
                    }}
                  >
                    {sendButtons}
                  </div>
                )}
              </div>
            ) : (
              <div
                ref={fanRef}
                data-zone={open ? zone : undefined}
                aria-hidden={open ? undefined : true}
                className={`fixed inset-x-2 ${LAYER_HAND_FAN} flex`}
                style={{
                  bottom: bottomInset,
                  height: openCardHeight,
                  visibility: open ? 'visible' : 'hidden',
                  // Clear of the side safe-area insets (#1384).
                  ...safeAreaMargins('left', 'right'),
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
                       only the buttons turn it back on. The row shares the fan's stacking context
                       with the cards, whose `zIndex` runs from 1 up to the count (`OverlapRow`), so
                       its own `zIndex` sits above them all, as the row did when it had a layer of
                       its own. */
                    open &&
                    hasSelection &&
                    onSendSelected && (
                      <div
                        className="fixed inset-x-2 flex justify-center"
                        style={{
                          top: `max(${SAFE_TOP_CLAMP}, calc(100% - ${bottomInset + openCardHeight + HAND_CONTROLS_HEIGHT}px))`,
                          zIndex: count + 2,
                          ...safeAreaMargins('left', 'right'),
                        }}
                      >
                        <div data-testid={`${zone}-controls`} className="flex flex-row justify-end gap-2" style={{ width: fanWidth }}>
                          {sendButtons}
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
            )}
            <BoxSelectRect box={boxSelect.box} className={LAYER_HAND_FAN} />
          </>,
          portalContainer ?? document.body,
        )}
    </>
  );
}
