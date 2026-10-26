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
// the right the ships, one to a row. At a planet mission (#1222) the attempting personnel show there
// too, as one face-down pile with a count (`attempt-personnel-pile`), a crop of the card back the size
// of a stack card, level with the stack's cards, with the ships in a column right of it. A space
// mission has no pile (#1235): the player knows the crew is on the ship, whose crew badge shows the count.
// The pile is not a drop target and previews nothing; the row of the
// personnel, its buttons and its droppable are not mounted, nor is the away team badge.
//
// The cards placed on the attempted mission (#1180) show in a column right of the mission card, as
// tall as the card (`AttemptPlacedOnColumn`): the dilemmas in a block above, the events below, every
// card as an art crop, overlapped to fit. The card then draws no strips; its badges stay. The column
// is not a droppable and has no `data-zone`, and its cards have no `data-card-id`: the bottom half of
// the mission card, `mission-on-<i>`, reaches over it, so a drop on it is a drop on the mission card.
// A tap on a block opens that group's panel, and a hold on a card previews it. With nothing placed
// on the mission there is no column, and it takes no width.
//
// In the dilemma choice the strip also holds the Draw dilemma button and the count of the dilemmas
// drawn (#1191, `AttemptDrawDilemma`). The strip sits at the top, so the open dilemma hand arc,
// which rises from the bottom edge, never covers the button.

