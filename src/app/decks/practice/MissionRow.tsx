'use client';

// The mission row (see the parent design in issue #130 and the plan for #597): 5 positional
// slots dealt face up from the deck's missions on a new game and on reset. A deck with fewer
// than 5 missions (a valid deck never has more) shows an empty placeholder outline for the rest.
//
// Every column, filled or empty, reserves fixed space for its controls, so the column layout
// does not shift as a mission's piles fill up:
//   - A badge strip below the mission card: the away team badge (#602), moved there from
//     above the mission card by #641 to make room for the dilemmas placed under the mission
//     (below), which now poke out above the mission card instead.
//   - Dilemmas placed under the mission (#606) render face up, stacked behind the mission card
//     in z-order, with a small sliver of each poking out above the mission card's top edge
//     (#641). They are absolutely positioned, so an empty pile reserves no space at all.
//
// The mission card and its ship row (#599) are both drop targets: dropping a ship on either one
// puts it in that mission's ship row, face up. A ship row shows up to 2 ships side by side; a
// third or later ship overlaps the others rather than growing the row, reusing the same
// overlap-offset calculation as the hand (`overlapOffset.ts`, originally #596). When the table has
// spare height, the ship row takes a second and a third row of 2 ships first (#930), and only the
// last row overlaps.
//
// Each ship already sitting in a ship row is itself a drop target too, and takes a placed card (#812): a card
// dropped on its art is placed on the ship (see `ShipCard` below), the same as a card dropped on a
// card in the core or the brig (#810). The ship stays draggable at the same time; a `useDroppable`
// wrapper around the already draggable `TableCard`, the same nesting pattern used for the mission
// card's own drop target, keeps the two roles apart as two different DOM nodes. The ship's crew
// badge (#811) is the only way to board a card by a drag: the same `PersonnelIcon`-and-count pill
// a mission's away team shows (`PileBadge` below), not the plain `CountBadge` circle the draw
// and discard piles use, and shown even with no crew, so the first crew card has somewhere to
// land. A tap anywhere on the ship (`onShipClick`) opens a panel with the ship in its own section
// and every crew card below it (#832; `CardListPanel`, zone `'crew'`, wired up in `page.tsx`), so the badge itself is not a tap
// target of its own: it is a plain, non-interactive `<span>` with `pointer-events-none`, so a tap
// that lands on it falls through to the ship's own `TableCard` button beneath. A ship with cards on
// it shows a second counter, at the other corner (`ShipPlacedOnPill`), and that one is not a tap
// target either (#963): a tap on it opens the crew panel too, which shows the cards on the ship
// below the ship (#957). The ship has one tap region.
//
// A row of 2 or fewer ships fits every ship side by side within the mission column's own width
// with no overlap (see `ShipRow`'s `shipMaxOffset` below); a third ship (or later) overlaps the
// earlier ones almost completely, since the row's width stays bounded and `offsetFor` shrinks the
// per-card offset as the count grows past what fits without overlap (#713). Once a row is in that
// overlapping
// state, every ship's tap opens a panel listing every ship on that row individually instead
// (`CardListPanel`, zone `'shipRow'`, the same list-view pattern the core, the brig, and a ship's
// crew already use) rather than going straight to `onShipClick` — the ship underneath an
// overlapping one is otherwise unreachable for both a tap and a drag. A tap on a ship inside that
// panel selects it, the same as a tap inside any other panel, and does not open its crew panel.
//
// Dropping a card on the mission card routes it by card type. The ship row takes only a ship
// (#886): any other card dropped on the bare row stays where it was. A personnel
// or an equipment joins that mission's away team face down (#870). An event, a mission, or an
// interrupt is placed on the mission card, face up, behind its count pill (#813,
// `PlacedOnCounter`), which sits in the badge strip beside the away team badge (#1069). The
// dilemmas placed on the mission count in a pill of their own, with the dual icon, to the right of
// it (#1081). The last 3 cards of each group also show as small cards in a strip along the edge of
// the mission card (#1099, `PlacedOnStrip`), the events on the left and the dilemmas on the right.
// The touch crop cuts off the mission's span, so it draws the span between the quadrant icon and
// the point box, styled as the card prints it (#1133, `MissionSpan`). It draws the quadrant icon and
// the point box over the scan's too, as large as the span (#1397). An AP mission prints that row
// lower, below the crop, so there the row runs across the whole width (#1272).
// A dilemma
// dropped on a mission, from anywhere, goes under the mission instead (#606, #733), face up, permanently, unless it lands on the bottom half of the mission card,
// which places it on the mission card (#871, `missionHalfDropId`). The top half, where the cards
// under the mission poke out, puts it under the mission (#917). The away team badge sits on
// the badge strip, below (and as a sibling of, not nested inside) the mission card's own
// `<button>` — nesting a badge button inside it would be invalid HTML and would let the mission's
// own tap handler fire first, the same conflict already avoided for the ship's own drop target. The
// badge is a drop target of its own: dropping a card of any type directly on it overrides the
// type-based routing above and files the card into the away team regardless. The badge sits
// geometrically on top of the mission card's larger drop target, so `collisionDetection`
// (`page.tsx`), which ranks every zone the dragged card overlaps by area, smallest first, already
// picks the smaller, nested badge over the mission card beneath it, the same reasoning that lets
// a ship's own drop targets win over its enclosing ship row (#645), which would refuse any card
// but a ship (#886). A tap on the badge opens the away
// team's panel (`CardListPanel`). A tap on the top half of the mission card opens the
// under-the-mission pile's panel (#917), and does nothing when no dilemma is under the mission; a
// tap on the bottom half opens the away team's panel (#967), and a hold on either half previews
// the mission. A single tap acts only once `DOUBLE_TAP_MS` passes with no second tap, because a
// double-tap toggles the mission's completion instead (#1059). The
// under-the-mission pile has no drop target of its own (`UnderMissionStack` below), since the drop
// happens on the mission card's own drop target; a tap on its slivers opens its panel, the same as
// a tap on the top half (#1012).

