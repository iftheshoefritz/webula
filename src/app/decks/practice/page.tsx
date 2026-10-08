'use client';

import React, { Suspense, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  CollisionDetection,
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  useDraggable,
  useDroppable,
} from '@dnd-kit/core';
import { collisionDetection } from './collisionDetection';
import { FaLayerGroup, FaMobileAlt, FaForward } from 'react-icons/fa';
import {
  deckFromTsv,
  extractDrawDeck,
  extractDilemmas,
  extractMissions,
  isDeckEmpty,
  shuffleArray,
  withBackImageFiles,
} from '../deckBuilderUtils';
import { DeckList } from '../../../types';
import useDataFetching from '../../../hooks/useDataFetching';
import { PRACTICE_DECK_TSV } from '../../../lib/practiceDeck';
import { LAYER_MENU_BUTTON, LAYER_MENU_BUTTON_OPEN, LAYER_MENU_SPLASH } from '../../../lib/layers';
import { DrivePickerModal } from '../../../components/DrivePickerModal';
import { usePracticeDrive } from './usePracticeDrive';
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
  seedInstanceIds,
  tableReducer,
} from './tableReducer';
import { fromSavedGame, toSavedGame } from './savedGame';
import CardHand from './CardHand';
import MissionRow, {
  DilemmaIcon,
  SHIP_ROW_GAP,
  missionIndexFromDropId,
  missionColumnHeight,
  missionHalfFromDropId,
  shipIdFromCrewDropId,
  shipRowLineHeight,
  shipsPerRow,
  underMissionHeadroom,
} from './MissionRow';
import CardPreview from './CardPreview';
import DecklistPanel from './DecklistPanel';
import { CardHoldProvider, NO_CALLOUT_STYLE, PreviewSide, swallowClickOf, useCardHold } from './useCardHold';
import { useTableSensors } from './panelScrollSensor';
import CountBadge from './CountBadge';
import CardListPanel, { ShuffleIcon } from './CardListPanel';
import FlatCardRow, { targetIdFromOnDropId } from './FlatCardRow';
import { PILE_CARD_BORDER_STYLE, cardBorderStyle, SMALL_CARD_ART_HEIGHT, SMALL_CARD_WIDTH, TABLE_CARD_ART_HEIGHT } from './TableCard';
import {
  DILEMMA_STACK_CARD_WIDTH,
  DILEMMA_STACK_DESKTOP_WIDTH_FACTOR,
  DESKTOP_RESERVED_SHIP_ROWS,
  useDesktopTableScale,
  useShipRowCount,
  useTableScale,
} from './tableScale';
import { usePanelBottomInset } from './panelBottomInset';
import { viewerCardSize } from './viewerCardSize';
import { useFinePointer } from './useFinePointer';
import { offsetFor } from './overlapOffset';
import { DraggedCardTypeProvider, useDraggedCardType } from './DraggedCardTypeContext';
import { LANDED_CUE_MS, LandedRing, LandedZoneProvider, LandedZones, useLandedNonce } from './LandedZoneContext';
import { landedZoneKey } from './landedZoneKey';
import { highlightClassName, highlightState, ZoneKind } from './zoneAccepts';
import { isReleaseInCancelRadius, PressGeometry, pressGeometryFrom } from './releaseCancel';
import { cardIdOfDraggable } from './panelDragId';
import { createCenterOnPointerModifier } from './centerOnPointer';
import { useFullscreen } from './useFullscreen';

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

// The four corners of a frame: pointing out to go into fullscreen, pointing in to leave it (#921).
function FullscreenIcon({ exit }: { exit: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-4 h-4"
      aria-hidden="true"
    >
      {exit ? (
        <path d="M8 3v5H3M16 3v5h5M8 21v-5H3M16 21v-5h5" />
      ) : (
        <path d="M3 8V3h5M21 8V3h-5M3 16v5h5M21 16v5h-5" />
      )}
    </svg>
  );
}

// A home for the controls that act on the whole game rather than one zone (#722): Reset, and
// Load deck (#780), which opens the Drive picker. Reset throws away the current game, so it
// confirms first via `window.confirm`, the same confirm-before-destroy pattern
// `DrivePickerModal`'s own delete already uses elsewhere in the app, rather than a custom dialog
// built just for this one destructive action.
//
// The menu opens on every load of the table (#781), so a new player sees it. It is a splash
// screen over the whole page (#896): it covers the table, so a press on the table no longer
// closes it. Continue (or Escape) closes it and shows the table. The menu button stays above the
// splash, so the player can open the splash again during a game.
//
// The splash sits above everything the table draws: the pile count badges, the open hand and the
// card list panel. At `z-40` the badges drew over the splash and took presses through it. The menu
// button rises above the splash only while it is open, so a closed menu's button stays under a
// card list panel as before. `src/lib/layers.ts` holds the order of every layer (#897).
//
// The fullscreen button (#921) sits under the menu button, in the same corner, so it adds no width
// to the bottom row. It puts the game layer into fullscreen, so every overlay above, which portals
// into the game layer, still shows. It is hidden where the browser has no Fullscreen API for a
// `<div>`, such as iPhone Safari.
const SPLASH_ITEM_CLASS =
  'block w-full rounded-md border border-white/10 bg-bg-secondary px-6 py-2.5 text-center text-base text-text-secondary hover:bg-white/[0.1] hover:text-text-primary';

function GameMenu({
  open,
  onToggle,
  onClose,
  onReset,
  onLoadDeck,
  onDecklist,
  fullscreen,
}: {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onReset: () => void;
  onLoadDeck: () => void;
  onDecklist: () => void;
  fullscreen: ReturnType<typeof useFullscreen>;
}) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  return (
    <>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Game menu"
          data-testid="game-menu-splash"
          className={`fixed inset-0 ${LAYER_MENU_SPLASH} flex flex-col items-center justify-center bg-[#131713]/95 px-8`}
        >
          <div className="flex w-full max-w-[16rem] flex-col gap-2">
            <button type="button" onClick={onClose} className={SPLASH_ITEM_CLASS}>
              Continue
            </button>
            <button type="button" onClick={onDecklist} className={SPLASH_ITEM_CLASS}>
              Decklist
            </button>
            <button type="button" onClick={onReset} className={SPLASH_ITEM_CLASS}>
              Reset
            </button>
            <button type="button" onClick={onLoadDeck} className={SPLASH_ITEM_CLASS}>
              Load deck
            </button>
          </div>
        </div>
      )}
      <div
        className={`absolute top-2 left-2 flex flex-col gap-1 ${open ? LAYER_MENU_BUTTON_OPEN : LAYER_MENU_BUTTON}`}
      >
        <button type="button" onClick={onToggle} aria-label="Game menu" aria-expanded={open} className="btn-icon btn-icon-sm">
          <MenuIcon />
        </button>
        {fullscreen.enabled && (
          <button
            type="button"
            onClick={fullscreen.toggle}
            aria-label={fullscreen.isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            aria-pressed={fullscreen.isFullscreen}
            data-testid="fullscreen-button"
            className="btn-icon btn-icon-sm"
          >
            <FullscreenIcon exit={fullscreen.isFullscreen} />
          </button>
        )}
      </div>
    </>
  );
}

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
// single-droppable behaviour. Both ids follow the kebab-case pattern `missionHalfDropId`/
// `shipRowDropId` already use.
const DILEMMA_PILE_TOP_DROPPABLE_ID = 'dilemma-pile-top';
const DILEMMA_PILE_BOTTOM_DROPPABLE_ID = 'dilemma-pile-bottom';

// The draw deck's own two drop targets (#743), the same top/bottom split as the dilemma pile
// above: a drop on the top half puts the card first in `drawDeck` (drawn next), the bottom half
// puts it last. Unlike the dilemma pile, the draw deck accepts every card type, not only one.
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
    return 'drawDeck';
  }

  // A drop on a card in the core or the brig places the card on it (#810). A card dropped on its
  // own droppable, such as one the pointer barely moved, stays in the zone it sits in, the same
  // reorder a drop on that zone gives.
  const targetId = targetIdFromOnDropId(String(over.id));
  if (targetId) {
    if (targetId === instance.id) {
      const targetLocation = findInstanceAnywhere(table, targetId);
      return targetLocation && typeof targetLocation.zone === 'string' && targetLocation.zone !== 'missions'
        ? targetLocation.zone
        : null;
    }
    return { zone: 'on', targetId };
  }

  // A personnel or an equipment dropped on a ship boards its crew (#893): the rules have no place
  // "on a ship" for either. Any other card dropped on the ship is placed on it (#812), the same as
  // a drop on a card in the core or the brig (#810).
  const shipId = shipIdFromCrewDropId(String(over.id));
  if (shipId) {
    if (instance.card.type === 'ship') {
      // A ship dropped on a ship is neither crew nor placed on it (#668): the ship already on the
      // row covers almost the whole row, so a second ship's drop lands here instead of on the row
      // itself. Route it to that same ship's own row, the row the drop was clearly aimed at,
      // instead of leaving the dragged ship stuck where it started.
      const shipLocation = findInstanceAnywhere(table, shipId);
      if (shipLocation && typeof shipLocation.zone === 'object' && shipLocation.zone.zone === 'shipRow') {
        return { zone: 'shipRow', missionIndex: shipLocation.zone.missionIndex };
      }
      return null;
    }
    if (instance.card.type === 'personnel' || instance.card.type === 'equipment') {
      return { zone: 'crew', shipId };
    }
    return { zone: 'on', targetId: shipId };
  }

  const missionIndex = missionIndexFromDropId(String(over.id));
  if (missionIndex !== null) {
    if (instance.card.type === 'ship') {
      return { zone: 'shipRow', missionIndex };
    }
    // The ship row holds ships (#886), the same rule `ZONE_ACCEPTS` highlights: any other card
    // dropped on the bare row, off any ship, stays where it was.
    const half = missionHalfFromDropId(String(over.id));
    if (!half) return null;
    if (instance.card.type === 'dilemma') {
      // A dilemma dropped on the top half of a mission card is placed on it (#871). Dropped on the
      // bottom half, or on a slot with no mission card, it lands under that mission (#606, #733),
      // whatever zone it came from.
      const mission = table.missions[missionIndex]?.mission;
      if (half === 'on' && mission) {
        return { zone: 'on', targetId: mission.id };
      }
      return { zone: 'missionPile', missionIndex, pile: 'underMission' };
    }
    // A personnel or an equipment dropped on the mission card (#870) files into the mission's
    // away team.
    if (instance.card.type === 'personnel' || instance.card.type === 'equipment') {
      return { zone: 'missionPile', missionIndex, pile: 'awayTeam' };
    }
    // Any other card dropped on the mission is placed on the mission card (#813): the cards on it
    // are the events at that mission, so a slot has no event pile.
    const mission = table.missions[missionIndex]?.mission;
    if (mission) return { zone: 'on', targetId: mission.id };
  }

  return null;
}

