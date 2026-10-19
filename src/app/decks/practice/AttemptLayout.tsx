'use client';

// The attempt layout (#1164): while a mission attempt is in progress (#1163), the table shows this in
// place of the mission row. A strip across the top holds the status, draw/spend N, View full table
// and Attempt done. Below it, left to right: the attempted mission, larger than on the table and
// drawn whole, with everything its card does on the table (`MissionCard`); the away team badge and
// every ship on the mission's ship row; and the dilemma stack. The bottom row stays below, unchanged.
//
// Every drop target keeps the id it has on the table (`mission-on-<i>`, `mission-under-<i>`,
// `ship-row-<i>`, `crew-<id>`, `dilemmaStack`), with `<i>` the mission's own slot index, so the
// collision detection and the drop routing need no change. `PracticeTable` mounts either this or the
// mission row, never both, so each droppable is mounted once. The other missions are not mounted.
//
// The middle column holds the row of the attempting personnel (#1165, `AttemptPersonnelRow`): at a
// planet mission the away team, in place of the away team badge, above the ships; at a space
// mission the crew of the attempting ship, beside the ships, with the away team badge above them.
// At a space mission the ships sit in a column exactly as wide as the mission, 2 to a row (#1177).
// The row is a droppable of its own, `attempt-away-team-<i>` or `attempt-crew-<id>`. At a space
// mission the away team badge sits outside the reach of the mission's bottom half, so a drop on it
// lands on no droppable; a drop on the bottom half of the mission card still joins the away team.
//
// The dilemma choice (#1190, `attempt.phase === 'choose'`) draws a body of its own: the mission at
// the same scale; the dilemma stack, face up and as wide as the width allows, in the middle; and on
// the right the attempting personnel as one face-down pile with a count (`attempt-personnel-pile`),
// above the ships, one to a row. The pile is not a drop target and previews nothing; the row of the
// personnel, its buttons and its droppable are not mounted, nor is the away team badge.
//
// In the dilemma choice the strip also holds the Draw dilemma button and the count of the dilemmas
// drawn (#1191, `AttemptDrawDilemma`). The strip sits at the top, so the open dilemma hand arc,
// which rises from the bottom edge, never covers the button.

import { ReactNode } from 'react';
import CountBadge from './CountBadge';
import type { Attempt, AttemptPhase, MissionPileName, MissionSlot, ShuffleLocation } from './tableReducer';
import { drawSpend } from './drawSpend';
import {
  MISSION_COLUMN_GAP,
  MissionCard,
  PileBadge,
  PlacedOnGroup,
  DilemmaIcon,
  ShipRow,
  badgeStripHeight,
  crewDropId,
  missionPileDropId,
  underMissionStackRoom,
} from './MissionRow';
import { TABLE_CARD_WIDTH, cardBorderStyle } from './TableCard';
import { ATTEMPT_GAP, ATTEMPT_STRIP_GUTTER, ATTEMPT_STRIP_HEIGHT, AttemptSizes } from './tableScale';
import { cardDisplayName } from '../../../lib/cardCount';
import AttemptPersonnelRow, { attemptAwayTeamDropId, attemptCrewDropId } from './AttemptPersonnelRow';

