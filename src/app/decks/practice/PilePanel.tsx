'use client';

// A mission's personnel, event, or under-the-mission pile panel (#602, #606), and, since #640,
// the core's and the brig's own panel too: a tap on a pile's badge (or,
// for the under-the-mission pile, the card-edge strip) (`MissionRow`), or a tap on any card
// already sitting in the core or the brig (`FlatCardRow`), opens this panel, listing that zone's
// cards face up regardless of their stored face (the same true-face-to-owner convention
// `CardPreview` already uses for the enlarged preview). Since #762, a panel that has a Flip button
// (below) no longer follows that convention: it draws the card back for a card whose stored
// `face` is `down`, and the art for a card whose `face` is `up`, so a Flip shows in the panel.
// `CardPreview` keeps the true-face-to-owner convention. The panels with no Flip button (the
// core, the brig, a crew, a ship row, and the draw and dilemma piles, which the player opens to
// download, #690) still list every card face up. A tap on a card opens that card's own
// full preview via `onCardClick`, reusing `findInstanceAnywhere` + the existing preview state in
// `page.tsx`. Each card is draggable out via the same `useDraggable` + `DragOverlay` mechanism
// the hand and the crew row already use. The card name stays off the panel as visible text (#674);
// it is still on the image's `alt` and the card button's `aria-label`, for a screen reader.
//
// The `'crew'` zone (#664) is opened by a tap on a ship, alongside that ship's own preview
// (#678), rather than on its own — so it can never cover the screen's right half, where the
// preview sits. Its backdrop and its box of cards both stay within the left half instead of the
// centered, up-to-90%-wide box every other zone uses, so the two never overlap; that gives it
// about the size the core's or the brig's own panel reaches once it holds enough cards to wrap
// past one row.
//
// Follows the same `hidden` convention as `CardPreview`'s crew row: the panel stays mounted (not
// unmounted) for the rest of a drag that started from a card inside it, so a touch drag begun
// there survives the panel closing (the #611 WebKit hazard: an element removed from the document
// mid-touch-drag stops receiving further touch events). `page.tsx`'s existing "any drag closing
// clears the open preview" logic (`handleDragEnd`) extends to close this panel too.
//
// Each card also carries a small select checkbox (#677), a sibling of the card's own draggable
// button rather than nested inside it — the same "control and drop/drag target sit side by
// side, not nested" pattern `PileBadge`/`ShipCrewBadge` (`MissionRow.tsx`) already use, since a
// `<button>` cannot nest inside another `<button>`. A tap on the checkbox toggles that card in
// or out of `selectedIds`, owned by `page.tsx` (not this component), so a drag started from a
// selected card can pick up the whole selection in `handleDragStart`. A tap on the card itself
// still opens its preview, unaffected by selection.
//
// A Shuffle button (#680) sits in every panel, as the first item in the box, next to the cards
// rather than on the backdrop — a tap on the backdrop still just closes the panel. `onShuffle`
// dispatches the `shuffle` table action for whichever zone this panel is currently open for
// (`page.tsx` picks the right `location` per call site); the reducer puts that zone's cards in a
// random order in the table state itself, so the panel, the table, and the next time the panel
// opens all agree on the new order. A tap on Shuffle does not close the panel.
// A "Stop"/"Unstop" button (#681) shows above the card grid whenever the selection holds one or
// more personnel cards; a selection with no personnel card at all shows no button, and a
// non-personnel card in the selection just never changes. The label reads "Stop" once any
// selected personnel card is not yet stopped, and "Unstop" only once every one of them already
// is — a tap then sets every selected personnel card's `stopped` flag to that single value in
// one `onSetStopped` call (owned by `page.tsx`, like the selection itself), never a per-card
// toggle, so a mixed selection cannot go out of step with itself. The selection stays after the
// tap, so the player can still drag the same cards next.
// A "Flip" button (#762) sits beside it, in the panels whose cards the preview can flip: a
// mission's personnel, event, and under-the-mission piles, and the dilemma stack. `page.tsx`
// passes `onFlip` only for those zones, the same way it gives `CardPreview` an `onFlip`. It shows
// once the selection holds one or more of this panel's cards, and a tap dispatches the existing
// `flip` action once per selected card, so each card turns over on its own: a mixed selection
// stays mixed, inverted. The selection stays after the tap, as with Stop.