import { CSSProperties, JSX, ReactNode, useEffect, useRef, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import type { Attempt, CardInstance, MissionPileName, MissionSlot } from './tableReducer';
import { AttemptOverlay, BackToAttemptButton } from './AttemptPanel';
import TableCard, {
  TableCardImage,
  SMALL_CARD_ART_HEIGHT,
  SMALL_CARD_WIDTH,
  TABLE_CARD_ART_HEIGHT,
  TABLE_CARD_WIDTH,
  COMPLETED_IMAGE_CLASSNAME,
  cardBorderWidth,
  fullCardHeight,
} from './TableCard';
import { offsetFor } from './overlapOffset';
import { useDraggedCardType } from './DraggedCardTypeContext';
import { highlightClassName, highlightState } from './zoneAccepts';
import { LandedRing, landedBumpClassName, useLandedNonce } from './LandedZoneContext';
import CountBadge from './CountBadge';
import { LAYER_COUNT_BADGE } from '../../../lib/layers';
import { cardDisplayName } from '../../../lib/cardCount';
import { DOUBLE_TAP_MS, NO_CALLOUT_STYLE, useCardHold } from './useCardHold';
// Imported, not linked as `/icons/...`, so Next.js emits it under `_next/static` and the service
// worker precaches it for offline play (#1051).
import eventIcon from '../../../../public/icons/icon_event.gif';
import dualIcon from '../../../../public/icons/icon_dual.gif';
import alphaQuadrantIcon from '../../../../public/icons/icon_quadrant_alpha.gif';
import deltaQuadrantIcon from '../../../../public/icons/icon_quadrant_delta.gif';
import gammaQuadrantIcon from '../../../../public/icons/icon_quadrant_gamma.gif';
import { CANCEL_RADIUS } from './releaseCancel';

// Issue #717: every pixel size below is tuned against a scale of 1, the 568x320 viewport
// `BADGE_STRIP_HEIGHT_BASE`'s comment describes. The smallest supported screen is now 667x375
// (`MIN_SCREEN`, `tableScale.ts`), where the scale is about 1.17. `page.tsx` passes down a `scale`, computed by
// `useTableScale` (`tableScale.ts`) from the live size of the game layer, that grows past 1 once
// there's more room than that — e.g. once scrolling up hides the browser's own toolbar. `scaled`
// rounds every derived pixel value the same way, so two elements whose base sizes matched still
// match once scaled.
const scaled = (px: number, scale: number): number => Math.round(px * scale);

// A ship row card takes the small card size (`SMALL_CARD_WIDTH`/`SMALL_CARD_ART_HEIGHT` in
// `TableCard.tsx`), so 2 ships fit side by side within the same TABLE_CARD_WIDTH column the mission
// card above them occupies. The mission's own ship row grows it with `scale`.
const SMALL_CARD_MAX_OFFSET_BASE = SMALL_CARD_WIDTH + 2; // 2 ships sit edge to edge with a small gap

// Issue #992: on a desktop (`useFinePointer`, #946) the mission, the dilemmas under it, and the
// ships show the whole card, frame and all, the same as the core and the brig (#926), instead of
// the art crop. A phone or a tablet keeps the crop. The height of the mission card at a scale:
export const missionCardHeight = (scale: number, desktop = false): number =>
  desktop ? fullCardHeight(scaled(TABLE_CARD_WIDTH, scale)) : scaled(TABLE_CARD_ART_HEIGHT, scale);

// A completed mission turns 90° clockwise (#1060), and is drawn at the largest size that fits the
// slot's reserved box, so completing a mission moves nothing. The box is the slot's width by the
// upright card's height.
//
// On a phone or a tablet the slot is the card's own width: the turned art crop fits that width but
// not the height, so it shrinks by `artHeight / cardWidth`. On a desktop every slot reserves the
// width of the turned whole card, `fullCardHeight(cardWidth)`, all the time, and the turned card
// fits it at full size. `slotBudget` is the width the row can give one slot
// (`desktopMissionSlotBudget`, `tableScale.ts`): a desktop too narrow for the wider slots gets a
// slot that fits, down to the card width, and the turned card shrinks to fit that.
export function missionSlotWidth(scale: number, desktop = false, slotBudget = Infinity): number {
  const cardWidth = scaled(TABLE_CARD_WIDTH, scale);
  if (!desktop) return cardWidth;
  return Math.max(cardWidth, Math.min(fullCardHeight(cardWidth), Math.floor(slotBudget)));
}

export function turnedMissionScale(
  scale: number,
  desktop = false,
  slotWidth = missionSlotWidth(scale, desktop),
): number {
  const cardWidth = scaled(TABLE_CARD_WIDTH, scale);
  const cardHeight = missionCardHeight(scale, desktop);
  return Math.min(1, slotWidth / cardHeight, cardHeight / cardWidth);
}

// The mission card has two drop halves (#871), each the full width and half the height of the
// card. They differ only for a dilemma: the top half puts it under the mission (#917), the bottom
// half places it on the mission card. Every other type routes the same way from either half.
export type MissionHalf = 'on' | 'under';
export const missionHalfDropId = (missionIndex: number, half: MissionHalf): string =>
  `mission-${half}-${missionIndex}`;
export const underMissionStackTestId = (missionIndex: number): string =>
  `${missionHalfDropId(missionIndex, 'under')}-stack`;
export const shipRowDropId = (missionIndex: number): string => `ship-row-${missionIndex}`;
// A ship's own droppable, over its art. A personnel or an equipment dropped here boards the crew
// (#600, #893); any other card is placed on the ship (#812).
export const crewDropId = (shipId: string): string => `crew-${shipId}`;

// A mission pile's key (#602): the landed key of a move into the pile (`landedZoneKey.ts`), and the
// `data-testid` of the away team badge. It is not a drop id (#924): the badge strip is part of the
// mission's bottom half, `missionHalfDropId(missionIndex, 'on')`, so a drop there routes by the
// card's type and no drag files a card into the away team by the badge alone.
export const missionPileDropId = (missionIndex: number, pile: MissionPileName): string =>
  `mission-pile-${pile}-${missionIndex}`;

// Both a drop on the mission card and a drop on its ship row resolve to the same mission index
// (#599's plan); this parses either droppable id back to that index.
export function missionIndexFromDropId(id: string): number | null {
  const match = /^(?:mission-on|mission-under|ship-row)-(\d+)$/.exec(id);
  return match ? Number(match[1]) : null;
}

// The half of the mission card a drop landed on (#871), or null for a ship row, which has none.
export function missionHalfFromDropId(id: string): MissionHalf | null {
  const match = /^mission-(on|under)-\d+$/.exec(id);
  return match ? (match[1] as MissionHalf) : null;
}

// Parses a ship's own droppable id back to that ship's instance id (#600's plan).
export function shipIdFromCrewDropId(id: string): string | null {
  const match = /^crew-(.+)$/.exec(id);
  return match ? match[1] : null;
}

function ShipCard({
  ship,
  onShipClick,
  width,
  artHeight,
  badgeHeight,
  desktop,
}: {
  ship: CardInstance;
  onShipClick: (id: string) => void;
  width: number;
  artHeight: number;
  badgeHeight: number;
  desktop: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: crewDropId(ship.id) });
  const draggedType = useDraggedCardType();
  const highlight = highlightState('ship', draggedType, isOver);
  // A move into the crew and a move onto the ship each have their own landed key
  // (`landedZoneKey.ts`), and both play their cue on this ship.
  const crewLandedNonce = useLandedNonce(crewDropId(ship.id));
  const onLandedNonce = useLandedNonce(`on-${ship.id}`);
  const landedNonce = onLandedNonce ?? crewLandedNonce;
  const crewCount = ship.crew?.length ?? 0;
  const onCount = ship.placedOn?.length ?? 0;

  return (
    <div
      ref={setNodeRef}
      data-zone={crewDropId(ship.id)}
      data-highlight={highlight}
      data-landed={landedNonce !== null || undefined}
      className={`relative rounded ${highlightClassName(highlight)}`}
    >
      <TableCard
        instance={ship}
        onClick={() => onShipClick(ship.id)}
        width={width}
        artHeight={artHeight}
        uncropped={desktop}
        draggable
      />
      <ShipCrewBadge
        shipName={cardDisplayName(ship.card)}
        count={crewCount}
        height={badgeHeight}
        landedNonce={crewLandedNonce}
      />
      {onCount > 0 && (
        <ShipPlacedOnPill name={cardDisplayName(ship.card)} count={onCount} height={badgeHeight} landedNonce={onLandedNonce} />
      )}
      <LandedRing nonce={landedNonce} />
    </div>
  );
}

const placedOnLabel = (name: string, count: number, noun = 'card'): string =>
  `${name}, ${count} ${noun}${count === 1 ? '' : 's'} on it`;

// The two groups of the cards placed on a mission card (#1081): the dilemmas, and every other card,
// which the badge strip calls the events. The split is a filter by `card.type`, not a zone of its
// own, so a saved game (#976) needs no migration.
export type PlacedOnGroup = 'events' | 'dilemmas';

export const placedOnGroupOf = (instance: CardInstance): PlacedOnGroup =>
  instance.card.type === 'dilemma' ? 'dilemmas' : 'events';

export const PLACED_ON_GROUP: Record<PlacedOnGroup, { icon: { src: string }; noun: string }> = {
  events: { icon: eventIcon, noun: 'event' },
  dilemmas: { icon: dualIcon, noun: 'dilemma' },
};

// The count of one group of the cards on a mission card (#813, #1081), in the badge strip to the
// right of the away team badge (#1069), and the same pill as `PileBadge`: the STCCG event icon for
// every card that is not a dilemma, and the dual dilemma icon for the dilemmas. It is a tap target
// of its own, so a tap here opens that group of the cards placed on that card. It is not a
// droppable: the mission's bottom half reaches over the badge strip, so a drop on it lands on
// `mission-on-<index>`. A ship shows a corner pill instead, `ShipPlacedOnPill`, which takes no tap
// (#963).
function PlacedOnCounter({
  missionIndex,
  group,
  name,
  count,
  height,
  landedNonce,
  onOpen,
}: {
  missionIndex: number;
  group: PlacedOnGroup;
  name: string;
  count: number;
  height: number;
  landedNonce: number | null;
  onOpen: () => void;
}) {
  const { icon, noun } = PLACED_ON_GROUP[group];
  return (
    <button
      type="button"
      data-testid={`mission-on-${group}-${missionIndex}`}
      onClick={onOpen}
      aria-label={placedOnLabel(name, count, noun)}
      className={`relative flex items-center ${BADGE_PILL_CLASS}`}
      style={{ height: height - 2 }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- a fixed 8 px icon, no optimisation to gain */}
      <img src={icon.src} alt="" aria-hidden="true" className="w-2 h-2" />
      <span key={landedNonce ?? undefined} className={`text-[8px] font-bold ${landedBumpClassName(landedNonce)}`}>
        {count}
      </span>
    </button>
  );
}

// The count of the cards on a ship (#812), at the corner opposite the ship's crew badge. Like
// `ShipCrewBadge` it is a non-interactive `<span>` with `pointer-events-none` (#963), so a tap on it
// falls through to the ship's `TableCard` and opens the crew panel, which shows the cards on the
// ship below the ship (#957).
function ShipPlacedOnPill({
  name,
  count,
  height,
  landedNonce,
}: {
  name: string;
  count: number;
  height: number;
  landedNonce: number | null;
}) {
  return (
    <span
      aria-label={placedOnLabel(name, count)}
      className="absolute -top-1 -left-1 z-10 flex items-center rounded-full bg-black/50 px-1 text-text-primary leading-none pointer-events-none"
      style={{ height: height - 2 }}
    >
      <span key={landedNonce ?? undefined} className={`text-[8px] font-bold ${landedBumpClassName(landedNonce)}`}>
        {count}
      </span>
    </span>
  );
}

// The strips of the cards placed on a mission (#1099): small cards along the edges of the mission
// card, the events on the left and the dilemmas on the right, so the player sees what is on the
// mission without opening a panel. Each strip shows the last `PLACED_ON_STRIP_MAX_VISIBLE` cards of
// its group in `placedOn` order, the most recently placed lowest and on top; the badge in the badge
// strip keeps the full count. The strips start below the mission's title and stop above its point
// box, both measured on a mission image (357x499: the title band ends at about 65 px, and the point
// box starts at about 255 px). The touch crop keeps the top of the image and the desktop card is as
// wide, so both draw the title and the point box at the same offsets, and one layout serves both. At
// scale 1 the room is 36 px, and 3 cards 14 px tall overlap by 3 px each to fit.
//
// Each strip sticks out past the mission card's edge on its side (#1126), so it reads as cards
// placed on the mission and not as part of its art. The overhang does not grow with the scale: the
// `gap-2` between two mission columns is 8 px at every scale, and two neighbouring strips that
// stick out 3 px each leave 2 px of it clear, so they never touch.
const MISSION_TITLE_SHARE = 0.14;
const MISSION_POINT_BOX_SHARE = 0.5;
export const PLACED_ON_STRIP_MAX_VISIBLE = 3;
const PLACED_ON_STRIP_CARD_WIDTH_BASE = 16; // px
const PLACED_ON_STRIP_CARD_HEIGHT_BASE = 14; // px, about the art crop's own shape
export const PLACED_ON_STRIP_OVERHANG = 3; // px past the mission card's edge, at every scale

export function placedOnStripLayout(scale: number): {
  top: number;
  bottom: number;
  overhang: number;
  cardWidth: number;
  cardHeight: number;
  step: number;
} {
  const fullHeight = fullCardHeight(scaled(TABLE_CARD_WIDTH, scale));
  const top = Math.ceil(fullHeight * MISSION_TITLE_SHARE);
  const bottom = Math.floor(fullHeight * MISSION_POINT_BOX_SHARE);
  const cardHeight = scaled(PLACED_ON_STRIP_CARD_HEIGHT_BASE, scale);
  const step = Math.min(cardHeight, Math.floor((bottom - top - cardHeight) / (PLACED_ON_STRIP_MAX_VISIBLE - 1)));
  return {
    top,
    bottom,
    overhang: PLACED_ON_STRIP_OVERHANG,
    cardWidth: scaled(PLACED_ON_STRIP_CARD_WIDTH_BASE, scale),
    cardHeight,
    step,
  };
}

