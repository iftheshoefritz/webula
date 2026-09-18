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
import { deckFromTsv, expandDeck, extractMissions, isDeckEmpty, shuffleArray } from '../deckBuilderUtils';
import { Deck } from '../../../types';
import useDataFetching from '../../../hooks/useDataFetching';
import { PRACTICE_DECK_TSV } from '../../../lib/practiceDeck';
import {
  CardInstance,
  MissionPileName,
  createCardInstances,
  findInstanceAnywhere,
  initialTableState,
  tableReducer,
} from './tableReducer';
import CardHand from './CardHand';
import MissionRow, { missionIndexFromDropId, missionPileFromDropId, shipIdFromCrewDropId } from './MissionRow';
import CardPreview from './CardPreview';
import CountBadge from './CountBadge';
import PilePanel from './PilePanel';

// A dropped card's type chooses its mission pile (#602): personnel and equipment go to the
// personnel pile, event/mission/interrupt go to the event pile. A ship, and any type not listed
// here (dilemmas, #605/#606), are handled separately or not yet supported.
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

// Picks the drop zone under the pointer, and falls back to the zone the dragged card overlaps
// most when the pointer is inside no zone. `pointerWithin` on its own lets a small zone nested
// inside a larger one win (a ship's crew zone inside its ship row, #600), which the area-based
// `rectIntersection` never does; the fallback keeps a drop working when the pointer leaves every
// zone, as it can at the bottom row, which sits partly below the bottom edge of the viewport.
const collisionDetection: CollisionDetection = (args) => {
  const withinPointer = pointerWithin(args);
  return withinPointer.length > 0 ? withinPointer : rectIntersection(args);
};

function EmptyZonePlaceholder({ zone, label }: { zone: string; label: string }) {
  return (
    <div
      data-zone={zone}
      className="w-14 h-20 rounded-lg border-2 border-dashed border-white/20 flex items-center justify-center text-text-muted text-[10px] text-center leading-tight px-1"
    >
      {label}
    </div>
  );
}

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

function PracticeDrawContent() {
  const searchParams = useSearchParams();
  const isFixture = searchParams.get('fixture') === '1';
  const { data, loading } = useDataFetching();
  const [table, dispatch] = useReducer(tableReducer, initialTableState);
  const { pile, hand, discard, missions } = table;
  const [deckEmpty, setDeckEmpty] = useState(true);
  const [focusedCardId, setFocusedCardId] = useState<string | null>(null);
  const [isPortrait, setIsPortrait] = useState(false);
  const [isHandOpen, setIsHandOpen] = useState(false);
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
      });
      setDeckEmpty(isDeckEmpty(deck));
      setFocusedCardId(null);
      setIsHandOpen(false);
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
      });
      setDeckEmpty(isDeckEmpty(deck));
      setFocusedCardId(null);
      setIsHandOpen(false);
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
    dispatch({ type: 'draw' });
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
    if (found.zone === 'hand') {
      // A drag from the open hand closes it at once; the DragOverlay carries the card under
      // the pointer for the rest of the drag, so the source card can stay put in the (now
      // closed) hand with no jump.
      setIsHandOpen(false);
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
    if (over?.id === DISCARD_DROPPABLE_ID) {
      dispatch({ type: 'move', id: String(active.id), to: 'discard' });
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
    // into one of the mission's two piles by type (#602). Any other type (a dilemma, #605/#606)
    // is not supported yet, so it is not dispatched and the card returns to its source zone.
    const missionIndex = over ? missionIndexFromDropId(String(over.id)) : null;
    if (missionIndex !== null && draggingInstance) {
      if (draggingInstance.card.type === 'ship') {
        dispatch({ type: 'move', id: String(active.id), to: { zone: 'shipRow', missionIndex } });
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
                  open={isHandOpen}
                  onOpen={() => setIsHandOpen(true)}
                  onClose={() => setIsHandOpen(false)}
                  onCardClick={(id) => setFocusedCardId(id)}
                  dragging={draggingInstance !== null}
                  portalContainer={gameLayer}
                />

                {/* Core and Brig: no drop behaviour yet (#603) */}
                <EmptyZonePlaceholder zone="core" label="Core" />
                <EmptyZonePlaceholder zone="brig" label="Brig" />

                {/* Dilemma pile: no contents or drop behaviour yet (#604). The closed dilemma hand
                    goes immediately to its left (#604). */}
                <div className="ml-auto">
                  <EmptyZonePlaceholder zone="dilemma" label="Dilemma" />
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
