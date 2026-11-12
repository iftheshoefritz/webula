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
// the same rules (`stopRules.ts`). Stop all reads Unstop all once every personnel is stopped (#1560). Shuffle (#1179) comes last, as in the panel's row of controls
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
import { ScrollIndicator } from './ScrollIndicator';
import { PANEL_SCROLLS_ATTRIBUTE } from './panelGesture';
import type { AttemptMoveDestination } from './attempt';
import { LAYER_MODAL, LAYER_MODAL_BACKDROP } from '../../../lib/layers';
import { useEscapeLayer } from './useEscapeLayer';
import { ATTEMPT_PERSONNEL_BUTTONS_HEIGHT, ATTEMPT_PERSONNEL_GAP, attemptPersonnelCropHeight } from './tableScale';
import { safeModalMaxHeight, safeModalWidth } from './useSafeAreaInsets';

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

// The marks of the revealed dilemma's random selection on the row (#1629), as card ids.
export interface BotRowMarks {
  selected: string[];
  met: string[];
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
  bandHeight = ATTEMPT_PERSONNEL_BUTTONS_HEIGHT,
  selectedIds,
  botMarks = null,
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
  // (#1376, `attemptPersonnelButtonsInBand`), and takes no height of the column. Its top is the top
  // of the band, `bandHeight` above the row (`attemptBandHeight`), level with the top of a full
  // stack of slivers above the mission (#1543).
  buttonsInBand?: boolean;
  bandHeight?: number;
  selectedIds: string[];
  // The personnel the revealed dilemma selected at random, as the reveal kept them (#1629), and those
  // who met its check. A badge in the top-right corner, never the selection ring, which is the
  // player's choice (#1593).
  botMarks?: BotRowMarks | null;
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
  const { selectedPersonnel, allSelectedStopped, unstoppedPersonnel, stoppedPersonnel, allPersonnelStopped } =
    stopButtons(cards, selectedIds);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollDeps = [cards.length, cardWidth, columns, height];
  const scrolls = useScrollsVertically(scrollRef, cards.length > 0, scrollDeps);
  const cardHeight = attemptPersonnelCropHeight(cardWidth);
  // The list is open for one selection of the row: any change of the selection closes it.
  const selectedInRow = cards.filter((instance) => selectedIds.includes(instance.id)).map((instance) => instance.id);
  const selectionKey = selectedInRow.join(' ');
  const [moveMenuFor, setMoveMenuFor] = useState<string | null>(null);
  const moveMenuOpen = selectedInRow.length > 0 && moveMenuFor === selectionKey;
  useEscapeLayer(() => setMoveMenuFor(null), moveMenuOpen);
  const buttonClassName = 'btn-primary whitespace-nowrap h-full !px-2 !py-0 text-[10px] leading-none';

  return (
    <div className="relative flex flex-col items-center" style={{ width, gap: SHIP_ROW_GAP }}>
      <div
        data-testid="attempt-row-buttons"
        className={`flex flex-row justify-center ${buttonsInBand ? 'absolute inset-x-0' : ''}`}
        style={{
          gap: SHIP_ROW_GAP,
          height: ATTEMPT_PERSONNEL_BUTTONS_HEIGHT,
          ...(buttonsInBand ? { top: -bandHeight } : {}),
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
        {(unstoppedPersonnel.length > 0 || allPersonnelStopped) && (
          <button
            type="button"
            data-testid="attempt-row-stop-all"
            onClick={() =>
              allPersonnelStopped
                ? onSetStopped(stoppedPersonnel.map((instance) => instance.id), false)
                : onSetStopped(unstoppedPersonnel.map((instance) => instance.id), true)
            }
            className={buttonClassName}
          >
            {allPersonnelStopped ? 'Unstop all' : 'Stop all'}
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
              className={`fixed left-1/2 top-1/2 ${LAYER_MODAL} flex -translate-x-1/2 -translate-y-1/2 flex-col gap-1 overflow-y-auto overscroll-contain rounded-md border border-white/10 bg-bg-secondary p-2 shadow-lg`}
              style={{ maxHeight: safeModalMaxHeight(90), width: safeModalWidth('18rem') }}
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
                const botSelected = !!botMarks?.selected.includes(instance.id);
                const botMet = botSelected && !!botMarks?.met.includes(instance.id);
                return (
                  <div
                    key={instance.id}
                    className="relative"
                    style={{ width: cardWidth, height: cardHeight }}
                    data-bot-selected={botSelected ? 'true' : undefined}
                    data-bot-check={botMet ? 'met' : undefined}
                  >
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
                    {botSelected && (
                      <span
                        data-testid="attempt-row-bot-mark"
                        title={botMet ? 'Selected by the dilemma; meets its check' : 'Selected by the dilemma'}
                        className={`pointer-events-none absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold text-white shadow ring-1 ring-white ${
                          botMet ? 'bg-red-600' : 'bg-amber-500'
                        }`}
                      >
                        {botMet ? '!' : '?'}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {/* #1544: the droppable does not scroll, so it holds the scroll area's indicator. */}
        {cards.length > 0 && <ScrollIndicator scrollerRef={scrollRef} scrolls={scrolls} deps={scrollDeps} />}
        <LandedRing nonce={landedNonce} />
      </div>
    </div>
  );
}