// The span of a mission on the touch crop (#1133). The crop keeps the row of the quadrant icon and
// the point box but cuts off the span the card prints at its bottom centre, so the crop draws the
// span in the gap of that row. The card prints the span as a black disc with a silver ring on a
// black backing, which breaks a rail of brushed-silver bars. The crop builds the row the same way,
// on the line the card already draws there: the quadrant icon and the point box are centred on one
// line (y 283.5 of the 357x499 image), and the grey requirements box starts on that line and runs
// up to the chrome of both (28.5 px in radius, centred 37.5 px in from either edge). So the span is
// centred on that line, the rail runs along it from the chrome of one to the chrome of the other,
// and a grey plate fills under the rail down to the card's border. Both ends are cut on the chrome
// itself, so no art shows between them on either side, whatever the art (#1140).
//
// The span is as large as the quadrant icon and the point box, 57 px across to the outer edge of
// their chrome (#1141), though the card prints it 44 px across. Its numeral grows with it: 19 px on
// the printed 44 px disc, so 19/44 of the disc (the owner's call on #1141). A desktop shows the
// whole card, printed span included, so it draws none.
//
// The quadrant icon and the point box the scan prints look smaller than the drawn span: their chrome
// is a dark bezel, and the disc inside it is about 42 px across, against the span's silver ring of
// about 49. So the crop draws both over the scan, from the card data, on every mission (#1397): the
// quadrant icon on the left chrome's centre and the point box with the mission's points on the right
// chrome's centre, each as large as the span's backing, so each covers the printed chrome. The point
// box is drawn as the card prints it, white numerals on a black face, as the span's (#1419). A
// headquarters has no points, and its point box is a blank black face, as the card prints it.
//
// An AP mission (#1272, `hasApMissionLayout`), the missions 60AP001 to 60AP012, prints a taller art,
// and its row of the quadrant icon, the span and the point box sits at y 340, below the crop. Its art
// shows on the line above, so the crop draws the row there in the same way, but the rail and the
// plate run across the whole width inside the card's border, uncut, since no printed chrome ends them.
const MISSION_SPAN_AXIS_SHARE = 283.5 / 499; // of the full card height
const MISSION_SPAN_CHROME_X = 37.5 / 357; // of the card width, from either edge
const MISSION_SPAN_CHROME_RADIUS = 28.5 / 357; // of the card width
const MISSION_SPAN_BACKING = 2 * MISSION_SPAN_CHROME_RADIUS; // of the card width
const MISSION_SPAN_BACKING_EDGE = 4 / 357; // of the card width: the black between the ring and the bars
const MISSION_SPAN_NUMERAL = 19 / 44; // of the backing's diameter, as the card prints it
const MISSION_SPAN_RAIL = 18 / 357; // of the card width
// The height of a digit of the numeral's font, as a share of its font size, measured in Chromium.
const MISSION_SPAN_DIGIT_EM = 0.78;

export function missionSpanLayout(scale: number): {
  top: number;
  width: number;
  height: number;
  axis: number;
  backing: number;
  backingLeft: number;
  ring: number;
  rim: number;
  numeral: number;
  fontSize: number;
  rail: number;
  bandLeft: number;
  bandWidth: number;
  chromeRadius: number;
  plateBottom: number;
} {
  const width = scaled(TABLE_CARD_WIDTH, scale);
  const axisOnCard = fullCardHeight(width) * MISSION_SPAN_AXIS_SHARE;
  // The disc sits on whole pixels, and as far as the card's width allows, on its centre, so the
  // ring and the numeral do not blur against each other.
  const backing = width - 2 * Math.round((width - width * MISSION_SPAN_BACKING) / 2);
  const ring = backing - 2 * Math.max(1, Math.round(width * MISSION_SPAN_BACKING_EDGE));
  const top = Math.round(axisOnCard - backing / 2);
  // The card's border is an outline over the image. The plate reaches half a pixel into it, which
  // covers the image when the strips sit half a pixel above the card.
  const borderTop = scaled(TABLE_CARD_ART_HEIGHT, scale) - cardBorderWidth(width);
  const plateBottom = borderTop + 0.5 - top;
  const numeral = backing * MISSION_SPAN_NUMERAL;
  const bandLeft = width * MISSION_SPAN_CHROME_X;
  return {
    top,
    width,
    height: Math.max(backing, plateBottom),
    axis: axisOnCard - top,
    backing,
    backingLeft: (width - backing) / 2,
    ring,
    rim: Math.max(1, Math.round(ring / 12)),
    numeral,
    fontSize: Math.round((numeral / MISSION_SPAN_DIGIT_EM) * 10) / 10,
    // As the backing, so the rail's edges fall on whole pixels too.
    rail: backing - 2 * Math.round((backing - width * MISSION_SPAN_RAIL) / 2),
    bandLeft,
    bandWidth: width - 2 * bandLeft,
    chromeRadius: width * MISSION_SPAN_CHROME_RADIUS,
    plateBottom,
  };
}

// Whether a mission's scan has the AP layout, whose row of the quadrant icon, the span and the point
// box sits below the crop (#1272). Rarity `AP` alone is not enough: AP personnel, dilemmas and
// interrupts exist too. The card values are lowercased by `useDataFetching`.
export function hasApMissionLayout(card: { type?: unknown; rarity?: unknown } | undefined): boolean {
  return (
    typeof card?.type === 'string' &&
    card.type.toLowerCase() === 'mission' &&
    typeof card.rarity === 'string' &&
    card.rarity.toLowerCase() === 'ap'
  );
}

// The quadrant icons, imported so the service worker precaches them (#1051). The keys are the
// `quadrant` values of the card data.
const QUADRANT_ICON_IMAGES: Record<string, { src: string; name: string }> = {
  a: { src: alphaQuadrantIcon.src, name: 'Alpha' },
  d: { src: deltaQuadrantIcon.src, name: 'Delta' },
  g: { src: gammaQuadrantIcon.src, name: 'Gamma' },
};

// The rail: a bright, a darker and a bright band, as the card prints its bars.
const MISSION_SPAN_RAIL_IMAGE =
  'linear-gradient(to bottom, #6b7280 0%, #f3f4f6 14%, #a1a7b0 34%, #4b5563 42%, #6b7280 50%, #4b5563 58%, #a1a7b0 66%, #e5e7eb 86%, #6b7280 100%)';
// The grey of the requirements box, a little lighter at the top.
const MISSION_SPAN_PLATE_IMAGE = 'linear-gradient(to bottom, #d4d5d8, #b9babe)';
// The silver ring: brighter at the top left, darker at the bottom right.
const MISSION_SPAN_RING = 'linear-gradient(135deg, #ffffff 0%, #d1d5db 35%, #6b7280 75%, #374151 100%)';
// The numeral is upright and skewed about its own centre, as the card's numerals lean. An italic
// font, or the slant a browser makes of an upright one, leans about the baseline, which moves the
// digit off the centre of the ring by a different amount in every font. The box is trimmed to the
// digit itself, so the flex centring puts the digit, not its line box, at the middle of the ring.
// React's `CSSProperties` does not type the text-box properties yet.
const NUMERAL_STYLE = {
  display: 'inline-block',
  transform: 'skewX(-12deg)',
  textBoxTrim: 'trim-both',
  textBoxEdge: 'cap alphabetic',
} as CSSProperties;

