'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Tooltip } from 'react-tooltip';
import { FaArrowLeft, FaRedo, FaLayerGroup } from 'react-icons/fa';
import { expandDeck, shuffleArray } from '../deckBuilderUtils';
import { Deck } from '../../../types';

const INITIAL_HAND_SIZE = 7;

export default function PracticeDrawPage() {
  const [pile, setPile] = useState<any[]>([]);
  const [hand, setHand] = useState<any[]>([]);
  const [focusedCard, setFocusedCard] = useState<number | null>(null);

  const initDeck = () => {
    try {
      const raw = localStorage.getItem('currentDeck');
      if (!raw) return;
      const deck: Deck = JSON.parse(raw);
      const expanded = expandDeck(deck);
      const shuffled = shuffleArray(expanded);
      setPile(shuffled);
      setHand([]);
      setFocusedCard(null);
    } catch {
      // silently ignore parse errors
    }
  };

  useEffect(() => {
    initDeck();
  }, []);

  const drawOne = () => {
    if (pile.length === 0) return;
    const [top, ...rest] = pile;
    setPile(rest);
    setHand((prev) => [...prev, top]);
  };

  const drawToSeven = () => {
    if (pile.length === 0) return;
    const needed = Math.max(0, INITIAL_HAND_SIZE - hand.length);
    const drawn = pile.slice(0, needed);
    setPile(pile.slice(needed));
    setHand((prev) => [...prev, ...drawn]);
  };

  const reset = () => {
    initDeck();
  };

  const isEmpty = pile.length === 0 && hand.length === 0;

  return (
    <div className="min-h-screen bg-gradient-page font-body text-text-primary flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-[#131713]">
        <Link href="/decks" className="flex items-center gap-2 text-text-muted hover:text-text-primary transition-colors text-sm">
          <FaArrowLeft />
          Back to Deck Builder
        </Link>
        <span className="text-lg font-display font-medium text-text-primary">Practice Draw</span>
        <div className="w-24" />
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06]">
        <Tooltip id="practice-tooltip" />
        <button
          className="btn-icon"
          onClick={drawToSeven}
          disabled={pile.length === 0 || hand.length >= INITIAL_HAND_SIZE}
          data-tooltip-id="practice-tooltip"
          data-tooltip-content="Draw cards until you have 7 in hand"
        >
          Draw to 7
        </button>
        <button
          className="btn-icon"
          onClick={reset}
          data-tooltip-id="practice-tooltip"
          data-tooltip-content="Shuffle all cards back and start over"
        >
          <FaRedo />
        </button>
      </div>

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
        <div className="flex flex-col flex-1 p-4">
          {/* Future game elements go here */}

          {/* Draw Pile + Hand anchored to the bottom */}
          <div className="mt-auto flex flex-col gap-6">
            {/* Pile */}
            <div className="flex items-start gap-4">
              <div className="flex flex-col items-center gap-1">
                <span className="text-sm text-text-muted font-medium">Draw Pile</span>
                <button
                  onClick={drawOne}
                  disabled={pile.length === 0}
                  className="relative focus:outline-none group disabled:opacity-50 disabled:cursor-not-allowed"
                  data-tooltip-id="practice-tooltip"
                  data-tooltip-content={pile.length > 0 ? `${pile.length} card${pile.length !== 1 ? 's' : ''} remaining — click to draw` : 'Pile is empty'}
                >
                  {pile.length > 0 ? (
                    <>
                      <div className="w-28 h-[154px] rounded-lg overflow-hidden shadow-lg group-hover:shadow-accent/30 transition-shadow">
                        <img
                          src="/cardimages/cardback.jpg"
                          alt="Face-down draw pile"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <span className="absolute -top-2 -right-2 bg-accent text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center shadow">
                        {pile.length}
                      </span>
                    </>
                  ) : (
                    <div className="w-28 h-40 rounded-lg border-2 border-dashed border-white/20 flex items-center justify-center text-text-muted text-xs">
                      Empty
                    </div>
                  )}
                </button>
              </div>
            </div>

            {/* Hand */}
            {hand.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="text-sm text-text-muted font-medium">Hand ({hand.length})</span>
                <div className="relative flex" style={{ minHeight: '180px' }}>
                  {hand.map((card, idx) => {
                    const isFocused = focusedCard === idx;
                    const fanOffset = Math.min(44, Math.floor(320 / Math.max(hand.length, 1)));
                    return (
                      <button
                        key={`${card.collectorsinfo}-${idx}`}
                        className="absolute focus:outline-none transition-transform duration-150"
                        style={{
                          left: idx * fanOffset,
                          zIndex: isFocused ? 100 : idx + 1,
                          transform: isFocused ? 'translateY(-32px) scale(1.08)' : 'none',
                        }}
                        onMouseEnter={() => setFocusedCard(idx)}
                        onMouseLeave={() => setFocusedCard(null)}
                        onFocus={() => setFocusedCard(idx)}
                        onBlur={() => setFocusedCard(null)}
                        aria-label={card.name}
                        data-tooltip-id="practice-tooltip"
                        data-tooltip-content={card.name}
                      >
                        <div className="w-28 h-[154px] rounded-lg overflow-hidden shadow-md">
                          <img
                            src={`/cardimages/${card.imagefile}.jpg`}
                            alt={card.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
