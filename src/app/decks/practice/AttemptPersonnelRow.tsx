'use client';

// The row of the attempting personnel (#1165), in the attempt layout (`AttemptLayout.tsx`): at a
// planet mission the away team, in place of the away team badge, and at a space mission the crew
// of the attempting ship, beside the ships. It shows every card of the place, the equipment too, in
// its stored order, as the art crops of table cards with the personnel format of #1176, side by
// side with no overlap, in as many rows as they need (#1205, `attemptPersonnelGrid`, `tableScale.ts`).
// Issue #1218: 3 to a row, as wide as the cards of the crew panel where the screen has the room, with
// the panel's 8 px gap. The area fills the height it has and shows part of the second row, and
// scrolls to the rest. The buttons sit above it, as in the crew panel, out of the scroll: in the
// band above the facing body, level with the slivers above the mission, so the first row of cards
// is level with the mission and the stack (#1376), or, where that band is too short for them,
// above the area in its column. The row has no rules of its own: it reads the live away team or crew, and the numbers
// of the attempt stay frozen (#1163).
//
// While the area scrolls it carries `PANEL_SCROLLS_ATTRIBUTE` and its cards `touch-action: pan-y`,
// as a scrolling card list panel does (#788, `panelScrollSensor.ts`): a touch whose first move is
// mostly up or down scrolls the area, and one mostly sideways drags the card. A press held until
// its preview fires drags the card in any direction, up to the strip too, and never scrolls (#1367).
//
// A card works as it does in the away team panel or the crew panel: a hold shows the preview, a tap
// selects it, and the selection gets Stop or Unstop (#681), with Stop all (#995) beside them, from
// the same rules (`stopRules.ts`). Shuffle (#1179) comes last, as in the panel's row of controls
// (#880): it shuffles the whole place, never the selection, and shows while the row holds a card.
// Move to… (#1341) shows while a card of the row is selected, the equipment too, and opens a list of
// the places the selection can go (`attemptMoveDestinations`), above the table with a backdrop, in a portal, so it
// adds no zone to the layout. A tap on a place moves the selection there and closes the list; a tap
// on the backdrop, Escape, or any change of the selection closes it too. The away team is stored face down, and the row shows it face up,
// as the panel does (#964). A stopped personnel shows greyed out (#679).
//
// The row is a droppable of its own: dnd-kit keeps one registration per id, and the ship's art
// already has `crew-<id>`, so the row takes `attempt-crew-<id>` or `attempt-away-team-<i>`. A drop
// on the crew row routes as a drop on the ship's art, and a drop on the away team row as a drop on
// the mission's bottom half, which the away team badge sits in on the table (#924). The cards drag
// under their own id: while the attempt layout shows, no other element of the table draws them,
// and a panel's copies drag under `panelDraggableId`.

import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDroppable } from '@dnd-kit/core';
import { CardInstance } from './tableReducer';
import TableCard from './TableCard';
import { SHIP_ROW_GAP } from './MissionRow';
import { useDraggedCardType } from './DraggedCardTypeContext';
import { highlightClassName, highlightState } from './zoneAccepts';
import { LandedRing, useLandedNonce } from './LandedZoneContext';
import { stopButtons } from './stopRules';
import { ShuffleIcon, panelScrollClassName, useScrollsVertically } from './CardListPanel';
import { PANEL_SCROLLS_ATTRIBUTE } from './panelGesture';
import type { AttemptMoveDestination } from './attempt';
import { LAYER_MODAL, LAYER_MODAL_BACKDROP } from '../../../lib/layers';
import { ATTEMPT_PERSONNEL_BUTTONS_HEIGHT, ATTEMPT_PERSONNEL_GAP, attemptPersonnelCropHeight } from './tableScale';

export const attemptAwayTeamDropId = (missionIndex: number): string => `attempt-away-team-${missionIndex}`;
export const attemptCrewDropId = (shipId: string): string => `attempt-crew-${shipId}`;

export function missionIndexFromAttemptAwayTeamDropId(id: string): number | null {
  const match = /^attempt-away-team-(\d+)$/.exec(id);
  return match ? Number(match[1]) : null;
}

