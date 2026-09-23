'use client';

import React, { Suspense, useEffect, useReducer, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
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
import { FaRedo, FaLayerGroup, FaMobileAlt } from 'react-icons/fa';
import { deckFromTsv, expandDeck, extractDilemmas, extractMissions, isDeckEmpty, shuffleArray } from '../deckBuilderUtils';
import { Deck } from '../../../types';
import useDataFetching from '../../../hooks/useDataFetching';
import { PRACTICE_DECK_TSV } from '../../../lib/practiceDeck';
import {
  CardInstance,
  MissionPileName,
  MoveTarget,
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
  SHIP_CARD_WIDTH,
  missionIndexFromDropId,
  missionPileFromDropId,
  shipIdFromCrewDropId,
} from './MissionRow';
import CardPreview, { cardIdFromDraggableId } from './CardPreview';
import CountBadge from './CountBadge';
import PilePanel from './PilePanel';
import FlatCardRow from './FlatCardRow';
import { DraggedCardTypeProvider, useDraggedCardType } from './DraggedCardTypeContext';
import { highlightClassName, highlightState } from './zoneAccepts';

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
const FLAT_DROP_ZONES: readonly Zone[] = [DISCARD_DROPPABLE_ID, 'core', 'brig', 'hand', 'dilemmaHand'];

// The dilemma pile's two drop targets (#607): a drop on the top half puts the card first in
// `dilemmaPile` (drawn next); a drop on the bottom half puts it last, matching the pile's older,
// single-droppable behaviour. Both ids follow the kebab-case pattern `missionPileDropId`/
// `shipRowDropId` already use.
const DILEMMA_PILE_TOP_DROPPABLE_ID = 'dilemma-pile-top';
const DILEMMA_PILE_BOTTOM_DROPPABLE_ID = 'dilemma-pile-bottom';

function dilemmaPileHalfFromDropId(id: string): 'top' | 'bottom' | null {
  if (id === DILEMMA_PILE_TOP_DROPPABLE_ID) return 'top';
  if (id === DILEMMA_PILE_BOTTOM_DROPPABLE_ID) return 'bottom';
  return null;
}

// Resolves a single dropped card's destination, the same routing `handleDragEnd` always used,
// pulled out into its own function so a multi-card drag (#677) can run it once per card in the
// dragged group, each keyed off that card's own type and own pre-drop zone rather than one
// shared "the dragged card" — a mixed-type group (say, a ship dropped on a mission alongside
// personnel) still sends the ship to the ship row and the personnel to the personnel pile, same
// as dragging each one on its own. Returns null for a card the drop target does not accept
// (matching the old early-return-less fallthrough): that card stays where it was.
function computeMoveTargetForInstance(
  over: DragEndEvent['over'],
  instance: CardInstance,
  originZone: TableZone | undefined
): MoveTarget | null {
  if (!over) return null;

  if (FLAT_DROP_ZONES.includes(String(over.id) as Zone)) {
    return over.id as Zone;
  }

  if (dilemmaPileHalfFromDropId(String(over.id))) {
    return 'dilemmaPile';
  }

  const shipId = shipIdFromCrewDropId(String(over.id));
  if (shipId && (instance.card.type === 'personnel' || instance.card.type === 'equipment')) {
    return { zone: 'crew', shipId };
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
      const pile = originZone === 'dilemmaHand' ? 'dilemma' : 'underMission';
      return { zone: 'missionPile', missionIndex, pile };
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

// One half of the dilemma pile's two drop targets (#607): the top half puts a dropped card first
// in the pile (drawn next), the bottom half puts it last. Each half is its own `<button>`, the
// same sibling-not-nested pattern `PileBadge` (`MissionRow.tsx`) already uses to combine a tap
// control and a droppable without nesting one button inside another — here the two halves sit as
// absolutely positioned siblings over the shared, non-interactive card art in `DilemmaPileButton`
// below, each covering exactly half its height and the full width, so both halves together cover
// the whole card and neither changes the card's footprint. A tap on either half draws, same as
// tapping anywhere on the old single button; `disabled` here only stops the tap (`useDroppable`'s
// geometry, and so a drop, works on a disabled button same as an enabled one, #607 review).
function DilemmaPileHalf({
  dropId,
  label,
  position,
  count,
  onDraw,
  showLabel,
}: {
  dropId: string;
  label: string;
  position: 'top' | 'bottom';
  count: number;
  onDraw: () => void;
  showLabel: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dropId });
  const draggedType = useDraggedCardType();
  const highlight = highlightState('dilemmaPile', draggedType, isOver);

  return (
    <button
      ref={setNodeRef}
      data-zone={dropId}
      data-highlight={highlight}
      onClick={onDraw}
      disabled={count === 0}
      aria-label={`Dilemma pile ${position}, tap to draw`}
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

      <DilemmaPileHalf
        dropId={DILEMMA_PILE_TOP_DROPPABLE_ID}
        label="Top"
        position="top"
        count={count}
        onDraw={onDraw}
        showLabel={showPositionLabel}
      />
      <DilemmaPileHalf
        dropId={DILEMMA_PILE_BOTTOM_DROPPABLE_ID}
        label="Bottom"
        position="bottom"
        count={count}
        onDraw={onDraw}
        showLabel={showPositionLabel}
      />
    </div>
  );
}

function PracticeDrawContent() {
  const searchParams = useSearchParams();
  const isFixture = searchParams.get('fixture') === '1';
  const { data, loading } = useDataFetching();
  const [table, dispatch] = useReducer(tableReducer, initialTableState);
  const { pile, hand, discard, core, brig, dilemmaPile, dilemmaHand, missions } = table;
  const [deckEmpty, setDeckEmpty] = useState(true);
  const [focusedCardId, setFocusedCardId] = useState<string | null>(null);
  const [isPortrait, setIsPortrait] = useState(false);
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
  const [openPile, setOpenPile] = useState<{ missionIndex: number; pile: MissionPileName } | null>(null);
  // Which of the core's/the brig's own pile panel (#640), or the draw pile's/the dilemma pile's
  // own download panel (#690), is open, if any — only one at a time. Tracked the same way
  // `openPile` tracks a mission's open pile: a piece of UI state with no effect on the table.
  const [openFlatZone, setOpenFlatZone] = useState<'core' | 'brig' | 'pile' | 'dilemmaPile' | null>(null);
  // Which ship's crew panel (#664) is open, if any, named by the ship's own instance id (not a
  // mission index, since a ship stays reachable by its own id regardless of which mission's ship
  // row currently holds it — the same reasoning `crewDropId` already follows). Tracked the same
  // way as `openPile`/`openFlatZone`: a piece of UI state with no effect on the table. Since
  // #678, a tap on a ship (`handleShipClick` below) opens this alongside the ship's own preview,
  // and the two close together, rather than the badge opening this on its own.
  const [openCrewShipId, setOpenCrewShipId] = useState<string | null>(null);
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

  const drawOne = () => {
    dispatch({ type: 'draw', from: 'pile', to: 'hand' });
  };

  const drawDilemma = () => {
    dispatch({ type: 'draw', from: 'dilemmaPile', to: 'dilemmaHand' });
  };

  const reset = () => {
    initDeck();
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
    setOpenCrewShipId(ship?.crew && ship.crew.length > 0 ? shipId : null);
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

    // A drag of a card selected in the open pile panel moves the whole selection together, in
    // the panel's own display order (#677); a drag of a card that is not selected moves only
    // that one card, as before, even while the panel holds an unrelated selection.
    setDraggingGroup(
      openPanelCards && selectedCardIds.includes(id)
        ? openPanelCards.filter((c) => selectedCardIds.includes(c.id))
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

    // A drop on the dilemma pile's top half (#607) puts the group first in the pile, in front of
    // its existing cards; the bottom half (the default, `position` undefined) puts it last. This
    // branch does not depend on a dragged card's type (`computeMoveTargetForInstance`), so it
    // resolves the same way for every card in the group. Dispatching one `move` per card, in the
    // group's own order, keeps that order in the destination for the default, appending case:
    // each dispatch adds its card after the ones already there. A 'top' drop reverses the
    // dispatch order instead, since a repeated prepend would otherwise reverse the group (#677).
    const position = over ? dilemmaPileHalfFromDropId(String(over.id)) ?? undefined : undefined;
    const orderedGroup = position === 'top' ? [...group].reverse() : group;

    // Each card in the group resolves its own target and, per #677's spec, a card the drop
    // target does not accept is simply left out here — it stays in its panel, same as a lone
    // card dropped somewhere it does not fit already did.
    const actions: Extract<TableAction, { type: 'move' }>[] = [];
    orderedGroup.forEach((instance) => {
      const origin = instance.id === dragOrigin?.instance.id ? dragOrigin : findInstanceAnywhere(table, instance.id);
      const target = computeMoveTargetForInstance(over, instance, origin?.zone);
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
      : dilemmaPile
    : openCrewShip
    ? openCrewShip.crew ?? []
    : null;

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
            collisionDetection={collisionDetection}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            {/* The dragged card's type, shared with every drop zone so each one can show its own
                highlight during a drag (#608). `draggingInstance` already tracks it for the drag
                overlay below. */}
            <DraggedCardTypeProvider value={draggingInstance?.card.type ?? null}>
            <div className="flex flex-col flex-1 p-4">
              {/* Mission row: 5 positional slots dealt face up on a new game and on reset (#597) */}
              <MissionRow
                missions={missions}
                onCardClick={(id) => setFocusedCardId(id)}
                onOpenPile={(missionIndex, pile) => setOpenPile({ missionIndex, pile })}
                onShipClick={handleShipClick}
              />

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

                  {/* Pile */}
                  <div className="flex items-start gap-4">
                    <div className="flex flex-col items-center gap-1">
                      <button
                        className="btn-icon btn-icon-sm"
                        onClick={reset}
                        aria-label="Reset"
                      >
                        <FaRedo />
                      </button>
                      <div className="flex items-end gap-1">
                        <button
                          data-zone="pile"
                          onClick={drawOne}
                          disabled={pile.length === 0}
                          className="relative focus:outline-none group disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {pile.length > 0 ? (
                            <>
                              <img
                                src="/cardimages/cardback.jpg"
                                width={120}
                                height={167}
                                alt="Face-down draw pile"
                                className="rounded-lg shadow-lg group-hover:shadow-accent/30 transition-shadow w-14 h-auto"
                              />
                              <CountBadge count={pile.length} />
                            </>
                          ) : (
                            <div className="w-14 h-20 rounded-lg border-2 border-dashed border-white/20 flex items-center justify-center text-text-muted text-xs">
                              Empty
                            </div>
                          )}
                        </button>
                        {/* Download from the draw pile without drawing (#690): a separate control,
                            beside the draw-pile button rather than layered on it, so it never
                            steals the button's own tap-to-draw click. */}
                        <DownloadPileButton label="draw pile" count={pile.length} onOpen={() => setOpenFlatZone('pile')} />
                      </div>
                    </div>
                  </div>

                  {/* Hand */}
                  <CardHand
                    instances={hand}
                    open={openHand === 'hand'}
                    onOpen={() => setOpenHand('hand')}
                    onClose={() => setOpenHand(null)}
                    onCardClick={(id) => setFocusedCardId(id)}
                    dragging={draggingInstance !== null}
                    portalContainer={gameLayer}
                    passthroughZone="pile"
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
                  onOpen={() => setOpenFlatZone('core')}
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
                  onOpen={() => setOpenFlatZone('brig')}
                />

                {/* The dilemma pile stays the rightmost zone, with the closed dilemma hand
                    immediately to its left, on the inside of the row (#604). The dilemma hand
                    shows only when it holds cards. */}
                <div className="ml-auto flex flex-row items-end gap-4">
                  {dilemmaHand.length > 0 && (
                    <CardHand
                      instances={dilemmaHand}
                      open={openHand === 'dilemmaHand'}
                      onOpen={() => setOpenHand('dilemmaHand')}
                      onClose={() => setOpenHand(null)}
                      onCardClick={(id) => setFocusedCardId(id)}
                      dragging={draggingInstance !== null}
                      portalContainer={gameLayer}
                      zone="dilemmaHand"
                      label="dilemma hand"
                      passthroughZone="pile"
                    />
                  )}

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
                      onOpen={() => setOpenFlatZone('dilemmaPile')}
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
                    focused.zone === 'missions' || (typeof focused.zone === 'object' && focused.zone.zone === 'missionPile')
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
                  hidden={draggingInstance !== null}
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