// The overlay. It takes no pointer events and is not a droppable, and has no `data-zone` or
// `data-card-id`: a tap, a hold and a drop on it reach the mission card and its halves under it.
// It darkens with a completed mission, as the card's image does (#991). It draws the quadrant icon
// and the point box on every mission (#1397); on an AP mission (`ap`) the band runs uncut (#1272).
function MissionSpan({
  missionIndex,
  span,
  quadrant: quadrantCode,
  points,
  scale,
  completed,
  ap,
}: {
  missionIndex: number;
  span: string;
  quadrant: string;
  points: string;
  scale: number;
  completed: boolean;
  ap: boolean;
}) {
  const layout = missionSpanLayout(scale);
  const { top, width, height, axis, backing, backingLeft, ring, rim, fontSize, rail } = layout;
  const { chromeRadius, plateBottom } = layout;
  const border = cardBorderWidth(width);
  const bandLeft = ap ? border : layout.bandLeft;
  const bandWidth = ap ? width - 2 * border : layout.bandWidth;
  // The rail and the plate start at the disc's centre, which is on the chrome's line to within half
  // a pixel; the cuts are centred on the chrome itself.
  const centre = backing / 2;
  // The rail and the plate run from the centre of one chrome ring to the centre of the other, and
  // each ring's disc is cut out of both, so their ends follow the chrome. On an AP mission they run
  // uncut across the whole width.
  const chromeCut = (y: number): CSSProperties => {
    if (ap) return {};
    const cut = (x: string) =>
      `radial-gradient(circle at ${x} ${y}px, transparent ${chromeRadius}px, black ${chromeRadius + 0.5}px)`;
    const mask = `${cut('0px')}, ${cut('100%')}`;
    return { maskImage: mask, WebkitMaskImage: mask, maskComposite: 'intersect', WebkitMaskComposite: 'source-in' };
  };
  // The quadrant icon and the point box sit on the chrome's centres, on whole pixels.
  const chromeLeft = Math.round(layout.bandLeft - backing / 2);
  const quadrant = QUADRANT_ICON_IMAGES[quadrantCode.toLowerCase()];
  const label = `${quadrant ? `${quadrant.name} Quadrant, ` : ''}Span ${span}${points ? `, ${points} points` : ''}`;
  return (
    <div
      data-testid={`mission-span-${missionIndex}`}
      role="img"
      aria-label={label}
      className={`absolute left-0 pointer-events-none ${completed ? COMPLETED_IMAGE_CLASSNAME : ''}`}
      style={{ top, width, height }}
    >
      <div
        data-testid={`mission-span-${missionIndex}-plate`}
        className="absolute"
        style={{
          left: bandLeft,
          width: bandWidth,
          top: centre,
          height: plateBottom - centre,
          backgroundImage: MISSION_SPAN_PLATE_IMAGE,
          ...chromeCut(axis - centre),
        }}
      />
      <div
        data-testid={`mission-span-${missionIndex}-rail`}
        className="absolute"
        style={{
          left: bandLeft,
          width: bandWidth,
          top: centre - rail / 2,
          height: rail,
          backgroundImage: MISSION_SPAN_RAIL_IMAGE,
          ...chromeCut(axis - centre + rail / 2),
        }}
      />
      {/* The black backing, which breaks the rail. */}
      <div
        className="absolute top-0 rounded-full bg-black flex items-center justify-center"
        style={{ left: backingLeft, width: backing, height: backing }}
      >
        <div className="rounded-full" style={{ width: ring, height: ring, padding: rim, backgroundImage: MISSION_SPAN_RING }}>
          <div
            className="w-full h-full rounded-full bg-black flex items-center justify-center font-sans font-bold leading-none text-white"
            style={{ fontSize }}
          >
            <span data-testid={`mission-span-${missionIndex}-numeral`} style={NUMERAL_STYLE}>
              {span}
            </span>
          </div>
        </div>
      </div>
      <div
        data-testid={`mission-span-${missionIndex}-quadrant`}
        className="absolute top-0 rounded-full bg-black flex items-center justify-center"
        style={{ left: chromeLeft, width: backing, height: backing }}
      >
        <div className="rounded-full" style={{ width: ring, height: ring, padding: rim, backgroundImage: MISSION_SPAN_RING }}>
          <div className="w-full h-full rounded-full bg-black flex items-center justify-center overflow-hidden">
            {quadrant ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={quadrant.src} alt="" draggable={false} className="w-full h-full" />
            ) : (
              <span className="font-sans font-bold leading-none text-white uppercase" style={{ fontSize }}>
                {quadrantCode}
              </span>
            )}
          </div>
        </div>
      </div>
      <div
        data-testid={`mission-span-${missionIndex}-points`}
        className="absolute top-0 rounded-full bg-black flex items-center justify-center"
        style={{ left: width - chromeLeft - backing, width: backing, height: backing }}
      >
        <div className="rounded-full" style={{ width: ring, height: ring, padding: rim, backgroundImage: MISSION_SPAN_RING }}>
          <div
            data-testid={`mission-span-${missionIndex}-points-face`}
            className="w-full h-full rounded-full bg-black flex items-center justify-center font-sans font-bold leading-none text-white"
            style={{ fontSize }}
          >
            {points && (
              <span data-testid={`mission-span-${missionIndex}-points-numeral`} style={NUMERAL_STYLE}>
                {points}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export const placedOnStripTestId = (missionIndex: number, group: PlacedOnGroup): string =>
  `mission-on-${group}-strip-${missionIndex}`;

// One strip. It is not a droppable and has no `data-zone`: a drop on it lands on the mission half
// under it, the same as anywhere else on the card (#917). Its small cards have no `data-card-id`,
// so the scripts still find the one card of each id, in its panel. A tap goes to `onTap`, the
// mission's own tap handler, so it waits out `DOUBLE_TAP_MS` and a double-tap toggles completion
// (#1059).
function PlacedOnStrip({
  missionIndex,
  group,
  name,
  cards,
  layout,
  completed,
  onTap,
}: {
  missionIndex: number;
  group: PlacedOnGroup;
  name: string;
  cards: CardInstance[];
  layout: ReturnType<typeof placedOnStripLayout>;
  completed: boolean;
  onTap: (event: React.MouseEvent<HTMLElement>, group: PlacedOnGroup) => void;
}) {
  if (cards.length === 0) return null;
  const shown = cards.slice(-PLACED_ON_STRIP_MAX_VISIBLE);
  const { noun } = PLACED_ON_GROUP[group];
  return (
    <div
      data-testid={placedOnStripTestId(missionIndex, group)}
      aria-label={`The last ${noun}s placed on ${name}: ${shown.map((c) => cardDisplayName(c.card)).join(', ')}`}
      className="absolute pointer-events-auto touch-manipulation"
      style={{
        ...NO_CALLOUT_STYLE,
        top: layout.top,
        [group === 'events' ? 'left' : 'right']: -layout.overhang,
        width: layout.cardWidth,
        height: layout.cardHeight + layout.step * (shown.length - 1),
      }}
      onClick={(event) => {
        event.stopPropagation();
        onTap(event, group);
      }}
    >
      {shown.map((card, i) => (
        <PlacedOnStripCard
          key={card.id}
          card={card}
          top={i * layout.step}
          zIndex={i + 1}
          width={layout.cardWidth}
          height={layout.cardHeight}
          completed={completed}
        />
      ))}
    </div>
  );
}

// A small card of a strip: the art crop of a table card, and a hold previews this card (#1099).
function PlacedOnStripCard({
  card,
  top,
  zIndex,
  width,
  height,
  completed,
}: {
  card: CardInstance;
  top: number;
  zIndex: number;
  width: number;
  height: number;
  completed: boolean;
}) {
  const holdListeners = useCardHold(card.id);
  return (
    <div
      data-testid="placed-on-strip-card"
      className="absolute inset-x-0"
      style={{ top, zIndex }}
      {...holdListeners}
    >
      <TableCardImage instance={card} width={width} height={height} completed={completed} className="rounded-sm" />
    </div>
  );
}

// The Flip button of a double-sided mission (#765), at the top-right corner of the mission card.
// It sits on the corner of the card as drawn, upright or turned (#1060), and stays upright itself.
// It is a sibling `<button>` of the card's own button, not a droppable, so a drop on it lands on the mission card's drop half beneath. It
// shows only for a mission with a `backimagefile`.
function MissionFlipButton({
  mission,
  height,
  onFlip,
}: {
  mission: CardInstance;
  height: number;
  onFlip: (missionId: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onFlip(mission.id)}
      aria-label={`Flip ${cardDisplayName(mission.card)} to its ${mission.flipped ? 'front' : 'back'}`}
      className="absolute -top-1 -right-1 z-10 flex items-center rounded-full bg-black/50 px-1 text-text-primary leading-none pointer-events-auto"
      style={{ height: height - 2 }}
    >
      <span className="text-[8px] font-bold">Flip</span>
    </button>
  );
}

// A completed mission (#991): a double-tap on the mission card toggles it (#1059), and the card
// darkens. Nothing is drawn over the card, so the point box stays clear. For the keyboard and a
// screen reader, a button beside the card in the tab order toggles it too. It is visually hidden
// until it has focus, and it is not a droppable. Completing a mission does not change the score.
function MissionToggleButton({
  mission,
  missionIndex,
  completed,
  onSetCompleted,
}: {
  mission: CardInstance;
  missionIndex: number;
  completed: boolean;
  onSetCompleted: (missionIndex: number, completed: boolean) => void;
}) {
  return (
    <button
      type="button"
      data-testid={`mission-toggle-${missionIndex}`}
      onClick={(event) => {
        event.stopPropagation();
        onSetCompleted(missionIndex, !completed);
      }}
      aria-pressed={completed}
      className={`sr-only focus:not-sr-only focus:absolute focus:top-0 focus:left-0 ${LAYER_COUNT_BADGE} focus:rounded focus:bg-black/80 focus:px-1 focus:text-[9px] focus:text-text-primary`}
    >
      {`Mark ${cardDisplayName(mission.card)} ${completed ? 'not complete' : 'complete'}`}
    </button>
  );
}

// The badge strip's fixed (scale-1) height (#602): tall enough to fit an icon+count badge,
// reserved on every mission column regardless of how many badges that mission actually shows, so
// a mission with 1, 2, or 3 badges keeps the same column layout as its neighbours. Three badges
// (the away team, the events and the dilemmas on the mission, #1081), each with a two-digit count,
// sit side by side within a scale-1 TABLE_CARD_WIDTH: each pill is about 22 px wide with
// `BADGE_PILL_CLASS`'s tight padding, and the strip's `gap-0.5` adds 4 px. At 568x320 (the
// old minimum screen, scale 1) they still leave the mission's own title, below the art,
// fully visible. Grows with `scale` (#717) along with the mission column's other chrome.
const BADGE_STRIP_HEIGHT_BASE = 14; // px
// The pill of every badge in the badge strip. The padding and the gap are tight so three pills
// with two-digit counts fit the narrowest mission column (#1081).
const BADGE_PILL_CLASS = 'gap-px rounded-full bg-black/50 px-0.5 text-text-primary leading-none';
// The gap between the mission card, its badge strip, and its ship row (Tailwind's `gap-1`).
const COLUMN_GAP = 4; // px

// Small inline icons (not react-icons) so the three badges are visually distinct at this size.
function PersonnelIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-2 h-2" aria-hidden="true">
      <circle cx="12" cy="7" r="4" />
      <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8z" />
    </svg>
  );
}

// A stack of face-down cards. Unused in this file since the dilemma stack moved out of the
// mission slots (#733); exported for #630, which uses it for the new stack's own badge, and for the
// Draw dilemma button of the attempt strip (#1191), at a size of its own.
export function DilemmaIcon({ className = 'w-2 h-2' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <rect x="3" y="9" width="14" height="10" rx="1.5" />
      <path d="M7 5.5A1.5 1.5 0 0 1 8.5 4h12A1.5 1.5 0 0 1 22 5.5v10a1.5 1.5 0 0 1-1.5 1.5H19V7.5A1.5 1.5 0 0 0 17.5 6H7z" />
    </svg>
  );
}

// Stacked bars, for the under-the-mission pile. Unused by `BadgeStrip` — that pile's control is
// the sliver stack behind the mission card, not a top badge — but required to satisfy
// `PILE_ICON`'s `Record<MissionPileName, ...>` type (#606).
function UnderMissionIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-2 h-2" aria-hidden="true">
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <rect x="3" y="10" width="18" height="4" rx="1" />
      <rect x="3" y="16" width="18" height="4" rx="1" />
    </svg>
  );
}