export default function AttemptLayout({
  attempt,
  slot,
  sizes,
  personnelCount,
  desktop,
  dilemmaStack,
  layoutRef,
  stripRef,
  onViewFullTable,
  onEndAttempt,
  onOpenPile,
  onShipClick,
  onOpenShipRow,
  onOpenPlacedOn,
  onFlipMission,
  onSetMissionCompleted,
  selectedIds,
  onToggleSelect,
  onSetStopped,
  onShuffle,
  canDrawDilemma,
  onDrawDilemma,
  onSetPhase,
}: {
  attempt: Attempt;
  slot: MissionSlot;
  sizes: AttemptSizes;
  // The cards of the away team or of the attempting ship's crew: the count of the face-down pile
  // of the dilemma choice (#1190).
  personnelCount: number;
  desktop: boolean;
  // The dilemma stack, sized by the caller, which owns it on the normal table too.
  dilemmaStack: ReactNode;
  layoutRef: (element: HTMLDivElement | null) => void;
  stripRef: (element: HTMLDivElement | null) => void;
  onViewFullTable: () => void;
  onEndAttempt: () => void;
  onOpenPile: (missionIndex: number, pile: MissionPileName) => void;
  onShipClick: (shipId: string) => void;
  onOpenShipRow: (missionIndex: number) => void;
  onOpenPlacedOn: (targetId: string, group?: PlacedOnGroup) => void;
  onFlipMission: (missionId: string) => void;
  onSetMissionCompleted: (missionIndex: number, completed: boolean) => void;
  // The selection of the row's cards (#1165), the same one a card list panel uses.
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onSetStopped: (ids: string[], stopped: boolean) => void;
  // The row's Shuffle (#1179): the crew of the attempting ship, or the away team of the mission.
  onShuffle: (location: ShuffleLocation) => void;
  // The Draw dilemma button of the dilemma choice (#1191): false while the dilemma pile is empty.
  canDrawDilemma: boolean;
  onDrawDilemma: () => void;
  // The phase button of the strip (#1192): Face dilemmas in the choice, Back to choosing in the facing.
  onSetPhase: (phase: AttemptPhase) => void;
}) {
  const { missionIndex } = attempt;
  const {
    missionScale,
    shipScale,
    shipRows,
    shipsWidth,
    shipRowsWidth,
    personnelCardWidth,
    personnelRows,
    personnelFirstRow,
    personnelWidth,
  } = sizes;
  const missionWidth = Math.round(TABLE_CARD_WIDTH * missionScale);
  const missionName = slot.mission ? cardDisplayName(slot.mission.card) : 'Mission';
  const ship = attempt.shipId ? slot.ships.find((s) => s.id === attempt.shipId) : undefined;
  const missionColumn = (
    <div className="flex flex-col items-center" style={{ width: missionWidth, gap: MISSION_COLUMN_GAP }}>
      <MissionCard
        missionIndex={missionIndex}
        slot={slot}
        onOpenPile={onOpenPile}
        onOpenPlacedOn={onOpenPlacedOn}
        onFlipMission={onFlipMission}
        onSetMissionCompleted={onSetMissionCompleted}
        scale={missionScale}
        uncropped
        slotWidth={missionWidth}
        showAwayTeam={false}
      />
    </div>
  );
  const ships = (
    <ShipRow
      missionIndex={missionIndex}
      ships={slot.ships}
      onShipClick={onShipClick}
      onOpenShipRow={onOpenShipRow}
      columnWidth={shipRowsWidth}
      scale={shipScale}
      availableRows={shipRows}
      desktop={desktop}
    />
  );

  const { choice } = sizes;
  const choiceBody = (
    <div
      data-testid="attempt-body"
      className="flex flex-row justify-center items-start"
      style={{ gap: ATTEMPT_GAP, paddingTop: underMissionStackRoom(missionScale, true) }}
    >
      {missionColumn}
      {dilemmaStack}
      <div
        data-testid="attempt-ships"
        className="flex flex-col items-center"
        style={{ width: choice.rightWidth, gap: MISSION_COLUMN_GAP }}
      >
        <div
          data-testid="attempt-personnel-pile"
          aria-label={`Attempting personnel, ${personnelCount} card${personnelCount === 1 ? '' : 's'}`}
          className="relative"
          style={{ width: choice.pileCardWidth }}
        >
          <img
            src="/cardimages/cardback.jpg"
            width={120}
            height={167}
            alt=""
            className="pointer-events-none rounded-lg shadow-lg h-auto"
            style={{ ...cardBorderStyle(choice.pileCardWidth), width: choice.pileCardWidth }}
          />
          <CountBadge count={personnelCount} />
        </div>
        <ShipRow
          missionIndex={missionIndex}
          ships={slot.ships}
          onShipClick={onShipClick}
          onOpenShipRow={onOpenShipRow}
          columnWidth={choice.rightWidth}
          scale={choice.shipScale}
          availableRows={choice.shipRows}
          desktop={desktop}
        />
      </div>
    </div>
  );

  return (
    <div ref={layoutRef} data-testid="attempt-layout" className="flex flex-col" style={{ gap: ATTEMPT_GAP }}>
      <div
        ref={stripRef}
        data-testid="attempt-strip"
        className="flex flex-row items-center gap-2 rounded bg-black/40 px-2 text-text-primary"
        style={{ height: ATTEMPT_STRIP_HEIGHT, marginLeft: ATTEMPT_STRIP_GUTTER }}
      >
        <span data-testid="attempt-status" className="min-w-0 truncate text-xs">
          Attempting {missionName}
          {ship && ` with ${cardDisplayName(ship.card)}`}
        </span>
        <span data-testid="attempt-draw-spend" className="whitespace-nowrap text-sm font-bold">
          draw/spend {drawSpend(attempt.personnel, attempt.subtract)}
        </span>
        {attempt.phase === 'choose' && (
          <AttemptDrawDilemma attempt={attempt} canDraw={canDrawDilemma} onDraw={onDrawDilemma} />
        )}
        <div className="ml-auto flex shrink-0 flex-row gap-2">
          {attempt.phase === 'choose' ? (
            <button
              type="button"
              data-testid="attempt-face-dilemmas"
              onClick={() => onSetPhase('face')}
              className="btn-primary whitespace-nowrap !px-2 !py-1 text-xs"
            >
              Face dilemmas
            </button>
          ) : (
            <button
              type="button"
              data-testid="attempt-back-to-choosing"
              onClick={() => onSetPhase('choose')}
              className="btn-primary bg-none bg-white/[0.05] whitespace-nowrap !px-2 !py-1 text-xs"
            >
              Back to choosing
            </button>
          )}
          <button
            type="button"
            data-testid="attempt-view-full-table"
            onClick={onViewFullTable}
            className="btn-primary bg-none bg-white/[0.05] whitespace-nowrap !px-2 !py-1 text-xs"
          >
            View full table
          </button>
          <button
            type="button"
            data-testid="attempt-done"
            onClick={onEndAttempt}
            className="btn-primary whitespace-nowrap !px-2 !py-1 text-xs"
          >
            Attempt done
          </button>
        </div>
      </div>

      {attempt.phase === 'choose' ? choiceBody : (
      <div
        data-testid="attempt-body"
        className="flex flex-row justify-center items-start"
        style={{ gap: ATTEMPT_GAP, paddingTop: underMissionStackRoom(missionScale, true) }}
      >
        {missionColumn}
        <div
          data-testid="attempt-ships"
          className="flex flex-col items-center"
          style={{ width: shipsWidth, gap: MISSION_COLUMN_GAP }}
        >
          {attempt.shipId ? (
            <>
              <div className="flex items-center justify-center" style={{ height: badgeStripHeight(missionScale) }}>
                <PileBadge
                  missionIndex={missionIndex}
                  pile="awayTeam"
                  count={slot.awayTeam.length}
                  onOpen={onOpenPile}
                  height={badgeStripHeight(missionScale)}
                />
              </div>
              <div className="flex flex-row items-start" style={{ gap: ATTEMPT_GAP }}>
                <div style={{ width: shipRowsWidth }}>{ships}</div>
                {ship && (
                  <AttemptPersonnelRow
                    dropId={attemptCrewDropId(ship.id)}
                    landedKey={crewDropId(ship.id)}
                    kind="ship"
                    label={`Crew of ${cardDisplayName(ship.card)}`}
                    cards={ship.crew ?? []}
                    cardWidth={personnelCardWidth}
                    rows={personnelRows}
                    firstRow={personnelFirstRow}
                    width={personnelWidth}
                    selectedIds={selectedIds}
                    onToggleSelect={onToggleSelect}
                    onSetStopped={onSetStopped}
                    onShuffle={() => onShuffle({ zone: 'crew', shipId: ship.id })}
                  />
                )}
              </div>
            </>
          ) : (
            <>
              <AttemptPersonnelRow
                dropId={attemptAwayTeamDropId(missionIndex)}
                landedKey={missionPileDropId(missionIndex, 'awayTeam')}
                kind="mission"
                label="Away team"
                cards={slot.awayTeam}
                cardWidth={personnelCardWidth}
                rows={personnelRows}
                firstRow={personnelFirstRow}
                width={personnelWidth}
                selectedIds={selectedIds}
                onToggleSelect={onToggleSelect}
                onSetStopped={onSetStopped}
                onShuffle={() => onShuffle({ zone: 'missionPile', missionIndex, pile: 'awayTeam' })}
              />
              {ships}
            </>
          )}
        </div>
        {dilemmaStack}
      </div>
      )}
    </div>
  );
}

