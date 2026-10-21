'use client';

// The row of the attempting personnel (#1165), in the attempt layout (`AttemptLayout.tsx`): at a
// planet mission the away team, in place of the away team badge, and at a space mission the crew
// of the attempting ship, beside the ships. It shows every card of the place, the equipment too, in
// its stored order, as the art crops of table cards with the personnel format of #1176, side by
// side with no overlap, in as many rows as they need (#1205, `attemptPersonnelGrid`, `tableScale.ts`).
// The area shows the whole rows that fit, and scrolls to the rest; the buttons stay below it, out of
// the scroll. The row has no rules of its own: it reads the live away team or crew, and the numbers
// of the attempt stay frozen (#1163).
//
// While the area scrolls it carries `PANEL_SCROLLS_ATTRIBUTE` and its cards `touch-action: pan-y`,
// as a scrolling card list panel does (#788, `panelScrollSensor.ts`): a touch whose first move is
// mostly up or down scrolls the area, and one mostly sideways drags the card.
//
// A card works as it does in the away team panel or the crew panel: a hold shows the preview, a tap
// selects it, and the selection gets Stop or Unstop (#681), with Stop all (#995) beside them, from
// the same rules (`stopRules.ts`). Shuffle (#1179) comes last, as in the panel's row of controls
// (#880): it shuffles the whole place, never the selection, and shows while the row holds a card. The away team is stored face down, and the row shows it face up,
// as the panel does (#964). A stopped personnel shows greyed out (#679).
//
// The row is a droppable of its own: dnd-kit keeps one registration per id, and the ship's art
// already has `crew-<id>`, so the row takes `attempt-crew-<id>` or `attempt-away-team-<i>`. A drop
// on the crew row routes as a drop on the ship's art, and a drop on the away team row as a drop on
// the mission's bottom half, which the away team badge sits in on the table (#924). The cards drag
// under their own id: while the attempt layout shows, no other element of the table draws them,
// and a panel's copies drag under `panelDraggableId`.

import { useRef } from 'react';
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
import { ATTEMPT_PERSONNEL_BUTTONS_HEIGHT, attemptPersonnelCropHeight } from './tableScale';

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
  dropId,
  landedKey,
  kind,
  label,
  cards,
  cardWidth,
  columns,
  width,
  height,
  selectedIds,
  onToggleSelect,
  onSetStopped,
  onShuffle,
}: {
  dropId: string;
  // The landed key of a move into the place (`landedZoneKey.ts`), so the row plays the landed cue.
  landedKey: string;
  // The target the row's routing mirrors, for the highlight: the mission card or the ship's art.
  kind: 'mission' | 'ship';
  // The name of the place, for the empty row and the screen reader.
  label: string;
  cards: CardInstance[];
  // The width of one crop, the crops of a row, and the area's width and height (#1205).
  cardWidth: number;
  columns: number;
  width: number;
  height: number;
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onSetStopped: (ids: string[], stopped: boolean) => void;
  // Shuffles the stored order of the place the row shows.
  onShuffle: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dropId });
  const draggedType = useDraggedCardType();
  const highlight = highlightState(kind, draggedType, isOver);
  const landedNonce = useLandedNonce(landedKey);
  const { selectedPersonnel, allSelectedStopped, unstoppedPersonnel } = stopButtons(cards, selectedIds);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrolls = useScrollsVertically(scrollRef, cards.length > 0, [cards.length, cardWidth, columns, height]);
  const cardHeight = attemptPersonnelCropHeight(cardWidth);
  const buttonClassName = 'btn-primary whitespace-nowrap h-full !px-2 !py-0 text-[10px] leading-none';

  return (
    <div className="flex flex-col items-center" style={{ width, gap: SHIP_ROW_GAP }}>
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
              style={{ gridTemplateColumns: `repeat(${Math.max(1, columns)}, ${cardWidth}px)`, gap: SHIP_ROW_GAP }}
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
      <div className="flex flex-row justify-center" style={{ gap: SHIP_ROW_GAP, height: ATTEMPT_PERSONNEL_BUTTONS_HEIGHT }}>
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
      </div>
    </div>
  );
}