const PILE_ICON: Record<MissionPileName, () => JSX.Element> = {
  awayTeam: PersonnelIcon,
  underMission: UnderMissionIcon,
};

// The badge's own noun. An away team is not a pile, so its label carries no such word; the
// under-mission pile is one, so its label keeps it.
const PILE_NOUN: Record<MissionPileName, string> = {
  awayTeam: 'Away team',
  underMission: 'Under the mission pile',
};

// A mission pile's badge (#602): a tap opens that pile's panel. It is not a drop target of its own
// (#924): the mission's bottom half reaches down over the badge strip (`MissionHalfTarget`), so a
// drop on the badge routes as a drop on the mission card does, and a personnel or an equipment
// joins the away team (#870). It shows with an empty pile too, the same as a ship's crew badge
// (#811): the icon alone, with no count, and nothing to open.
export function PileBadge({
  missionIndex,
  pile,
  count,
  onOpen,
  height,
}: {
  missionIndex: number;
  pile: MissionPileName;
  count: number;
  onOpen: (missionIndex: number, pile: MissionPileName) => void;
  height: number;
}) {
  // A badge the drop itself creates (count 0 -> 1) reads the landed zones on its first render,
  // so the cue plays as it mounts (#778).
  const landedNonce = useLandedNonce(missionPileDropId(missionIndex, pile));
  const Icon = PILE_ICON[pile];

  return (
    <button
      type="button"
      data-testid={missionPileDropId(missionIndex, pile)}
      data-landed={landedNonce !== null || undefined}
      onClick={count > 0 ? () => onOpen(missionIndex, pile) : undefined}
      aria-label={`${PILE_NOUN[pile]}, ${count} card${count === 1 ? '' : 's'}${count > 0 ? ', tap to open' : ''}`}
      className={`relative flex items-center ${BADGE_PILL_CLASS} ${count === 0 ? 'opacity-60' : ''}`}
      style={{ height: height - 2 }}
    >
      <Icon />
      {count > 0 && (
        <span key={landedNonce ?? undefined} className={`text-[8px] font-bold ${landedBumpClassName(landedNonce)}`}>
          {count}
        </span>
      )}
      <LandedRing nonce={landedNonce} />
    </button>
  );
}

// A ship's crew badge: the same `PersonnelIcon`-and-count pill style `PileBadge` uses for a
// mission's away team, so the same kind of thing — personnel in a pile — always gets the
// same badge. It sits as a sibling of the ship's own `TableCard` button, inside `ShipCard`'s
// `crewDropId` wrapper, since a `<button>` cannot nest inside another `<button>` (the ship's own
// button) — the same reasoning `PileBadge` documents above for the mission's own badges. A tap
// on the ship opens its crew panel (`onShipClick`), so the badge itself is not a tap target: a non-interactive `<span>` with
// `pointer-events-none`, so a tap that lands on it falls through to the ship's `TableCard` button
// underneath rather than being swallowed here. It is not a drop target (#923): a drop anywhere on
// the ship lands on the ship's own `crewDropId`, which boards a personnel or an equipment (#893).
// It shows with an empty crew too: the icon alone, with no count.
function ShipCrewBadge({
  shipName,
  count,
  height,
  landedNonce,
}: {
  shipName: string;
  count: number;
  height: number;
  landedNonce: number | null;
}) {
  return (
    <span
      aria-label={`${shipName} crew, ${count} card${count === 1 ? '' : 's'}`}
      className={`absolute -top-1 -right-1 z-10 flex items-center gap-0.5 rounded-full bg-black/50 px-1 text-text-primary leading-none pointer-events-none ${
        count === 0 ? 'opacity-60' : ''
      }`}
      style={{ height: height - 2 }}
    >
      <PersonnelIcon />
      {count > 0 && (
        <span key={landedNonce ?? undefined} className={`text-[8px] font-bold ${landedBumpClassName(landedNonce)}`}>
          {count}
        </span>
      )}
    </span>
  );
}

type PlacedOnBadge = { group: PlacedOnGroup; count: number; landedNonce: number | null };

// The away team badge, and to its right the count of the events placed on the mission card
// (#1069), then the count of the dilemmas placed on it (#1081), each only when its count is above
// 0. The strip stays centred, so the away team badge shifts left as the other badges appear.
function BadgeStrip({
  missionIndex,
  awayTeamCount,
  onOpenPile,
  placedOn,
  height,
  showAwayTeam,
}: {
  missionIndex: number;
  awayTeamCount: number;
  onOpenPile: (missionIndex: number, pile: MissionPileName) => void;
  placedOn: { name: string; badges: PlacedOnBadge[]; onOpen: (group: PlacedOnGroup) => void } | null;
  height: number;
  // The attempt layout (#1164) shows the away team badge in the ships column instead.
  showAwayTeam: boolean;
}) {
  return (
    <div className="w-full flex items-center justify-center gap-0.5" style={{ height }}>
      {showAwayTeam && (
        <PileBadge missionIndex={missionIndex} pile="awayTeam" count={awayTeamCount} onOpen={onOpenPile} height={height} />
      )}
      {placedOn?.badges
        .filter((badge) => badge.count > 0)
        .map((badge) => (
          <PlacedOnCounter
            key={badge.group}
            missionIndex={missionIndex}
            group={badge.group}
            name={placedOn.name}
            count={badge.count}
            height={height}
            landedNonce={badge.landedNonce}
            onOpen={() => placedOn.onOpen(badge.group)}
          />
        ))}
    </div>
  );
}

// The landed nonce of a drop onto a mission card, for one group's badge only: the events and the
// dilemmas share the landed key `on-<mission id>`, so the badge whose count grew with that nonce
// bumps, and the other does not (#1081).
function useGroupLandedNonce(landedNonce: number | null, count: number): number | null {
  const [lastCount, setLastCount] = useState(count);
  const [ownNonce, setOwnNonce] = useState<number | null>(null);
  // React's pattern for storing information from previous renders: adjust the state during render
  // when the count changes, so the nonce is the group's own in the same render.
  let own = ownNonce;
  if (count !== lastCount) {
    setLastCount(count);
    if (landedNonce !== null && count > lastCount) {
      own = landedNonce;
      setOwnNonce(landedNonce);
    }
  }
  return landedNonce !== null && own === landedNonce ? landedNonce : null;
}

// The under-the-mission stack shows at most two slivers (#917); the count on the stack, and the
// hidden button's aria-label, keep the true number.
const UNDER_MISSION_MAX_VISIBLE = 2;
// Each sliver pokes out by about 10% of the card height (#968, 5% before).
const UNDER_MISSION_SLIVER_FRACTION = 0.1;

const underMissionSliver = (cardArtHeight: number): number =>
  Math.max(1, Math.round(cardArtHeight * UNDER_MISSION_SLIVER_FRACTION));

// How far, in px, the stack of slivers pokes out above the mission card: 0 for an empty pile.
const underMissionStackHeight = (cardArtHeight: number, count: number): number =>
  underMissionSliver(cardArtHeight) * Math.min(count, UNDER_MISSION_MAX_VISIBLE);

// `page.tsx`'s own `p-4` padding above the mission row, which the stack pokes into.
const TABLE_TOP_PADDING = 16; // px

// The room the mission row moves down by (#968), so a full stack of slivers stays below the top
// edge of the table: the height of two slivers, less the padding already above the row.
// `PracticeTable.tsx` pads the row's wrapper, not `MissionRow` alone.
export function underMissionHeadroom(scale: number, desktop = false): number {
  const stackHeight = underMissionSliver(missionCardHeight(scale, desktop)) * UNDER_MISSION_MAX_VISIBLE;
  return Math.max(0, stackHeight - TABLE_TOP_PADDING);
}