import { useEffect, useRef, useState } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { CardInstance, MissionPileName } from './tableReducer';
import { TABLE_CARD_WIDTH, TABLE_CARD_ART_HEIGHT, STOPPED_IMAGE_CLASSNAME } from './TableCard';
import { offsetFor } from './overlapOffset';

// A plain inline icon (not react-icons, the same reasoning `MissionRow.tsx`'s small badge icons
// document): every test that renders this page mocks `react-icons/fa` with an explicit list of
// the icons `page.tsx` itself imports, so a new react-icons import here would need every one of
// those mocks updated too, for a component this small.
export function ShuffleIcon() {
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
      <polyline points="16 3 21 3 21 8" />
      <line x1="4" y1="20" x2="21" y2="3" />
      <polyline points="21 16 21 21 16 21" />
      <line x1="15" y1="15" x2="21" y2="21" />
      <line x1="4" y1="4" x2="9" y2="9" />
    </svg>
  );
}

// A mission pile is one of `MissionPileName`; the core and the brig (#640) are two more flat
// zones this same panel now lists, alongside a mission's piles. A ship's crew (#664) is a third:
// like the core and the brig, it is not addressed by mission index, so it is named the same way,
// by its own zone string rather than a `MissionPileName`. The draw pile and the dilemma pile
// (#690) are a fourth and fifth: opening this panel for either one lets the player download from
// it — the game's term for a look through every card without drawing — while the rest of the pile
// stays exactly where it was, in its existing order. The player normally shuffles afterwards,
// with the panel's own Shuffle button, because the download showed them the whole pile.
// A mission's own ship row (#713) is a sixth: once it holds more ships than fit without overlap,
// a tap on any of them opens this panel listing every ship on that row individually, the same
// way the core and the brig already list their own cards. The dilemma stack (#733) is a seventh;
// #630 gives it the tap target on the table that opens this panel.
export type PanelZone =
  | MissionPileName
  | 'core'
  | 'brig'
  | 'crew'
  | 'pile'
  | 'dilemmaPile'
  | 'dilemmaStack'
  | 'shipRow';

const PANEL_LABEL: Record<PanelZone, string> = {
  personnel: 'Personnel',
  event: 'Event',
  underMission: 'Under the mission',
  core: 'Core',
  brig: 'Brig',
  crew: 'Crew',
  pile: 'Draw pile',
  dilemmaPile: 'Dilemma pile',
  dilemmaStack: 'Dilemma stack',
  shipRow: 'Ships',
};

// The core, the brig, a ship's crew (#664), the draw pile, the dilemma pile (#690), the dilemma
// stack (#733), and a mission's own ship row (#713) already say "pile" or "stack" (or need no
// such word at all) in their own label, so their close button's label does not repeat it; a mission pile's label keeps the
// trailing "pile", unchanged from before #640.
const closeLabel = (zone: PanelZone): string =>
  zone === 'core' ||
  zone === 'brig' ||
  zone === 'crew' ||
  zone === 'pile' ||
  zone === 'dilemmaPile' ||
  zone === 'dilemmaStack' ||
  zone === 'shipRow'
    ? `Close ${PANEL_LABEL[zone].toLowerCase()}`
    : `Close ${PANEL_LABEL[zone].toLowerCase()} pile`;

