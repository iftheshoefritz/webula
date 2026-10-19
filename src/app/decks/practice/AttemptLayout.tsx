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

import { ReactNode } from 'react';
import type { Attempt, MissionPileName, MissionSlot, ShuffleLocation } from './tableReducer';
import { drawSpend } from './drawSpend';
import {
  MISSION_COLUMN_GAP,
  MissionCard,
  PileBadge,
  PlacedOnGroup,
  ShipRow,
  badgeStripHeight,
  crewDropId,
  missionPileDropId,
  underMissionStackRoom,
} from './MissionRow';
import { TABLE_CARD_WIDTH } from './TableCard';
import { ATTEMPT_GAP, ATTEMPT_STRIP_GUTTER, ATTEMPT_STRIP_HEIGHT, AttemptLayoutSizes } from './tableScale';
import { cardDisplayName } from '../../../lib/cardCount';
import AttemptPersonnelRow, { attemptAwayTeamDropId, attemptCrewDropId } from './AttemptPersonnelRow';

export default function AttemptLayout({
  attempt,
  slot,
  sizes,
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
}: {
  attempt: Attempt;
  slot: MissionSlot;
  sizes: AttemptLayoutSizes;
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
        <div className="ml-auto flex flex-row gap-2">
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

      <div
        data-testid="attempt-body"
        className="flex flex-row justify-center items-start"
        style={{ gap: ATTEMPT_GAP, paddingTop: underMissionStackRoom(missionScale, true) }}
      >
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
    </div>
  );
}