// The dilemmas placed under the mission (#606), rendered face up and stacked directly behind the
// mission card in z-order, each poking a small sliver out above the mission card's top edge
// (#641). Absolutely positioned within the mission's own relatively positioned drop target
// (`MissionColumn` below), so an empty pile renders nothing and reserves no space. The stack sits on
// top of the mission's top drop half (#990), so it takes the taps of that half itself (#1012): a
// tap on a sliver, or on the count badge, opens the pile's panel (`CardListPanel`), and a hold
// previews the mission (`holdId`), the same as on the top half of the mission card. A visually
// hidden button keeps the pile's name and count for a
// screen reader and a keyboard, and `practice_drag.sh` reads its aria-label. The card images have
// no click handling of their own (`pointer-events-none`). The stack is not a drop target (#861), so
// it has no `data-zone`; its `data-testid`, `mission-under-<index>-stack` (#920), names the
// mission, and `practice_drag.sh` strips the `-stack` to print the drop target's own name.
function UnderMissionStack({
  missionIndex,
  cards,
  onOpen,
  cardWidth,
  cardArtHeight,
  uncropped,
  holdId,
}: {
  missionIndex: number;
  cards: CardInstance[];
  onOpen: (missionIndex: number, pile: MissionPileName) => void;
  cardWidth: number;
  cardArtHeight: number;
  uncropped: boolean;
  // The mission card a hold on the slivers previews; none in a mission slot with no mission card.
  holdId?: string;
}) {
  const landedNonce = useLandedNonce(missionPileDropId(missionIndex, 'underMission'));
  const holdListeners = useCardHold(holdId ?? '');
  if (cards.length === 0) return null;
  const sliver = underMissionSliver(cardArtHeight);
  const shown = cards.slice(-UNDER_MISSION_MAX_VISIBLE);
  const stackHeight = underMissionStackHeight(cardArtHeight, cards.length);

  return (
    <div
      data-testid={underMissionStackTestId(missionIndex)}
      className="absolute inset-x-0 touch-manipulation"
      style={{ ...NO_CALLOUT_STYLE, top: -stackHeight, height: stackHeight }}
      data-landed={landedNonce !== null || undefined}
      {...(holdId ? holdListeners : {})}
      onClick={() => onOpen(missionIndex, 'underMission')}
    >
      {shown.map((card, i) => (
        <div
          key={card.id}
          className="absolute inset-x-0 flex items-center justify-center pointer-events-none"
          style={{ top: i * sliver, zIndex: i + 1 }}
        >
          <TableCard
            instance={card}
            onClick={() => {}}
            width={cardWidth}
            artHeight={cardArtHeight}
            uncropped={uncropped}
            holdable={false}
          />
        </div>
      ))}
      <button
        type="button"
        onClick={(event) => {
          // The stack's own tap handler opens the same panel, so the click stops here.
          event.stopPropagation();
          onOpen(missionIndex, 'underMission');
        }}
        aria-label={`${PILE_NOUN.underMission}, ${cards.length} card${
          cards.length === 1 ? '' : 's'
        }, tap to open`}
        className="sr-only"
      />
      {/* The same count badge as the draw deck, the hands, and the discard pile (#996). The
          hidden button above already names the count, and a tap falls through to the stack.
          The stack sits at the very top of the table, so the wrapper moves the badge down by its
          `-top-2` overhang: without it the top of the badge is cut off by the viewport. */}
      <span aria-hidden="true" className="absolute inset-x-0 top-2 pointer-events-none">
        <CountBadge count={cards.length} landedNonce={landedNonce} />
      </span>
      <LandedRing nonce={landedNonce} />
    </div>
  );
}

// The gap between two rows of ships (#930), the same as the gap between the mission card, its
// badge strip, and its ship row.
export const SHIP_ROW_GAP = COLUMN_GAP;

// The height of one row of ships (#930): a ship card's art, with no title line below it (#634), or
// the whole ship card on a desktop (#992).
export const shipRowLineHeight = (scale: number, desktop = false): number =>
  desktop ? fullCardHeight(scaled(SMALL_CARD_WIDTH, scale)) : scaled(SMALL_CARD_ART_HEIGHT, scale);

// How many ships one row holds with no overlap (#930): 2 at the column width of every scale. The
// attempt layout (#1164) gives its ship rows a width of their own, `rowWidth`.
export function shipsPerRow(scale: number, rowWidth = scaled(TABLE_CARD_WIDTH, scale)): number {
  const cardWidth = scaled(SMALL_CARD_WIDTH, scale);
  const maxOffset = scaled(SMALL_CARD_MAX_OFFSET_BASE, scale);
  return Math.max(1, Math.floor((rowWidth - cardWidth) / maxOffset) + 1);
}

// The rows a ship row fills (#930): as many as its ships need at `shipsPerRow` each, never more
// than the table has room for (`useShipRowCount`, `tableScale.ts`), and always at least 1.
export function shipRowsUsed(shipCount: number, availableRows: number, scale: number, rowWidth?: number): number {
  return Math.max(1, Math.min(availableRows, Math.ceil(shipCount / shipsPerRow(scale, rowWidth))));
}

// The width of a ship card at a scale, and the height of the badge strip (#602).
export const shipCardWidth = (scale: number): number => scaled(SMALL_CARD_WIDTH, scale);
export const badgeStripHeight = (scale: number): number => scaled(BADGE_STRIP_HEIGHT_BASE, scale);
export const MISSION_COLUMN_GAP = COLUMN_GAP;
// The width a ship row needs to hold `perRow` ships side by side with no overlap.
export const shipRowWidth = (scale: number, perRow: number): number =>
  scaled(SMALL_CARD_WIDTH, scale) + (perRow - 1) * scaled(SMALL_CARD_MAX_OFFSET_BASE, scale);

// The room above the mission card that a full stack of slivers needs, with no table padding to
// poke into: the attempt layout (#1164) has its strip above the mission.
export const underMissionStackRoom = (scale: number, uncropped = false): number =>
  underMissionSliver(missionCardHeight(scale, uncropped)) * UNDER_MISSION_MAX_VISIBLE;

// The height of a whole mission column (#992), from the top of the room the row moves down by
// (`underMissionHeadroom`) to the bottom of `rows` rows of ships: the mission card, the badge
// strip, and the ship rows, with the gaps between them. `useMissionScale` (`tableScale.ts`)
// grows the cards, on a desktop and on a touch screen, until this fills the height above the bottom row.
export function missionColumnHeight(scale: number, desktop: boolean, rows: number): number {
  return (
    underMissionHeadroom(scale, desktop) +
    missionCardHeight(scale, desktop) +
    COLUMN_GAP +
    scaled(BADGE_STRIP_HEIGHT_BASE, scale) +
    COLUMN_GAP +
    rows * shipRowLineHeight(scale, desktop) +
    (rows - 1) * SHIP_ROW_GAP
  );
}

// Fills the rows in order (#930): every row but the last holds `perRow` ships, and the last row
// holds the rest, overlapping as the single row did before once it holds more than `perRow`.
function splitIntoRows<T>(ships: T[], perRow: number, rows: number): T[][] {
  const result: T[][] = [];
  for (let row = 0; row < rows; row++) {
    const last = row === rows - 1;
    result.push(ships.slice(row * perRow, last ? undefined : (row + 1) * perRow));
  }
  return result;
}

export function ShipRow({
  missionIndex,
  ships,
  onShipClick,
  onOpenShipRow,
  columnWidth,
  scale,
  availableRows,
  desktop,
}: {
  missionIndex: number;
  ships: CardInstance[];
  onShipClick: (shipId: string) => void;
  onOpenShipRow: (missionIndex: number) => void;
  columnWidth: number;
  scale: number;
  availableRows: number;
  desktop: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: shipRowDropId(missionIndex) });
  const draggedType = useDraggedCardType();
  // An empty row shows nothing, not even the faint `valid` ring, until a ship is over it (#947).
  // The mission card is the visible target for a ship; the row stays a drop target.
  const rawHighlight = highlightState('shipRow', draggedType, isOver);
  const highlight = ships.length === 0 && rawHighlight === 'valid' ? undefined : rawHighlight;
  const landedNonce = useLandedNonce(shipRowDropId(missionIndex));
  const shipCardWidth = scaled(SMALL_CARD_WIDTH, scale);
  const shipCardArtHeight = shipRowLineHeight(scale, desktop);
  const shipMaxOffset = scaled(SMALL_CARD_MAX_OFFSET_BASE, scale);
  const shipRowMaxWidth = columnWidth; // bounds the row to the column's own (scaled) width
  // The rows the ships fill (#930). The block grows with them, and the drop target covers the
  // whole block, so a ship dropped on any of its rows lands in the ship row.
  const rowCount = shipRowsUsed(ships.length, availableRows, scale, columnWidth);
  const rows = splitIntoRows(ships, shipsPerRow(scale, columnWidth), rowCount);
  const shipRowHeight = rowCount * shipCardArtHeight + (rowCount - 1) * SHIP_ROW_GAP;
  const lastRow = rows[rows.length - 1];
  const lastOffset = offsetFor(lastRow.length, shipCardWidth, shipRowMaxWidth, shipMaxOffset);
  // True once the last row holds more ships than fit without overlap (#713, #930): 2 ships fit at
  // `shipMaxOffset` with a gap and no overlap, 3 or more shrink the offset below that. Every row
  // before the last holds only as many as fit, so only the last row can overlap. A row of one ship
  // is excluded, where `offsetFor` returns 0 (unused) with nothing behind it to overlap.
  const overlapping = lastRow.length > 1 && lastOffset < shipMaxOffset;
  const handleShipTap = overlapping ? () => onOpenShipRow(missionIndex) : onShipClick;
  const badgeHeight = scaled(BADGE_STRIP_HEIGHT_BASE, scale);

  return (
    <div
      ref={setNodeRef}
      data-zone={shipRowDropId(missionIndex)}
      data-highlight={highlight}
      data-landed={landedNonce !== null || undefined}
      className={`relative w-full flex flex-col items-center justify-start rounded ${highlightClassName(highlight)}`}
      style={{ height: shipRowHeight, gap: SHIP_ROW_GAP }}
    >
      {ships.length > 0 &&
        rows.map((rowShips, row) => {
          const offset = offsetFor(rowShips.length, shipCardWidth, shipRowMaxWidth, shipMaxOffset);
          const rowWidth = shipCardWidth + offset * (rowShips.length - 1);
          const first = rows.slice(0, row).reduce((sum, r) => sum + r.length, 0);
          return (
            <div
              key={row}
              data-testid={`ship-row-${missionIndex}-line-${row}`}
              className="relative"
              style={{ width: rowWidth, height: shipCardArtHeight }}
            >
              {rowShips.map((ship, idx) => (
                <div
                  key={ship.id}
                  className="absolute top-0"
                  style={{ left: idx * offset, zIndex: first + idx + 1 }}
                >
                  <ShipCard
                    ship={ship}
                    onShipClick={handleShipTap}
                    width={shipCardWidth}
                    artHeight={shipCardArtHeight}
                    badgeHeight={badgeHeight}
                    desktop={desktop}
                  />
                </div>
              ))}
            </div>
          );
        })}
      <LandedRing nonce={landedNonce} />
    </div>
  );
}

// True when a tap on the mission card lands on its top half (#917), where the cards under the
// mission poke out. A tap there opens the under-the-mission panel, and a tap on the bottom half
// opens the away team panel (#967).
function isTopHalfTap(event: React.MouseEvent<HTMLElement>): boolean {
  const rect = event.currentTarget.getBoundingClientRect();
  return event.clientY < rect.top + rect.height / 2;
}

