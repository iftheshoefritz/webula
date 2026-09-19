'use client';

import React, { Suspense, useEffect, useReducer, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  CollisionDetection,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { FaRedo, FaLayerGroup, FaMobileAlt } from 'react-icons/fa';
import { deckFromTsv, expandDeck, extractDilemmas, extractMissions, isDeckEmpty, shuffleArray } from '../deckBuilderUtils';
import { Deck } from '../../../types';
import useDataFetching from '../../../hooks/useDataFetching';
import { PRACTICE_DECK_TSV } from '../../../lib/practiceDeck';
import {
  CardInstance,
  MissionPileName,
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
import CardPreview from './CardPreview';
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

// Three flat, top-level drop zones (#603 adds the core and the brig alongside the discard pile):
// each one's `useDroppable` id is just its own zone name (`FlatCardRow`, `DiscardPile`), so a
// drop on any of them dispatches the same `move` straight to that zone, for any card type. The
// dilemma pile is a flat zone too, but not one of these: it has two drop targets of its own, the
// top half and the bottom half of `DilemmaPileButton`, handled separately below (#607) — it
// replaces the single whole-card `dilemmaPile` droppable #605 added, which only ever appended to
// the bottom.
const FLAT_DROP_ZONES: readonly Zone[] = [DISCARD_DROPPABLE_ID, 'core', 'brig'];

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

// The core and the brig show their cards at the ship row's small size (`MissionRow.tsx`), and
// each one's row is bounded to a width that keeps the whole bottom row (discard pile, draw pile,
// closed hand, core, brig, dilemma placeholder) inside the 568 px acceptance-check viewport: the
// other four zones and their gaps take a little over 300 px, leaving roughly 250 px for the core
// and the brig combined. A core row bounded to fit 4 overlapping cards and a brig row bounded to
// fit 2 together stay well inside that budget.
const CORE_ROW_MAX_WIDTH = 92; // px, fits 4 overlapping ship-sized cards
const BRIG_ROW_MAX_WIDTH = 58; // px, fits 2 overlapping ship-sized cards
const FLAT_ROW_MAX_OFFSET = SHIP_CARD_WIDTH + 2; // cards sit edge to edge with a small gap, matching the ship row

// Picks the drop zone under the pointer, and falls back to the zone the dragged card overlaps
// most when the pointer is inside no zone. `pointerWithin` on its own lets a small zone nested
// inside a larger one win (a ship's crew zone inside its ship row, #600), which the area-based
// `rectIntersection` never does; the fallback keeps a drop working when the pointer leaves every
// zone, as it can at the bottom row, which sits partly below the bottom edge of the viewport.
const collisionDetection: CollisionDetection = (args) => {
  const withinPointer = pointerWithin(args);
  return withinPointer.length > 0 ? withinPointer : rectIntersection(args);
};

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
  const [gameLayer, setGameLayer] = useState<HTMLDivElement | null>(null);
  const [openPile, setOpenPile] = useState<{ missionIndex: number; pile: MissionPileName } | null>(null);

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

  const handleDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id);
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
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setDraggingInstance(null);
    // Any drag closing clears the open preview: a crew card's drag begins while its own ship's
    // preview is still open (the crew row is the only place a crew card appears), and the
    // acceptance check for #600 requires that drag ending (dropped or not) to close the preview.
    // The same applies to an open pile panel (#602): a card dragged out of it begins its drag
    // while the panel is still open.
    setFocusedCardId(null);
    setOpenPile(null);
    if (over && FLAT_DROP_ZONES.includes(String(over.id) as Zone)) {
      dispatch({ type: 'move', id: String(active.id), to: over.id as Zone });
      return;
    }
    // A drop on either half of the dilemma pile (#607): the top half puts the card first in the
    // pile (drawn next), the bottom half puts it last. Accepted for any card type, the same
    // advisory-zone convention every other flat zone follows.
    const dilemmaPilePosition = over ? dilemmaPileHalfFromDropId(String(over.id)) : null;
    if (dilemmaPilePosition) {
      dispatch({ type: 'move', id: String(active.id), to: 'dilemmaPile', position: dilemmaPilePosition });
      return;
    }
    // A drop on a ship already in a ship row puts a personnel or equipment card aboard as crew
    // (#600). A drop of any other card type on it is not supported, so it is not dispatched and
    // the card returns to its source zone.
    const shipId = over ? shipIdFromCrewDropId(String(over.id)) : null;
    if (shipId && (draggingInstance?.card.type === 'personnel' || draggingInstance?.card.type === 'equipment')) {
      dispatch({ type: 'move', id: String(active.id), to: { zone: 'crew', shipId } });
      return;
    }
    // A drop directly on a pile's badge always goes to that pile, regardless of card type: the
    // player's way to override the type-based routing below (#602).
    const badgeTarget = over ? missionPileFromDropId(String(over.id)) : null;
    if (badgeTarget) {
      dispatch({ type: 'move', id: String(active.id), to: { zone: 'missionPile', ...badgeTarget } });
      return;
    }
    // A drop on a mission card or its ship row both resolve to the same mission index. A ship
    // goes to that mission's ship row (#599); personnel/equipment/event/mission/interrupt file
    // into one of the mission's piles by type (#602). A dilemma dropped there from the open
    // dilemma hand builds the mission's dilemma stack instead (#605); a dilemma dropped there
    // from anywhere else — including that mission's own dilemma stack — goes under the mission
    // instead, face up, permanently out of the stack (#606).
    const missionIndex = over ? missionIndexFromDropId(String(over.id)) : null;
    if (missionIndex !== null && draggingInstance) {
      if (draggingInstance.card.type === 'ship') {
        dispatch({ type: 'move', id: String(active.id), to: { zone: 'shipRow', missionIndex } });
        return;
      }
      if (draggingInstance.card.type === 'dilemma') {
        const source = findInstanceAnywhere(table, String(active.id));
        const pile = source?.zone === 'dilemmaHand' ? 'dilemma' : 'underMission';
        dispatch({ type: 'move', id: String(active.id), to: { zone: 'missionPile', missionIndex, pile } });
        return;
      }
      const pile = MISSION_PILE_BY_TYPE[draggingInstance.card.type];
      if (pile) {
        dispatch({ type: 'move', id: String(active.id), to: { zone: 'missionPile', missionIndex, pile } });
      }
    }
  };

  // The browser can cancel a touch drag (a pointercancel or a resize). Clear the overlay then too.
  const handleDragCancel = () => {
    setDraggingInstance(null);
    setFocusedCardId(null);
    setOpenPile(null);
  };

  const isEmpty = deckEmpty;
  const focused = focusedCardId ? findInstanceAnywhere(table, focusedCardId) : null;

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
            // drop zone (`ship-row-<idx>`), which is larger. dnd-kit's default collision
            // detection (`rectIntersection`) picks the droppable with the greatest overlap area,
            // so the ship row would always win over the smaller zone nested inside it, and a
            // personnel or equipment card dropped on a ship would return to its source instead
            // of boarding (#600 review). `pointerWithin` instead picks among only the droppables
            // that contain the pointer, ordered by distance from the pointer to each one's
            // corners, so the smaller nested zone (whose corners sit closer to the pointer) wins.
            //
            // `pointerWithin` alone is stricter than the old behaviour for every other zone: it
            // finds nothing unless the pointer itself sits inside a zone, and the bottom row sits
            // partly below the bottom edge of the viewport. So it falls back to
            // `rectIntersection` when the pointer is inside no zone, which keeps the older, more
            // forgiving drops (a card that only overlaps the discard pile) working.
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
              />

              {/* Bottom row, anchored to the bottom, offset partially below the viewport. From left
                  to right: discard pile, draw pile, closed hand, core, brig. The dilemma pile is the
                  rightmost zone, at the right edge. */}
              <div className="mt-auto flex flex-row items-end gap-4" style={{ transform: 'translateY(30%)' }}>
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
                />

                {/* Core: any card, usually events (#603) */}
                <FlatCardRow
                  zone="core"
                  label="Core"
                  cards={core}
                  maxWidth={CORE_ROW_MAX_WIDTH}
                  maxOffset={FLAT_ROW_MAX_OFFSET}
                  onCardClick={(id) => setFocusedCardId(id)}
                />

                {/* Brig: captured personnel, though the zone accepts any card type (#603) */}
                <FlatCardRow
                  zone="brig"
                  label="Brig"
                  cards={brig}
                  maxWidth={BRIG_ROW_MAX_WIDTH}
                  maxOffset={FLAT_ROW_MAX_OFFSET}
                  onCardClick={(id) => setFocusedCardId(id)}
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
                    />
                  )}

                  <DilemmaPileButton
                    count={dilemmaPile.length}
                    onDraw={drawDilemma}
                    showPositionLabel={draggingInstance?.card.type === 'dilemma'}
                  />
                </div>
              </div>

              {/* Enlarged card preview, anchored to the right edge at full screen height so its
                  position never shifts regardless of which card is previewed. A table card (a
                  mission, or a card in one of its piles, #602) gets a "Flip" button; a hand card
                  does not (#598). A ship's preview also shows its crew in a row below the art
                  (#600); `hidden` visually closes the preview for the duration of any drag
                  without unmounting that row. */}
              {focused && (
                <CardPreview
                  instance={focused.instance}
                  onClose={() => setFocusedCardId(null)}
                  onFlip={
                    focused.zone === 'missions' || (typeof focused.zone === 'object' && focused.zone.zone === 'missionPile')
                      ? () => dispatch({ type: 'flip', id: focused.instance.id })
                      : undefined
                  }
                  crew={focused.instance.card.type === 'ship' ? focused.instance.crew ?? [] : undefined}
                  onCardClick={(id) => setFocusedCardId(id)}
                  hidden={draggingInstance !== null}
                />
              )}

              {/* A mission's personnel or event pile panel (#602), opened by tapping its badge. */}
              {openPile && (
                <PilePanel
                  pile={openPile.pile}
                  cards={missions[openPile.missionIndex][openPile.pile]}
                  onClose={() => setOpenPile(null)}
                  onCardClick={(id) => setFocusedCardId(id)}
                  hidden={draggingInstance !== null}
                />
              )}
            </div>
            </DraggedCardTypeProvider>

            <DragOverlay>
              {draggingInstance && (
                <img
                  src={`/cardimages/${draggingInstance.card.imagefile}.jpg`}
                  width={120}
                  height={167}
                  alt={draggingInstance.card.name}
                  className="rounded-lg shadow-md w-14 h-auto"
                />
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