// The core and the brig show their cards at the ship row's small size (`MissionRow.tsx`), and
// each one's row is bounded to a width that keeps the whole bottom row (discard pile, draw pile,
// closed hand, core, brig, dilemma placeholder) inside the 568 px acceptance-check viewport: the
// other four zones and their gaps take a little over 300 px, leaving roughly 250 px for the core
// and the brig combined. The player uses the core more than the brig (#666), so the core is
// bounded to fit 3 cards side by side with no overlap, and the brig stays bounded to fit 2
// overlapping cards. #928 spent the width #927 left spare: at 568x320 the page draws a 15 px
// scrollbar, and the row then had 7 px spare with an empty brig (56 px), or 5 px with a full one
// (58 px). The two bounds split those 5 px in proportion to their old widths, 106 to 58, so both
// keep a ratio of about 1.83 to 1 and the dilemma pile stays whole.
const CORE_ROW_MAX_WIDTH = 109; // px, fits 3 small cards side by side with no overlap
const BRIG_ROW_MAX_WIDTH = 60; // px, fits 2 overlapping small cards
const FLAT_ROW_MAX_OFFSET = SMALL_CARD_WIDTH + 2; // cards sit edge to edge with a small gap, matching the ship row

// The zones whose panel `openFlatLocation` tracks: the core and the brig (#640), the draw deck and the
// dilemma pile (#690), the dilemma stack (#733), and the discard pile (#782).
type FlatPanelLocation = 'core' | 'brig' | 'drawDeck' | 'dilemmaPile' | 'dilemmaStack' | 'discard';

// The two piles whose panel has a Download button (#827), each with the hand its cards go to.
// The same two piles are the ones the table's Shuffle buttons shuffle (`shufflePile`).
const DOWNLOAD_HAND = { drawDeck: 'hand', dilemmaPile: 'dilemmaHand' } as const;
type DownloadPile = keyof typeof DOWNLOAD_HAND;
// The deck each hand's "→ top" and "→ bottom" buttons send its selected cards to (#994).
const HAND_DECK = { hand: 'drawDeck', dilemmaHand: 'dilemmaPile' } as const;
const isDownloadPile = (location: FlatPanelLocation): location is DownloadPile => location in DOWNLOAD_HAND;

// The discard pile's top card, draggable off the pile (#606 review): a dilemma dragged from here
// onto a mission card lands under that mission, since its source is not the dilemma hand (see
// `handleDragEnd`'s dilemma routing below). A separate component, mounted only while a top card
// exists, keeps `useDraggable`'s hook call (and so its registration order, which the mock
// `@dnd-kit/core` in the test suite relies on) tied to the card's own presence, the same as
// `CardListPanelCard` and `CardHand`'s cards.
// A tap on it opens the discard pile's own panel (#782), which lists every card in the pile.
function DiscardPileCard({
  topCard,
  count,
  landedNonce,
  onOpen,
}: {
  topCard: CardInstance;
  count: number;
  landedNonce: number | null;
  onOpen: () => void;
}) {
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
      onClick={onOpen}
      {...attributes}
      {...listeners}
    >
      <img
        src={`/cardimages/${topCard.card.imagefile}.jpg`}
        width={120}
        height={167}
        alt="Discard pile"
        className="rounded-lg shadow-lg w-14 h-auto"
        style={PILE_CARD_BORDER_STYLE}
      />
      <CountBadge count={count} landedNonce={landedNonce} />
    </div>
  );
}

function DiscardPile({
  topCard,
  count,
  onOpen,
}: {
  topCard: CardInstance | undefined;
  count: number;
  onOpen: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: DISCARD_DROPPABLE_ID });
  const draggedType = useDraggedCardType();
  const highlight = highlightState('discard', draggedType, isOver);
  const landedNonce = useLandedNonce('discard');

  // A ring shows that the discard pile accepts the card under the pointer (`isOver`), or accepts
  // the dragged card's type generally (`valid`, #608).
  return (
    <div
      ref={setNodeRef}
      data-zone="discard"
      data-highlight={highlight}
      data-landed={landedNonce !== null || undefined}
      className={`relative flex flex-col items-center gap-1 rounded-lg ${highlightClassName(highlight)}`}
    >
      <LandedRing nonce={landedNonce} />
      {topCard ? (
        <DiscardPileCard topCard={topCard} count={count} landedNonce={landedNonce} onOpen={onOpen} />
      ) : (
        <div className="w-14 h-20 rounded-lg border-2 border-dashed border-white/20 flex items-center justify-center text-text-muted text-[10px] text-center leading-tight px-1">
          Discard
        </div>
      )}
    </div>
  );
}

// One half of a pile's two drop targets — the dilemma pile's (#607) or the draw deck's (#743):
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
// `CardListPanel.tsx`'s own `ShuffleIcon` documents.
// The glyph fills the same 2–22 box, centred on 12, as `ShuffleIcon`'s (#901): the two sit side
// by side above each pile, and a smaller, off-centre magnifier made the pair look unequal.
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
      <circle cx="10" cy="10" r="7" />
      <line x1="21" y1="21" x2="15" y2="15" />
    </svg>
  );
}

// A download trigger for the draw pile or the dilemma pile (#690): opens that pile's own
// `CardListPanel` so the player can look through every card in it — face up, in its existing order —
// and drag one straight into hand, or select several and press the panel's Download button (#827),
// without drawing through the rest of the pile. Kept apart from
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

// The face-down card art of the draw pile or the dilemma pile, animated when the pile's Shuffle
// button runs (#786): a shuffle changes nothing visible, so without it the player cannot tell
// the tap did anything. `shuffleCount` is the `key`, so each tap remounts the wrapper and
// restarts the animation rather than queueing one. The wrapper is absolutely positioned and
// animates only `transform` (or, under `prefers-reduced-motion`, a still ring), so the pile keeps
// its size and position, and `pointer-events-none` leaves every tap and drop to the `PileHalf`s.
function PileArt({ alt, shuffleCount }: { alt: string; shuffleCount: number }) {
  return (
    <div
      key={shuffleCount}
      data-testid="pile-art"
      data-shuffled={shuffleCount > 0 ? 'true' : undefined}
      className={`pointer-events-none absolute inset-0 rounded-lg ${
        shuffleCount > 0 ? 'motion-safe:animate-pile-shuffle motion-reduce:animate-pile-shuffle-ring' : ''
      }`}
    >
      <img
        src="/cardimages/cardback.jpg"
        width={120}
        height={167}
        alt={alt}
        className="rounded-lg shadow-lg group-hover:shadow-accent/30 transition-shadow w-full h-full object-cover"
        style={PILE_CARD_BORDER_STYLE}
      />
    </div>
  );
}

// A card of an away team is face down by default, so its preview shows no "Face down" badge (#964).
const isAwayTeamZone = (zone: TableZone): boolean =>
  typeof zone === 'object' && zone.zone === 'missionPile' && zone.pile === 'awayTeam';

