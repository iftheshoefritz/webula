'use client';

// Spike for #1182 on the 3D table (#1823): the four layouts of the opponent's half, side by side
// behind `?opponent=1&layout=a|b|c|d`, so they can be compared on one build.
//
// - A, "tabs": one mission row at a time. Tabs in the opponent strip swap the player's row for the
//   opponent's, drawn in the same tilted plane at the same size, on a tinted mat.
// - B, "far row": both rows at once. The opponent's missions sit as compact title bands on the far
//   side of the same table, beyond the player's row, mirrored, at a slightly steeper camera.
// - C, "zoom": the camera tilts in steps from the player's side (18°) to the whole table (38°), with
//   − and +, a minimap of the 10 locations, and the top edge during a drag. The far row gains its
//   ships at the steepest step.
// - D, "camera": one button between two fixed views, "Your side" (18°) and "Whole table" (28°),
//   where the opponent's missions, with their badges, show on the far side.
//
// Every far row lies in the board's own plane (`TablePlane`), as an absolutely placed child above
// the player's row: it never enters the measured box `setMissionRows`, so `useMissionScale` and
// `useShipRows` measure the player's row alone, and the camera moves only the transform. The
// opponent's cards lie flat (`opponent-flat`, no shadow), read only: no `data-zone`, no
// `data-card-id`, no drag.

import { useEffect, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useDndMonitor } from '@dnd-kit/core';
import type { DragMoveEvent } from '@dnd-kit/core';
import { MISSION_SLOTS } from './tableReducer';
import type { CardInstance } from './tableReducer';
import { TABLE_CARD_WIDTH, TableCardImage } from './TableCard';
import {
  ContestedMark,
  OPPONENT_TINT_CLASS,
  OpponentSideBadge,
  badgeStripHeight,
  missionCardHeight,
  shipCardWidth,
  shipRowLineHeight,
} from './MissionRow';
import { sideIsEmpty, sidePersonnelCount } from './opponent';
import type { LocationSide, OpponentHalf, Player } from './opponent';
import { BOARD_PERSPECTIVE, BOARD_TILT_DEG } from './table3d';
import type { TableCamera } from './table3d';

export type OpponentLayout = 'a' | 'b' | 'c' | 'd';

export const parseOpponentLayout = (value: string | null): OpponentLayout =>
  value === 'a' || value === 'b' || value === 'c' || value === 'd' ? value : 'd';

// The camera steps (#1823). 18° is today's table. 28° fits the opponent's missions with their badge
// strip at 667×375 (the owner's floor for the whole table, #1823), and 38° their ship row too. The
// 45.5° of the issue's analysis fits a whole opposing half of two ship rows and a core; the far row
// here draws one row of ships, which 38° already fits, so a steeper step only adds empty felt.
export const CAMERA_YOUR_SIDE = BOARD_TILT_DEG;
export const CAMERA_WHOLE_TABLE = 28;
export const CAMERA_STEPS = [BOARD_TILT_DEG, 28, 38] as const;
// B's fixed camera: a little steeper than 18°, so the compact far row clears the opponent strip.
export const CAMERA_FAR_ROW = 22;
// The far row's ships show from this tilt (C's steepest step).
export const SHIPS_FROM_TILT = 38;

export const cameraOf = (tiltDeg: number): TableCamera => ({ tiltDeg, perspective: BOARD_PERSPECTIVE });

// How long a camera move takes. Both tilted parts take the same transition, so they stay in one
// plane during the move; the droppables are measured again once it ends.
export const CAMERA_MOVE_MS = 300;

const scaled = (px: number, scale: number): number => Math.round(px * scale);
const COLUMN_GAP = 4; // px, as `MissionRow`'s columns
// The gap between the far row and the dilemmas under the player's missions: the middle of the table.
export const TABLE_MIDDLE = 12; // px

// The order the opponent's row draws its slots in: mirrored, so their slot 0 is on the right, as
// across a real table. The cards stay upright, so their text reads for the one viewer (#1823).
export const mirroredSlots = (): number[] => Array.from({ length: MISSION_SLOTS }, (_, i) => MISSION_SLOTS - 1 - i);

function YourSideBadge({ count, height }: { count: number; height: number }) {
  return (
    <span
      aria-label={`You here: ${count} personnel`}
      className={`flex items-center gap-px rounded-full px-1 leading-none bg-sky-800/90 text-sky-50 text-[8px] font-bold ${
        count === 0 ? 'opacity-50' : ''
      }`}
      style={{ height: height - 2 }}
    >
      You {count}
    </span>
  );
}