// The Draw dilemma button and the count beside it (#1191), one group, so that a phase button can sit
// beside it later. Each tap draws one dilemma into the dilemma hand as the counted choice-phase draw
// (#1189); the button is disabled only while the dilemma pile is empty, as Reveal top is (#1078), and
// never at N. The count goes on past N, in amber once it does.
export function AttemptDrawDilemma({
  attempt,
  canDraw,
  onDraw,
}: {
  attempt: Attempt;
  canDraw: boolean;
  onDraw: () => void;
}) {
  const n = drawSpend(attempt.personnel, attempt.subtract);
  const over = attempt.drawn > n;
  return (
    <div className="flex shrink-0 flex-row items-center gap-2">
      <button
        type="button"
        data-testid="attempt-draw-dilemma"
        onClick={onDraw}
        disabled={!canDraw}
        className="btn-primary whitespace-nowrap flex items-center justify-center gap-1 !px-3 !py-1 text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <DilemmaIcon className="w-4 h-4" />
        Draw dilemma
      </button>
      <span
        data-testid="attempt-drawn-count"
        data-over={over ? 'true' : undefined}
        className={`whitespace-nowrap text-sm font-bold ${over ? 'text-amber-400' : ''}`}
      >
        Drawn {attempt.drawn} of {n}
      </span>
    </div>
  );
}
