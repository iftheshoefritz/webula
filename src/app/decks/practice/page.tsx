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
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { FaRedo, FaLayerGroup, FaMobileAlt } from 'react-icons/fa';
import { deckFromTsv, expandDeck, shuffleArray } from '../deckBuilderUtils';
import { Deck } from '../../../types';
import useDataFetching from '../../../hooks/useDataFetching';
import { PRACTICE_DECK_TSV } from '../../../lib/practiceDeck';
import { CardInstance, createCardInstances, initialTableState, tableReducer } from './tableReducer';
import CardHand from './CardHand';

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
          <span className="absolute -top-2 -right-2 bg-accent text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center shadow">
            {count}
          </span>
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
  const { pile, hand, discard } = table;
  const [focusedCardId, setFocusedCardId] = useState<string | null>(null);
  const [isPortrait, setIsPortrait] = useState(false);
  const [isHandOpen, setIsHandOpen] = useState(false);
  const [draggingInstance, setDraggingInstance] = useState<CardInstance | null>(null);
  const [gameLayer, setGameLayer] = useState<HTMLDivElement | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const initDeck = () => {
    if (isFixture) {
      if (loading || data.length === 0) return;
      const deck = deckFromTsv(PRACTICE_DECK_TSV, data);
      const expanded = expandDeck(deck);
      dispatch({ type: 'reset', cards: createCardInstances(shuffleArray(expanded)) });
      setFocusedCardId(null);
      setIsHandOpen(false);
      return;
    }

    try {
      const raw = localStorage.getItem('currentDeck');
      if (!raw) return;
      const deck: Deck = JSON.parse(raw);
      const expanded = expandDeck(deck);
      dispatch({ type: 'reset', cards: createCardInstances(shuffleArray(expanded)) });
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
    const instance = hand.find((c) => c.id === id);
    if (instance) {
      // A drag from the open hand closes it at once; the DragOverlay carries the card under
      // the pointer for the rest of the drag, so the source card can stay put in the (now
      // closed) hand with no jump.
      setIsHandOpen(false);
      setDraggingInstance(instance);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setDraggingInstance(null);
    if (over?.id === DISCARD_DROPPABLE_ID) {
      dispatch({ type: 'move', id: String(active.id), to: 'discard' });
    }
  };

  // The browser can cancel a touch drag (a pointercancel or a resize). Clear the overlay then too.
  const handleDragCancel = () => {
    setDraggingInstance(null);
  };

  const isEmpty = pile.length === 0 && hand.length === 0 && discard.length === 0;
  const focusedInstance = hand.find((instance) => instance.id === focusedCardId);

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
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <div className="flex flex-col flex-1 p-4">
              {/* Future game elements go here */}

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
                          <span className="absolute -top-2 -right-2 bg-accent text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center shadow">
                            {pile.length}
                          </span>
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
                  position never shifts regardless of which card is previewed */}
              {focusedInstance && (
                <button
                  className="fixed inset-0 z-[200] bg-black/50"
                  onClick={() => setFocusedCardId(null)}
                  aria-label={`${focusedInstance.card.name}, tap to shrink`}
                >
                  <img
                    src={`/cardimages/${focusedInstance.card.imagefile}.jpg`}
                    alt={focusedInstance.card.name}
                    className="absolute right-4 top-1/2 -translate-y-1/2 h-[90%] w-auto rounded-lg shadow-2xl"
                  />
                </button>
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
