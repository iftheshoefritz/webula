import React from 'react';
import { DeckList } from '../../../types';
import { LAYER_CARD_PREVIEW, LAYER_MODAL, LAYER_MODAL_BACKDROP } from '../../../lib/layers';
import DeckListItem from '../../../components/DeckListItem';
import { cardPileFor, DeckPile } from '../deckBuilderUtils';

const PILES: { pile: DeckPile; title: string }[] = [
  { pile: 'mission', title: 'Missions' },
  { pile: 'dilemmaPile', title: 'Dilemmas' },
  { pile: 'drawDeck', title: 'Draw' },
];

type DecklistEntry = { key: string; name: string; count: number; imagefile: string; unique: boolean };

// The deck as loaded, grouped by pile (#779), sorted by name within each pile.
export function decklistByPile(deck: DeckList): Record<DeckPile, DecklistEntry[]> {
  const result: Record<DeckPile, DecklistEntry[]> = { mission: [], dilemmaPile: [], drawDeck: [] };
  for (const [key, entry] of Object.entries(deck)) {
    if (!entry?.row || !(entry.count > 0)) continue;
    result[cardPileFor(entry.row)].push({
      key,
      name: entry.row.originalName ?? entry.row.name,
      count: entry.count,
      imagefile: entry.row.imagefile,
      unique: entry.row.unique === 'y',
    });
  }
  for (const pile of Object.keys(result) as DeckPile[]) {
    result[pile].sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }
  return result;
}

// A read-only list of every card of the loaded deck (#779), opened from the game menu. It shows
// the deck as loaded, not where each card is now. Each row is the deck builder's `DeckListItem`
// without its plus and minus buttons (#899), so a hover or a tap on a name shows the card image
// and changes nothing; a tap outside the panel (the backdrop) closes it, the same convention the
// game menu follows.
export default function DecklistPanel({ deck, onClose }: { deck: DeckList; onClose: () => void }) {
  const byPile = decklistByPile(deck);
  return (
    <>
      <button type="button" className={`fixed inset-0 ${LAYER_MODAL_BACKDROP} bg-black/40`} onClick={onClose} aria-label="Close decklist" />
      <div
        role="dialog"
        aria-label="Decklist"
        className={`fixed left-1/2 top-1/2 ${LAYER_MODAL} max-h-[85vh] w-[min(24rem,90vw)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-md border border-white/10 bg-bg-secondary p-3 shadow-lg`}
      >
        {PILES.map(({ pile, title }) => {
          const entries = byPile[pile];
          const total = entries.reduce((sum, e) => sum + e.count, 0);
          return (
            <section key={pile} data-testid={`decklist-${pile}`} className="mb-3 last:mb-0">
              <h3 className="text-xs uppercase tracking-wide text-text-muted">
                {title} ({total})
              </h3>
              {entries.length === 0 ? (
                <p className="py-1 text-sm text-text-muted">None</p>
              ) : (
                <ul className="divide-y divide-solid divide-white/[0.06]">
                  {entries.map((e) => (
                    <DeckListItem
                      key={e.key}
                      collectorsinfo={e.key}
                      count={e.count}
                      name={e.name}
                      imagefile={e.imagefile}
                      unique={e.unique}
                      previewLayer={LAYER_CARD_PREVIEW}
                    />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
