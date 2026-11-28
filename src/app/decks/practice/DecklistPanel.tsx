import React from 'react';
import { DeckList } from '../../../types';
import { LAYER_CARD_PREVIEW, LAYER_MODAL, LAYER_MODAL_BACKDROP } from '../../../lib/layers';
import { useEscapeLayer } from './useEscapeLayer';
import PanelCloseButton from './PanelCloseButton';
import DeckListItem from '../../../components/DeckListItem';
import { cardImageUrl } from '../../../lib/cardImageUrl';
import { cardPileFor, DeckPile } from '../deckBuilderUtils';
import { safeModalMaxHeight, safeModalWidth } from './useSafeAreaInsets';

const PILES: { pile: DeckPile; title: string }[] = [
  { pile: 'mission', title: 'Missions' },
  { pile: 'dilemmaPile', title: 'Dilemmas' },
  { pile: 'drawDeck', title: 'Draw' },
];

type DecklistEntry = {
  key: string;
  name: string;
  originalTitle?: string;
  originalSubtitle?: string;
  count: number;
  imageSrc: string;
  unique: boolean;
};

// The deck as loaded, grouped by pile (#779), sorted by name within each pile.
export function decklistByPile(deck: DeckList): Record<DeckPile, DecklistEntry[]> {
  const result: Record<DeckPile, DecklistEntry[]> = { mission: [], dilemmaPile: [], drawDeck: [] };
  for (const [key, entry] of Object.entries(deck)) {
    if (!entry?.row || !(entry.count > 0)) continue;
    result[cardPileFor(entry.row)].push({
      key,
      name: entry.row.originalName ?? entry.row.name,
      originalTitle: entry.row.originalTitle,
      originalSubtitle: entry.row.originalSubtitle,
      count: entry.count,
      imageSrc: cardImageUrl(entry.row),
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
// and changes nothing; a tap outside the panel (the backdrop) or Escape closes it, the same
// convention the game menu follows.
export default function DecklistPanel({ deck, onClose }: { deck: DeckList; onClose: () => void }) {
  const byPile = decklistByPile(deck);
  useEscapeLayer(onClose);
  return (
    <>
      <button type="button" className={`fixed inset-0 ${LAYER_MODAL_BACKDROP} bg-black/40`} onClick={onClose} aria-label="Close decklist" />
      <div
        role="dialog"
        aria-label="Decklist"
        className={`fixed left-1/2 top-1/2 ${LAYER_MODAL} flex -translate-x-1/2 -translate-y-1/2 flex-col rounded-md border border-white/10 bg-bg-secondary p-3 shadow-lg`}
        style={{ maxHeight: safeModalMaxHeight(85), width: safeModalWidth('24rem') }}
      >
        {/* The X sits on a line of its own outside the scrolling list, so it never scrolls away
            (#1780). The line has no heading (#898): the dialog keeps its name through aria-label. */}
        <div className="mb-2 flex justify-end">
          <PanelCloseButton onClose={onClose} />
        </div>
        <div data-testid="decklist-scroll" className="overflow-y-auto">
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
                      originalTitle={e.originalTitle}
                      originalSubtitle={e.originalSubtitle}
                      imageSrc={e.imageSrc}
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
      </div>
    </>
  );
}
