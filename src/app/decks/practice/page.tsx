'use client';

import React, { Suspense, useEffect, useReducer, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  CollisionDetection,
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { collisionDetection } from './collisionDetection';
import { FaLayerGroup, FaMobileAlt, FaForward } from 'react-icons/fa';
import { deckFromTsv, expandDeck, extractDilemmas, extractMissions, isDeckEmpty, shuffleArray } from '../deckBuilderUtils';
import { Deck } from '../../../types';
import useDataFetching from '../../../hooks/useDataFetching';
import { PRACTICE_DECK_TSV } from '../../../lib/practiceDeck';
import {
  CardInstance,
  MissionPileName,
  MoveTarget,
  SCORE_MAX,
  SCORE_MIN,
  SCORE_STEP,
  TableAction,
  TableState,
  TableZone,
  Zone,
  createCardInstances,
  findInstanceAnywhere,
  initialTableState,
  tableReducer,
} from './tableReducer';
import CardHand from './CardHand';
import MissionRow, {
  DilemmaIcon,
  SHIP_CARD_ART_HEIGHT,
  SHIP_CARD_WIDTH,
  missionIndexFromDropId,
  missionPileFromDropId,
  shipIdFromCrewDropId,
} from './MissionRow';
import CardPreview, { cardIdFromDraggableId } from './CardPreview';
import CountBadge from './CountBadge';
import PilePanel, { ShuffleIcon } from './PilePanel';
import FlatCardRow from './FlatCardRow';
import { TABLE_CARD_WIDTH, TABLE_CARD_ART_HEIGHT } from './TableCard';
import { useTableScale } from './tableScale';
import { DraggedCardTypeProvider, useDraggedCardType } from './DraggedCardTypeContext';
import { highlightClassName, highlightState, ZoneKind } from './zoneAccepts';

// A plain inline hamburger icon (#722), not react-icons: see `DownloadIcon`'s comment below for
// why a react-icons import here would need every test mock of `react-icons/fa` in this file's own
// tests, and every other test that renders this page, updated too.
function MenuIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      className="w-4 h-4"
      aria-hidden="true"
    >
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

// A home for the controls that act on the whole game rather than one zone (#722), starting with
// Reset. A small menu button opens it; it does not cover the table while closed, and a tap
// outside the open menu (the backdrop below, the same "tap outside closes it" convention
// `CardHand`'s own fan backdrop already follows) closes it without acting. Reset throws away the
// current game, so it confirms first via `window.confirm`, the same confirm-before-destroy
// pattern `DrivePickerModal`'s own delete already uses elsewhere in the app, rather than a
// custom dialog built just for this one destructive action.
function GameMenu({ open, onToggle, onClose, onReset }: { open: boolean; onToggle: () => void; onClose: () => void; onReset: () => void }) {
  return (
    <div className="absolute top-2 left-2 z-40">
      <button type="button" onClick={onToggle} aria-label="Game menu" aria-expanded={open} className="btn-icon btn-icon-sm">
        <MenuIcon />
      </button>
      {open && (
        <>
          <button type="button" className="fixed inset-0 z-30" onClick={onClose} aria-label="Close game menu" />
          <div className="absolute left-0 top-full mt-1 z-40 min-w-[8rem] rounded-md border border-white/10 bg-bg-secondary py-1 shadow-lg">
            <button
              type="button"
              onClick={onReset}
              className="block w-full px-3 py-1.5 text-left text-sm text-text-secondary hover:bg-white/[0.1] hover:text-text-primary"
            >
              Reset
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// A dropped card's type chooses its mission pile (#602): personnel and equipment go to the
// personnel pile, event/mission/interrupt go to the event pile. A ship, and a dilemma (routed
// separately below, since a dilemma's pile depends on its source zone too, #605/#606), are
// handled elsewhere.
const MISSION_PILE_BY_TYPE: Record<string, MissionPileName> = {
  personnel: 'personnel',
  equipment: 'personnel',
  event: 'event',
  mission: 'event',
  interrupt: 'event',
};

interface ScreenOrientationWithLock extends ScreenOrientation {
  lock?(orientation: string): Promise<void>;
}

function RotateDeviceOverlay() {
  return (
    <div className="fixed inset-0 z-50 bg-[#131713] flex flex-col items-center justify-center gap-4 text-text-primary">
      <FaMobileAlt className="text-6xl text-text-muted" style={{ transform: 'rotate(90deg)' }} />
      <p className="text-xl font-display font-medium">Rotate your device</p>
      <p className="text-sm text-text-muted text-center px-8">
        Rotate your device to landscape to use Practice Draw
      </p>
    </div>
  );
}

const DISCARD_DROPPABLE_ID = 'discard';

// Flat, top-level drop zones (#603 adds the core and the brig alongside the discard pile; #644
// adds the hand and the dilemma hand): each one's `useDroppable` id is just its own zone name
// (`FlatCardRow`, `DiscardPile`, `CardHand`'s closed row), so a drop on any of them dispatches
// the same `move` straight to that zone, for any card type — the zone rules in `zoneAccepts.ts`
// are advisory highlights only, same as every other flat zone here. The dilemma pile is a flat
// zone too, but not one of these: it has two drop targets of its own, the top half and the
// bottom half of `DilemmaPileButton`, handled separately below (#607) — it replaces the single
// whole-card `dilemmaPile` droppable #605 added, which only ever appended to the bottom.
// #630: the dilemma stack joins this list too — a single whole-card droppable, appending to the
// bottom, the same as the other zones here, unlike the dilemma pile's own top/bottom halves.
const FLAT_DROP_ZONES: readonly Zone[] = [DISCARD_DROPPABLE_ID, 'core', 'brig', 'hand', 'dilemmaHand', 'dilemmaStack'];

// The dilemma pile's two drop targets (#607): a drop on the top half puts the card first in
// `dilemmaPile` (drawn next); a drop on the bottom half puts it last, matching the pile's older,
// single-droppable behaviour. Both ids follow the kebab-case pattern `missionPileDropId`/
// `shipRowDropId` already use.
const DILEMMA_PILE_TOP_DROPPABLE_ID = 'dilemma-pile-top';
const DILEMMA_PILE_BOTTOM_DROPPABLE_ID = 'dilemma-pile-bottom';

// The draw pile's own two drop targets (#743), the same top/bottom split as the dilemma pile
// above: a drop on the top half puts the card first in `pile` (drawn next), the bottom half
// puts it last. Unlike the dilemma pile, the draw pile accepts every card type, not only one.
const DRAW_PILE_TOP_DROPPABLE_ID = 'draw-pile-top';
const DRAW_PILE_BOTTOM_DROPPABLE_ID = 'draw-pile-bottom';

function dilemmaPileHalfFromDropId(id: string): 'top' | 'bottom' | null {
  if (id === DILEMMA_PILE_TOP_DROPPABLE_ID) return 'top';
  if (id === DILEMMA_PILE_BOTTOM_DROPPABLE_ID) return 'bottom';
  return null;
}

function drawPileHalfFromDropId(id: string): 'top' | 'bottom' | null {
  if (id === DRAW_PILE_TOP_DROPPABLE_ID) return 'top';
  if (id === DRAW_PILE_BOTTOM_DROPPABLE_ID) return 'bottom';
  return null;
}

// Resolves a single dropped card's destination, the same routing `handleDragEnd` always used,
// pulled out into its own function so a multi-card drag (#677) can run it once per card in the
// dragged group, each keyed off that card's own type rather than one shared "the dragged card" —
// a mixed-type group (say, a ship dropped on a mission alongside personnel) still sends the ship
// to the ship row and the personnel to the personnel pile, same as dragging each one on its own.
// Returns null for a card the drop target does not accept (matching the old early-return-less
// fallthrough): that card stays where it was.
function computeMoveTargetForInstance(
  over: DragEndEvent['over'],
  instance: CardInstance,
  table: TableState
): MoveTarget | null {
  if (!over) return null;

  if (FLAT_DROP_ZONES.includes(String(over.id) as Zone)) {
    return over.id as Zone;
  }

  if (dilemmaPileHalfFromDropId(String(over.id))) {
    return 'dilemmaPile';
  }

  if (drawPileHalfFromDropId(String(over.id))) {
    return 'pile';
  }

  const shipId = shipIdFromCrewDropId(String(over.id));
  if (shipId) {
    if (instance.card.type === 'personnel' || instance.card.type === 'equipment') {
      return { zone: 'crew', shipId };
    }
    // A ship dropped on a crew zone is not crew (#668): the crew zone of the ship already on
    // the row covers almost the whole row, so a second ship's drop lands here instead of on the
    // row itself. Route it to that same ship's own row, the row the drop was clearly aimed at,
    // instead of falling through to null and leaving the dragged ship stuck where it started.
    if (instance.card.type === 'ship') {
      const shipLocation = findInstanceAnywhere(table, shipId);
      if (shipLocation && typeof shipLocation.zone === 'object' && shipLocation.zone.zone === 'shipRow') {
        return { zone: 'shipRow', missionIndex: shipLocation.zone.missionIndex };
      }
    }
  }

  const badgeTarget = missionPileFromDropId(String(over.id));
  if (badgeTarget) {
    return { zone: 'missionPile', ...badgeTarget };
  }

  const missionIndex = missionIndexFromDropId(String(over.id));
  if (missionIndex !== null) {
    if (instance.card.type === 'ship') {
      return { zone: 'shipRow', missionIndex };
    }
    if (instance.card.type === 'dilemma') {
      // A dilemma dropped on a mission card always lands under that mission (#606, #733),
      // whatever zone it came from.
      return { zone: 'missionPile', missionIndex, pile: 'underMission' };
    }
    const pile = MISSION_PILE_BY_TYPE[instance.card.type];
    if (pile) return { zone: 'missionPile', missionIndex, pile };
  }

  return null;
}

// The core and the brig show their cards at the ship row's small size (`MissionRow.tsx`), and
// each one's row is bounded to a width that keeps the whole bottom row (discard pile, draw pile,
// closed hand, core, brig, dilemma placeholder) inside the 568 px acceptance-check viewport: the
// other four zones and their gaps take a little over 300 px, leaving roughly 250 px for the core
// and the brig combined. The player uses the core more than the brig (#666), so the core is
// bounded to fit 3 cards side by side with no overlap, and the brig stays bounded to fit 2
// overlapping cards; together they stay well inside that budget.
const CORE_ROW_MAX_WIDTH = 106; // px, fits 3 ship-sized cards side by side with no overlap
const BRIG_ROW_MAX_WIDTH = 58; // px, fits 2 overlapping ship-sized cards
const FLAT_ROW_MAX_OFFSET = SHIP_CARD_WIDTH + 2; // cards sit edge to edge with a small gap, matching the ship row

// The discard pile's top card, draggable off the pile (#606 review): a dilemma dragged from here
// onto a mission card lands under that mission, since its source is not the dilemma hand (see
// `handleDragEnd`'s dilemma routing below). A separate component, mounted only while a top card
// exists, keeps `useDraggable`'s hook call (and so its registration order, which the mock
// `@dnd-kit/core` in the test suite relies on) tied to the card's own presence, the same as
// `PilePanelCard` and `CardHand`'s cards.
function DiscardPileCard({ topCard, count }: { topCard: CardInstance; count: number }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: topCard.id });

  return (
    <div
      ref={setNodeRef}
      data-card-id={topCard.id}
      className="relative touch-none"
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        opacity: isDragging ? 0.5 : 1,
      }}
      {...attributes}
      {...listeners}
    >
      <img
        src={`/cardimages/${topCard.card.imagefile}.jpg`}
        width={120}
        height={167}
        alt="Discard pile"
        className="rounded-lg shadow-lg w-14 h-auto"
      />
      <CountBadge count={count} />
    </div>
  );
}

function DiscardPile({ topCard, count }: { topCard: CardInstance | undefined; count: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: DISCARD_DROPPABLE_ID });
  const draggedType = useDraggedCardType();
  const highlight = highlightState('discard', draggedType, isOver);

  // A ring shows that the discard pile accepts the card under the pointer (`isOver`), or accepts
  // the dragged card's type generally (`valid`, #608).
  return (
    <div
      ref={setNodeRef}
      data-zone="discard"
      data-highlight={highlight}
      className={`flex flex-col items-center gap-1 rounded-lg ${highlightClassName(highlight)}`}
    >
      {topCard ? (
        <DiscardPileCard topCard={topCard} count={count} />
      ) : (
        <div className="w-14 h-20 rounded-lg border-2 border-dashed border-white/20 flex items-center justify-center text-text-muted text-[10px] text-center leading-tight px-1">
          Discard
        </div>
      )}
    </div>
  );
}