import { ReactNode } from 'react';
import CountBadge from './CountBadge';
import type { Attempt, AttemptPhase, CardInstance, MissionPileName, MissionSlot, ShuffleLocation } from './tableReducer';
import { drawSpend, drawSpendText } from './drawSpend';
import {
  MISSION_COLUMN_GAP,
  MissionCard,
  PLACED_ON_GROUP,
  PileBadge,
  PlacedOnGroup,
  DilemmaIcon,
  ShipRow,
  badgeStripHeight,
  crewDropId,
  missionCardHeight,
  missionPileDropId,
  placedOnGroupOf,
  underMissionStackRoom,
} from './MissionRow';
import { TABLE_CARD_WIDTH, TableCardImage, cardBorderStyle } from './TableCard';
import {
  ATTEMPT_GAP,
  ATTEMPT_PLACED_ON_BLOCK_GAP,
  ATTEMPT_STACK_SIDE_GAP,
  ATTEMPT_STRIP_GUTTER,
  ATTEMPT_STRIP_HEIGHT,
  AttemptPlacedOnBlock,
  AttemptSizes,
  attemptPlacedOnBlocks,
} from './tableScale';
import { NO_CALLOUT_STYLE, useCardHold } from './useCardHold';
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
    personnelColumns,
    personnelWidth,
    personnelHeight,
    placedOnWidth,
  } = sizes;
  const missionWidth = Math.round(TABLE_CARD_WIDTH * missionScale);
  const missionName = slot.mission ? cardDisplayName(slot.mission.card) : 'Mission';
  const ship = attempt.shipId ? slot.ships.find((s) => s.id === attempt.shipId) : undefined;
  const placedOn = slot.mission?.placedOn ?? [];
  const placedOnColumn =
    slot.mission && placedOn.length > 0 && placedOnWidth > 0 ? { gap: ATTEMPT_GAP, width: placedOnWidth } : undefined;
  const missionCard = (
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
        placedOnColumn={placedOnColumn}
      />
    </div>
  );
  const missionColumn =
    slot.mission && placedOnColumn ? (
      <div className="flex flex-row items-start" style={{ gap: ATTEMPT_GAP }}>
        {missionCard}
        <AttemptPlacedOnColumn
          missionIndex={missionIndex}
          mission={slot.mission}
          cards={placedOn}
          width={placedOnColumn.width}
          height={missionCardHeight(missionScale, true)}
          onOpen={(group) => onOpenPlacedOn(slot.mission!.id, group)}
        />
      </div>
    ) : (
      missionCard
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
      className="flex min-h-0 flex-row justify-center items-start overflow-y-clip"
      style={{ gap: ATTEMPT_GAP, paddingTop: underMissionStackRoom(missionScale, true) }}
    >
      {missionColumn}
      {/* The empty space outside the "First" and "Last" ends of the stack (#1220), outside
          its drop zone. */}
      <div data-testid="attempt-stack-margin" className="flex-none" style={{ marginLeft: ATTEMPT_STACK_SIDE_GAP, marginRight: ATTEMPT_STACK_SIDE_GAP }}>
        {dilemmaStack}
      </div>
      <div
        data-testid="attempt-ships"
        className={`flex ${choice.hasPile ? 'flex-row items-start' : 'flex-col items-center'}`}
        style={{ width: choice.rightWidth, gap: ATTEMPT_GAP }}
      >
        {/* At a planet mission (#1222) the pile is a stack card's crop of the card back, in a slot as
            tall as the stack, at its bottom, so it lines up with the stack's cards. A space mission
            has no pile (#1235): the ship's crew badge shows the count. */}
        {choice.hasPile && (
          <div className="flex flex-col justify-end" style={{ width: choice.pileCardWidth, height: choice.stackHeight }}>
            <div
              data-testid="attempt-personnel-pile"
              aria-label={`Attempting personnel, ${personnelCount} card${personnelCount === 1 ? '' : 's'}`}
              className="relative"
              style={{ width: choice.pileCardWidth }}
            >
              <div className="overflow-hidden rounded-md shadow-lg" style={{ height: choice.pileCardHeight }}>
                <img
                  src="/cardimages/cardback.jpg"
                  width={120}
                  height={167}
                  alt=""
                  className="pointer-events-none w-full h-full object-cover object-top"
                  style={cardBorderStyle(choice.pileCardWidth)}
                />
              </div>
              <CountBadge count={personnelCount} />
            </div>
          </div>
        )}
        <ShipRow
          missionIndex={missionIndex}
          ships={slot.ships}
          onShipClick={onShipClick}
          onOpenShipRow={onOpenShipRow}
          columnWidth={choice.shipColumnWidth}
          scale={choice.shipScale}
          availableRows={choice.shipRows}
          desktop={desktop}
        />
      </div>
    </div>
  );

  // A bot game's attempt keeps the Draw and Spend the player set (#1291); any other attempt has N.
  const drawSpendN = drawSpend(attempt.personnel, attempt.subtract);
  return (
    // `min-h-0` and the bodies' `overflow-y-clip` are a safety net (#1203): the sizes fit the height
    // above the bottom row (`attemptColumnHeight`), and should a column still be too tall, the body
    // clips it rather than push the bottom row off the screen.
    <div ref={layoutRef} data-testid="attempt-layout" className="flex min-h-0 flex-col" style={{ gap: ATTEMPT_GAP }}>
      <div
        ref={stripRef}
        data-testid="attempt-strip"
        className="flex flex-row items-center gap-1 rounded bg-black/40 px-2 text-text-primary"
        style={{ height: ATTEMPT_STRIP_HEIGHT, marginLeft: ATTEMPT_STRIP_GUTTER }}
      >
        <span data-testid="attempt-status" className="min-w-0 truncate text-xs">
          Attempting {missionName}
          {ship && ` with ${cardDisplayName(ship.card)}`}
        </span>
        <span data-testid="attempt-draw-spend" className="whitespace-nowrap text-sm font-bold">
          {drawSpendText(attempt.botDraw ?? drawSpendN, attempt.botSpend ?? drawSpendN)}
        </span>
        {attempt.phase === 'choose' && (
          <AttemptDrawDilemma attempt={attempt} canDraw={canDrawDilemma} onDraw={onDrawDilemma} />
        )}
        <div className="ml-auto flex shrink-0 flex-row gap-1">
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
        className="flex min-h-0 flex-row justify-center items-start overflow-y-clip"
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
                    columns={personnelColumns}
                    width={personnelWidth}
                    height={personnelHeight}
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
                columns={personnelColumns}
                width={personnelWidth}
                height={personnelHeight}
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

export const attemptPlacedOnTestId = (missionIndex: number): string => `attempt-placed-on-${missionIndex}`;

// The column of the cards placed on the attempted mission (#1180): the dilemmas above, the events
// below, each group a block of its own that a tap opens as that group's panel.
function AttemptPlacedOnColumn({
  missionIndex,
  mission,
  cards,
  width,
  height,
  onOpen,
}: {
  missionIndex: number;
  mission: CardInstance;
  cards: CardInstance[];
  width: number;
  height: number;
  onOpen: (group: PlacedOnGroup) => void;
}) {
  const dilemmas = cards.filter((c) => placedOnGroupOf(c) === 'dilemmas');
  const events = cards.filter((c) => placedOnGroupOf(c) === 'events');
  const blocks = attemptPlacedOnBlocks(dilemmas.length, events.length, height, width);
  const name = cardDisplayName(mission.card);
  return (
    <div
      data-testid={attemptPlacedOnTestId(missionIndex)}
      aria-label={`The cards placed on ${name}`}
      className="flex flex-col"
      style={{ width, height, gap: ATTEMPT_PLACED_ON_BLOCK_GAP }}
    >
      {(
        [
          ['dilemmas', dilemmas, blocks.dilemmas],
          ['events', events, blocks.events],
        ] as const
      ).map(([group, groupCards, block]) =>
        block ? (
          <AttemptPlacedOnBlockView
            key={group}
            missionIndex={missionIndex}
            group={group}
            name={name}
            cards={groupCards}
            block={block}
            width={width}
            onOpen={() => onOpen(group)}
          />
        ) : null,
      )}
    </div>
  );
}

function AttemptPlacedOnBlockView({
  missionIndex,
  group,
  name,
  cards,
  block,
  width,
  onOpen,
}: {
  missionIndex: number;
  group: PlacedOnGroup;
  name: string;
  cards: CardInstance[];
  block: AttemptPlacedOnBlock;
  width: number;
  onOpen: () => void;
}) {
  const { noun } = PLACED_ON_GROUP[group];
  return (
    <div
      data-testid={`attempt-placed-on-${group}-${missionIndex}`}
      aria-label={`The ${noun}s placed on ${name}: ${cards.map((c) => cardDisplayName(c.card)).join(', ')}`}
      className="relative touch-manipulation cursor-pointer"
      style={{ ...NO_CALLOUT_STYLE, height: block.height }}
      onClick={onOpen}
    >
      {cards.map((card, i) => (
        <AttemptPlacedOnCard
          key={card.id}
          card={card}
          top={i * block.step}
          zIndex={i + 1}
          width={width}
          height={block.cardHeight}
        />
      ))}
    </div>
  );
}

// A card of the column: the art crop of a table card, and a hold previews it, as on a strip (#1099).
function AttemptPlacedOnCard({
  card,
  top,
  zIndex,
  width,
  height,
}: {
  card: CardInstance;
  top: number;
  zIndex: number;
  width: number;
  height: number;
}) {
  const holdListeners = useCardHold(card.id);
  return (
    <div data-testid="attempt-placed-on-card" className="absolute inset-x-0" style={{ top, zIndex }} {...holdListeners}>
      <TableCardImage instance={card} width={width} height={height} className="rounded-sm" />
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
    <div className="flex shrink-0 flex-row items-center gap-1">
      <button
        type="button"
        data-testid="attempt-draw-dilemma"
        onClick={onDraw}
        disabled={!canDraw}
        className="btn-primary whitespace-nowrap flex items-center justify-center gap-1 !px-2 !py-1 text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed"
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