function PilePanelCard({
  instance,
  onClick,
  selected,
  onToggleSelect,
  cardWidth,
  cardArtHeight,
  reorderable = false,
  showBackWhenFaceDown = false,
}: {
  instance: CardInstance;
  onClick: () => void;
  selected: boolean;
  onToggleSelect: () => void;
  cardWidth: number;
  cardArtHeight: number;
  // The dilemma stack's own popup only (#632): registers this card's own instance id as a drop
  // target too, alongside the draggable identity every card already has, so a drop that lands on
  // top of this card resolves to something (`handleDragEnd` in `page.tsx` then reads it as "move
  // this stack card next to that one" rather than a move out of the zone). Every other `PilePanel`
  // zone leaves this card a plain, non-droppable `useDraggable`, unchanged.
  reorderable?: boolean;
  // A panel with a Flip button (#762) draws a face-down card as the card back.
  showBackWhenFaceDown?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: instance.id });
  const { setNodeRef: setDropRef } = useDroppable({ id: instance.id, disabled: !reorderable });
  const { card } = instance;
  const showBack = showBackWhenFaceDown && instance.face === 'down';

  return (
    <div
      ref={reorderable ? setDropRef : undefined}
      data-zone={reorderable ? instance.id : undefined}
      className="relative"
      style={{ width: cardWidth }}
    >
      <button
        ref={setNodeRef}
        type="button"
        data-card-id={instance.id}
        onClick={onClick}
        {...attributes}
        {...listeners}
        className={`flex flex-col items-center gap-0.5 focus:outline-none touch-none w-full rounded-md ${
          selected ? 'ring-2 ring-accent' : ''
        }`}
        style={{
          transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
          opacity: isDragging ? 0.5 : 1,
        }}
        aria-label={card.name}
      >
        <div className="relative w-full" style={{ height: cardArtHeight }}>
          <div className="w-full h-full rounded-md overflow-hidden bg-black/20">
            <img
              src={showBack ? '/cardimages/cardback.jpg' : `/cardimages/${card.imagefile}.jpg`}
              alt={card.name}
              className={`w-full h-full object-cover object-top ${instance.stopped ? STOPPED_IMAGE_CLASSNAME : ''}`}
            />
          </div>
        </div>
      </button>
      <button
        type="button"
        onClick={onToggleSelect}
        aria-pressed={selected}
        aria-label={selected ? `Deselect ${card.name}` : `Select ${card.name}`}
        className={`absolute top-0.5 right-0.5 w-4 h-4 rounded border flex items-center justify-center text-[9px] leading-none focus:outline-none ${
          selected ? 'bg-accent border-accent text-white' : 'bg-black/50 border-white/50 text-transparent'
        }`}
      >
        ✓
      </button>
    </div>
  );
}