// One half of a pile's two drop targets — the dilemma pile's (#607) or the draw pile's (#743):
// the top half puts a dropped card first in the pile (drawn next), the bottom half puts it last.
// Each half is its own `<button>`, the same sibling-not-nested pattern `PileBadge`
// (`MissionRow.tsx`) already uses to combine a tap control and a droppable without nesting one
// button inside another — here the two halves sit as absolutely positioned siblings over the
// shared, non-interactive card art in `DilemmaPileButton`/`DrawPileButton` below, each covering
// exactly half its height and the full width, so both halves together cover the whole card and
// neither changes the card's footprint. A tap on either half draws, same as tapping anywhere on
// the old single button; `disabled` here only stops the tap (`useDroppable`'s geometry, and so a
// drop, works on a disabled button same as an enabled one, #607 review).
function PileHalf({
  dropId,
  label,
  position,
  count,
  onDraw,
  showLabel,
  zoneKind,
  pileName,
}: {
  dropId: string;
  label: string;
  position: 'top' | 'bottom';
  count: number;
  onDraw: () => void;
  showLabel: boolean;
  zoneKind: ZoneKind;
  pileName: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dropId });
  const draggedType = useDraggedCardType();
  const highlight = highlightState(zoneKind, draggedType, isOver);

  return (
    <button
      ref={setNodeRef}
      data-zone={dropId}
      data-highlight={highlight}
      onClick={onDraw}
      disabled={count === 0}
      aria-label={`${pileName} ${position}, tap to draw`}
      className={`absolute inset-x-0 ${position === 'top' ? 'top-0' : 'bottom-0'} h-1/2 focus:outline-none disabled:cursor-not-allowed ${highlightClassName(
        highlight
      )} ${position === 'top' ? 'rounded-t-lg' : 'rounded-b-lg'}`}
    >
      {showLabel && isOver && (
        <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-white bg-black/60 rounded">
          {label}
        </span>
      )}
    </button>
  );
}

// A plain inline magnifying-glass icon (#690), not react-icons: every test that renders this
// page mocks `react-icons/fa` with an explicit list of the icons this file imports, so a new
// react-icons import here would need every one of those mocks updated too — the same reasoning
// `PilePanel.tsx`'s own `ShuffleIcon` documents.
function DownloadIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-3 h-3"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

// A download trigger for the draw pile or the dilemma pile (#690): opens that pile's own
// `PilePanel` so the player can look through every card in it — face up, in its existing order —
// and drag one straight into hand, without drawing through the rest of the pile. Kept apart from
// the pile's own tap-to-draw click (`onClick` on the draw-pile button, `DilemmaPileButton`'s two
// drop/draw halves), rather than layered on top of the pile art, so it never steals a tap meant
// for drawing, or a drop meant for the dilemma pile's top/bottom halves — the same
// "control sits beside the card, not nested on top of it" reasoning `PileBadge`/`ShipCrewBadge`
// (`MissionRow.tsx`) already follow. Disabled, like the pile's own draw control, once the pile is
// empty: there is nothing left to download.
function DownloadPileButton({ label, count, onOpen }: { label: string; count: number; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={count === 0}
      aria-label={`Download from the ${label}`}
      className="btn-icon btn-icon-sm disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <DownloadIcon />
    </button>
  );
}