function OpponentShip({ ship, width, height }: { ship: CardInstance; width: number; height: number }) {
  return (
    <div className="relative ring-1 ring-rose-600 rounded-md" style={{ width }}>
      <TableCardImage instance={ship} width={width} height={height} />
      <span className={`absolute -top-1 -right-1 rounded-full px-1 text-[8px] font-bold leading-none ${OPPONENT_TINT_CLASS}`}>
        {ship.crew?.length ?? 0}
      </span>
    </div>
  );
}

// The opponent's 5 missions at the size of the player's row: A's row in place of the player's, and
// the far row of C and D. `showShips` adds the opponent's ships under each mission.
export function OpponentMissionRow({
  half,
  scale,
  slotWidth,
  showShips,
  onOpenLocation,
}: {
  half: OpponentHalf;
  scale: number;
  slotWidth: number;
  showShips: boolean;
  onOpenLocation: (index: number) => void;
}) {
  const cardWidth = scaled(TABLE_CARD_WIDTH, scale);
  const cardHeight = missionCardHeight(scale, false);
  const badgeHeight = badgeStripHeight(scale);
  const shipWidth = shipCardWidth(scale);
  const shipHeight = shipRowLineHeight(scale, false);
  return (
    <div data-testid="opponent-mission-row" className="opponent-flat flex flex-row gap-2 justify-center">
      {mirroredSlots().map((index) => {
        const mission = half.missions[index];
        const theirs = half.sidesAtTheirs[index];
        const yours = half.yourSidesAtTheirs[index];
        const contested = !sideIsEmpty(theirs) && !sideIsEmpty(yours);
        return (
          <div
            key={index}
            data-testid={`opponent-mission-${index}`}
            className="flex flex-col items-center"
            style={{ width: slotWidth, gap: COLUMN_GAP }}
          >
            <button
              type="button"
              onClick={() => onOpenLocation(index)}
              className={`relative rounded-md touch-manipulation ${mission ? 'ring-2 ring-rose-700' : 'border-2 border-dashed border-rose-300/30'}`}
              style={{ width: cardWidth, height: mission ? undefined : cardHeight }}
              aria-label={`Opponent's mission ${mission ? mission.card.name : index + 1}, tap to see who is there`}
            >
              {mission && <TableCardImage instance={mission} width={cardWidth} height={cardHeight} />}
              {contested && <ContestedMark testId={`opponent-contested-${index}`} size={Math.round(badgeHeight * 0.7)} />}
            </button>
            <div className="w-full flex items-center justify-center gap-px" style={{ height: badgeHeight }}>
              <YourSideBadge count={sidePersonnelCount(yours)} height={badgeHeight} />
              <OpponentSideBadge
                testId={`opponent-row-side-${index}`}
                personnel={sidePersonnelCount(theirs)}
                ships={theirs.ships.length}
                onOpen={() => onOpenLocation(index)}
                height={badgeHeight}
              />
            </div>
            {showShips && (
              <div className="flex flex-row justify-center gap-1" style={{ minHeight: shipHeight }}>
                {theirs.ships.map((ship) => (
                  <OpponentShip key={ship.id} ship={ship} width={shipWidth} height={shipHeight} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// B's compact far row: each mission only as its title band, the top of the art crop, with the
// two-part badge of the location and the contested mark.
export const COMPACT_TILE_HEIGHT = 24; // px
const COMPACT_BADGE_HEIGHT = 14; // px

export function OpponentCompactRow({
  half,
  slotWidth,
  cardWidth,
  onOpenLocation,
}: {
  half: OpponentHalf;
  slotWidth: number;
  cardWidth: number;
  onOpenLocation: (index: number) => void;
}) {
  return (
    <div data-testid="opponent-compact-row" className="opponent-flat flex flex-row gap-2 justify-center">
      {mirroredSlots().map((index) => {
        const mission = half.missions[index];
        const theirs = half.sidesAtTheirs[index];
        const yours = half.yourSidesAtTheirs[index];
        const contested = !sideIsEmpty(theirs) && !sideIsEmpty(yours);
        const yourCount = sidePersonnelCount(yours);
        return (
          <div key={index} className="flex justify-center" style={{ width: slotWidth }}>
            {/* A div, not a button: the badge inside it is a button. */}
            <div
              role="button"
              tabIndex={0}
              data-testid={`opponent-tile-${index}`}
              onClick={() => onOpenLocation(index)}
              className={`relative rounded-md touch-manipulation ${mission ? 'ring-2 ring-rose-700' : 'border-2 border-dashed border-rose-300/30'}`}
              style={{ width: cardWidth, height: COMPACT_TILE_HEIGHT }}
              aria-label={`Opponent's mission ${mission ? mission.card.name : index + 1}, tap to see who is there`}
            >
              {mission && (
                <TableCardImage instance={mission} width={cardWidth} height={COMPACT_TILE_HEIGHT} className="rounded-md opacity-90" />
              )}
              {contested && <ContestedMark testId={`opponent-contested-${index}`} size={10} />}
              <span className="absolute -bottom-1.5 right-0 flex items-center gap-px">
                {yourCount > 0 && (
                  <span
                    className="flex items-center rounded-full bg-sky-800/90 px-1 text-[8px] font-bold leading-none text-sky-50"
                    style={{ height: COMPACT_BADGE_HEIGHT - 2 }}
                  >
                    You {yourCount}
                  </span>
                )}
                {!sideIsEmpty(theirs) && (
                  <OpponentSideBadge
                    testId={`opponent-tile-side-${index}`}
                    personnel={sidePersonnelCount(theirs)}
                    ships={theirs.ships.length}
                    height={COMPACT_BADGE_HEIGHT}
                  />
                )}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// The far side of the table: an absolutely placed child of the tilted board, its bottom
// `TABLE_MIDDLE` px above the top of a full stack of the slivers under the player's missions (`gap`,
// `fullUnderMissionStackHeight`), on the opponent's tinted mat. It takes no layout, so no measured box
// changes.
export function FarSide({ gap, children }: { gap: number; children: ReactNode }) {
  const style: CSSProperties = { bottom: `calc(100% + ${gap + TABLE_MIDDLE}px)` };
  return (
    <div data-testid="opponent-far-side" className="absolute left-0 right-0" style={style}>
      <div aria-hidden="true" className="board-mat board-mat-theirs pointer-events-none absolute -inset-2 -z-10 rounded-2xl" />
      {children}
    </div>
  );
}

export type Presence = 'none' | 'you' | 'opponent' | 'contested';

export function presence(yours: LocationSide, theirs: LocationSide): Presence {
  const you = !sideIsEmpty(yours);
  const them = !sideIsEmpty(theirs);
  return you && them ? 'contested' : you ? 'you' : them ? 'opponent' : 'none';
}

export const PRESENCE_STYLE: Record<Presence, string> = {
  none: 'rgb(255 255 255 / 0.12)',
  you: 'rgb(14 165 233)',
  opponent: 'rgb(225 29 72)',
  contested: 'linear-gradient(135deg, rgb(14 165 233) 50%, rgb(225 29 72) 50%)',
};

// The overview of the 10 locations: two rows of 5 cells, the opponent's missions on top
// (mirrored) and the player's below, each coloured by who is there. `highlight` outlines the rows on
// screen; a tap on a row calls `onRow`.
export function LocationOverview({
  yourSides,
  half,
  highlight,
  onRow,
}: {
  yourSides: LocationSide[];
  half: OpponentHalf;
  highlight: Player[];
  onRow: (row: Player) => void;
}) {
  const rows: { row: Player; cells: Presence[] }[] = [
    { row: 'opponent', cells: mirroredSlots().map((i) => presence(half.yourSidesAtTheirs[i], half.sidesAtTheirs[i])) },
    { row: 'you', cells: yourSides.map((side, i) => presence(side, half.sidesAtYours[i])) },
  ];
  return (
    <span data-testid="location-overview" className="flex flex-col gap-px" aria-label="All 10 locations">
      {rows.map(({ row, cells }) => (
        <button
          key={row}
          type="button"
          data-testid={`overview-row-${row}`}
          data-showing={highlight.includes(row) || undefined}
          onClick={() => onRow(row)}
          aria-label={row === 'you' ? 'Show your missions' : "Show the opponent's missions"}
          className={`flex gap-px rounded-sm p-px ${highlight.includes(row) ? 'outline outline-1 outline-white' : ''}`}
        >
          {cells.map((cell, i) => (
            <span
              key={i}
              data-presence={cell}
              className="block rounded-[1px]"
              style={{ width: 9, height: 6, background: PRESENCE_STYLE[cell] }}
            />
          ))}
        </button>
      ))}
    </span>
  );
}

// A's tabs, with the overview beside them.
export function RowSwitch({
  showing,
  onShow,
  yourSides,
  half,
}: {
  showing: Player;
  onShow: (row: Player) => void;
  yourSides: LocationSide[];
  half: OpponentHalf;
}) {
  return (
    <span className="ml-auto flex items-center gap-2">
      <span role="tablist" className="flex h-full rounded-full bg-black/50 p-0.5 text-text-primary">
        {(['you', 'opponent'] as const).map((row) => (
          <button
            key={row}
            type="button"
            role="tab"
            aria-selected={showing === row}
            data-testid={`row-tab-${row}`}
            onClick={() => onShow(row)}
            className={`rounded-full px-2 py-0.5 ${showing === row ? (row === 'you' ? 'bg-sky-700' : 'bg-rose-700') : ''}`}
          >
            {row === 'you' ? 'Your missions' : 'Their missions'}
          </button>
        ))}
      </span>
      <LocationOverview yourSides={yourSides} half={half} highlight={[showing]} onRow={onShow} />
    </span>
  );
}

// D's button: two fixed views of the one table.
export function CameraToggle({ tiltDeg, onTilt }: { tiltDeg: number; onTilt: (tiltDeg: number) => void }) {
  const whole = tiltDeg > CAMERA_YOUR_SIDE;
  return (
    <button
      type="button"
      data-testid="camera-toggle"
      data-view={whole ? 'whole' : 'yours'}
      aria-pressed={whole}
      onClick={() => onTilt(whole ? CAMERA_YOUR_SIDE : CAMERA_WHOLE_TABLE)}
      className="ml-auto rounded-full bg-black/50 px-2 h-full text-text-primary"
    >
      {whole ? 'Your side' : 'Whole table'}
    </button>
  );
}

// C's controls: − and + step the camera, and the overview is a minimap whose top row turns the
// camera to the whole table and whose bottom row back to the player's side.
export function CameraZoom({
  tiltDeg,
  onTilt,
  yourSides,
  half,
}: {
  tiltDeg: number;
  onTilt: (tiltDeg: number) => void;
  yourSides: LocationSide[];
  half: OpponentHalf;
}) {
  const step = CAMERA_STEPS.findIndex((t) => t >= tiltDeg - 0.01);
  const at = step < 0 ? 0 : step;
  const last = CAMERA_STEPS.length - 1;
  const highlight: Player[] = tiltDeg > CAMERA_YOUR_SIDE ? ['opponent', 'you'] : ['you'];
  return (
    <span className="ml-auto flex items-center gap-1 text-text-primary">
      <button
        type="button"
        data-testid="camera-closer"
        aria-label="Closer to your side"
        disabled={at === 0}
        onClick={() => onTilt(CAMERA_STEPS[Math.max(0, at - 1)])}
        className="rounded-full bg-black/50 w-5 h-full disabled:opacity-40"
      >
        +
      </button>
      <button
        type="button"
        data-testid="camera-wider"
        aria-label="More of the table"
        disabled={at === last}
        onClick={() => onTilt(CAMERA_STEPS[Math.min(last, at + 1)])}
        className="rounded-full bg-black/50 w-5 h-full disabled:opacity-40"
      >
        −
      </button>
      <LocationOverview
        yourSides={yourSides}
        half={half}
        highlight={highlight}
        onRow={(row) => onTilt(row === 'opponent' ? CAMERA_STEPS[last] : CAMERA_YOUR_SIDE)}
      />
    </span>
  );
}

// C's pan at the edge during a drag, on the 3D table: a card held in the band along the top edge of
// the screen, the direction of the opponent, turns the camera one step further towards the whole
// table for each `EDGE_HOLD_MS` it stays there. A drag never turns it back, so the drop lands on what
// the player sees.
export const EDGE_ZONE = 48; // px from the top of the window
export const EDGE_HOLD_MS = 450;

function pointerY(event: DragMoveEvent): number | null {
  const start = event.activatorEvent;
  let y: number | null = null;
  if (typeof TouchEvent !== 'undefined' && start instanceof TouchEvent) y = start.touches[0]?.clientY ?? null;
  else if ('clientY' in start) y = (start as PointerEvent).clientY;
  return y === null ? null : y + event.delta.y;
}

export function EdgeCamera({ tiltDeg, onTilt }: { tiltDeg: number; onTilt: (tiltDeg: number) => void }) {
  // A pointer that rests in the band moves no more, so a timer turns the camera, not the move events.
  const timer = useRef<number | null>(null);
  const tilt = useRef(tiltDeg);
  const turn = useRef(onTilt);
  useEffect(() => {
    tilt.current = tiltDeg;
    turn.current = onTilt;
  }, [tiltDeg, onTilt]);
  const stop = () => {
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);
  useDndMonitor({
    onDragMove(event) {
      const y = pointerY(event);
      if (y === null || y > EDGE_ZONE) {
        stop();
        return;
      }
      if (timer.current !== null) return;
      timer.current = window.setInterval(() => {
        const next = CAMERA_STEPS.find((t) => t > tilt.current + 0.01);
        if (next === undefined) stop();
        else turn.current(next);
      }, EDGE_HOLD_MS);
    },
    onDragEnd: stop,
    onDragCancel: stop,
  });
  return null;
}