export default function PilePanel({
  zone,
  cards,
  onClose,
  onCardClick,
  selectedIds,
  onToggleSelect,
  onShuffle,
  onSetStopped,
  onFlip,
  hidden = false,
  cardWidth = TABLE_CARD_WIDTH,
  cardArtHeight = TABLE_CARD_ART_HEIGHT,
}: {
  zone: PanelZone;
  cards: CardInstance[];
  onClose: () => void;
  onCardClick: (id: string) => void;
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onShuffle: () => void;
  // Sets `stopped` to one explicit value on a list of ids (#681): the same reducer action
  // `page.tsx`'s single-card preview button uses, so the "Stop"/"Unstop" button below shares it
  // rather than toggling each selected card on its own.
  onSetStopped: (ids: string[], stopped: boolean) => void;
  // Turns each id over on its own (#762). Given only for the zones whose cards can be flipped;
  // its presence is what shows the "Flip" button and draws face-down cards as the card back.
  onFlip?: (ids: string[]) => void;
  hidden?: boolean;
  // Issue #717: this panel is one of "the modals" the issue names, so its own card grid grows
  // the same way the table's mission cards do — `page.tsx` computes both from the same `scale`
  // (`tableScale.ts`) and passes the result down here. Defaults to the fixed base size for
  // callers, including this component's own tests, that don't care about the grown state.
  cardWidth?: number;
  cardArtHeight?: number;
}) {
  // The crew zone opens alongside the ship's own preview, anchored to the right (#678): its
  // backdrop and its box of cards both stay within the left half of the screen so neither ever
  // sits under the preview. Every other zone keeps the centered, up-to-90%-wide layout it always
  // had.
  const isCrew = zone === 'crew';
  // The dilemma stack's own popup only (#632): a wrapped, multi-per-row grid — every other
  // `PilePanel` zone's layout — has no single top or bottom once it wraps past one row, so this
  // one zone instead lays its cards out in a single ordered row, left-to-right mapped to
  // first-revealed-to-last-revealed (#630/#733's index-0-is-first-revealed convention), with a
  // label at each end saying so. A single column of cards (this popup's original #632 layout)
  // overflows a short, wide viewport (568x320) after only two or three cards, clipping the rest
  // below the panel's own `max-h` cap — the clipped card is still in the DOM, at a real but
  // off-screen position, so a tap there hits whatever paints underneath instead (the panel's own
  // backdrop, closing it) rather than picking the card up. A row, like the open hand's own fan
  // (`CardHand.tsx`, `offsetFor` in `overlapOffset.ts`), instead overlaps the cards' edges to fit
  // many of them into the same bounded width every other bottom-row zone already fits into, so
  // every card stays reachable at that viewport. Each card also becomes a drop target of its own
  // (`reorderable` on `PilePanelCard`), so a drop on top of a neighbour reorders the stack instead
  // of leaving the zone.
  const isDilemmaStack = zone === 'dilemmaStack';
  // The overlap offset for the stack's row (#632's browser-check follow-up). The budget is the
  // row's own measured width, not a card-count guess: a guess of six cards still let the sixth
  // card fall outside the panel at 568 x 320, where the panel measures 511 px and the two end
  // labels take their own share of it. A card outside the panel is clipped, and a tap there hits
  // whatever paints underneath, so the player cannot pick that card up — the same defect the
  // single column had, turned on its side. `rowWidth` comes from the row element itself, which
  // CSS sizes (`w-full` inside the stack's own `w-[86vw]` grid), so every card always sits
  // inside the panel, however many the stack holds. `maxOffset` is `cardWidth` itself: never
  // space the cards out further than their own width, only ever pull them closer together.
  // jsdom reports 0 for every measurement and stubs `ResizeObserver` out, so the fallback keeps
  // the cards edge to edge there, which is what the Jest tests read.
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [rowWidth, setRowWidth] = useState(0);
  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const measure = () => setRowWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [isDilemmaStack]);
  const stackRowMaxWidth = rowWidth > 0 ? rowWidth : cardWidth * Math.max(cards.length, 1);
  const stackOffset = isDilemmaStack ? offsetFor(cards.length, cardWidth, stackRowMaxWidth, cardWidth) : 0;
  const backdropClassName = isCrew ? 'absolute inset-y-0 left-0 right-1/2' : 'absolute inset-0';
  // Positioning only; the visible card grid itself is `gridClassName` below, now a sibling of
  // the "Stop"/"Unstop" button rather than carrying that button's own styling.
  const layoutClassName = isCrew
    ? 'absolute left-4 right-[calc(50%+0.5rem)] top-8 flex flex-col items-start gap-2'
    : 'absolute left-1/2 top-8 -translate-x-1/2 flex flex-col items-center gap-2 max-w-[90%]';
  // #720: a pile with many cards used to grow this box past the bottom of the screen, with no
  // way to scroll down to the cards that fell off. `max-h` caps the grid's own height to the
  // viewport (leaving room above for `top-8` plus the Stop/Shuffle buttons that sit above the
  // grid as its siblings, and some room below so the box doesn't touch the screen's edge), and
  // `overflow-y-auto` scrolls the cards inside it once they no longer fit. The buttons above stay
  // outside this scrolling element, so they never scroll out of view with the cards. `dvh`, not
  // `vh`, so a phone's address bar showing or hiding doesn't leave the cap wrong either way.
  const gridClassName = isCrew
    ? 'flex flex-wrap items-start justify-start gap-2 rounded-lg bg-black/70 p-2 max-h-[calc(100dvh-8rem)] overflow-y-auto overscroll-contain'
    : isDilemmaStack
    ? 'flex flex-col items-stretch gap-1 rounded-lg bg-black/70 p-2 w-[86vw] overflow-hidden'
    : 'flex flex-wrap items-start justify-center gap-2 rounded-lg bg-black/70 p-2 max-h-[calc(100dvh-8rem)] overflow-y-auto overscroll-contain';
  // The two end labels sit on their own line above the cards, not at the two ends of the card
  // row: a label in the row takes width from the cards, and the row must keep all of its width
  // for them (see `stackRowMaxWidth` above). The line reads left to right, the same order the
  // cards below it do.
  const stackEndLabelClassName = 'shrink-0 text-[10px] font-bold uppercase tracking-wide text-text-secondary';

  const selectedPersonnel = cards.filter(
    (instance) => selectedIds.includes(instance.id) && instance.card.type === 'personnel'
  );
  const showStopButton = selectedPersonnel.length > 0;
  const allSelectedStopped = showStopButton && selectedPersonnel.every((instance) => instance.stopped);
  const handleStopTap = () => onSetStopped(selectedPersonnel.map((instance) => instance.id), !allSelectedStopped);
  const selectedInPanel = cards.filter((instance) => selectedIds.includes(instance.id));
  const showFlipButton = onFlip !== undefined && selectedInPanel.length > 0;
  const handleFlipTap = () => onFlip?.(selectedInPanel.map((instance) => instance.id));

  return (
    <div
      className="fixed inset-0 z-[150]"
      style={{ visibility: hidden ? 'hidden' : 'visible', pointerEvents: hidden ? 'none' : undefined }}
    >
      <button
        type="button"
        className={`${backdropClassName} bg-black/40`}
        onClick={onClose}
        aria-label={closeLabel(zone)}
      />
      <div className={layoutClassName}>
        {(showStopButton || showFlipButton) && (
          <div className="flex flex-row items-center gap-2">
            {showStopButton && (
              <button type="button" onClick={handleStopTap} className="btn-primary">
                {allSelectedStopped ? 'Unstop' : 'Stop'}
              </button>
            )}
            {showFlipButton && (
              <button type="button" onClick={handleFlipTap} className="btn-primary">
                Flip
              </button>
            )}
          </div>
        )}
        {/* The Shuffle button (#680) sits inside the panel, next to the cards, not on the
            backdrop — a tap on the backdrop still closes the panel, and a tap here does not.
            It is a sibling of the card grid, the same place the "Stop"/"Unstop" button (#681)
            sits, so both panel controls stack above the cards. */}
        <button
          type="button"
          onClick={onShuffle}
          className="flex items-center justify-center gap-1 rounded-md bg-white/[0.05] border border-white/10 px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-white/[0.1] transition-colors duration-150"
        >
          <ShuffleIcon />
          Shuffle
        </button>
        <div data-zone={`pile-panel-${zone}`} className={gridClassName}>
          {isDilemmaStack && (
            <div className="flex flex-row justify-between">
              <span className={stackEndLabelClassName}>Top (revealed first)</span>
              <span className={stackEndLabelClassName}>Bottom (revealed last)</span>
            </div>
          )}
          {isDilemmaStack ? (
            // A relatively-positioned row, each card placed by its own `left`/`zIndex` (the same
            // pattern `FlatCardRow.tsx` already uses for the core/the brig) rather than a plain
            // `flex` row, since the cards must overlap (`stackOffset` above) rather than just sit
            // side by side. `zIndex` rises left to right, so a later (further down the stack)
            // card's edge sits on top of the one before it, the same reading order the labels at
            // each end already describe.
            <div ref={rowRef} className="relative w-full" style={{ height: cardArtHeight }}>
              {cards.map((instance, idx) => (
                <div key={instance.id} className="absolute top-0" style={{ left: idx * stackOffset, zIndex: idx + 1 }}>
                  <PilePanelCard
                    instance={instance}
                    onClick={() => onCardClick(instance.id)}
                    selected={selectedIds.includes(instance.id)}
                    onToggleSelect={() => onToggleSelect(instance.id)}
                    cardWidth={cardWidth}
                    cardArtHeight={cardArtHeight}
                    reorderable
                    showBackWhenFaceDown={onFlip !== undefined}
                  />
                </div>
              ))}
            </div>
          ) : (
            cards.map((instance) => (
              <PilePanelCard
                key={instance.id}
                instance={instance}
                onClick={() => onCardClick(instance.id)}
                selected={selectedIds.includes(instance.id)}
                onToggleSelect={() => onToggleSelect(instance.id)}
                cardWidth={cardWidth}
                cardArtHeight={cardArtHeight}
                showBackWhenFaceDown={onFlip !== undefined}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