export function shipIdFromAttemptCrewDropId(id: string): string | null {
  const match = /^attempt-crew-(.+)$/.exec(id);
  return match ? match[1] : null;
}

export const attemptPersonnelScrollTestId = (dropId: string): string => `${dropId}-scroll`;

export default function AttemptPersonnelRow({
  disabled = false,
  dropId,
  landedKey,
  kind,
  label,
  cards,
  cardWidth,
  columns,
  width,
  height,
  buttonsInBand = false,
  selectedIds,
  onToggleSelect,
  onSetStopped,
  onShuffle,
  moveDestinations,
  onMoveSelection,
}: {
  // The row of a parked attempt layout (#1342) takes no drop.
  disabled?: boolean;
  dropId: string;
  // The landed key of a move into the place (`landedZoneKey.ts`), so the row plays the landed cue.
  landedKey: string;
  // The target the row's routing mirrors, for the highlight: the mission card or the ship's art.
  kind: 'mission' | 'ship';
  // The name of the place, for the empty row and the screen reader.
  label: string;
  cards: CardInstance[];
  // The width of one crop, the crops of a row, and the area's width and height (#1205, #1218).
  cardWidth: number;
  columns: number;
  width: number;
  height: number;
  // The line of the buttons sits above the row's top, in the band the body keeps above its columns
  // (#1376, `attemptPersonnelButtonsInBand`), and takes no height of the column.
  buttonsInBand?: boolean;
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onSetStopped: (ids: string[], stopped: boolean) => void;
  // Shuffles the stored order of the place the row shows.
  onShuffle: () => void;
  // Move to… (#1341): the places the row's selection can go, and the move to one of them.
  moveDestinations: AttemptMoveDestination[];
  onMoveSelection: (destination: AttemptMoveDestination) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dropId, disabled });
  const draggedType = useDraggedCardType();
  const highlight = highlightState(kind, draggedType, isOver);
  const landedNonce = useLandedNonce(landedKey);
  const { selectedPersonnel, allSelectedStopped, unstoppedPersonnel } = stopButtons(cards, selectedIds);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrolls = useScrollsVertically(scrollRef, cards.length > 0, [cards.length, cardWidth, columns, height]);
  const cardHeight = attemptPersonnelCropHeight(cardWidth);
  // The list is open for one selection of the row: any change of the selection closes it.
  const selectedInRow = cards.filter((instance) => selectedIds.includes(instance.id)).map((instance) => instance.id);
  const selectionKey = selectedInRow.join(' ');
  const [moveMenuFor, setMoveMenuFor] = useState<string | null>(null);
  const moveMenuOpen = selectedInRow.length > 0 && moveMenuFor === selectionKey;
  const buttonClassName = 'btn-primary whitespace-nowrap h-full !px-2 !py-0 text-[10px] leading-none';

  return (
    <div className="relative flex flex-col items-center" style={{ width, gap: SHIP_ROW_GAP }}>
      <div
        data-testid="attempt-row-buttons"
        className={`flex flex-row justify-center ${buttonsInBand ? 'absolute inset-x-0' : ''}`}
        style={{
          gap: SHIP_ROW_GAP,
          height: ATTEMPT_PERSONNEL_BUTTONS_HEIGHT,
          ...(buttonsInBand ? { bottom: '100%' } : {}),
        }}
      >
        {selectedPersonnel.length > 0 && (
          <button
            type="button"
            data-testid="attempt-row-stop"
            onClick={() => onSetStopped(selectedPersonnel.map((instance) => instance.id), !allSelectedStopped)}
            className={buttonClassName}
          >
            {allSelectedStopped ? 'Unstop' : 'Stop'}
          </button>
        )}
        {unstoppedPersonnel.length > 0 && (
          <button
            type="button"
            data-testid="attempt-row-stop-all"
            onClick={() => onSetStopped(unstoppedPersonnel.map((instance) => instance.id), true)}
            className={buttonClassName}
          >
            Stop all
          </button>
        )}
        {cards.length > 0 && (
          <button
            type="button"
            data-testid="attempt-row-shuffle"
            onClick={onShuffle}
            className={`${buttonClassName} flex items-center justify-center gap-1`}
          >
            <ShuffleIcon />
            Shuffle
          </button>
        )}
        {selectedInRow.length > 0 && moveDestinations.length > 0 && (
          <button
            type="button"
            data-testid="attempt-row-move-to"
            aria-haspopup="menu"
            aria-expanded={moveMenuOpen}
            onClick={() => setMoveMenuFor(selectionKey)}
            className={buttonClassName}
          >
            Move to…
          </button>
        )}
      </div>
      {moveMenuOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <>
            <button
              type="button"
              className={`fixed inset-0 ${LAYER_MODAL_BACKDROP} bg-black/40`}
              onClick={() => setMoveMenuFor(null)}
              aria-label="Close the Move to list"
            />
            <div
              role="menu"
              aria-label={`Move ${selectedInRow.length} card${selectedInRow.length === 1 ? '' : 's'} to`}
              data-testid="attempt-move-to-menu"
              onKeyDown={(event) => {
                if (event.key === 'Escape') setMoveMenuFor(null);
              }}
              className={`fixed left-1/2 top-1/2 ${LAYER_MODAL} flex max-h-[90vh] w-[min(18rem,90vw)] -translate-x-1/2 -translate-y-1/2 flex-col gap-1 overflow-y-auto overscroll-contain rounded-md border border-white/10 bg-bg-secondary p-2 shadow-lg`}
            >
              <h2 className="px-1 text-xs font-semibold text-text-primary">
                Move {selectedInRow.length} card{selectedInRow.length === 1 ? '' : 's'} to
              </h2>
              {moveDestinations.map((destination) => (
                <button
                  key={destination.key}
                  type="button"
                  role="menuitem"
                  data-testid={`attempt-move-to-${destination.key}`}
                  onClick={() => {
                    setMoveMenuFor(null);
                    onMoveSelection(destination);
                  }}
                  className="rounded px-2 py-1 text-left text-xs text-text-primary hover:bg-white/10"
                >
                  {destination.label}
                </button>
              ))}
            </div>
          </>,
          document.body
        )}
      <div
        ref={setNodeRef}
        data-zone={dropId}
        data-testid={dropId}
        data-highlight={highlight}
        data-landed={landedNonce !== null || undefined}
        aria-label={`${label}, ${cards.length} card${cards.length === 1 ? '' : 's'}`}
        className={`relative flex flex-col items-center rounded ${
          cards.length === 0 ? 'border-2 border-dashed border-white/20' : ''
        } ${highlightClassName(highlight)}`}
        style={{ width, height }}
      >
        {cards.length === 0 && (
          <span className="m-auto text-center text-[10px] leading-tight text-text-muted">{label}</span>
        )}
        {cards.length > 0 && (
          <div
            ref={scrollRef}
            data-testid={attemptPersonnelScrollTestId(dropId)}
            {...{ [PANEL_SCROLLS_ATTRIBUTE]: scrolls ? 'true' : undefined }}
            className={`h-full w-full overscroll-contain ${panelScrollClassName(scrolls)}`}
          >
            <div
              className="grid justify-center"
              style={{ gridTemplateColumns: `repeat(${Math.max(1, columns)}, ${cardWidth}px)`, gap: ATTEMPT_PERSONNEL_GAP }}
            >
              {cards.map((instance) => {
                const selected = selectedIds.includes(instance.id);
                return (
                  <div key={instance.id} className="relative" style={{ width: cardWidth, height: cardHeight }}>
                    <TableCard
                      instance={instance}
                      onClick={() => onToggleSelect(instance.id)}
                      width={cardWidth}
                      artHeight={cardHeight}
                      draggable
                      showFace
                      panY={scrolls}
                    />
                    {/* Inside the card, so the scroller's edge never clips the ring. */}
                    {selected && (
                      <span className="pointer-events-none absolute inset-0 rounded-md ring-2 ring-inset ring-accent" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <LandedRing nonce={landedNonce} />
      </div>
    </div>
  );
}
