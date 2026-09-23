'use client';

// A mission's personnel, event, dilemma stack, or under-the-mission pile panel (#602, #605,
// #606), and, since #640, the core's and the brig's own panel too: a tap on a pile's badge (or,
// for the under-the-mission pile, the card-edge strip) (`MissionRow`), or a tap on any card
// already sitting in the core or the brig (`FlatCardRow`), opens this panel, listing that zone's
// cards face up regardless of their stored face (the same true-face-to-owner convention
// `CardPreview` already uses for the enlarged preview). A tap on a card opens that card's own
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

import { useDraggable } from '@dnd-kit/core';
import { CardInstance, MissionPileName } from './tableReducer';
import { TABLE_CARD_WIDTH, TABLE_CARD_ART_HEIGHT, STOPPED_IMAGE_CLASSNAME } from './TableCard';

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
// way the core and the brig already list their own cards.
export type PanelZone = MissionPileName | 'core' | 'brig' | 'crew' | 'pile' | 'dilemmaPile' | 'shipRow';

const PANEL_LABEL: Record<PanelZone, string> = {
  personnel: 'Personnel',
  event: 'Event',
  dilemma: 'Dilemma',
  underMission: 'Under the mission',
  core: 'Core',
  brig: 'Brig',
  crew: 'Crew',
  pile: 'Draw pile',
  dilemmaPile: 'Dilemma pile',
  shipRow: 'Ships',
};

// The core, the brig, a ship's crew (#664), the draw pile, the dilemma pile (#690), and a
// mission's own ship row (#713) already say "pile" (or need no such word at all) in their own
// label, so their close button's label does not repeat it; a mission pile's label keeps the
// trailing "pile", unchanged from before #640.
const closeLabel = (zone: PanelZone): string =>
  zone === 'core' ||
  zone === 'brig' ||
  zone === 'crew' ||
  zone === 'pile' ||
  zone === 'dilemmaPile' ||
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
}: {
  instance: CardInstance;
  onClick: () => void;
  selected: boolean;
  onToggleSelect: () => void;
  cardWidth: number;
  cardArtHeight: number;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: instance.id });
  const { card } = instance;

  return (
    <div className="relative" style={{ width: cardWidth }}>
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
              src={`/cardimages/${card.imagefile}.jpg`}
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
    : 'flex flex-wrap items-start justify-center gap-2 rounded-lg bg-black/70 p-2 max-h-[calc(100dvh-8rem)] overflow-y-auto overscroll-contain';

  const selectedPersonnel = cards.filter(
    (instance) => selectedIds.includes(instance.id) && instance.card.type === 'personnel'
  );
  const showStopButton = selectedPersonnel.length > 0;
  const allSelectedStopped = showStopButton && selectedPersonnel.every((instance) => instance.stopped);
  const handleStopTap = () => onSetStopped(selectedPersonnel.map((instance) => instance.id), !allSelectedStopped);

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
        {showStopButton && (
          <button type="button" onClick={handleStopTap} className="btn-primary">
            {allSelectedStopped ? 'Unstop' : 'Stop'}
          </button>
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
          {cards.map((instance) => (
            <PilePanelCard
              key={instance.id}
              instance={instance}
              onClick={() => onCardClick(instance.id)}
              selected={selectedIds.includes(instance.id)}
              onToggleSelect={() => onToggleSelect(instance.id)}
              cardWidth={cardWidth}
              cardArtHeight={cardArtHeight}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
