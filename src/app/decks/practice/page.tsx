'use client';

import React, { Suspense, useEffect, useReducer, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { DndContext, DragEndEvent, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import { FaRedo, FaLayerGroup, FaMobileAlt } from 'react-icons/fa';
import { deckFromTsv, expandDeck, shuffleArray } from '../deckBuilderUtils';
import { Deck } from '../../../types';
import useDataFetching from '../../../hooks/useDataFetching';
import { PRACTICE_DECK_TSV } from '../../../lib/practiceDeck';
import { CardInstance, createCardInstances, initialTableState, tableReducer } from './tableReducer';

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

function DraggableHandCard({
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

function DiscardPile({ topCard, count }: { topCard: CardInstance | undefined; count: number }) {
  const { setNodeRef } = useDroppable({ id: DISCARD_DROPPABLE_ID });

  return (
    <div ref={setNodeRef} className="flex flex-col items-center gap-1">
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
        <div className="w-14 h-20 rounded-lg border-2 border-dashed border-white/20 flex items-center justify-center text-text-muted text-xs">
          Empty
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

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const initDeck = () => {
    if (isFixture) {
      if (loading || data.length === 0) return;
      const deck = deckFromTsv(PRACTICE_DECK_TSV, data);
      const expanded = expandDeck(deck);
      dispatch({ type: 'reset', cards: createCardInstances(shuffleArray(expanded)) });
      setFocusedCardId(null);
      return;
    }

    try {
      const raw = localStorage.getItem('currentDeck');
      if (!raw) return;
      const deck: Deck = JSON.parse(raw);
      const expanded = expandDeck(deck);
      dispatch({ type: 'reset', cards: createCardInstances(shuffleArray(expanded)) });
      setFocusedCardId(null);
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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over?.id === DISCARD_DROPPABLE_ID) {
      dispatch({ type: 'move', id: String(active.id), to: 'discard' });
    }
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
      <div data-testid="practice-game-layer" className="fixed inset-0 bg-gradient-page font-body text-text-primary flex flex-col">
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
          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
            <div className="flex flex-col flex-1 p-4">
              {/* Future game elements go here */}

              {/* Draw Pile + Hand + Discard anchored to the bottom, offset partially below the viewport */}
              <div className="mt-auto flex flex-row items-end gap-6" style={{ transform: 'translateY(30%)' }}>
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
                {hand.length > 0 && (
                  <div className="flex flex-col gap-2 flex-1">
                    <div className="relative flex" style={{ minHeight: '90px' }}>
                      {hand.map((instance, idx) => {
                        const isFocused = focusedCardId === instance.id;
                        const fanOffset = Math.min(44, Math.floor(320 / Math.max(hand.length, 1)));
                        return (
                          <DraggableHandCard
                            key={instance.id}
                            instance={instance}
                            left={idx * fanOffset}
                            zIndex={isFocused ? 100 : idx + 1}
                            onClick={() => setFocusedCardId(instance.id)}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Discard */}
                <div className="flex items-start gap-4">
                  <DiscardPile topCard={discard[discard.length - 1]} count={discard.length} />
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
