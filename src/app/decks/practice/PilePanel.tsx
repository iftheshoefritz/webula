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

// A mission pile is one of `MissionPileName`; the core and the brig (#640) are two more flat
// zones this same panel now lists, alongside a mission's piles. A ship's crew (#664) is a third:
// like the core and the brig, it is not addressed by mission index, so it is named the same way,
// by its own zone string rather than a `MissionPileName`.
export type PanelZone = MissionPileName | 'core' | 'brig' | 'crew';

const PANEL_LABEL: Record<PanelZone, string> = {
  personnel: 'Personnel',
  event: 'Event',
  dilemma: 'Dilemma',
  underMission: 'Under the mission',
  core: 'Core',
  brig: 'Brig',
  crew: 'Crew',
};

// The core, the brig, and a ship's crew (#664) are not "piles" the way a mission's
// personnel/event/dilemma piles are, so their close button's label drops that word; a mission
// pile's label keeps it, unchanged from before #640.
const closeLabel = (zone: PanelZone): string =>
  zone === 'core' || zone === 'brig' || zone === 'crew'
    ? `Close ${PANEL_LABEL[zone].toLowerCase()}`
    : `Close ${PANEL_LABEL[zone].toLowerCase()} pile`;

function PilePanelCard({
  instance,
  onClick,
  selected,
  onToggleSelect,
}: {
  instance: CardInstance;
  onClick: () => void;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: instance.id });
  const { card } = instance;

  return (
    <div className="relative" style={{ width: TABLE_CARD_WIDTH }}>
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
        <div className="relative w-full" style={{ height: TABLE_CARD_ART_HEIGHT }}>
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
        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded border flex items-center justify-center text-[9px] leading-none focus:outline-none ${
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
  onSetStopped,
  hidden = false,
}: {
  zone: PanelZone;
  cards: CardInstance[];
  onClose: () => void;
  onCardClick: (id: string) => void;
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  // Sets `stopped` to one explicit value on a list of ids (#681): the same reducer action
  // `page.tsx`'s single-card preview button uses, so the "Stop"/"Unstop" button below shares it
  // rather than toggling each selected card on its own.
  onSetStopped: (ids: string[], stopped: boolean) => void;
  hidden?: boolean;
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
  const gridClassName = isCrew
    ? 'flex flex-wrap items-start justify-start gap-2 rounded-lg bg-black/70 p-2'
    : 'flex flex-wrap items-start justify-center gap-2 rounded-lg bg-black/70 p-2';

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
        <div data-zone={`pile-panel-${zone}`} className={gridClassName}>
          {cards.map((instance) => (
            <PilePanelCard
              key={instance.id}
              instance={instance}
              onClick={() => onCardClick(instance.id)}
              selected={selectedIds.includes(instance.id)}
              onToggleSelect={() => onToggleSelect(instance.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