// The top card of the draw pile or the dilemma pile, draggable off the pile art (#814), the same
// "mounted only while a top card exists" pattern `DiscardPileCard` above uses. The two `PileHalf`
// buttons cover the whole art, so this component wraps them rather than sitting under them: a
// press on either half bubbles up to the drag listeners here, while the half still gets its own
// tap (the `PointerSensor`'s 8 px activation constraint starts no drag for a tap) and its own drop
// (dnd-kit finds a droppable by its rect, not by a pointer event). The node takes no transform:
// the `DragOverlay` carries the pile's card back under the pointer instead (`showBack`), since
// the card is face down.
function PileTopCardDrag({ topCard, children }: { topCard: CardInstance; children: React.ReactNode }) {
  const { listeners, setNodeRef } = useDraggable({ id: topCard.id, data: { showBack: true } });

  return (
    <div ref={setNodeRef} data-card-id={topCard.id} className="absolute inset-0 touch-none" {...listeners}>
      {children}
    </div>
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
  topCard,
  onDraw,
  showPositionLabel,
  shuffleCount,
}: {
  count: number;
  topCard: CardInstance | undefined;
  onDraw: () => void;
  showPositionLabel: boolean;
  shuffleCount: number;
}) {
  const landedNonce = useLandedNonce('dilemmaPile');
  const halves = (
    <>
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
    </>
  );
  return (
    <div
      className={`relative w-14 h-20 rounded-lg group ${count === 0 ? 'opacity-50' : ''}`} data-testid="dilemma-pile"
      data-landed={landedNonce !== null || undefined}
    >
      <LandedRing nonce={landedNonce} />
      {count > 0 ? (
        <>
          <PileArt alt="Face-down dilemma pile" shuffleCount={shuffleCount} />
          <CountBadge count={count} landedNonce={landedNonce} />
        </>
      ) : (
        <div className="pointer-events-none w-full h-full rounded-lg border-2 border-dashed border-white/20 flex items-center justify-center text-text-muted text-[10px] text-center leading-tight px-1">
          Dilemma
        </div>
      )}

      {topCard ? <PileTopCardDrag topCard={topCard}>{halves}</PileTopCardDrag> : halves}
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
  topCard,
  onDraw,
  showPositionLabel,
  shuffleCount,
}: {
  count: number;
  topCard: CardInstance | undefined;
  onDraw: () => void;
  showPositionLabel: boolean;
  shuffleCount: number;
}) {
  const landedNonce = useLandedNonce('drawDeck');
  const halves = (
    <>
      <PileHalf
        dropId={DRAW_PILE_TOP_DROPPABLE_ID}
        label="Top"
        position="top"
        count={count}
        onDraw={onDraw}
        showLabel={showPositionLabel}
        zoneKind="drawDeck"
        pileName="Draw deck"
      />
      <PileHalf
        dropId={DRAW_PILE_BOTTOM_DROPPABLE_ID}
        label="Bottom"
        position="bottom"
        count={count}
        onDraw={onDraw}
        showLabel={showPositionLabel}
        zoneKind="drawDeck"
        pileName="Draw deck"
      />
    </>
  );
  return (
    <div
      className={`relative w-14 h-20 rounded-lg group ${count === 0 ? 'opacity-50' : ''}`}
      data-landed={landedNonce !== null || undefined}
    >
      <LandedRing nonce={landedNonce} />
      {count > 0 ? (
        <>
          <PileArt alt="Face-down draw deck" shuffleCount={shuffleCount} />
          <CountBadge count={count} landedNonce={landedNonce} />
        </>
      ) : (
        <div className="pointer-events-none w-full h-full rounded-lg border-2 border-dashed border-white/20 flex items-center justify-center text-text-muted text-xs">
          Empty
        </div>
      )}

      {topCard ? <PileTopCardDrag topCard={topCard}>{halves}</PileTopCardDrag> : halves}
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
// `onClick` alongside `useDraggable`'s own listeners `CardListPanelCard` (`CardListPanel.tsx`) already
// combines on one element — a plain tap still opens the full stack panel; a drag pulls just this
// one card out.
function DilemmaStackTopCard({
  topCard,
  count,
  onOpen,
  zIndex,
  cardWidth,
}: {
  topCard: CardInstance;
  count: number;
  onOpen: () => void;
  zIndex: number;
  cardWidth: number;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: topCard.id });
  // A revealed card previews like any other face-up card on the table: a mouse hover or a press
  // and hold (#989).
  const holdListeners = useCardHold(topCard.id, listeners);

  return (
    <button
      type="button"
      ref={setNodeRef}
      data-card-id={topCard.id}
      onClick={onOpen}
      aria-label={`Dilemma stack, ${count} card${count === 1 ? '' : 's'}, tap to open`}
      style={{
        ...NO_CALLOUT_STYLE,
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        opacity: isDragging ? 0.5 : 1,
        bottom: 0,
        zIndex,
      }}
      {...attributes}
      {...holdListeners}
      className="absolute left-0 rounded-lg focus:outline-none touch-none"
    >
      <img
        src={`/cardimages/${topCard.card.imagefile}.jpg`}
        width={120}
        height={167}
        alt={topCard.card.name}
        className="pointer-events-none rounded-lg shadow-lg h-auto"
        style={{ ...NO_CALLOUT_STYLE, ...cardBorderStyle(cardWidth), width: cardWidth }}
      />
    </button>
  );
}

// The dilemma stack (#630): a single flat drop target — no top/bottom split, since a drop always
// appends at the bottom, and the first dilemma dropped (index 0) is the first revealed. Sits in
// its own reserved column to the right of the mission row (`computeTableScale`,
// `tableScale.ts`); a tap opens its own `CardListPanel`, listing the stack in that same order. Its
// `DilemmaIcon` badge (`MissionRow.tsx`, exported for exactly this once #733 took the stack out
// of the mission slots) marks it apart from the flat dilemma pile, which looks the same otherwise
// (a face-down cardback with a count).
//
// #751: a separate "reveal" control, a small corner overlay sibling of the tap-to-open button —
// the same "a control sits beside the card, not nested inside its own button" convention
// `CardListPanelCard`'s selection checkbox (`CardListPanel.tsx`) already follows for a corner overlay
// specifically — turns the top card face up in place via the existing `flip` action, one card at
// a time; the card below stays face down until revealed in its own turn. Only shown while there
// is a face-down top card to reveal; once revealed, `DilemmaStackTopCard` above takes over the
// zone's own art and becomes the drag source, and the button hides since there's nothing left for
// it to do until the next card needs revealing. Do not confuse this with the whole-stack
// `CardListPanel` open above: that already shows every card in the stack face up, unconditionally,
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
//
// #752: drawn as a vertical fan of normal-sized cards rather than one card-back stretched over
// the whole zone. Each card keeps its own 120x167 art's true aspect ratio — the same fixed-width,
// `h-auto` treatment `DiscardPileCard` above already uses — instead of `object-cover` against a
// forced height. `dilemmaStack[0]`, the top of the physical stack, sits lowest in the zone and
// frontmost; each later index sits `offset` px higher and one layer further back, so the bottom
// of the physical stack sits highest — the reverse of `UnderMissionStack`'s own stacking order
// (`MissionRow.tsx`), which fans its last-added card lowest instead. `offsetFor` (`overlapOffset.ts`)
// bounds that offset so any number of cards still fits inside the zone's own (unscaled) height.
//
// #988: on a desktop (`useFinePointer`, #946) the zone and its cards are two times as wide, and
// the zone grows taller when the scale leaves it shorter than one of those wider cards. A phone or
// a tablet keeps the narrow zone.
// The two widths are set in `tableScale.ts`, whose desktop scale (#992) leaves room for the zone.

// The height of a desktop mission column with the ship rows `useDesktopTableScale` reserves (#992).
// Defined once at module level, so the hook's effect does not run again on every render.
const desktopMissionColumnHeight = (scale: number): number =>
  missionColumnHeight(scale, true, DESKTOP_RESERVED_SHIP_ROWS);
const dilemmaStackCardHeight = (cardWidth: number) => Math.round((cardWidth * 167) / 120); // px, the card's own aspect ratio
const DILEMMA_STACK_MAX_OFFSET = 24; // px, the largest gap between fanned cards

function DilemmaStackPile({
  stack,
  onOpen,
  onReveal,
  visible,
  scale,
  desktop,
}: {
  stack: CardInstance[];
  onOpen: () => void;
  onReveal: () => void;
  visible: boolean;
  scale: number;
  desktop: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: 'dilemmaStack' });
  const draggedType = useDraggedCardType();
  const highlight = highlightState('dilemmaStack', draggedType, isOver);
  const landedNonce = useLandedNonce('dilemmaStack');
  const cardWidth = DILEMMA_STACK_CARD_WIDTH * (desktop ? DILEMMA_STACK_DESKTOP_WIDTH_FACTOR : 1);
  const cardHeight = dilemmaStackCardHeight(cardWidth);
  const height = Math.max(Math.round((TABLE_CARD_ART_HEIGHT + SMALL_CARD_ART_HEIGHT) * scale), desktop ? cardHeight : 0);
  const count = stack.length;
  const topCard = stack[0];
  const revealed = topCard?.face === 'up';
  const offset = offsetFor(count, cardHeight, height, DILEMMA_STACK_MAX_OFFSET);

  return (
    <div
      ref={setNodeRef}
      data-zone="dilemmaStack"
      data-highlight={highlight}
      data-landed={landedNonce !== null || undefined}
      style={{ width: cardWidth, height, visibility: visible ? 'visible' : 'hidden', pointerEvents: visible ? 'auto' : 'none' }}
      className={`relative rounded-lg ${highlightClassName(highlight)}`}
    >
      <LandedRing nonce={landedNonce} />
      {/* Covers the whole box underneath the fan (below), so a tap anywhere the fan doesn't
          cover still opens the panel. Once the top card is revealed, `DilemmaStackTopCard`
          below carries the same label as the control the player actually sees and taps, so this
          one is hidden from the accessibility tree — it stays clickable for the fan's own
          non-interactive back-card area, just not separately announced. */}
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Dilemma stack, ${count} card${count === 1 ? '' : 's'}, tap to open`}
        aria-hidden={revealed || undefined}
        tabIndex={revealed ? -1 : undefined}
        className="absolute inset-0 w-full h-full rounded-lg focus:outline-none"
      >
        {count === 0 && (
          <div className="pointer-events-none w-full h-full rounded-lg border-2 border-dashed border-white/20 flex items-center justify-center text-text-muted text-[10px] text-center leading-tight px-1">
            Dilemma stack
          </div>
        )}
      </button>
      {stack.map((card, i) =>
        i === 0 && revealed ? (
          <DilemmaStackTopCard key={card.id} topCard={card} count={count} onOpen={onOpen} zIndex={count - i} cardWidth={cardWidth} />
        ) : (
          <img
            key={card.id}
            data-card-id={card.id}
            src="/cardimages/cardback.jpg"
            width={120}
            height={167}
            alt={i === 0 ? 'Face-down dilemma stack' : ''}
            className="pointer-events-none absolute left-0 rounded-lg shadow-lg h-auto"
            style={{ ...cardBorderStyle(cardWidth), width: cardWidth, bottom: i * offset, zIndex: count - i }}
          />
        )
      )}
      <span className="absolute -top-1 -right-1 flex items-center gap-0.5 rounded-full bg-black/50 px-1 text-text-primary leading-none pointer-events-none" style={{ height: 14, zIndex: count + 1 }}>
        <DilemmaIcon />
        {count > 0 && <span className="text-[8px] font-bold">{count}</span>}
      </span>
      {count > 0 && !revealed && (
        <button
          type="button"
          onClick={onReveal}
          aria-label="Reveal top dilemma"
          className="absolute -bottom-1 -left-1 w-4 h-4 rounded-full bg-black/50 border border-white/50 flex items-center justify-center text-text-primary focus:outline-none"
          style={{ zIndex: count + 1 }}
        >
          <RevealIcon />
        </button>
      )}
    </div>
  );
}

// The localStorage key of the saved practice game (#976). A fixture route keeps its game under
// its own key, so a fixture visit never overwrites the player's game.
const PRACTICE_GAME_KEY = 'practiceGame';
const practiceGameKey = (fixture: string | null) => (fixture ? `${PRACTICE_GAME_KEY}:fixture=${fixture}` : PRACTICE_GAME_KEY);

function PracticeDrawContent() {
  const searchParams = useSearchParams();
  const fixture = searchParams.get('fixture');
  // `?fixture=piles` (#802) deals the same fixture deck as `?fixture=1`, then places a big
  // away team and a crewed ship, for the card list panel checks.
  const isPilesFixture = fixture === 'piles';
  const isFixture = fixture === '1' || isPilesFixture;
  const gameKey = practiceGameKey(isFixture ? fixture : null);
  // `?reset=1` deals a new game instead of the saved one, and the new game replaces the save.
  // Browser checks use it with `?fixture=1` to start from the same table every time.
  const isReset = searchParams.get('reset') === '1';
  const { data, loading } = useDataFetching();
  const [table, dispatch] = useReducer(tableReducer, initialTableState);
  const { drawDeck, hand, discard, core, brig, dilemmaPile, dilemmaHand, dilemmaStack, missions, turn, score } = table;
  const [deckEmpty, setDeckEmpty] = useState(true);
  // The card a press and hold shows in the preview, while the pointer stays down. The preview
  // exists only for a hold: a tap never opens it. A hold never touches `openCrewShipId`: a hold
  // on a ship does not open its crew panel, and a hold on a crew card leaves that panel open.
  const [heldCardId, setHeldCardId] = useState<string | null>(null);
  // The card a mouse rests on (#766), after `HOVER_DELAY_MS`. Kept apart from `heldCardId`, so
  // the release of a mouse hold on a hovered card leaves the preview up until the pointer leaves.
  // The preview shows the held card first, and the hovered card otherwise.
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
  // The edge each preview takes, away from the press or hover point (#879).
  const [heldSide, setHeldSide] = useState<PreviewSide>('right');
  const [hoveredSide, setHoveredSide] = useState<PreviewSide>('right');
  // Read by `startHover`, which is memoized: a hover never starts during a drag.
  const draggingRef = useRef(false);
  // The press point and the pressed card's rectangle, recorded at drag start (#774). Read only by
  // `handleDragEnd`, so a ref: it must not cause a render.
  const pressRef = useRef<PressGeometry | null>(null);
  // The last place the pointer was seen, for the check that a hovered card is still under it.
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      pointerRef.current = { x: event.clientX, y: event.clientY };
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, []);
  const cardHold = useMemo(
    () => ({
      startHold: (id: string, side: PreviewSide) => {
        setHeldCardId(id);
        setHeldSide(side);
      },
      endHold: () => setHeldCardId(null),
      startHover: (id: string, side: PreviewSide) => {
        if (draggingRef.current) return;
        setHoveredCardId(id);
        setHoveredSide(side);
      },
      endHover: (id: string) => setHoveredCardId((current) => (current === id ? null : current)),
    }),
    []
  );
  const [isPortrait, setIsPortrait] = useState(false);
  // The game menu (#722): open on every load (#781), so a new player finds the game controls.
  // Nothing is stored; the first press outside the menu closes it. `menu=0` in the URL starts
  // it closed (#1028), so a browser check's first drag is not covered by the splash. It is read
  // in the initial state, not in an effect, so the splash never shows for one frame.
  const [gameMenuOpen, setGameMenuOpen] = useState(() => searchParams.get('menu') !== '0');
  // Only one hand opens at a time (#604), so one value names the open hand rather than one
  // boolean per hand.
  const [openHand, setOpenHand] = useState<'hand' | 'dilemmaHand' | null>(null);
  // How many times each pile's Shuffle button has run, the `key` that restarts its animation (#786).
  const [shuffleCounts, setShuffleCounts] = useState({ drawDeck: 0, dilemmaPile: 0 });
  const shufflePile = (location: DownloadPile) => {
    dispatch({ type: 'shuffle', location });
    setShuffleCounts((counts) => ({ ...counts, [location]: counts[location] + 1 }));
  };
  const [draggingInstance, setDraggingInstance] = useState<CardInstance | null>(null);
  // Whether the `DragOverlay` shows the card back rather than the card (#814).
  const [draggingShowsBack, setDraggingShowsBack] = useState(false);
  // The full set of cards this drag moves together (#677): normally just `draggingInstance`
  // itself, but the whole current selection, in the open panel's own order, when the touched
  // card is part of it. `draggingInstance` stays the single card the pointer actually touched —
  // used for the overlay's type context and the "hide the preview/panel during a drag" checks,
  // unchanged from before — while this array drives `handleDragEnd`'s per-card move dispatch and
  // the overlay's card count.
  const [draggingGroup, setDraggingGroup] = useState<CardInstance[]>([]);
  // The zones the last drop moved a card into (#778), each of which plays the landed cue until a
  // timer clears them. A newer drop replaces them at once, with a new nonce to restart the cue.
  const [landedZones, setLandedZones] = useState<LandedZones | null>(null);
  const landedNonceRef = useRef(0);
  const landedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [gameLayer, setGameLayer] = useState<HTMLDivElement | null>(null);
  // Issue #717: grows the mission cards, the ship cards, and every card-list-panel card grid past
  // their base pixel size once the game layer (which already tracks the browser's toolbar
  // showing/hiding, `fixed inset-0`) measures more room than the baseline they were tuned
  // against. `viewerCardWidth`/`viewerCardHeight` feed every `CardListPanel` and `CardHand` below; `MissionRow`
  // derives its own ship-row sizes from the same `scale`.
  const scale = useTableScale(gameLayer);
  const fullscreen = useFullscreen(gameLayer);
  // Every viewer (a card list panel, the open fan) draws its card at 1.5x the table card (#802),
  // up to a fixed width on a desktop (#946).
  const finePointer = useFinePointer();
  const { width: viewerCardWidth, height: viewerCardHeight } = viewerCardSize(scale, finePointer);
  // Issue #828: every card list panel anchors its bottom just above the bottom row.
  const [bottomRow, setBottomRow] = useState<HTMLDivElement | null>(null);
  const panelBottom = usePanelBottomInset(gameLayer, bottomRow);
  // Issue #930: the ship rows take a second and a third row of ships when the gap between the
  // mission rows and the bottom row has room for them.
  const [missionRows, setMissionRows] = useState<HTMLDivElement | null>(null);
  // Issue #992: on a desktop the missions and the ships show the whole card, and grow into a large
  // gap above the bottom row. A phone or a tablet keeps the art crop at the table scale.
  const missionScale = useDesktopTableScale(
    finePointer,
    scale,
    gameLayer,
    missionRows,
    bottomRow,
    desktopMissionColumnHeight,
  );
  const shipRows = useShipRowCount(
    missionRows,
    bottomRow,
    shipRowLineHeight(missionScale, finePointer),
    SHIP_ROW_GAP,
    Math.max(0, ...missions.map((slot) => slot.ships.length)),
    shipsPerRow(missionScale),
  );
  const [openPile, setOpenPile] = useState<{ missionIndex: number; pile: MissionPileName } | null>(null);
  // Which of the core's/the brig's own card list panel (#640), or the draw pile's/the dilemma pile's
  // own download panel (#690), is open, if any — only one at a time. Tracked the same way
  // `openPile` tracks a mission's open pile: a piece of UI state with no effect on the table.
  const [openFlatLocation, setOpenFlatLocation] = useState<FlatPanelLocation | null>(null);
  // Which ship's crew panel (#664) is open, if any, named by the ship's own instance id (not a
  // mission index, since a ship stays reachable by its own id regardless of which mission's ship
  // row currently holds it — the same reasoning `crewDropId` already follows). Tracked the same
  // way as `openPile`/`openFlatLocation`: a piece of UI state with no effect on the table. A tap on a
  // ship (`handleShipClick` below) opens it.
  const [openCrewShipId, setOpenCrewShipId] = useState<string | null>(null);
  // Whose panel of placed cards (#810) is open, if any, named by that card's own instance id, the same way
  // `openCrewShipId` names a ship. A tap on a card in the core or the brig with cards on it opens it.
  const [openPlacedOnTargetId, setOpenPlacedOnTargetId] = useState<string | null>(null);
  // Which mission's ship-row list panel (#713) is open, if any, named by mission index the same
  // way `openPile` is — only one at a time, tracked the same way as the other three panels
  // below. Opened once a mission's ship row holds more ships than fit without overlap
  // (`MissionRow.tsx`'s `ShipRow`), so every ship on that row stays reachable for a tap and a
  // drag, not just the one on top.
  const [openShipRowMissionIndex, setOpenShipRowMissionIndex] = useState<number | null>(null);
  // The cards checked in the currently open card list panel (#677), by id. UI state, scoped to
  // whichever panel is open — only one panel is ever open at a time — and cleared whenever a
  // panel closes, the same as the panels themselves.
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);

  // A touch or pen press in a scrolling card list panel splits a scroll from a drag (#788); every
  // other press drags as before. `panelScrollSensor.ts` explains why it is one sensor.
  const sensors = useTableSensors();
  // Keeps the centre of the drag overlay under the pointer, whatever the size of the source card (#955).
  const overlayModifiers = useMemo(() => [createCenterOnPointerModifier()], []);

  // A deck loaded from Drive (#780). Once set, Reset deals it again instead of the builder's
  // currentDeck. It is kept in page state only: localStorage.currentDeck is the deck builder's
  // working copy and may hold unsaved edits.
  const [loadedDeck, setLoadedDeck] = useState<DeckList | null>(null);
  // The deck as it was dealt (#779), for the game menu's read-only Decklist panel. Every deal
  // goes through `dealDeck`, so this holds the fixture deck, the builder's deck, or a deck loaded
  // from Drive, whichever the table plays now.
  const [dealtDeck, setDealtDeck] = useState<DeckList>({});
  // The Drive file of `loadedDeck`, kept in the save (#976).
  const [driveFileId, setDriveFileId] = useState<string | undefined>(undefined);
  // Set by the first deal or restore (#976). Until then `table` is the empty
  // `initialTableState`, which must not overwrite a valid save.
  const saveReadyRef = useRef(false);
  // Set once a saved game is restored, so the later `data` load does not deal over it.
  const restoredRef = useRef(false);
  const [decklistOpen, setDecklistOpen] = useState(false);
  const drive = usePracticeDrive();

  // Deals a new game from a deck. The fixture, currentDeck, and Drive loads all go through here.
  // The `?fixture=piles` deal (#802) keeps the deck order, so it places the same cards every time.
  // The fixture deck holds 27 personnel, fewer than the 20 + 12 that deal places, so it deals a second
  // copy of the deck's personnel too, each copy its own instance.
  const dealDeck = (deck: DeckList, fixturePiles = false) => {
    const cards = extractDrawDeck(deck);
    dispatch({
      type: fixturePiles ? 'resetWithPiles' : 'reset',
      cards: createCardInstances(
        fixturePiles ? [...cards, ...cards.filter((c: any) => c.type === 'personnel')] : shuffleArray(cards)
      ),
      // A deck saved before #765 has no `backimagefile` on its missions, so it comes from `data`.
      missions: createCardInstances(withBackImageFiles(extractMissions(deck), data), 'up'),
      dilemmas: createCardInstances(shuffleArray(extractDilemmas(deck))),
    });
    setDeckEmpty(isDeckEmpty(deck));
    setDealtDeck(deck);
    setOpenHand(null);
    saveReadyRef.current = true;
  };

  // Restores the game saved under `gameKey` (#976). Returns false when there is none, or
  // when `fromSavedGame` drops it, for example after an edit of the deck in the deck builder.
  // A fixture save is compared with the fixture deck, so it needs `data`.
  const restoreSavedGame = (): boolean => {
    try {
      if (isFixture && (loading || data.length === 0)) return false;
      const raw = localStorage.getItem(gameKey);
      if (!raw) return false;
      let currentDeck: DeckList;
      if (isFixture) {
        currentDeck = deckFromTsv(PRACTICE_DECK_TSV, data);
      } else {
        const currentRaw = localStorage.getItem('currentDeck');
        currentDeck = currentRaw ? JSON.parse(currentRaw) : {};
      }
      const restored = fromSavedGame(raw, currentDeck);
      if (!restored) return false;
      seedInstanceIds(restored.maxInstanceId);
      dispatch({ type: 'restore', state: restored.table });
      setDealtDeck(restored.dealtDeck);
      setDeckEmpty(isDeckEmpty(restored.dealtDeck));
      if (restored.source === 'drive') {
        setLoadedDeck(restored.dealtDeck);
        setDriveFileId(restored.driveFileId);
      }
      saveReadyRef.current = true;
      return true;
    } catch {
      return false;
    }
  };

  const initDeck = () => {
    if (loadedDeck) {
      dealDeck(loadedDeck);
      return;
    }

    if (isFixture) {
      if (loading || data.length === 0) return;
      dealDeck(deckFromTsv(PRACTICE_DECK_TSV, data), isPilesFixture);
      return;
    }

    try {
      const raw = localStorage.getItem('currentDeck');
      if (!raw) return;
      const deck: DeckList = JSON.parse(raw);
      dealDeck(deck);
    } catch {
      // silently ignore parse errors
    }
  };

  // The first run restores the saved game when there is one (#976), and a restored game is never
  // dealt over by the later run that `data` starts. A fixture route restores only once `data` is
  // there. `?reset=1` skips the restore.
  useEffect(() => {
    if (restoredRef.current) return;
    if (!isReset && !saveReadyRef.current && restoreSavedGame()) {
      restoredRef.current = true;
      return;
    }
    initDeck();
  }, [data]);

  // Writes the game after every change of the table (#976). A failed write (quota, private
  // browsing) is ignored, so play goes on. The first deal or restore sets `saveReadyRef` in the
  // same commit as its dispatch, so this effect still sees the empty `initialTableState` there,
  // and that table must not overwrite the save (#1005). The write waits for the next render.
  useEffect(() => {
    if (!saveReadyRef.current || table === initialTableState) return;
    try {
      const save = toSavedGame(table, dealtDeck, loadedDeck ? 'drive' : 'builder', loadedDeck ? driveFileId : undefined);
      localStorage.setItem(gameKey, JSON.stringify(save));
    } catch {
      // keep playing without a save
    }
  }, [table, dealtDeck, loadedDeck, driveFileId, gameKey]);

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

  // The game menu's Decklist item (#779): closes the menu and opens the read-only deck list.
  const handleDecklistClick = () => {
    setGameMenuOpen(false);
    setDecklistOpen(true);
  };

  // A Google sign-in that started from Load deck comes back with `?openPicker=true` (#980). The
  // table opens the picker, and drops the parameter so a reload does not open it again.
  useEffect(() => {
    if (searchParams.get('openPicker') !== 'true') return;
    const url = new URL(window.location.href);
    url.searchParams.delete('openPicker');
    window.history.replaceState({}, '', url.pathname + url.search);
    drive.openPicker();
  }, []);

  // The game menu's Load deck item (#780): closes the menu and opens the Drive picker.
  const handleLoadDeckClick = () => {
    setGameMenuOpen(false);
    drive.openPicker();
  };

  // The picker's choice of deck. Confirms first, since a load throws away the current game. The
  // pile choice of the picker is ignored: a practice game always deals the full deck.
  const loadDriveDeck = async (file: { id: string }) => {
    if (!window.confirm('Load this deck? This will throw away the current game.')) return;
    const tsv = await drive.fetchDeckTsv(file);
    if (tsv === null) return;
    const deck = deckFromTsv(tsv, data);
    setLoadedDeck(deck);
    setDriveFileId(file.id);
    dealDeck(deck);
    drive.closePicker();
  };

  const drawOne = () => {
    dispatch({ type: 'drawCard', from: 'drawDeck', to: 'hand' });
  };

  const drawDilemma = () => {
    dispatch({ type: 'drawCard', from: 'dilemmaPile', to: 'dilemmaHand' });
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

  // Sets `stopped` to one explicit value on every id in `ids` (#681's card list panel button). Keeps the selection afterward,
  // so the player can drag the same cards next, same as any other tap on the panel's checkboxes.
  const setStoppedForSelection = (ids: string[], stopped: boolean) => {
    dispatch({ type: 'setStopped', ids, stopped });
  };

  // Turns each id over on its own (#762's card list panel Flip button): one `flip` per card, so a
  // mixed selection stays mixed, inverted. Keeps the selection afterward, as with Stop.
  const flipSelection = (ids: string[]) => {
    ids.forEach((id) => dispatch({ type: 'flip', id }));
  };

  // Moves every id to the discard pile, in the given order (#787's card list panel Discard button), with
  // the same `move` action a drop on the discard pile dispatches, so each card takes the discard
  // pile's face. The panel stays open, or closes when its zone runs empty, by the same rule a drag
  // out of it follows (`closePanelsAfterDrag`). The selection clears either way.
  const discardSelection = (ids: string[]) => {
    const origin = ids.length > 0 ? findInstanceAnywhere(table, ids[0]) : null;
    const actions: TableAction[] = ids.map((id) => ({ type: 'move', id, to: 'discard' }));
    actions.forEach((action) => dispatch(action));
    const nextTable = actions.reduce((state, action) => tableReducer(state, action), table);
    closePanelsAfterDrag(origin, nextTable);
    setSelectedCardIds([]);
  };

  // Moves every id from a pile into its matching hand, in the given order (#827's card list panel
  // Download button), then closes the panel, clears the selection, and shuffles the pile. The
  // moves dispatch before the shuffle, so the shuffle covers only the cards left in the pile.
  // `openHand` is not touched: the hand stays open or closed, and its badge count rises.
  const downloadSelection = (pile: DownloadPile, ids: string[]) => {
    ids.forEach((id) => dispatch({ type: 'move', id, to: DOWNLOAD_HAND[pile] }));
    setOpenFlatLocation(null);
    setSelectedCardIds([]);
    shufflePile(pile);
  };

  // Sends the selected cards of an open hand to the top or the bottom of its deck (#994), with the
  // same `move` a drop on a half of that deck dispatches: the draw deck for the hand, the dilemma
  // pile for the dilemma hand. The cards keep the order of the hand, so a 'top' send dispatches
  // them in reverse, as a 'top' drop does (#677). The hand closes once it runs empty, and the
  // selection clears either way.
  const sendHandSelectionToDeck = (hand: 'hand' | 'dilemmaHand', position: 'top' | 'bottom') => {
    const deck = HAND_DECK[hand];
    const ids = table[hand].filter((c) => selectedCardIds.includes(c.id)).map((c) => c.id);
    const ordered = position === 'top' ? [...ids].reverse() : ids;
    const actions: Extract<TableAction, { type: 'move' }>[] = ordered.map((id) => ({ type: 'move', id, to: deck, position }));
    actions.forEach((action) => dispatch(action));
    markLanded(actions);
    if (table[hand].length === ids.length) setOpenHand(null);
    setSelectedCardIds([]);
  };

  // A tap on a ship opens its crew panel, which shows the ship in its own section above the
  // crew (#832). A ship with no crew opens the panel too, with an empty crew area.
  const handleShipClick = (shipId: string) => {
    if (findInstanceAnywhere(table, shipId)) {
      openOnlyCrewPanel(shipId);
    } else {
      setOpenCrewShipId(null);
    }
  };

  // #711: `openPile`, `openFlatLocation`, `openCrewShipId`, and, since #713, `openShipRowMissionIndex`
  // each open a panel, but none of them used to clear the others, so tapping a second panel open
  // (e.g. a core/brig card while a mission's card list panel is still open) left two of these set at
  // once. `openPanelCards`, below, only reads one of them at a time — whichever this file checks
  // first — so the second panel rendered showed the first panel's cards until it was closed and
  // reopened. These four helpers are the only way any of the four states is ever set to a
  // non-null value, so routing every "open a panel" call through one of them, each clearing the
  // other three first, restores the invariant the comments elsewhere in this file already
  // claimed.
  const openOnlyMissionPile = (missionIndex: number, pile: MissionPileName) => {
    setOpenFlatLocation(null);
    setOpenCrewShipId(null);
    setOpenShipRowMissionIndex(null);
    setOpenPlacedOnTargetId(null);
    setSelectedCardIds([]);
    setOpenPile({ missionIndex, pile });
  };

  const openOnlyFlatZone = (zone: FlatPanelLocation) => {
    setOpenPile(null);
    setOpenCrewShipId(null);
    setOpenShipRowMissionIndex(null);
    setOpenPlacedOnTargetId(null);
    setSelectedCardIds([]);
    setOpenFlatLocation(zone);
  };

  const openOnlyCrewPanel = (shipId: string) => {
    setOpenPile(null);
    setOpenFlatLocation(null);
    setOpenShipRowMissionIndex(null);
    setOpenPlacedOnTargetId(null);
    setSelectedCardIds([]);
    setOpenCrewShipId(shipId);
  };

  const openOnlyShipRowPanel = (missionIndex: number) => {
    setOpenPile(null);
    setOpenFlatLocation(null);
    setOpenCrewShipId(null);
    setOpenPlacedOnTargetId(null);
    setSelectedCardIds([]);
    setOpenShipRowMissionIndex(missionIndex);
  };

  const openOnlyPlacedOnPanel = (targetId: string) => {
    setOpenPile(null);
    setOpenFlatLocation(null);
    setOpenCrewShipId(null);
    setOpenShipRowMissionIndex(null);
    setSelectedCardIds([]);
    setOpenPlacedOnTargetId(targetId);
  };

  // A drag ends a press and hold (#763), and hides a hover preview (#766). Called at the drag's
  // start and again at its end, on every branch (#776): a preview that came back during the drag
  // (a hold whose release never reached `window`) must not outlive it.
  const closePreviews = () => {
    setHeldCardId(null);
    setHoveredCardId(null);
  };

  const handleDragStart = (event: DragStartEvent) => {
    const id = cardIdOfDraggable(event.active.id);
    closePreviews();
    draggingRef.current = true;
    // The press point, read from the activator event, so the release can be measured against it
    // (#774, #825).
    pressRef.current = pressGeometryFrom(event.activatorEvent);
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
    // A drag off the draw pile's or the dilemma pile's art (#814) carries the card face down.
    setDraggingShowsBack(event.active.data?.current?.showBack === true);

    // A drag of a card selected in the open card list panel, or in the open hand it started from
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

  // Closes a card list panel after a drag ends, unless the drag started from a card inside that very
  // panel and the panel still holds a card after the drop (#675): the player can then drag the
  // next card out with no extra tap. A drag that did not start from a given panel still closes
  // it, the same as before this change — including a panel that merely happened to be open while
  // a drag started somewhere else entirely. `dragOrigin` is the dragged card's zone before the
  // drop (found while `table` still holds its pre-drop state, in `handleDragEnd`/
  // `handleDragCancel` below); `nextTable` is `table` after the drop's move applies (or `table`
  // itself, unchanged, for a drag that dispatched no move at all, including a cancelled drag and a
  // release within the cancel radius of the press point, #774).
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

    if (openFlatLocation) {
      const isDragOrigin = zone === openFlatLocation;
      const stillHasCards = nextTable[openFlatLocation].length > 0;
      if (!isDragOrigin || !stillHasCards) {
        setOpenFlatLocation(null);
        closedAPanel = true;
      }
    }

    if (openCrewShipId) {
      // The panel also shows the cards placed on the ship (#957), and a drag of one of them starts
      // from this panel too (#963).
      const isDragOrigin =
        typeof zone === 'object' &&
        ((zone.zone === 'crew' && zone.shipId === openCrewShipId) ||
          (zone.zone === 'on' && zone.targetId === openCrewShipId));
      // The panel shows the ship too (#832), so it stays open after the last crew member
      // leaves, as long as the ship itself is still on the table.
      const shipStillThere = !!findInstanceAnywhere(nextTable, openCrewShipId);
      if (!isDragOrigin || !shipStillThere) {
        setOpenCrewShipId(null);
        closedAPanel = true;
      }
    }

    if (openPlacedOnTargetId) {
      const isDragOrigin = typeof zone === 'object' && zone.zone === 'on' && zone.targetId === openPlacedOnTargetId;
      // The panel shows the host card too (#881), so it stays open after the last placed card
      // leaves, as long as the host card itself is still on the table.
      const hostStillThere = !!findInstanceAnywhere(nextTable, openPlacedOnTargetId);
      if (!isDragOrigin || !hostStillThere) {
        setOpenPlacedOnTargetId(null);
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
    // started elsewhere (e.g. an open card list panel, per the issue's acceptance check) still
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
    closePreviews();
    const { active, over } = event;
    const id = cardIdOfDraggable(active.id);
    // The dragged card's zone before the drop, read while `table` still holds its pre-drop
    // state — used below both for the dilemma pile's from-hand routing and to decide, in
    // `closePanelsAfterDrag`, whether this drag started from an open panel (#675).
    const dragOrigin = findInstanceAnywhere(table, id);
    const press = pressRef.current;
    pressRef.current = null;
    // A release still within the cancel radius of the press point is not a choice of a
    // target (#774, #825): the drag cancels before anything else runs, so no card moves, and the hand
    // or the panel it started from opens again.
    if (isReleaseInCancelRadius(press, event.delta)) {
      cancelDrag(dragOrigin);
      return;
    }
    // The full group this drag moves (#677): `draggingGroup` if `handleDragStart` built one
    // (it always does, for any drag that found a card), falling back to just the touched card
    // for a drag that somehow never set it (defensive only; `dragOrigin` covers the same case
    // `handleDragStart`'s own `findInstanceAnywhere` lookup would).
    const group = draggingGroup.length > 0 ? draggingGroup : dragOrigin ? [dragOrigin.instance] : [];
    setDraggingInstance(null);
    setDraggingGroup([]);
    // An open card list panel (#602), including the core's/the brig's own panel (#640) and a ship's
    // crew panel (#664), closes after a drag, unless the drag started from a card inside it and
    // it still holds a card after the drop (#675).

    // A drop inside the dilemma stack's own popup, on top of another card still in the stack,
    // reorders the stack instead of moving the card out of its zone (#632). The dragged card's
    // origin has to be the stack itself, and the drop has to land on another card that is still
    // in the stack — only a drag that started from this same open popup can ever land on a stack
    // card's own id (`CardListPanelCard`'s `reorderable` droppable), so this cannot misfire against
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
    markLanded(actions);

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

  // Plays the landed cue (#778) on every distinct zone the drop moved a card into. A drop that
  // moved nothing leaves the current cue alone.
  const markLanded = (actions: Extract<TableAction, { type: 'move' }>[]) => {
    if (actions.length === 0) return;
    landedNonceRef.current += 1;
    setLandedZones({ keys: new Set(actions.map((action) => landedZoneKey(action.to))), nonce: landedNonceRef.current });
    if (landedTimerRef.current) clearTimeout(landedTimerRef.current);
    landedTimerRef.current = setTimeout(() => {
      landedTimerRef.current = null;
      setLandedZones(null);
    }, LANDED_CUE_MS);
  };

  useEffect(
    () => () => {
      if (landedTimerRef.current) clearTimeout(landedTimerRef.current);
    },
    []
  );

  // The browser can cancel a touch drag (a pointercancel or a resize), and a release inside the
  // cancel radius of the press point cancels one too (#774). Clear the overlay then. No move
  // ever dispatches for a cancelled drag, so `table` itself is already the outcome
  // `closePanelsAfterDrag` needs (#675): the panel the drag started from, if any, still holds
  // every card it held before the drag, so it stays open, and the hand it started from reopens.
  const cancelDrag = (dragOrigin: { instance: CardInstance; zone: TableZone } | null) => {
    setDraggingInstance(null);
    setDraggingGroup([]);
    closePanelsAfterDrag(dragOrigin, table);
  };

  const handleDragCancel = () => {
    closePreviews();
    pressRef.current = null;
    cancelDrag(draggingInstance ? findInstanceAnywhere(table, draggingInstance.id) : null);
  };

  const isEmpty = deckEmpty;
  // #742: the dilemma stack zone is only useful once one of these is true — it holds a card, its
  // own hand is open (so there's somewhere to drag a dilemma from), or a dilemma is being dragged
  // right now (so it's a valid drop target mid-drag, the same `draggingInstance` check the
  // dilemma pile's own top/bottom split already uses for `showPositionLabel`).
  const dilemmaStackVisible =
    dilemmaStack.length > 0 || openHand === 'dilemmaHand' || draggingInstance?.card.type === 'dilemma';
  draggingRef.current = draggingInstance !== null;
  const previewCardId = heldCardId ?? hoveredCardId;
  const held = previewCardId ? findInstanceAnywhere(table, previewCardId) : null;
  // A hover ends when its card moves away from the pointer (#784): a card that a table change
  // moves out from under a still pointer sends no `pointerleave`. Checked after every render, so
  // after every move of a card, against the last place the pointer was seen. The preview takes
  // no pointer events, so `elementFromPoint` sees the table under it.
  useEffect(() => {
    const point = pointerRef.current;
    if (!hoveredCardId || !point || typeof document.elementFromPoint !== 'function') return;
    const under = document.elementFromPoint(point.x, point.y);
    if (!under?.closest(`[data-card-id="${hoveredCardId}"]`)) setHoveredCardId(null);
  });
  // A press anywhere closes the preview, and does nothing else (#784): it does not select a card,
  // open a panel, start a hold or start a drag, and its click is swallowed. The listener is on
  // `window` in the capture phase, so it runs before the table's own handlers and dnd-kit's. A
  // press on the card a mouse hovers is the exception: that press acts on the card it previews.
  useEffect(() => {
    if (!previewCardId || draggingInstance) return;
    const onPress = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!heldCardId && target?.closest(`[data-card-id="${hoveredCardId}"]`)) return;
      event.stopPropagation();
      event.preventDefault();
      swallowClickOf(event);
      setHeldCardId(null);
      setHoveredCardId(null);
    };
    window.addEventListener('pointerdown', onPress, true);
    return () => window.removeEventListener('pointerdown', onPress, true);
  }, [previewCardId, heldCardId, hoveredCardId, draggingInstance]);
  const openCrewShip = openCrewShipId ? findInstanceAnywhere(table, openCrewShipId)?.instance : null;
  const openPlacedOnTarget = openPlacedOnTargetId ? findInstanceAnywhere(table, openPlacedOnTargetId)?.instance : null;
  // The cards of whichever card list panel is currently open, if any — only one panel is ever open
  // at a time. Used both to build a multi-select drag's group (`handleDragStart`) and to pass
  // the right card list to whichever `<CardListPanel>` below is rendered.
  const openPanelCards: CardInstance[] | null = openPile
    ? missions[openPile.missionIndex][openPile.pile]
    : openFlatLocation
    ? openFlatLocation === 'core'
      ? core
      : openFlatLocation === 'brig'
      ? brig
      : openFlatLocation === 'drawDeck'
      ? drawDeck
      : openFlatLocation === 'dilemmaPile'
      ? dilemmaPile
      : openFlatLocation === 'discard'
      ? discard
      : dilemmaStack
    : openCrewShip
    ? openCrewShip.crew ?? []
    : openPlacedOnTarget
    ? openPlacedOnTarget.placedOn ?? []
    : openShipRowMissionIndex !== null
    ? missions[openShipRowMissionIndex].ships
    : null;
  // A drag that started from a card inside the dilemma stack's own popup (#632's reorder) needs
  // that popup to stay on screen for the rest of the drag: the card the player is aiming at, a
  // neighbour still in the stack, is inside the popup too, so hiding it (the same
  // `hidden={draggingInstance !== null}` every other panel below still uses, `CardListPanel`'s own
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
    const panelEl = document.querySelector('[data-testid="card-list-panel-dilemmaStack"]');
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
        {/* The home for whole-game controls (#722): Reset and Load deck (#780). Rendered outside the
            isEmpty/!isEmpty split below so it's there in both states. */}
        <GameMenu
          open={gameMenuOpen}
          onToggle={() => setGameMenuOpen((open) => !open)}
          onClose={() => setGameMenuOpen(false)}
          onReset={handleResetClick}
          onLoadDeck={handleLoadDeckClick}
          onDecklist={handleDecklistClick}
          fullscreen={fullscreen}
        />
        {decklistOpen && <DecklistPanel deck={dealtDeck} onClose={() => setDecklistOpen(false)} />}

        {drive.showPicker && (
          <DrivePickerModal
            mode="load"
            driveFiles={drive.driveFiles}
            loadDriveFile={loadDriveDeck}
            deleteDriveFile={drive.deleteDriveFile}
            inProgress={drive.loading}
            onClose={drive.closePicker}
            isSignedIn={!!drive.session}
            hasDriveScope={drive.session?.hasDriveScope ?? false}
            onSignIn={drive.signInToDrive}
            browsedFolder={drive.browsedFolder}
            onBrowseFolder={drive.setBrowsedFolder}
          />
        )}

        {isEmpty && (
          <div className="flex flex-col items-center justify-center flex-1 text-text-muted gap-2 p-8">
            <FaLayerGroup className="text-4xl" />
            <p className="text-lg">No draw cards in deck.</p>
            <p className="text-sm">Add cards to your draw deck in the deck builder, then come back here.</p>
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
            <LandedZoneProvider value={landedZones}>
            <CardHoldProvider value={cardHold}>
            <div className="flex flex-col flex-1 p-4">
              {/* Mission row: 5 positional slots dealt face up on a new game and on reset (#597),
                  plus the dilemma stack (#630) in its own reserved column to the right, in the
                  same row so it lines up with the missions and shares their gap. The row moves
                  down once the dilemmas under a mission poke out past the padding above it (#968). */}
              <div
                ref={setMissionRows}
                className="flex flex-row gap-2 justify-center items-start"
                style={{ paddingTop: underMissionHeadroom(missionScale, finePointer) }}
              >
                <MissionRow
                  missions={missions}
                  onOpenPile={(missionIndex, pile) => openOnlyMissionPile(missionIndex, pile)}
                  onShipClick={handleShipClick}
                  onOpenShipRow={(missionIndex) => openOnlyShipRowPanel(missionIndex)}
                  onOpenPlacedOn={openOnlyPlacedOnPanel}
                  onFlipMission={(id) => dispatch({ type: 'flipMission', id })}
                  scale={missionScale}
                  shipRows={shipRows}
                  desktop={finePointer}
                />
                <DilemmaStackPile
                  stack={dilemmaStack}
                  onOpen={() => openOnlyFlatZone('dilemmaStack')}
                  onReveal={() => dispatch({ type: 'flip', id: dilemmaStack[0].id })}
                  visible={dilemmaStackVisible}
                  scale={missionScale}
                  desktop={finePointer}
                />
              </div>

              {/* Bottom row, anchored to the bottom. From left to right: discard pile, draw pile,
                  closed hand, core, brig. The dilemma pile is the rightmost zone, at the right
                  edge. The push-below-the-viewport offset (#130, #636) is gone entirely now
                  (#682): every zone here fits the table's own height, so `items-end` alone
                  aligns every zone's bottom edge to this row's own bottom edge, the same edge
                  core and the brig already used. */}
              <div ref={setBottomRow} className="mt-auto flex flex-row items-end gap-2">
                <div className="flex flex-row items-end gap-2">
                  {/* Discard, with the score counter above it (#753) rather than beside it. The
                      turn counter sits above the hand instead (#927), so the discard pile is
                      centred under the score buttons and the row fits a 568 px table. */}
                  <div className="flex flex-col items-center gap-1">
                    {/* Score counter (#719): shows the current score, and plus/minus buttons
                        that change it by SCORE_STEP points, clamped by the reducer to 0-140. */}
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

                    <DiscardPile
                      topCard={discard[discard.length - 1]}
                      count={discard.length}
                      onOpen={() => openOnlyFlatZone('discard')}
                    />
                  </div>

                  {/* The draw deck, with the shuffle button and the search button above it
                      (#753) rather than beside it. */}
                  <div className="flex flex-col items-center gap-1">
                    <div className="flex items-center gap-1">
                      <button
                        className="btn-icon btn-icon-sm"
                        onClick={() => shufflePile('drawDeck')}
                        aria-label="Shuffle"
                      >
                        <ShuffleIcon />
                      </button>
                      {/* Download from the draw deck without drawing (#690): a separate control,
                          rather than layered on the draw-deck button, so it never steals the
                          button's own tap-to-draw click or its top/bottom drop halves. */}
                      <DownloadPileButton label="draw deck" count={drawDeck.length} onOpen={() => openOnlyFlatZone('drawDeck')} />
                    </div>
                    {/* The draw deck (#743): the same top/bottom drop-half split as the dilemma
                        pile, so a card dragged from any zone can be filed back in at either
                        end of the deck, not only drawn from the top. */}
                    <DrawPileButton
                      count={drawDeck.length}
                      topCard={drawDeck[0]}
                      onDraw={drawOne}
                      showPositionLabel={draggingInstance !== null}
                      shuffleCount={shuffleCounts.drawDeck}
                    />
                  </div>

                  {/* The hand, with the turn counter above it (#927), the way the draw deck and
                      the discard pile carry their controls above their card. */}
                  <div className="flex flex-col items-center gap-1">
                    {/* Turn counter (#718): shows the current turn, and a button that raises it
                        by one and unstops every stopped personnel card on the table. */}
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

                    {/* Hand. `selectedIds`/`onToggleSelect` let the player select more than one
                        card here and drag them together (#691), the same as a card list panel (#677);
                        closing the hand clears the selection. */}
                    <CardHand
                      instances={hand}
                      open={openHand === 'hand'}
                      onOpen={() => setOpenHand('hand')}
                      onClose={() => {
                        setOpenHand(null);
                        setSelectedCardIds([]);
                      }}
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
                      onSelectIds={setSelectedCardIds}
                      onSendSelected={(position) => sendHandSelectionToDeck('hand', position)}
                      openCardWidth={viewerCardWidth}
                      bottomInset={panelBottom}
                    />
                  </div>
                </div>

                {/* Core: any card, usually events (#603). A tap on a card opens the core's own
                    card list panel (#640). */}
                <FlatCardRow
                  zone="core"
                  label="Core"
                  cards={core}
                  maxWidth={CORE_ROW_MAX_WIDTH}
                  maxOffset={FLAT_ROW_MAX_OFFSET}
                  fixedWidth
                  onOpen={() => openOnlyFlatZone('core')}
                  onOpenPlacedOn={openOnlyPlacedOnPanel}
                />

                {/* Brig: captured personnel, though the zone accepts any card type (#603). A tap
                    on a card opens the brig's own card list panel (#640). */}
                <FlatCardRow
                  zone="brig"
                  label="Brig"
                  cards={brig}
                  maxWidth={BRIG_ROW_MAX_WIDTH}
                  maxOffset={FLAT_ROW_MAX_OFFSET}
                  onOpen={() => openOnlyFlatZone('brig')}
                  onOpenPlacedOn={openOnlyPlacedOnPanel}
                />

                {/* The dilemma pile stays the rightmost zone, with the closed dilemma hand
                    immediately to its left, on the inside of the row (#604). The dilemma hand
                    renders even with no cards (#631), as a drop target for a dilemma dragged back
                    from the stack popup — `CardHand`'s closed row shows an empty placeholder in
                    that state, the same as the draw deck and the dilemma stack. */}
                <div className="ml-auto flex flex-row items-end gap-2">
                  <CardHand
                    instances={dilemmaHand}
                    open={openHand === 'dilemmaHand'}
                    onOpen={() => setOpenHand('dilemmaHand')}
                    onClose={() => {
                      setOpenHand(null);
                      setSelectedCardIds([]);
                    }}
                    dragging={draggingInstance !== null}
                    portalContainer={gameLayer}
                    zone="dilemmaHand"
                    label="dilemma hand"
                    openCardWidth={viewerCardWidth}
                    bottomInset={panelBottom}
                    passthroughZone={[
                      DRAW_PILE_TOP_DROPPABLE_ID,
                      DRAW_PILE_BOTTOM_DROPPABLE_ID,
                      DILEMMA_PILE_TOP_DROPPABLE_ID,
                      DILEMMA_PILE_BOTTOM_DROPPABLE_ID,
                    ]}
                    selectedIds={selectedCardIds}
                    onToggleSelect={toggleCardSelection}
                    onSelectIds={setSelectedCardIds}
                    onSendSelected={(position) => sendHandSelectionToDeck('dilemmaHand', position)}
                    deckLabel="dilemma pile"
                  />

                  {/* Dilemma pile, with the shuffle button and the search button above it
                      (#753, #785) rather than beside it, the same layout as the draw deck. */}
                  <div className="flex flex-col items-center gap-1">
                    <div className="flex items-center gap-1">
                      {/* Its own accessible name, so it is told apart from the draw deck's
                          "Shuffle" button (#785). */}
                      <button
                        className="btn-icon btn-icon-sm"
                        onClick={() => shufflePile('dilemmaPile')}
                        aria-label="Shuffle dilemma pile"
                      >
                        <ShuffleIcon />
                      </button>
                      {/* Download from the dilemma pile without drawing (#690): a separate control,
                          rather than layered on the dilemma-pile button, so it never steals the
                          button's own tap-to-draw click or its top/bottom drop halves. */}
                      <DownloadPileButton
                        label="dilemma pile"
                        count={dilemmaPile.length}
                        onOpen={() => openOnlyFlatZone('dilemmaPile')}
                      />
                    </div>
                    <DilemmaPileButton
                      count={dilemmaPile.length}
                      topCard={dilemmaPile[0]}
                      onDraw={drawDilemma}
                      showPositionLabel={draggingInstance?.card.type === 'dilemma'}
                      shuffleCount={shuffleCounts.dilemmaPile}
                    />
                  </div>
                </div>
              </div>

              {/* The large card preview, shown only while a card is held (`useCardHold`). It is
                  read-only and takes no pointer events. `hidden` hides it during a drag. A hover preview
                  does not dim the table (#985). */}
              {held && (
                <CardPreview
                  instance={held.instance}
                  hidden={draggingInstance !== null}
                  side={heldCardId ? heldSide : hoveredSide}
                  markFaceDown={!isAwayTeamZone(held.zone)}
                  dim={heldCardId !== null}
                />
              )}

              {/* A mission's personnel or event card list panel (#602), opened by tapping its badge.
                  `selectedIds`/`onToggleSelect` let the player select more than one card here and
                  drag them together (#677); closing the panel clears the selection. */}
              {openPile && (
                <CardListPanel
                  location={openPile.pile}
                  cards={openPanelCards ?? []}
                  onClose={() => {
                    setOpenPile(null);
                    setSelectedCardIds([]);
                  }}
                  selectedIds={selectedCardIds}
                  onToggleSelect={toggleCardSelection}
                  onSelectIds={setSelectedCardIds}
                  onShuffle={() =>
                    dispatch({
                      type: 'shuffle',
                      location: { zone: 'missionPile', missionIndex: openPile.missionIndex, pile: openPile.pile },
                    })
                  }
                  onSetStopped={setStoppedForSelection}
                  onFlip={flipSelection}
                  onDiscard={discardSelection}
                  hidden={draggingInstance !== null}
                  cardWidth={viewerCardWidth}
                  cardHeight={viewerCardHeight}
                  bottomInset={panelBottom}
                />
              )}

              {/* The core's or the brig's own card list panel (#640), opened by tapping a card
                  already sitting in that zone; or the draw pile's/the dilemma pile's own download
                  panel (#690), opened by the new download control beside each one. */}
              {openFlatLocation && (
                <CardListPanel
                  location={openFlatLocation}
                  cards={openPanelCards ?? []}
                  onClose={() => {
                    setOpenFlatLocation(null);
                    setSelectedCardIds([]);
                  }}
                  selectedIds={selectedCardIds}
                  onToggleSelect={toggleCardSelection}
                  onSelectIds={setSelectedCardIds}
                  onShuffle={
                    openFlatLocation === 'discard' ? undefined : () => dispatch({ type: 'shuffle', location: openFlatLocation })
                  }
                  // A card in a deck pile is never stopped (#902), so the draw deck's and the dilemma
                  // pile's panels get no Stop button, and neither does the discard's.
                  onSetStopped={
                    openFlatLocation === 'discard' || isDownloadPile(openFlatLocation)
                      ? undefined
                      : setStoppedForSelection
                  }
                  onDiscard={openFlatLocation === 'discard' ? undefined : discardSelection}
                  onDownload={
                    isDownloadPile(openFlatLocation)
                      ? (ids) => downloadSelection(openFlatLocation, ids)
                      : undefined
                  }
                  hidden={draggingInstance !== null && !dragFromDilemmaStackPanel}
                  cardWidth={viewerCardWidth}
                  cardHeight={viewerCardHeight}
                  bottomInset={panelBottom}
                />
              )}

              {/* A ship's crew panel: opened by a tap on a ship (`handleShipClick`). It shows
                  the ship in its own section above the crew (#832). */}
              {openCrewShip && (
                <CardListPanel
                  location="crew"
                  cards={openPanelCards ?? []}
                  host={openCrewShip}
                  onClose={() => {
                    setOpenCrewShipId(null);
                    setSelectedCardIds([]);
                  }}
                  selectedIds={selectedCardIds}
                  onToggleSelect={toggleCardSelection}
                  onSelectIds={setSelectedCardIds}
                  onShuffle={() => dispatch({ type: 'shuffle', location: { zone: 'crew', shipId: openCrewShip.id } })}
                  onSetStopped={setStoppedForSelection}
                  onDiscard={discardSelection}
                  hidden={draggingInstance !== null}
                  cardWidth={viewerCardWidth}
                  cardHeight={viewerCardHeight}
                  bottomInset={panelBottom}
                />
              )}

              {/* The cards placed on a card (#810): opened by a tap on a card in the core or the
                  brig with cards on it, or by a tap on a mission card's counter of the cards on it
                  (#813). A ship has no second tap region (#963): the cards on a ship show in its
                  crew panel, as tiny cards below the ship, and leave the ship by a drag out of
                  there. A placed card leaves a card by a drag out of here.
                  No Shuffle: `shuffle` has no location for the placed cards. */}
              {openPlacedOnTarget && (
                <CardListPanel
                  location="on"
                  cards={openPanelCards ?? []}
                  host={openPlacedOnTarget}
                  onClose={() => {
                    setOpenPlacedOnTargetId(null);
                    setSelectedCardIds([]);
                  }}
                  selectedIds={selectedCardIds}
                  onToggleSelect={toggleCardSelection}
                  onSelectIds={setSelectedCardIds}
                  onSetStopped={setStoppedForSelection}
                  onDiscard={discardSelection}
                  hidden={draggingInstance !== null}
                  cardWidth={viewerCardWidth}
                  cardHeight={viewerCardHeight}
                  bottomInset={panelBottom}
                />
              )}

              {/* A mission's ship-row list panel (#713): opened by a tap on any ship once that
                  row holds more ships than fit without overlap (`ShipRow`), listing every ship on
                  it individually. A tap on a ship here selects it, the same as a tap inside any
                  other panel — it does not open a crew panel, since a second panel would break
                  the one-panel-at-a-time invariant of #711. */}
              {openShipRowMissionIndex !== null && (
                <CardListPanel
                  location="shipRow"
                  cards={openPanelCards ?? []}
                  onClose={() => {
                    setOpenShipRowMissionIndex(null);
                    setSelectedCardIds([]);
                  }}
                  selectedIds={selectedCardIds}
                  onToggleSelect={toggleCardSelection}
                  onSelectIds={setSelectedCardIds}
                  onShuffle={() =>
                    dispatch({ type: 'shuffle', location: { zone: 'shipRow', missionIndex: openShipRowMissionIndex } })
                  }
                  onSetStopped={setStoppedForSelection}
                  onDiscard={discardSelection}
                  hidden={draggingInstance !== null}
                  cardWidth={viewerCardWidth}
                  cardHeight={viewerCardHeight}
                  bottomInset={panelBottom}
                />
              )}
            </div>
            </CardHoldProvider>
            </LandedZoneProvider>
            </DraggedCardTypeProvider>

            <DragOverlay modifiers={overlayModifiers}>
              {draggingInstance && (
                // dnd-kit measures this, the overlay's only child, as `overlayNodeRect`, and its
                // wrapper is the size of the source card. `w-fit` keeps this box the size of the
                // card image, so `centerOnPointer` centres the image, not the source card's width (#955).
                <div className="relative w-fit">
                  <img
                    src={draggingShowsBack ? '/cardimages/cardback.jpg' : `/cardimages/${draggingInstance.card.imagefile}.jpg`}
                    width={120}
                    height={167}
                    alt={draggingShowsBack ? 'Face-down card' : draggingInstance.card.name}
                    className="rounded-lg shadow-md w-14 h-auto"
                    style={PILE_CARD_BORDER_STYLE}
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
