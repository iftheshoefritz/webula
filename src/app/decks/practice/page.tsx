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
const DILEMMA_PILE_DROPPABLE_ID = 'dilemmaPile';

// Four flat, top-level drop zones (#603 adds the core and the brig alongside the discard pile;
// #605 adds the dilemma pile): each one's `useDroppable` id is just its own zone name
// (`FlatCardRow`, `DiscardPile`, `DilemmaPileButton`), so a drop on any of them dispatches the
// same `move` straight to that zone, for any card type. A card dropped on the dilemma pile this
// way always lands on the pile's bottom, face down — `move` appends to the end of the destination
// array, and `ZONE_FACE.dilemmaPile` is 'down' — which is the general flat-zone behavior, not a
// choice of top or bottom (#607's later job).
const FLAT_DROP_ZONES: readonly Zone[] = [DISCARD_DROPPABLE_ID, 'core', 'brig', DILEMMA_PILE_DROPPABLE_ID];

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

function DiscardPile({ topCard, count }: { topCard: CardInstance | undefined; count: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: DISCARD_DROPPABLE_ID });

  // A ring shows that the discard pile accepts the card under the pointer.
  return (
    <div
      ref={setNodeRef}
      data-zone="discard"
      className={`flex flex-col items-center gap-1 rounded-lg ${isOver ? 'ring-2 ring-accent' : ''}`}
    >
      {topCard ? (
        <div className="relative">
          <img
            src={`/cardimages/${topCard.card.imagefile}.jpg`}
            width={120}
            height={167}
            alt="Discard pile"
            className="rounded-lg shadow-lg w-14 h-auto"
          />
          <CountBadge count={count} />
        </div>
      ) : (
        <div className="w-14 h-20 rounded-lg border-2 border-dashed border-white/20 flex items-center justify-center text-text-muted text-[10px] text-center leading-tight px-1">
          Discard
        </div>
      )}
    </div>
  );
}

// The dilemma pile (#604): a tap draws its top card into the dilemma hand. It is also a drop
// target (#605): a revealed dilemma dragged here from a mission's dilemma stack goes on the
// bottom, face down (see `FLAT_DROP_ZONES`).
function DilemmaPileButton({ count, onDraw }: { count: number; onDraw: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: DILEMMA_PILE_DROPPABLE_ID });

  return (
    <button
      ref={setNodeRef}
      data-zone={DILEMMA_PILE_DROPPABLE_ID}
      onClick={onDraw}
      disabled={count === 0}
      className={`relative focus:outline-none group disabled:opacity-50 disabled:cursor-not-allowed rounded-lg ${
        isOver ? 'ring-2 ring-accent' : ''
      }`}
      aria-label="Dilemma pile, tap to draw"
    >
      {count > 0 ? (
        <>
          <img
            src="/cardimages/cardback.jpg"
            width={120}
            height={167}
            alt="Face-down dilemma pile"
            className="rounded-lg shadow-lg group-hover:shadow-accent/30 transition-shadow w-14 h-auto"
          />
          <CountBadge count={count} />
        </>
      ) : (
        <div className="w-14 h-20 rounded-lg border-2 border-dashed border-white/20 flex items-center justify-center text-text-muted text-[10px] text-center leading-tight px-1">
          Dilemma
        </div>
      )}
    </button>
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

                  <DilemmaPileButton count={dilemmaPile.length} onDraw={drawDilemma} />
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