// The dilemma pile (#604): a tap draws its top card into the dilemma hand. It is also a drop
// target: dropping any card on its top half puts it first in the pile (drawn next), dropping on
// its bottom half puts it last (#607, replacing #605's single whole-card droppable, which only
// ever appended to the bottom). Only a dragged dilemma shows the "Top"/"Bottom" label; a drop of
// any other card type is still accepted on either half (the same advisory-zone convention every
// other flat zone follows), with only the generic `isOver` ring.
function DilemmaPileButton({
  count,
  onDraw,
  showPositionLabel,
}: {
  count: number;
  onDraw: () => void;
  showPositionLabel: boolean;
}) {
  return (
    <div className={`relative w-14 h-20 group ${count === 0 ? 'opacity-50' : ''}`} data-testid="dilemma-pile">
      {count > 0 ? (
        <>
          <img
            src="/cardimages/cardback.jpg"
            width={120}
            height={167}
            alt="Face-down dilemma pile"
            className="pointer-events-none rounded-lg shadow-lg group-hover:shadow-accent/30 transition-shadow w-full h-full object-cover"
          />
          <CountBadge count={count} />
        </>
      ) : (
        <div className="pointer-events-none w-full h-full rounded-lg border-2 border-dashed border-white/20 flex items-center justify-center text-text-muted text-[10px] text-center leading-tight px-1">
          Dilemma
        </div>
      )}

      <PileHalf
        dropId={DILEMMA_PILE_TOP_DROPPABLE_ID}
        label="Top"
        position="top"
        count={count}
        onDraw={onDraw}
        showLabel={showPositionLabel}
        zoneKind="dilemmaPile"
        pileName="Dilemma pile"
      />
      <PileHalf
        dropId={DILEMMA_PILE_BOTTOM_DROPPABLE_ID}
        label="Bottom"
        position="bottom"
        count={count}
        onDraw={onDraw}
        showLabel={showPositionLabel}
        zoneKind="dilemmaPile"
        pileName="Dilemma pile"
      />
    </div>
  );
}

// The draw pile (#743): the same top/bottom drop-half split the dilemma pile above uses, wired
// to the `pile` zone rather than `dilemmaPile`. Unlike the dilemma pile, the draw pile accepts
// every card type — so `showPositionLabel` gates only on whether any drag is in progress at all,
// not on the dragged card's type, and the halves' zone kind (`zoneAccepts.ts`) accepts every
// type too. A tap on either half still draws, same as the single button this replaces.
function DrawPileButton({
  count,
  onDraw,
  showPositionLabel,
}: {
  count: number;
  onDraw: () => void;
  showPositionLabel: boolean;
}) {
  return (
    <div className={`relative w-14 h-20 group ${count === 0 ? 'opacity-50' : ''}`}>
      {count > 0 ? (
        <>
          <img
            src="/cardimages/cardback.jpg"
            width={120}
            height={167}
            alt="Face-down draw pile"
            className="pointer-events-none rounded-lg shadow-lg group-hover:shadow-accent/30 transition-shadow w-full h-full object-cover"
          />
          <CountBadge count={count} />
        </>
      ) : (
        <div className="pointer-events-none w-full h-full rounded-lg border-2 border-dashed border-white/20 flex items-center justify-center text-text-muted text-xs">
          Empty
        </div>
      )}

      <PileHalf
        dropId={DRAW_PILE_TOP_DROPPABLE_ID}
        label="Top"
        position="top"
        count={count}
        onDraw={onDraw}
        showLabel={showPositionLabel}
        zoneKind="pile"
        pileName="Draw pile"
      />
      <PileHalf
        dropId={DRAW_PILE_BOTTOM_DROPPABLE_ID}
        label="Bottom"
        position="bottom"
        count={count}
        onDraw={onDraw}
        showLabel={showPositionLabel}
        zoneKind="pile"
        pileName="Draw pile"
      />
    </div>
  );
}

// A plain inline eye icon (#751), not react-icons: see `DownloadIcon`'s comment above for why a
// react-icons import here would need every test mock of `react-icons/fa` in this file's own
// tests, and every other test that renders this page, updated too.
function RevealIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-2.5 h-2.5"
      aria-hidden="true"
    >
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

// The dilemma stack's own top card, revealed one at a time (#751): once its own `flip` (the
// existing per-card action, unchanged) turns it face up, it shows its own art in place of the
// generic card back, right there on the table, and becomes draggable straight off the stack —
// the same "the pile's top card is a small component of its own, mounted only while a top card
// exists" pattern `DiscardPileCard` above already uses, so `useDraggable`'s own registration (and
// so the mock `@dnd-kit/core` the test suite relies on) only happens while a revealed card is
// actually there to drag. The button also keeps the zone's own tap-to-open working, the same
// `onClick` alongside `useDraggable`'s own listeners `PilePanelCard` (`PilePanel.tsx`) already
// combines on one element — a plain tap still opens the full stack panel; a drag pulls just this
// one card out.
function DilemmaStackTopCard({
  topCard,
  count,
  onOpen,
}: {
  topCard: CardInstance;
  count: number;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: topCard.id });

  return (
    <button
      type="button"
      ref={setNodeRef}
      data-card-id={topCard.id}
      onClick={onOpen}
      aria-label={`Dilemma stack, ${count} card${count === 1 ? '' : 's'}, tap to open`}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        opacity: isDragging ? 0.5 : 1,
      }}
      {...attributes}
      {...listeners}
      className="absolute inset-0 w-full h-full rounded-lg focus:outline-none touch-none"
    >
      <img
        src={`/cardimages/${topCard.card.imagefile}.jpg`}
        width={120}
        height={167}
        alt={topCard.card.name}
        className="pointer-events-none rounded-lg shadow-lg w-full h-full object-cover"
      />
    </button>
  );
}