// One of the mission card's two drop halves (#871), laid over the card like a `PileHalf`
// (`page.tsx`), but with `pointer-events-none`: dnd-kit measures the rect, so a drop still lands,
// while the hold preview on the mission's `TableCard` and the taps on the badge strip still work.
// During a dilemma drag each half shows its own highlight and, under the pointer, its label; for
// any other type both halves report the whole card's state and the card itself shows the ring.
// The halves span the slot's reserved width (#1060), so on a desktop a drop anywhere on a turned
// mission lands; they are not turned with the card, so they stay a top and a bottom half.
function MissionHalfTarget({
  setNodeRef,
  isOver,
  dropId,
  half,
  label,
  split,
  draggedType,
  eitherOver,
  reach = 0,
  side,
}: {
  setNodeRef: (element: HTMLElement | null) => void;
  isOver: boolean;
  dropId: string;
  half: MissionHalf;
  label: string;
  split: boolean;
  draggedType: string | null;
  eitherOver: boolean;
  // How far, in px, the half reaches past the card: the bottom half down over the badge strip
  // (#924), the top half up over the dilemmas under the mission (#990).
  reach?: number;
  // The column of the placed cards right of the card in the attempt layout (#1180), past a gap: the
  // bottom half's droppable then spans the whole card, the gap and the column, from the card's top
  // to the end of its reach. The top half lies inside it and, smaller, outranks it under
  // `pointerWithin`, so the top half of the card still goes under. The highlight shows on the bottom
  // half and the column only.
  side?: { gap: number; width: number };
}) {
  const highlight = highlightState('mission', draggedType, split ? isOver : eitherOver);
  if (side) {
    const partClassName = `absolute ${split ? highlightClassName(highlight) : ''}`;
    return (
      <div
        ref={setNodeRef}
        data-zone={dropId}
        data-highlight={highlight}
        className="absolute left-0 top-0 pointer-events-none"
        style={{ right: -(side.gap + side.width), bottom: -reach }}
      >
        <div
          className={`${partClassName} left-0 bottom-0 rounded-b-lg`}
          style={{ right: side.gap + side.width, height: `calc(50% + ${reach / 2}px)` }}
        >
          {split && isOver && (
            <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-white bg-black/60 rounded">
              {label}
            </span>
          )}
        </div>
        <div className={`${partClassName} right-0 top-0 rounded`} style={{ width: side.width, bottom: reach }} />
      </div>
    );
  }
  return (
    <div
      ref={setNodeRef}
      data-zone={dropId}
      data-highlight={highlight}
      className={`absolute inset-x-0 h-1/2 pointer-events-none ${half === 'under' ? 'top-0 rounded-t-lg' : 'bottom-0 rounded-b-lg'} ${
        split ? highlightClassName(highlight) : ''
      }`}
      style={
        reach > 0
          ? { [half === 'under' ? 'top' : 'bottom']: -reach, height: `calc(50% + ${reach}px)` }
          : undefined
      }
    >
      {split && isOver && (
        <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-white bg-black/60 rounded">
          {label}
        </span>
      )}
    </div>
  );
}

// The words of the two drop halves during a dilemma drag (#871, #917). In the facing phase of the
// attempt layout (#1424) they say what the drop means there: a dilemma goes under the mission when
// the player overcomes it, and on the card when its text places it there.
const MISSION_HALF_LABELS = {
  table: { on: 'On', under: 'Under' },
  facing: { on: 'Place on', under: 'Overcome' },
} as const;

// The mission card of a slot, with everything it does on the table, and its badge strip below it:
// `MissionColumn` stacks the ship row under it, and the attempt layout (#1164) puts the ships beside
// it. Both render this one component, so the attempted mission keeps every behaviour of the card.
export function MissionCard({
  missionIndex,
  slot,
  onOpenPile,
  onOpenPlacedOn,
  onFlipMission,
  onSetMissionCompleted,
  overlay,
  scale,
  uncropped,
  slotWidth,
  showAwayTeam = true,
  placedOnColumn,
  facing = false,
}: {
  missionIndex: number;
  slot: MissionSlot;
  onOpenPile: (missionIndex: number, pile: MissionPileName) => void;
  onOpenPlacedOn: (targetId: string, group?: PlacedOnGroup) => void;
  onFlipMission: (missionId: string) => void;
  onSetMissionCompleted: (missionIndex: number, completed: boolean) => void;
  // The contents of the attempt overlay on the card (#1163, #1164), or undefined for none.
  overlay?: ReactNode;
  scale: number;
  // The whole card rather than the art crop: on a desktop (#992), and in the attempt layout.
  uncropped: boolean;
  // The width the slot reserves (`missionSlotWidth`): the card's own width on a touch screen, and
  // the turned card's width on a desktop (#1060).
  slotWidth: number;
  showAwayTeam?: boolean;
  // The column of the placed cards beside the card in the attempt layout (#1180): the card then
  // draws no strips, and its bottom half reaches over the column.
  placedOnColumn?: { gap: number; width: number };
  // The attempted mission in the facing phase of the attempt layout (#1424): the halves read
  // "Overcome" and "Place on".
  facing?: boolean;
}) {
  const halfLabels = MISSION_HALF_LABELS[facing ? 'facing' : 'table'];
  const { setNodeRef: setOnNodeRef, isOver: onIsOver } = useDroppable({ id: missionHalfDropId(missionIndex, 'on') });
  const { setNodeRef: setUnderNodeRef, isOver: underIsOver } = useDroppable({
    id: missionHalfDropId(missionIndex, 'under'),
  });
  const draggedType = useDraggedCardType();
  // Only a dilemma tells the two halves apart (#871), so only a dilemma drag shows them apart.
  // For any other type the whole card highlights while the pointer is over either half.
  const split = draggedType === 'dilemma';
  const eitherOver = onIsOver || underIsOver;
  const highlight = highlightState('mission', draggedType, eitherOver);
  const { mission, awayTeam, underMission } = slot;
  // The cards placed on the mission card (#813), such as the events at the mission.
  const onLandedNonce = useLandedNonce(mission ? `on-${mission.id}` : '');
  // Split by type into the events and the dilemmas (#1081), each with a badge of its own.
  const placedOn = mission?.placedOn ?? [];
  const dilemmaCount = placedOn.filter((c) => placedOnGroupOf(c) === 'dilemmas').length;
  const eventCount = placedOn.length - dilemmaCount;
  const eventLandedNonce = useGroupLandedNonce(onLandedNonce, eventCount);
  const dilemmaLandedNonce = useGroupLandedNonce(onLandedNonce, dilemmaCount);
  const cardWidth = scaled(TABLE_CARD_WIDTH, scale);
  const cardArtHeight = missionCardHeight(scale, uncropped);
  const badgeHeight = scaled(BADGE_STRIP_HEIGHT_BASE, scale);
  // The bottom half reaches over the gap and the badge strip below the card (#924), so a drop on
  // the away team badge routes as a drop on the mission card does.
  const onReach = COLUMN_GAP + badgeHeight;
  // The top half reaches up over the slivers of the dilemmas under the mission (#990).
  const underReach = underMissionStackHeight(cardArtHeight, underMission.length);
  // A completed mission (#991) darkens. A double-tap on the card toggles it (#1059).
  const completed = Boolean(mission && slot.completed);
  // A completed mission turns 90° clockwise inside its slot (#1060). The Flip button sits on the
  // corner of the card as drawn, upright or turned.
  const turnedScale = turnedMissionScale(scale, uncropped, slotWidth);
  const visualWidth = completed ? Math.round(cardArtHeight * turnedScale) : cardWidth;
  const visualHeight = completed ? Math.round(cardWidth * turnedScale) : cardArtHeight;
  // The tap that waits out `DOUBLE_TAP_MS` for a second tap: where it landed, and the panel it
  // opens if no second tap comes.
  // The card and its strips (#1099) share it, so a double-tap toggles completion wherever it lands.
  const pendingTap = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);
  useEffect(
    () => () => {
      if (pendingTap.current) clearTimeout(pendingTap.current.timer);
    },
    [],
  );
  // Runs `action` once `DOUBLE_TAP_MS` passes with no second tap; a second tap toggles completion.
  const deferTap = (event: React.MouseEvent<HTMLElement>, action: () => void) => {
    const pending = pendingTap.current;
    if (pending) {
      clearTimeout(pending.timer);
      pendingTap.current = null;
      if (Math.hypot(event.clientX - pending.x, event.clientY - pending.y) <= CANCEL_RADIUS) {
        onSetMissionCompleted(missionIndex, !completed);
        return;
      }
    }
    const timer = setTimeout(() => {
      pendingTap.current = null;
      action();
    }, DOUBLE_TAP_MS);
    pendingTap.current = { timer, x: event.clientX, y: event.clientY };
  };
  const onMissionClick = (event: React.MouseEvent<HTMLElement>) => {
    // Read the half now: the event's `currentTarget` is gone when the timer fires.
    const pile: MissionPileName = isTopHalfTap(event) ? 'underMission' : 'awayTeam';
    deferTap(event, () => {
      // Like the badges, a tap opens a pile only when it holds a card.
      const count = pile === 'underMission' ? underMission.length : awayTeam.length;
      if (count > 0) onOpenPile(missionIndex, pile);
    });
  };
  // A tap on a strip (#1099) opens the panel of its group, through the same `pendingTap`.
  const onStripTap = (event: React.MouseEvent<HTMLElement>, group: PlacedOnGroup) => {
    if (!mission) return;
    const missionId = mission.id;
    deferTap(event, () => onOpenPlacedOn(missionId, group));
  };
  const stripLayout = placedOnStripLayout(scale);

  return (
    <>
      <div
        data-landed={onLandedNonce !== null || undefined}
        className={`relative w-full flex items-center justify-center rounded ${
          split ? '' : highlightClassName(highlight)
        }`}
      >
        {/* Dilemmas under the mission (#606), stacked behind it and poking out above (#641) */}
        <UnderMissionStack
          missionIndex={missionIndex}
          cards={underMission}
          onOpen={onOpenPile}
          cardWidth={cardWidth}
          cardArtHeight={cardArtHeight}
          uncropped={uncropped}
          holdId={mission?.id}
        />

        <div className="relative z-10 w-full flex items-center justify-center">
          {mission ? (
            <>
              <TableCard
                instance={mission}
                width={cardWidth}
                artHeight={cardArtHeight}
                uncropped={uncropped}
                completed={completed}
                turnedScale={completed ? turnedScale : undefined}
                turnable
                onClick={onMissionClick}
              />
              <MissionToggleButton
                mission={mission}
                missionIndex={missionIndex}
                completed={completed}
                onSetCompleted={onSetMissionCompleted}
              />
              <MissionHalfTarget
                setNodeRef={setOnNodeRef}
                isOver={onIsOver}
                dropId={missionHalfDropId(missionIndex, 'on')}
                half="on"
                label={halfLabels.on}
                split={split}
                draggedType={draggedType}
                eitherOver={eitherOver}
                reach={onReach}
                side={placedOnColumn}
              />
              <MissionHalfTarget
                setNodeRef={setUnderNodeRef}
                isOver={underIsOver}
                dropId={missionHalfDropId(missionIndex, 'under')}
                half="under"
                label={halfLabels.under}
                split={split}
                draggedType={draggedType}
                eitherOver={eitherOver}
                reach={underReach}
              />
              {/* The strips of the placed cards (#1099) and the span (#1133), on the upright card's box.
                  They turn with a completed mission (#1060), so they stay where the card prints them. */}
              <div
                data-testid={`mission-strips-${missionIndex}`}
                className="absolute left-1/2 top-1/2 pointer-events-none motion-safe:transition-transform motion-reduce:transition-none"
                style={{
                  width: cardWidth,
                  height: cardArtHeight,
                  transform: `translate(-50%, -50%)${completed ? ` rotate(90deg) scale(${turnedScale})` : ''}`,
                }}
              >
                {!placedOnColumn && (['events', 'dilemmas'] as const).map((group) => (
                  <PlacedOnStrip
                    key={group}
                    missionIndex={missionIndex}
                    group={group}
                    name={cardDisplayName(mission.card)}
                    cards={placedOn.filter((c) => placedOnGroupOf(c) === group)}
                    layout={stripLayout}
                    completed={completed}
                    onTap={onStripTap}
                  />
                ))}
                {/* The span, which the touch crop cuts off (#1133), with the quadrant icon and the
                    point box as large as it (#1397, #1272). It turns with the card. */}
                {!uncropped && mission.card.span && (
                  <MissionSpan
                    missionIndex={missionIndex}
                    span={String(mission.card.span)}
                    scale={scale}
                    quadrant={String(mission.card.quadrant ?? '')}
                    points={String(mission.card.points ?? '')}
                    completed={completed}
                    ap={hasApMissionLayout(mission.card)}
                  />
                )}
              </div>
              <div
                data-testid={`mission-corners-${missionIndex}`}
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                style={{ width: visualWidth, height: visualHeight }}
              >
                {mission.card.backimagefile && (
                  <MissionFlipButton mission={mission} height={badgeHeight} onFlip={onFlipMission} />
                )}
              </div>
              {/* The attempt in progress (#1163), above the card and its drop halves, upright on a
                  turned mission. */}
              {overlay !== undefined && <AttemptOverlay missionIndex={missionIndex}>{overlay}</AttemptOverlay>}
            </>
          ) : (
            <div
              className="relative w-full rounded-lg border-2 border-dashed border-white/20 flex items-center justify-center text-text-muted text-[9px]"
              style={{ height: cardArtHeight }}
            >
              Mission
              {/* With no mission card to place on, a dilemma goes under the mission from either half. */}
              <MissionHalfTarget
                setNodeRef={setOnNodeRef}
                isOver={onIsOver}
                dropId={missionHalfDropId(missionIndex, 'on')}
                half="on"
                label="Under"
                split={split}
                draggedType={draggedType}
                eitherOver={eitherOver}
                reach={onReach}
              />
              <MissionHalfTarget
                setNodeRef={setUnderNodeRef}
                isOver={underIsOver}
                dropId={missionHalfDropId(missionIndex, 'under')}
                half="under"
                label="Under"
                split={split}
                draggedType={draggedType}
                eitherOver={eitherOver}
                reach={underReach}
              />
            </div>
          )}
        </div>
        <LandedRing nonce={onLandedNonce} />
      </div>

      {/* Badge strip: the away team badge (#602) and the counts of the events (#1069) and the
          dilemmas (#1081) placed on the mission, under the reach of the bottom half (#924). */}
      <BadgeStrip
        missionIndex={missionIndex}
        awayTeamCount={awayTeam.length}
        onOpenPile={onOpenPile}
        placedOn={
          mission
            ? {
                name: cardDisplayName(mission.card),
                badges: [
                  { group: 'events', count: eventCount, landedNonce: eventLandedNonce },
                  { group: 'dilemmas', count: dilemmaCount, landedNonce: dilemmaLandedNonce },
                ],
                onOpen: (group) => onOpenPlacedOn(mission.id, group),
              }
            : null
        }
        height={badgeHeight}
        showAwayTeam={showAwayTeam}
      />
    </>
  );
}

function MissionColumn({
  missionIndex,
  slot,
  onOpenPile,
  onShipClick,
  onOpenShipRow,
  onOpenPlacedOn,
  onFlipMission,
  onSetMissionCompleted,
  attemptOverlay,
  scale,
  shipRows,
  desktop,
  slotWidth,
}: {
  missionIndex: number;
  slot: MissionSlot;
  onOpenPile: (missionIndex: number, pile: MissionPileName) => void;
  onShipClick: (shipId: string) => void;
  onOpenShipRow: (missionIndex: number) => void;
  onOpenPlacedOn: (targetId: string, group?: PlacedOnGroup) => void;
  onFlipMission: (missionId: string) => void;
  onSetMissionCompleted: (missionIndex: number, completed: boolean) => void;
  attemptOverlay?: ReactNode;
  scale: number;
  shipRows: number;
  desktop: boolean;
  slotWidth: number;
}) {
  return (
    <div className="flex flex-col items-center" style={{ width: slotWidth, gap: COLUMN_GAP }}>
      <MissionCard
        missionIndex={missionIndex}
        slot={slot}
        onOpenPile={onOpenPile}
        onOpenPlacedOn={onOpenPlacedOn}
        onFlipMission={onFlipMission}
        onSetMissionCompleted={onSetMissionCompleted}
        overlay={attemptOverlay}
        scale={scale}
        uncropped={desktop}
        slotWidth={slotWidth}
      />
      <ShipRow
        missionIndex={missionIndex}
        ships={slot.ships}
        onShipClick={onShipClick}
        onOpenShipRow={onOpenShipRow}
        columnWidth={scaled(TABLE_CARD_WIDTH, scale)}
        scale={scale}
        availableRows={shipRows}
        desktop={desktop}
      />
    </div>
  );
}

export default function MissionRow({
  missions,
  onOpenPile,
  onShipClick,
  onOpenShipRow,
  onOpenPlacedOn,
  onFlipMission = () => {},
  onSetMissionCompleted = () => {},
  attempt,
  onBackToAttempt = () => {},
  scale = 1,
  shipRows = 1,
  desktop = false,
  slotBudget = Infinity,
}: {
  missions: MissionSlot[];
  onOpenPile: (missionIndex: number, pile: MissionPileName) => void;
  onShipClick: (shipId: string) => void;
  onOpenShipRow: (missionIndex: number) => void;
  // A tap on a counter of the cards on a mission card (#813) opens them: the events or the
  // dilemmas, by the counter's group (#1081).
  onOpenPlacedOn: (targetId: string, group?: PlacedOnGroup) => void;
  // A tap on the Flip button of a double-sided mission (#765) turns it over.
  onFlipMission?: (missionId: string) => void;
  // A double-tap on a mission card, or its hidden focus button, marks it complete or not (#991, #1059).
  onSetMissionCompleted?: (missionIndex: number, completed: boolean) => void;
  // The mission attempt in progress (#1163), while the full table shows (#1164): its mission card
  // shows the overlay, and the overlay's Back to attempt button calls `onBackToAttempt`.
  attempt?: Attempt;
  onBackToAttempt?: () => void;
  // Issue #717: grows the mission cards, the ship cards, and the under-mission pile stack past
  // their base pixel size, computed by `useTableScale` (`tableScale.ts`) from the live size of
  // the game layer. Defaults to 1 (today's fixed sizes) for callers — including this
  // component's own tests — that don't care about the grown state.
  scale?: number;
  // Issue #930: the rows of ships a ship row may fill, computed by `useShipRowCount`
  // (`tableScale.ts`) from the spare height of the table. Defaults to 1, a single row.
  shipRows?: number;
  // Issue #992: a desktop shows the whole mission and ship cards. Defaults to false, the crop.
  desktop?: boolean;
  // Issue #1060: the width the row can give one desktop slot (`desktopMissionSlotBudget`,
  // `tableScale.ts`). Unbounded by default.
  slotBudget?: number;
}) {
  const slotWidth = missionSlotWidth(scale, desktop, slotBudget);
  return (
    <div className="flex flex-row gap-2 justify-center">
      {missions.map((slot, idx) => (
        <MissionColumn
          key={idx}
          missionIndex={idx}
          scale={scale}
          shipRows={shipRows}
          desktop={desktop}
          slotWidth={slotWidth}
          slot={slot}
          onOpenPile={onOpenPile}
          onShipClick={onShipClick}
          onOpenShipRow={onOpenShipRow}
          onOpenPlacedOn={onOpenPlacedOn}
          onFlipMission={onFlipMission}
          onSetMissionCompleted={onSetMissionCompleted}
          attemptOverlay={
            attempt?.missionIndex === idx ? <BackToAttemptButton onBack={onBackToAttempt} /> : undefined
          }
        />
      ))}
    </div>
  );
}