// The dilemma stack (#630): a single flat drop target — no top/bottom split, since a drop always
// appends at the bottom, and the first dilemma dropped (index 0) is the first revealed. Sits in
// its own reserved column to the right of the mission row (`computeTableScale`,
// `tableScale.ts`); a tap opens its own `PilePanel`, listing the stack in that same order. Its
// `DilemmaIcon` badge (`MissionRow.tsx`, exported for exactly this once #733 took the stack out
// of the mission slots) marks it apart from the flat dilemma pile, which looks the same otherwise
// (a face-down cardback with a count).
//
// #751: a separate "reveal" control, a small corner overlay sibling of the tap-to-open button —
// the same "a control sits beside the card, not nested inside its own button" convention
// `PilePanelCard`'s selection checkbox (`PilePanel.tsx`) already follows for a corner overlay
// specifically — turns the top card face up in place via the existing `flip` action, one card at
// a time; the card below stays face down until revealed in its own turn. Only shown while there
// is a face-down top card to reveal; once revealed, `DilemmaStackTopCard` above takes over the
// zone's own art and becomes the drag source, and the button hides since there's nothing left for
// it to do until the next card needs revealing. Do not confuse this with the whole-stack
// `PilePanel` open above: that already shows every card in the stack face up, unconditionally,
// for a reorder — this reveals only the current top card, on the table itself, unchanged from
// this issue's own scope.
//
// #742: hidden (kept in the DOM, `visibility: hidden`, so the reserved column's width never
// moves the mission row beside it) whenever it isn't useful — the stack is empty, the dilemma
// hand is closed, and no dilemma is being dragged — and shown again the moment any one of those
// stops being true, the same `visibility`/`pointerEvents` pattern the closed hand's own fan uses
// (`CardHand.tsx`). `visibility: hidden` alone already keeps it out of the accessibility tree, so
// no separate `aria-hidden` is needed. Its height is a mission card's own art height plus its
// ship row's height, not one card's height, so a dragged dilemma has a bigger target to hit; both
// pieces scale with `scale` the same way `MissionRow.tsx` scales the mission column beside it.
function DilemmaStackPile({
  count,
  topCard,
  onOpen,
  onReveal,
  visible,
  scale,
}: {
  count: number;
  topCard: CardInstance | undefined;
  onOpen: () => void;
  onReveal: () => void;
  visible: boolean;
  scale: number;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: 'dilemmaStack' });
  const draggedType = useDraggedCardType();
  const highlight = highlightState('dilemmaStack', draggedType, isOver);
  const height = Math.round((TABLE_CARD_ART_HEIGHT + SHIP_CARD_ART_HEIGHT) * scale);
  const revealed = topCard?.face === 'up';

  return (
    <div
      ref={setNodeRef}
      data-zone="dilemmaStack"
      data-highlight={highlight}
      style={{ height, visibility: visible ? 'visible' : 'hidden', pointerEvents: visible ? 'auto' : 'none' }}
      className={`relative w-14 rounded-lg ${highlightClassName(highlight)}`}
    >
      {revealed && topCard ? (
        <DilemmaStackTopCard topCard={topCard} count={count} onOpen={onOpen} />
      ) : (
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Dilemma stack, ${count} card${count === 1 ? '' : 's'}, tap to open`}
          className="absolute inset-0 w-full h-full rounded-lg focus:outline-none"
        >
          {count > 0 ? (
            <img
              src="/cardimages/cardback.jpg"
              width={120}
              height={167}
              alt="Face-down dilemma stack"
              className="pointer-events-none rounded-lg shadow-lg w-full h-full object-cover"
            />
          ) : (
            <div className="pointer-events-none w-full h-full rounded-lg border-2 border-dashed border-white/20 flex items-center justify-center text-text-muted text-[10px] text-center leading-tight px-1">
              Dilemma stack
            </div>
          )}
        </button>
      )}
      <span className="absolute -top-1 -right-1 flex items-center gap-0.5 rounded-full bg-black/50 px-1 text-text-primary leading-none pointer-events-none" style={{ height: 14 }}>
        <DilemmaIcon />
        {count > 0 && <span className="text-[8px] font-bold">{count}</span>}
      </span>
      {count > 0 && !revealed && (
        <button
          type="button"
          onClick={onReveal}
          aria-label="Reveal top dilemma"
          className="absolute -bottom-1 -left-1 w-4 h-4 rounded-full bg-black/50 border border-white/50 flex items-center justify-center text-text-primary focus:outline-none"
        >
          <RevealIcon />
        </button>
      )}
    </div>
  );
}

function PracticeDrawContent() {
  const searchParams = useSearchParams();
  const isFixture = searchParams.get('fixture') === '1';
  const { data, loading } = useDataFetching();
  const [table, dispatch] = useReducer(tableReducer, initialTableState);
  const { pile, hand, discard, core, brig, dilemmaPile, dilemmaHand, dilemmaStack, missions, turn, score } = table;
  const [deckEmpty, setDeckEmpty] = useState(true);
  const [focusedCardId, setFocusedCardId] = useState<string | null>(null);
  const [isPortrait, setIsPortrait] = useState(false);
  // The game menu (#722): closed by default, so it never covers the table.
  const [gameMenuOpen, setGameMenuOpen] = useState(false);
  // Only one hand opens at a time (#604), so one value names the open hand rather than one
  // boolean per hand.
  const [openHand, setOpenHand] = useState<'hand' | 'dilemmaHand' | null>(null);
  const [draggingInstance, setDraggingInstance] = useState<CardInstance | null>(null);
  // The full set of cards this drag moves together (#677): normally just `draggingInstance`
  // itself, but the whole current selection, in the open panel's own order, when the touched
  // card is part of it. `draggingInstance` stays the single card the pointer actually touched —
  // used for the overlay's type context and the "hide the preview/panel during a drag" checks,
  // unchanged from before — while this array drives `handleDragEnd`'s per-card move dispatch and
  // the overlay's card count.
  const [draggingGroup, setDraggingGroup] = useState<CardInstance[]>([]);
  const [gameLayer, setGameLayer] = useState<HTMLDivElement | null>(null);
  // Issue #717: grows the mission cards, the ship cards, and every pile-panel card grid past
  // their base pixel size once the game layer (which already tracks the browser's toolbar
  // showing/hiding, `fixed inset-0`) measures more room than the baseline they were tuned
  // against. `tableCardWidth`/`tableCardArtHeight` feed every `PilePanel` below; `MissionRow`
  // derives its own ship-row sizes from the same `scale`.
  const scale = useTableScale(gameLayer);
  const tableCardWidth = Math.round(TABLE_CARD_WIDTH * scale);
  const tableCardArtHeight = Math.round(TABLE_CARD_ART_HEIGHT * scale);
  const [openPile, setOpenPile] = useState<{ missionIndex: number; pile: MissionPileName } | null>(null);
  // Which of the core's/the brig's own pile panel (#640), or the draw pile's/the dilemma pile's
  // own download panel (#690), is open, if any — only one at a time. Tracked the same way
  // `openPile` tracks a mission's open pile: a piece of UI state with no effect on the table.
  const [openFlatZone, setOpenFlatZone] = useState<'core' | 'brig' | 'pile' | 'dilemmaPile' | 'dilemmaStack' | null>(
    null
  );
  // Which ship's crew panel (#664) is open, if any, named by the ship's own instance id (not a
  // mission index, since a ship stays reachable by its own id regardless of which mission's ship
  // row currently holds it — the same reasoning `crewDropId` already follows). Tracked the same
  // way as `openPile`/`openFlatZone`: a piece of UI state with no effect on the table. Since
  // #678, a tap on a ship (`handleShipClick` below) opens this alongside the ship's own preview,
  // and the two close together, rather than the badge opening this on its own.
  const [openCrewShipId, setOpenCrewShipId] = useState<string | null>(null);
  // Which mission's ship-row list panel (#713) is open, if any, named by mission index the same
  // way `openPile` is — only one at a time, tracked the same way as the other three panels
  // below. Opened once a mission's ship row holds more ships than fit without overlap
  // (`MissionRow.tsx`'s `ShipRow`), so every ship on that row stays reachable for a tap and a
  // drag, not just the one on top.
  const [openShipRowMissionIndex, setOpenShipRowMissionIndex] = useState<number | null>(null);
  // The cards checked in the currently open pile panel (#677), by id. UI state, scoped to
  // whichever panel is open — only one panel is ever open at a time — and cleared whenever a
  // panel closes, the same as the panels themselves.
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const initDeck = () => {
    if (isFixture) {
      if (loading || data.length === 0) return;
      const deck = deckFromTsv(PRACTICE_DECK_TSV, data);
      const expanded = expandDeck(deck);
      dispatch({
        type: 'reset',
        cards: createCardInstances(shuffleArray(expanded)),
        missions: createCardInstances(extractMissions(deck), 'up'),
        dilemmas: createCardInstances(shuffleArray(extractDilemmas(deck))),
      });
      setDeckEmpty(isDeckEmpty(deck));
      setFocusedCardId(null);
      setOpenHand(null);
      return;
    }

    try {
      const raw = localStorage.getItem('currentDeck');
      if (!raw) return;
      const deck: Deck = JSON.parse(raw);
      const expanded = expandDeck(deck);
      dispatch({
        type: 'reset',
        cards: createCardInstances(shuffleArray(expanded)),
        missions: createCardInstances(extractMissions(deck), 'up'),
        dilemmas: createCardInstances(shuffleArray(extractDilemmas(deck))),
      });
      setDeckEmpty(isDeckEmpty(deck));
      setFocusedCardId(null);
      setOpenHand(null);
    } catch {
      // silently ignore parse errors
    }
  };

  useEffect(() => {
    initDeck();
  }, [data]);

  useEffect(() => {
    const mql = window.matchMedia('(orientation: portrait)');
    setIsPortrait(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsPortrait(e.matches);
    mql.addEventListener('change', handler);

    (screen.orientation as ScreenOrientationWithLock)?.lock?.('landscape')?.catch(() => {});

    return () => {
      mql.removeEventListener('change', handler);
      (screen.orientation as ScreenOrientationWithLock)?.unlock?.();
    };
  }, []);

  // The game menu's Reset item (#722): closes the menu, confirms since it throws away the
  // current game, and starts a new one the same way a fresh page load does.
  const handleResetClick = () => {
    setGameMenuOpen(false);
    if (window.confirm('Reset the game? This will throw away the current game.')) {
      initDeck();
    }
  };

  const drawOne = () => {
    dispatch({ type: 'draw', from: 'pile', to: 'hand' });
  };

  const drawDilemma = () => {
    dispatch({ type: 'draw', from: 'dilemmaPile', to: 'dilemmaHand' });
  };

  // Raises the turn counter by one and unstops every stopped personnel card on the table (#718).
  const nextTurn = () => {
    dispatch({ type: 'nextTurn' });
  };

  // Changes the score counter by SCORE_STEP points (#719), clamped by the reducer to the
  // 0-140 range.
  const adjustScore = (delta: number) => {
    dispatch({ type: 'adjustScore', delta });
  };

  const toggleCardSelection = (id: string) => {
    setSelectedCardIds((ids) => (ids.includes(id) ? ids.filter((cardId) => cardId !== id) : [...ids, id]));
  };

  // Sets `stopped` to one explicit value on every id in `ids` (#681's pile panel button; also
  // the preview's own single-card "Stop"/"Unstop" button, above). Keeps the selection afterward,
  // so the player can drag the same cards next, same as any other tap on the panel's checkboxes.
  const setStoppedForSelection = (ids: string[], stopped: boolean) => {
    dispatch({ type: 'setStopped', ids, stopped });
  };

  // A tap on a ship (#678): opens the ship's own preview, same as a tap on any other table card,
  // and — since a ship with no crew shows nothing new — opens its crew panel alongside the
  // preview only when it actually has crew aboard.
  const handleShipClick = (shipId: string) => {
    setFocusedCardId(shipId);
    const ship = findInstanceAnywhere(table, shipId)?.instance;
    if (ship?.crew && ship.crew.length > 0) {
      openOnlyCrewPanel(shipId);
    } else {
      setOpenCrewShipId(null);
    }
  };

  // #711: `openPile`, `openFlatZone`, `openCrewShipId`, and, since #713, `openShipRowMissionIndex`
  // each open a panel, but none of them used to clear the others, so tapping a second panel open
  // (e.g. a core/brig card while a mission's pile panel is still open) left two of these set at
  // once. `openPanelCards`, below, only reads one of them at a time — whichever this file checks
  // first — so the second panel rendered showed the first panel's cards until it was closed and
  // reopened. These four helpers are the only way any of the four states is ever set to a
  // non-null value, so routing every "open a panel" call through one of them, each clearing the
  // other three first, restores the invariant the comments elsewhere in this file already
  // claimed.
  const openOnlyMissionPile = (missionIndex: number, pile: MissionPileName) => {
    setOpenFlatZone(null);
    setOpenCrewShipId(null);
    setOpenShipRowMissionIndex(null);
    setSelectedCardIds([]);
    setOpenPile({ missionIndex, pile });
  };

  const openOnlyFlatZone = (zone: 'core' | 'brig' | 'pile' | 'dilemmaPile' | 'dilemmaStack') => {
    setOpenPile(null);
    setOpenCrewShipId(null);
    setOpenShipRowMissionIndex(null);
    setSelectedCardIds([]);
    setOpenFlatZone(zone);
  };

  const openOnlyCrewPanel = (shipId: string) => {
    setOpenPile(null);
    setOpenFlatZone(null);
    setOpenShipRowMissionIndex(null);
    setSelectedCardIds([]);
    setOpenCrewShipId(shipId);
  };

  const openOnlyShipRowPanel = (missionIndex: number) => {
    setOpenPile(null);
    setOpenFlatZone(null);
    setOpenCrewShipId(null);
    setSelectedCardIds([]);
    setOpenShipRowMissionIndex(missionIndex);
  };

  const handleDragStart = (event: DragStartEvent) => {
    // The enlarged card preview (#643) registers under its own draggable id, distinct from the
    // card's plain instance id, since the card's home draggable (in the hand, a ship row, or an
    // open pile panel) can be mounted, and registered with dnd-kit, at the same time. Normalizing
    // it back to the real card id here, before anything else runs, means nothing past this line
    // needs to know a prefix ever existed.
    const id = cardIdFromDraggableId(String(event.active.id));
    // A drag can start from the open hand or from a ship already on a mission's ship row
    // (#599); `findInstanceAnywhere` locates a card regardless of which one it is.
    const found = findInstanceAnywhere(table, id);
    if (!found) return;
    if (found.zone === 'hand' || found.zone === 'dilemmaHand') {
      // A drag from an open hand closes it at once; the DragOverlay carries the card under
      // the pointer for the rest of the drag, so the source card can stay put in the (now
      // closed) hand with no jump.
      setOpenHand(null);
    }
    setDraggingInstance(found.instance);

    // A drag of a card selected in the open pile panel, or in the open hand it started from
    // (#691), moves the whole selection together, in that zone's own display order (#677); a
    // drag of a card that is not selected moves only that one card, as before, even while the
    // zone holds an unrelated selection. Only one of these can ever apply to a given drag: a
    // drag starts either from an open hand or from an open panel, never both.
    const groupSource = found.zone === 'hand' ? hand : found.zone === 'dilemmaHand' ? dilemmaHand : openPanelCards;
    setDraggingGroup(
      groupSource && selectedCardIds.includes(id)
        ? groupSource.filter((c) => selectedCardIds.includes(c.id))
        : [found.instance]
    );
  };

  // Closes a pile panel after a drag ends, unless the drag started from a card inside that very
  // panel and the panel still holds a card after the drop (#675): the player can then drag the
  // next card out with no extra tap. A drag that did not start from a given panel still closes
  // it, the same as before this change — including a panel that merely happened to be open while
  // a drag started somewhere else entirely. `dragOrigin` is the dragged card's zone before the
  // drop (found while `table` still holds its pre-drop state, in `handleDragEnd`/
  // `handleDragCancel` below); `nextTable` is `table` after the drop's move applies (or `table`
  // itself, unchanged, for a drag that dispatched no move at all, including a cancelled drag).
  const closePanelsAfterDrag = (
    dragOrigin: { instance: CardInstance; zone: TableZone } | null,
    nextTable: TableState
  ) => {
    const zone = dragOrigin?.zone;
    // Tracks whether this call closes any panel, so the selection (#677), scoped to whichever
    // panel is open, clears along with it — the same "clear it when the panel closes" rule a
    // tap on the panel's own close button follows below, in the JSX.
    let closedAPanel = false;

    if (openPile) {
      const isDragOrigin =
        typeof zone === 'object' &&
        zone.zone === 'missionPile' &&
        zone.missionIndex === openPile.missionIndex &&
        zone.pile === openPile.pile;
      const stillHasCards = nextTable.missions[openPile.missionIndex][openPile.pile].length > 0;
      if (!isDragOrigin || !stillHasCards) {
        setOpenPile(null);
        closedAPanel = true;
      }
    }

    if (openFlatZone) {
      const isDragOrigin = zone === openFlatZone;
      const stillHasCards = nextTable[openFlatZone].length > 0;
      if (!isDragOrigin || !stillHasCards) {
        setOpenFlatZone(null);
        closedAPanel = true;
      }
    }

    if (openCrewShipId) {
      const isDragOrigin = typeof zone === 'object' && zone.zone === 'crew' && zone.shipId === openCrewShipId;
      const stillHasCards = !!findInstanceAnywhere(nextTable, openCrewShipId)?.instance.crew?.length;
      if (!isDragOrigin || !stillHasCards) {
        setOpenCrewShipId(null);
        closedAPanel = true;
      }
    }

    if (openShipRowMissionIndex !== null) {
      const isDragOrigin =
        typeof zone === 'object' && zone.zone === 'shipRow' && zone.missionIndex === openShipRowMissionIndex;
      const stillHasCards = nextTable.missions[openShipRowMissionIndex].ships.length > 0;
      if (!isDragOrigin || !stillHasCards) {
        setOpenShipRowMissionIndex(null);
        closedAPanel = true;
      }
    }

    // The open hand and the open dilemma hand (#740). Unlike the four panels above,
    // `handleDragStart` already closes whichever hand a drag starts from, before the drop, so
    // the `DragOverlay` can carry the card without the fan jumping underneath it — by the time
    // this function runs, `openHand` already reads `null` for that case. So the reopen check
    // below reads `zone` (the drag's pre-drop origin) rather than `openHand`, and reopens the
    // hand the drag came from if it still holds a card. A hand left open through a drag that
    // started elsewhere (e.g. an open pile panel, per the issue's acceptance check) still
    // closes, the same as the four panels above.
    if (zone === 'hand' || zone === 'dilemmaHand') {
      if (nextTable[zone].length > 0) {
        setOpenHand(zone);
      } else {
        closedAPanel = true;
      }
    } else if (openHand) {
      setOpenHand(null);
      closedAPanel = true;
    }

    if (closedAPanel) setSelectedCardIds([]);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    // See `handleDragStart`: normalized once, at the top, so every branch below already keys off
    // the real card id regardless of whether the drag came from the card's home draggable or its
    // enlarged preview (#643).
    const id = cardIdFromDraggableId(String(active.id));
    // The dragged card's zone before the drop, read while `table` still holds its pre-drop
    // state — used below both for the dilemma pile's from-hand routing and to decide, in
    // `closePanelsAfterDrag`, whether this drag started from an open panel (#675).
    const dragOrigin = findInstanceAnywhere(table, id);
    // The full group this drag moves (#677): `draggingGroup` if `handleDragStart` built one
    // (it always does, for any drag that found a card), falling back to just the touched card
    // for a drag that somehow never set it (defensive only; `dragOrigin` covers the same case
    // `handleDragStart`'s own `findInstanceAnywhere` lookup would).
    const group = draggingGroup.length > 0 ? draggingGroup : dragOrigin ? [dragOrigin.instance] : [];
    setDraggingInstance(null);
    setDraggingGroup([]);
    // Any drag closing clears the open preview (#602); an open pile panel (#602), including the
    // core's/the brig's own panel (#640) and a ship's crew panel (#664), closes too, unless the
    // drag started from a card inside it and it still holds a card after the drop (#675).
    setFocusedCardId(null);

    // A drop inside the dilemma stack's own popup, on top of another card still in the stack,
    // reorders the stack instead of moving the card out of its zone (#632). The dragged card's
    // origin has to be the stack itself, and the drop has to land on another card that is still
    // in the stack — only a drag that started from this same open popup can ever land on a stack
    // card's own id (`PilePanelCard`'s `reorderable` droppable), so this cannot misfire against
    // an unrelated drag. Returning here skips the "card left its panel" side effects a real
    // move-out triggers below (`closePanelsAfterDrag`, clearing `selectedCardIds`), since the
    // card never leaves the zone it was selected in.
    if (over && dragOrigin?.zone === 'dilemmaStack') {
      const overId = String(over.id);
      if (overId !== id && dilemmaStack.some((c) => c.id === overId)) {
        dispatch({ type: 'reorderDilemmaStack', id, overId });
        return;
      }
    }

    // A drop on the dilemma pile's or the draw pile's top half (#607, #743) puts the group first
    // in the pile, in front of its existing cards; the bottom half (the default, `position`
    // undefined) puts it last. This branch does not depend on a dragged card's type
    // (`computeMoveTargetForInstance`), so it resolves the same way for every card in the group.
    // Dispatching one `move` per card, in the group's own order, keeps that order in the
    // destination for the default, appending case: each dispatch adds its card after the ones
    // already there. A 'top' drop reverses the dispatch order instead, since a repeated prepend
    // would otherwise reverse the group (#677).
    const position = over
      ? dilemmaPileHalfFromDropId(String(over.id)) ?? drawPileHalfFromDropId(String(over.id)) ?? undefined
      : undefined;
    const orderedGroup = position === 'top' ? [...group].reverse() : group;

    // Each card in the group resolves its own target and, per #677's spec, a card the drop
    // target does not accept is simply left out here — it stays in its panel, same as a lone
    // card dropped somewhere it does not fit already did.
    const actions: Extract<TableAction, { type: 'move' }>[] = [];
    orderedGroup.forEach((instance) => {
      const target = computeMoveTargetForInstance(over, instance, table);
      if (target) actions.push({ type: 'move', id: instance.id, to: target, position });
    });

    // React applies queued `useReducer` dispatches through the reducer in the order they are
    // called, each built on the previous one's result, so dispatching every card's own action in
    // sequence here reaches the same end state `tableReducer`, replayed below, predicts.
    actions.forEach((action) => dispatch(action));

    // `tableReducer` is a pure function (#675): replaying the same actions here, on the side,
    // predicts the drop's outcome without waiting for the dispatches to reach the next render —
    // `closePanelsAfterDrag` needs that outcome now, to decide whether an open panel still holds
    // a card. A drag that dispatched no move (nothing was over a valid drop target, for every
    // card in the group) leaves `table` itself as the outcome: nothing moved, so nothing in any
    // panel changed either.
    const nextTable = actions.reduce((state, action) => tableReducer(state, action), table);

    // A card that actually moved is no longer in the panel it was selected in, so it drops out
    // of the selection (#677); a card the drop target did not accept stays selected, same as it
    // stays in the panel. `closePanelsAfterDrag`, below, may clear the selection entirely on top
    // of this, if the panel it belonged to closed.
    if (actions.length > 0) {
      const movedIds = new Set(actions.map((action) => action.id));
      setSelectedCardIds((ids) => ids.filter((cardId) => !movedIds.has(cardId)));
    }

    closePanelsAfterDrag(dragOrigin, nextTable);
  };

  // The browser can cancel a touch drag (a pointercancel or a resize). Clear the overlay then
  // too. No move ever dispatches for a cancelled drag, so `table` itself is already the outcome
  // `closePanelsAfterDrag` needs (#675): the panel the drag started from, if any, still holds
  // every card it held before the drag, so it stays open.
  const handleDragCancel = () => {
    const dragOrigin = draggingInstance ? findInstanceAnywhere(table, draggingInstance.id) : null;
    setDraggingInstance(null);
    setDraggingGroup([]);
    setFocusedCardId(null);
    closePanelsAfterDrag(dragOrigin, table);
  };

  const isEmpty = deckEmpty;
  // #742: the dilemma stack zone is only useful once one of these is true — it holds a card, its
  // own hand is open (so there's somewhere to drag a dilemma from), or a dilemma is being dragged
  // right now (so it's a valid drop target mid-drag, the same `draggingInstance` check the
  // dilemma pile's own top/bottom split already uses for `showPositionLabel`).
  const dilemmaStackVisible =
    dilemmaStack.length > 0 || openHand === 'dilemmaHand' || draggingInstance?.card.type === 'dilemma';
  const focused = focusedCardId ? findInstanceAnywhere(table, focusedCardId) : null;
  const openCrewShip = openCrewShipId ? findInstanceAnywhere(table, openCrewShipId)?.instance : null;
  // The cards of whichever pile panel is currently open, if any — only one panel is ever open
  // at a time. Used both to build a multi-select drag's group (`handleDragStart`) and to pass
  // the right card list to whichever `<PilePanel>` below is rendered.
  const openPanelCards: CardInstance[] | null = openPile
    ? missions[openPile.missionIndex][openPile.pile]
    : openFlatZone
    ? openFlatZone === 'core'
      ? core
      : openFlatZone === 'brig'
      ? brig
      : openFlatZone === 'pile'
      ? pile
      : openFlatZone === 'dilemmaPile'
      ? dilemmaPile
      : dilemmaStack
    : openCrewShip
    ? openCrewShip.crew ?? []
    : openShipRowMissionIndex !== null
    ? missions[openShipRowMissionIndex].ships
    : null;
  // A drag that started from a card inside the dilemma stack's own popup (#632's reorder) needs
  // that popup to stay on screen for the rest of the drag: the card the player is aiming at, a
  // neighbour still in the stack, is inside the popup too, so hiding it (the same
  // `hidden={draggingInstance !== null}` every other panel below still uses, `PilePanel`'s own
  // #598/#611 convention) leaves nothing for the player to aim at. `table` still holds the
  // dragged card in `dilemmaStack` for the whole drag — the reorder/move dispatch only runs at
  // the drop, in `handleDragEnd` — so re-deriving the drag's origin zone here, the same way
  // `dragOrigin` does inside `handleDragEnd` itself, reliably answers "did this drag start in the
  // stack popup" for as long as the drag runs, including one that ends by dropping the card
  // somewhere else entirely (the dilemma hand, a mission): that drop still moves the card, same
  // as before this popup started staying visible for it.
  const dragFromDilemmaStackPanel =
    draggingInstance !== null && findInstanceAnywhere(table, draggingInstance.id)?.zone === 'dilemmaStack';

  // Keeping the popup visible mid-drag (above) is not enough on its own: dnd-kit's collision
  // detection ranks droppables purely by their on-screen rects, oblivious to which element paints
  // on top, so a stack card's own reorder droppable can lose to a mission's `ship-row-<n>` zone
  // that happens to overlap it at a short viewport (#632's review, 568x320). Restricting the
  // candidate droppables by whether the pointer is inside the popup's own row fixes this without
  // touching every other drag on the table: inside the popup, only the stack cards' reorder
  // droppables can win, so a drop there always reorders; outside it, the stack cards are excluded
  // so a drop still reaches whatever zone is under the pointer, same as before this popup started
  // staying open (dnd-kit only reports a stack card as a candidate at all when the pointer is
  // already over its own rect, which only happens inside the popup, so this exclusion never hides
  // a legitimate target elsewhere on the table).
  const dilemmaStackPopupCollisionDetection: CollisionDetection = (args) => {
    if (!dragFromDilemmaStackPanel) return collisionDetection(args);
    const panelEl = document.querySelector('[data-zone="pile-panel-dilemmaStack"]');
    const panelRect = panelEl?.getBoundingClientRect();
    const pointer = args.pointerCoordinates;
    const insidePanel =
      !!panelRect &&
      !!pointer &&
      pointer.x >= panelRect.left &&
      pointer.x <= panelRect.right &&
      pointer.y >= panelRect.top &&
      pointer.y <= panelRect.bottom;
    const stackCardIds = new Set(dilemmaStack.map((c) => c.id));
    const droppableContainers = args.droppableContainers.filter((container) =>
      insidePanel ? stackCardIds.has(String(container.id)) : !stackCardIds.has(String(container.id))
    );
    return collisionDetection({ ...args, droppableContainers });
  };

  if (isPortrait) {
    return <RotateDeviceOverlay />;
  }

  return (
    <>
      {/* Scroll room only. Mobile Safari hides its toolbar when the document scrolls, and keeps it
          hidden only while the document is taller than the toolbar-hidden viewport (100lvh). */}
      <div aria-hidden="true" data-testid="practice-scroll-spacer" className="h-[calc(100lvh+120px)]" />

      {/* Game layer: fixed inset-0 always fills the visible area as the toolbar shows and hides */}
      <div ref={setGameLayer} data-testid="practice-game-layer" className="fixed inset-0 bg-gradient-page font-body text-text-primary flex flex-col">
        {/* The home for whole-game controls (#722), starting with Reset. Rendered outside the
            isEmpty/!isEmpty split below so it's there in both states. */}
        <GameMenu
          open={gameMenuOpen}
          onToggle={() => setGameMenuOpen((open) => !open)}
          onClose={() => setGameMenuOpen(false)}
          onReset={handleResetClick}
        />

        {isEmpty && (
          <div className="flex flex-col items-center justify-center flex-1 text-text-muted gap-2 p-8">
            <FaLayerGroup className="text-4xl" />
            <p className="text-lg">No draw cards in deck.</p>
            <p className="text-sm">Add cards to your draw pile in the deck builder, then come back here.</p>
            <Link href="/decks" className="mt-4 btn-icon">
              Go to Deck Builder
            </Link>
          </div>
        )}

        {!isEmpty && (
          <DndContext
            sensors={sensors}
            // A ship's own crew drop zone (`crew-<shipId>`) sits nested inside its ship row's
            // drop zone (`ship-row-<idx>`), which is larger, which itself sits inside its
            // mission column. dnd-kit's default collision detection (`rectIntersection`) ranks
            // the droppable with the greatest overlap ratio first, which is usually one of the
            // bigger enclosing zones, not the smaller one nested inside it — so a personnel or
            // equipment card dropped on a ship would file into the mission's personnel pile
            // instead of boarding (#645). `collisionDetection` re-ranks the same overlap set by
            // area instead, smallest first, so the most-nested zone the dragged card touches
            // always wins.
            collisionDetection={dilemmaStackPopupCollisionDetection}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            {/* The dragged card's type, shared with every drop zone so each one can show its own
                highlight during a drag (#608). `draggingInstance` already tracks it for the drag
                overlay below. */}
            <DraggedCardTypeProvider value={draggingInstance?.card.type ?? null}>
            <div className="flex flex-col flex-1 p-4">
              {/* Mission row: 5 positional slots dealt face up on a new game and on reset (#597),
                  plus the dilemma stack (#630) in its own reserved column to the right, in the
                  same row so it lines up with the missions and shares their gap. */}
              <div className="flex flex-row gap-2 justify-center items-start">
                <MissionRow
                  missions={missions}
                  onCardClick={(id) => setFocusedCardId(id)}
                  onOpenPile={(missionIndex, pile) => openOnlyMissionPile(missionIndex, pile)}
                  onShipClick={handleShipClick}
                  onOpenShipRow={(missionIndex) => openOnlyShipRowPanel(missionIndex)}
                  scale={scale}
                />
                <DilemmaStackPile
                  count={dilemmaStack.length}
                  topCard={dilemmaStack[0]}
                  onOpen={() => openOnlyFlatZone('dilemmaStack')}
                  onReveal={() => dispatch({ type: 'flip', id: dilemmaStack[0].id })}
                  visible={dilemmaStackVisible}
                  scale={scale}
                />
              </div>

              {/* Bottom row, anchored to the bottom. From left to right: discard pile, draw pile,
                  closed hand, core, brig. The dilemma pile is the rightmost zone, at the right
                  edge. The push-below-the-viewport offset (#130, #636) is gone entirely now
                  (#682): every zone here fits the table's own height, so `items-end` alone
                  aligns every zone's bottom edge to this row's own bottom edge, the same edge
                  core and the brig already used. */}
              <div className="mt-auto flex flex-row items-end gap-4">
                <div className="flex flex-row items-end gap-4">
                  {/* Discard */}
                  <DiscardPile topCard={discard[discard.length - 1]} count={discard.length} />

                  {/* Turn counter (#718): shows the current turn, and a button that raises it by
                      one and unstops every stopped personnel card on the table. */}
                  <div className="flex flex-col items-center gap-1">
                    <span data-testid="turn-counter" className="text-xs text-text-muted">
                      Turn {turn}
                    </span>
                    <button
                      className="btn-icon btn-icon-sm"
                      onClick={nextTurn}
                      aria-label="Next turn"
                    >
                      <FaForward />
                    </button>
                  </div>

                  {/* Score counter (#719): shows the current score, and plus/minus buttons that
                      change it by SCORE_STEP points, clamped by the reducer to 0-140. */}
                  <div className="flex flex-col items-center gap-1">
                    <span data-testid="score-counter" className="text-xs text-text-muted">
                      Score {score}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        className="btn-icon btn-icon-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={() => adjustScore(-SCORE_STEP)}
                        disabled={score <= SCORE_MIN}
                        aria-label="Decrease score"
                      >
                        -
                      </button>
                      <button
                        className="btn-icon btn-icon-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={() => adjustScore(SCORE_STEP)}
                        disabled={score >= SCORE_MAX}
                        aria-label="Increase score"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* Pile */}
                  <div className="flex items-start gap-4">
                    <div className="flex flex-col items-center gap-1">
                      <button
                        className="btn-icon btn-icon-sm"
                        onClick={() => dispatch({ type: 'shuffle', location: 'pile' })}
                        aria-label="Shuffle"
                      >
                        <ShuffleIcon />
                      </button>
                      <div className="flex items-end gap-1">
                        {/* Draw pile (#743): the same top/bottom drop-half split as the dilemma
                            pile, so a card dragged from any zone can be filed back in at either
                            end of the pile, not only drawn from the top. */}
                        <DrawPileButton
                          count={pile.length}
                          onDraw={drawOne}
                          showPositionLabel={draggingInstance !== null}
                        />
                        {/* Download from the draw pile without drawing (#690): a separate control,
                            beside the draw-pile button rather than layered on it, so it never
                            steals the button's own tap-to-draw click or its top/bottom drop
                            halves. */}
                        <DownloadPileButton label="draw pile" count={pile.length} onOpen={() => openOnlyFlatZone('pile')} />
                      </div>
                    </div>
                  </div>

                  {/* Hand. `selectedIds`/`onToggleSelect` let the player select more than one
                      card here and drag them together (#691), the same as a pile panel (#677);
                      closing the hand clears the selection. */}
                  <CardHand
                    instances={hand}
                    open={openHand === 'hand'}
                    onOpen={() => setOpenHand('hand')}
                    onClose={() => {
                      setOpenHand(null);
                      setSelectedCardIds([]);
                    }}
                    onCardClick={(id) => setFocusedCardId(id)}
                    dragging={draggingInstance !== null}
                    portalContainer={gameLayer}
                    passthroughZone={[
                      DRAW_PILE_TOP_DROPPABLE_ID,
                      DRAW_PILE_BOTTOM_DROPPABLE_ID,
                      DILEMMA_PILE_TOP_DROPPABLE_ID,
                      DILEMMA_PILE_BOTTOM_DROPPABLE_ID,
                    ]}
                    selectedIds={selectedCardIds}
                    onToggleSelect={toggleCardSelection}
                  />
                </div>

                {/* Core: any card, usually events (#603). A tap on a card opens the core's own
                    pile panel (#640) rather than that one card's preview directly. */}
                <FlatCardRow
                  zone="core"
                  label="Core"
                  cards={core}
                  maxWidth={CORE_ROW_MAX_WIDTH}
                  maxOffset={FLAT_ROW_MAX_OFFSET}
                  fixedWidth
                  onOpen={() => openOnlyFlatZone('core')}
                />

                {/* Brig: captured personnel, though the zone accepts any card type (#603). A tap
                    on a card opens the brig's own pile panel (#640) rather than that one card's
                    preview directly. */}
                <FlatCardRow
                  zone="brig"
                  label="Brig"
                  cards={brig}
                  maxWidth={BRIG_ROW_MAX_WIDTH}
                  maxOffset={FLAT_ROW_MAX_OFFSET}
                  onOpen={() => openOnlyFlatZone('brig')}
                />

                {/* The dilemma pile stays the rightmost zone, with the closed dilemma hand
                    immediately to its left, on the inside of the row (#604). The dilemma hand
                    renders even with no cards (#631), as a drop target for a dilemma dragged back
                    from the stack popup — `CardHand`'s closed row shows an empty placeholder in
                    that state, the same as the draw pile and the dilemma stack. */}
                <div className="ml-auto flex flex-row items-end gap-4">
                  <CardHand
                    instances={dilemmaHand}
                    open={openHand === 'dilemmaHand'}
                    onOpen={() => setOpenHand('dilemmaHand')}
                    onClose={() => {
                      setOpenHand(null);
                      setSelectedCardIds([]);
                    }}
                    onCardClick={(id) => setFocusedCardId(id)}
                    dragging={draggingInstance !== null}
                    portalContainer={gameLayer}
                    zone="dilemmaHand"
                    label="dilemma hand"
                    passthroughZone={[
                      DRAW_PILE_TOP_DROPPABLE_ID,
                      DRAW_PILE_BOTTOM_DROPPABLE_ID,
                      DILEMMA_PILE_TOP_DROPPABLE_ID,
                      DILEMMA_PILE_BOTTOM_DROPPABLE_ID,
                    ]}
                    selectedIds={selectedCardIds}
                    onToggleSelect={toggleCardSelection}
                  />

                  <div className="flex items-end gap-1">
                    <DilemmaPileButton
                      count={dilemmaPile.length}
                      onDraw={drawDilemma}
                      showPositionLabel={draggingInstance?.card.type === 'dilemma'}
                    />
                    {/* Download from the dilemma pile without drawing (#690): a separate control,
                        beside the dilemma-pile button rather than layered on it, so it never
                        steals the button's own tap-to-draw click or its top/bottom drop
                        halves. */}
                    <DownloadPileButton
                      label="dilemma pile"
                      count={dilemmaPile.length}
                      onOpen={() => openOnlyFlatZone('dilemmaPile')}
                    />
                  </div>
                </div>
              </div>

              {/* Enlarged card preview, anchored to the right edge at full screen height so its
                  position never shifts regardless of which card is previewed. A table card (a
                  mission, or a card in one of its piles, #602) gets a "Flip" button; a hand card
                  does not (#598). `hidden` visually closes the preview for the duration of any
                  drag. The enlarged card is itself draggable to another zone (#643) unless it
                  previews a mission — a mission card has no on-table draggable of its own either
                  (`MissionRow.tsx`). Since #678, closing this preview also closes an open crew
                  panel (they always open and close together, from a tap on a ship); when a crew
                  panel is open, `reserveLeft` shrinks this preview's own full-screen tap-to-close
                  area down to the screen's right half, so it does not sit on top of — and swallow
                  taps meant for — the crew panel's cards in the left half. */}
              {focused && (
                <CardPreview
                  instance={focused.instance}
                  onClose={() => {
                    setFocusedCardId(null);
                    setOpenCrewShipId(null);
                  }}
                  onFlip={
                    focused.zone === 'missions' ||
                    focused.zone === 'dilemmaStack' ||
                    (typeof focused.zone === 'object' && focused.zone.zone === 'missionPile')
                      ? () => dispatch({ type: 'flip', id: focused.instance.id })
                      : undefined
                  }
                  onStop={
                    focused.instance.card.type === 'personnel'
                      ? () =>
                          dispatch({
                            type: 'setStopped',
                            ids: [focused.instance.id],
                            stopped: !focused.instance.stopped,
                          })
                      : undefined
                  }
                  draggable={focused.zone !== 'missions'}
                  hidden={draggingInstance !== null}
                  reserveLeft={openCrewShipId !== null}
                />
              )}

              {/* A mission's personnel or event pile panel (#602), opened by tapping its badge.
                  `selectedIds`/`onToggleSelect` let the player select more than one card here and
                  drag them together (#677); closing the panel clears the selection. */}
              {openPile && (
                <PilePanel
                  zone={openPile.pile}
                  cards={openPanelCards ?? []}
                  onClose={() => {
                    setOpenPile(null);
                    setSelectedCardIds([]);
                  }}
                  onCardClick={(id) => setFocusedCardId(id)}
                  selectedIds={selectedCardIds}
                  onToggleSelect={toggleCardSelection}
                  onShuffle={() =>
                    dispatch({
                      type: 'shuffle',
                      location: { zone: 'missionPile', missionIndex: openPile.missionIndex, pile: openPile.pile },
                    })
                  }
                  onSetStopped={setStoppedForSelection}
                  hidden={draggingInstance !== null}
                  cardWidth={tableCardWidth}
                  cardArtHeight={tableCardArtHeight}
                />
              )}

              {/* The core's or the brig's own pile panel (#640), opened by tapping a card
                  already sitting in that zone; or the draw pile's/the dilemma pile's own download
                  panel (#690), opened by the new download control beside each one. */}
              {openFlatZone && (
                <PilePanel
                  zone={openFlatZone}
                  cards={openPanelCards ?? []}
                  onClose={() => {
                    setOpenFlatZone(null);
                    setSelectedCardIds([]);
                  }}
                  onCardClick={(id) => setFocusedCardId(id)}
                  selectedIds={selectedCardIds}
                  onToggleSelect={toggleCardSelection}
                  onShuffle={() => dispatch({ type: 'shuffle', location: openFlatZone })}
                  onSetStopped={setStoppedForSelection}
                  hidden={draggingInstance !== null && !dragFromDilemmaStackPanel}
                  cardWidth={tableCardWidth}
                  cardArtHeight={tableCardArtHeight}
                />
              )}

              {/* A ship's crew panel: opened by a tap on the ship itself, alongside its own
                  preview (`handleShipClick`, #678), so closing this panel closes that preview
                  too. */}
              {openCrewShip && (
                <PilePanel
                  zone="crew"
                  cards={openPanelCards ?? []}
                  onClose={() => {
                    setOpenCrewShipId(null);
                    setSelectedCardIds([]);
                    setFocusedCardId(null);
                  }}
                  onCardClick={(id) => setFocusedCardId(id)}
                  selectedIds={selectedCardIds}
                  onToggleSelect={toggleCardSelection}
                  onShuffle={() => dispatch({ type: 'shuffle', location: { zone: 'crew', shipId: openCrewShip.id } })}
                  onSetStopped={setStoppedForSelection}
                  hidden={draggingInstance !== null}
                  cardWidth={tableCardWidth}
                  cardArtHeight={tableCardArtHeight}
                />
              )}

              {/* A mission's ship-row list panel (#713): opened by a tap on any ship once that
                  row holds more ships than fit without overlap (`ShipRow`), listing every ship on
                  it individually. A tap on a ship here only opens that ship's own preview, the
                  same as a tap inside the core/brig/crew panels — it does not also open a crew
                  panel, since a second panel would break the one-panel-at-a-time invariant of
                  #711, and this panel itself stays open underneath the preview. */}
              {openShipRowMissionIndex !== null && (
                <PilePanel
                  zone="shipRow"
                  cards={openPanelCards ?? []}
                  onClose={() => {
                    setOpenShipRowMissionIndex(null);
                    setSelectedCardIds([]);
                  }}
                  onCardClick={(id) => setFocusedCardId(id)}
                  selectedIds={selectedCardIds}
                  onToggleSelect={toggleCardSelection}
                  onShuffle={() =>
                    dispatch({ type: 'shuffle', location: { zone: 'shipRow', missionIndex: openShipRowMissionIndex } })
                  }
                  onSetStopped={setStoppedForSelection}
                  hidden={draggingInstance !== null}
                  cardWidth={tableCardWidth}
                  cardArtHeight={tableCardArtHeight}
                />
              )}
            </div>
            </DraggedCardTypeProvider>

            <DragOverlay>
              {draggingInstance && (
                <div className="relative">
                  <img
                    src={`/cardimages/${draggingInstance.card.imagefile}.jpg`}
                    width={120}
                    height={167}
                    alt={draggingInstance.card.name}
                    className="rounded-lg shadow-md w-14 h-auto"
                  />
                  {/* Shows how many cards this drag carries (#677), for a multi-select drag. */}
                  {draggingGroup.length > 1 && <CountBadge count={draggingGroup.length} />}
                </div>
              )}
            </DragOverlay>
          </DndContext>
        )}
      </div>
    </>
  );
}

export default function PracticeDrawPage() {
  return (
    <Suspense>
      <PracticeDrawContent />
    </Suspense>
  );
}
