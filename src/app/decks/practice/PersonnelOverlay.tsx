'use client';

// The format of a personnel table card (#1176), the counterpart of the mission's span (#1133,
// #1141, `MissionSpan` in `MissionRow.tsx`). The art crop cuts off the column of icons the card
// prints left of its skill box and the integrity, cunning and strength it prints along its bottom,
// so the crop draws them again from the card data: the icons in a column at the left of the art,
// below the affiliation icon the crop already shows, and the three attributes in a band along the
// bottom, built from the mission's chrome: a grey plate under a silver rail, broken by a ringed
// black disc for each number. Only a cropped, face-up personnel draws it: the whole card prints
// both, so a desktop panel, the core, the brig and the attempt row draw none.

import type { CSSProperties } from 'react';
import auIcon from '../../../../public/icons/icon_au.gif';
import cmdIcon from '../../../../public/icons/icon_command.gif';
import ds9Icon from '../../../../public/icons/icon_ds9.png';
import earthIcon from '../../../../public/icons/icon_earth.gif';
import futureIcon from '../../../../public/icons/icon_future.gif';
import maquisIcon from '../../../../public/icons/icon_maquis.gif';
import pastIcon from '../../../../public/icons/icon_past.gif';
import staffIcon from '../../../../public/icons/icon_staff.gif';
import terokNorIcon from '../../../../public/icons/icon_teroknor.gif';
import tngIcon from '../../../../public/icons/icon_tng.png';
import tosIcon from '../../../../public/icons/icon_tos.png';
import voyagerIcon from '../../../../public/icons/icon_voyager.png';

// The chrome of a mission's span (#1133), shared with the personnel band.
// The rail: a bright, a darker and a bright band, as the card prints its bars.
export const CHROME_RAIL_IMAGE =
  'linear-gradient(to bottom, #6b7280 0%, #f3f4f6 14%, #a1a7b0 34%, #4b5563 42%, #6b7280 50%, #4b5563 58%, #a1a7b0 66%, #e5e7eb 86%, #6b7280 100%)';
// The grey of the requirements box, a little lighter at the top.
export const CHROME_PLATE_IMAGE = 'linear-gradient(to bottom, #d4d5d8, #b9babe)';
// The silver ring: brighter at the top left, darker at the bottom right.
export const CHROME_RING_IMAGE = 'linear-gradient(135deg, #ffffff 0%, #d1d5db 35%, #6b7280 75%, #374151 100%)';
// The height of a digit of the numeral's font, as a share of its font size, measured in Chromium.
export const CHROME_DIGIT_EM = 0.78;
// The numeral is upright and skewed about its own centre, as the card's numerals lean. An italic
// font, or the slant a browser makes of an upright one, leans about the baseline, which moves the
// digit off the centre of the ring by a different amount in every font. The box is trimmed to the
// digit itself, so the flex centring puts the digit, not its line box, at the middle of the ring.
// React's `CSSProperties` does not type the text-box properties yet.
export const CHROME_NUMERAL_STYLE = {
  display: 'inline-block',
  transform: 'skewX(-12deg)',
  textBoxTrim: 'trim-both',
  textBoxEdge: 'cap alphabetic',
} as CSSProperties;

// The icon files are imported as modules, so they land in `_next/static` and the service worker
// precaches them for offline play (#1051). The codes are those of `CARD_ICON_IMAGES`
// (`missionRequirements.ts`), which the search keeps as `/icons/...` paths.
const PERSONNEL_ICON_IMAGES: Record<string, { src: string }> = {
  au: auIcon,
  cmd: cmdIcon,
  ds9: ds9Icon,
  e: earthIcon,
  fut: futureIcon,
  maq: maquisIcon,
  pa: pastIcon,
  stf: staffIcon,
  tn: terokNorIcon,
  tng: tngIcon,
  tos: tosIcon,
  voy: voyagerIcon,
};

// The icon codes of a card's `icons` value, such as `[cmd][tos][pa][au]`, in order. A code with no
// image is dropped.
export function personnelIconCodes(icons: unknown): string[] {
  if (typeof icons !== 'string') return [];
  return Array.from(icons.toLowerCase().matchAll(/\[([^\]]*)\]/g), (match) => match[1].trim()).filter(
    (code) => code in PERSONNEL_ICON_IMAGES
  );
}

// Whether a card draws the overlay over its crop: a personnel, face up where it is drawn.
export function hasPersonnelOverlay(card: { type?: unknown } | undefined): boolean {
  return typeof card?.type === 'string' && card.type.toLowerCase() === 'personnel';
}

// The shares of the card width. The affiliation icon the crop shows sits in about the top fifth of
// the card's width, so the column starts below it.
const ICON_COLUMN_TOP = 0.2;
const ICON_COLUMN_LEFT = 0.035;
const ICON_SIZE = 0.11;
const ICON_GAP = 0.016;
const BAND_DISC = 0.16; // the backing's diameter, as large as the band
const BAND_RAIL = 18 / 357; // as the mission's rail
const BAND_BACKING_EDGE = 4 / 357; // the black between the ring and the bars, as the mission's
const BAND_NUMERAL = 19 / 44; // of the backing's diameter, as the mission's span
const BAND_DISC_CENTRES = [0.2, 0.5, 0.8]; // integrity, cunning, strength, left to right

export const PERSONNEL_MAX_ICONS = 4;

// The geometry of the overlay on a crop `cropHeight` tall of a card `width` wide, whose border is
// `border` wide. Every length is a share of the width, so the overlay scales with the card.
export function personnelOverlayLayout(
  width: number,
  cropHeight: number,
  border: number
): {
  iconTop: number;
  iconLeft: number;
  iconSize: number;
  iconGap: number;
  bandTop: number;
  bandHeight: number;
  backing: number;
  ring: number;
  rim: number;
  rail: number;
  fontSize: number;
  discLefts: number[];
} {
  // The disc sits on whole pixels, so the ring and the numeral do not blur against each other.
  const backing = Math.max(8, Math.round(width * BAND_DISC));
  const ring = backing - 2 * Math.max(1, Math.round(width * BAND_BACKING_EDGE));
  const bandTop = cropHeight - border - backing;
  const rail = Math.max(2, Math.round(width * BAND_RAIL));
  return {
    iconTop: Math.round(width * ICON_COLUMN_TOP),
    iconLeft: Math.max(border + 1, Math.round(width * ICON_COLUMN_LEFT)),
    iconSize: Math.round(width * ICON_SIZE),
    iconGap: Math.max(1, Math.round(width * ICON_GAP)),
    bandTop,
    bandHeight: backing,
    backing,
    ring,
    rim: Math.max(1, Math.round(ring / 12)),
    rail,
    fontSize: Math.round(((backing * BAND_NUMERAL) / CHROME_DIGIT_EM) * 10) / 10,
    discLefts: BAND_DISC_CENTRES.map((share) => Math.round(width * share - backing / 2)),
  };
}

const ATTRIBUTES = ['integrity', 'cunning', 'strength'] as const;
const attributeName = (attribute: string): string => attribute[0].toUpperCase() + attribute.slice(1);

// The overlay. It takes no pointer events, is not a droppable, and has no `data-zone` or
// `data-card-id`: a tap, a hold and a drop on it reach the card under it. `className` carries the
// stopped look, so a stopped personnel greys out whole (#679).
export default function PersonnelOverlay({
  card,
  width,
  cropHeight,
  border,
  className = '',
}: {
  card: { icons?: unknown; integrity?: unknown; cunning?: unknown; strength?: unknown };
  width: number;
  cropHeight: number;
  border: number;
  className?: string;
}) {
  const layout = personnelOverlayLayout(width, cropHeight, border);
  const { iconTop, iconLeft, iconSize, iconGap, bandTop, bandHeight, backing, ring, rim, rail, fontSize } = layout;
  const codes = personnelIconCodes(card.icons).slice(0, PERSONNEL_MAX_ICONS);
  const values = ATTRIBUTES.map((attribute) => String(card[attribute] ?? '').trim());
  const centre = backing / 2;
  return (
    <div
      data-testid="personnel-overlay"
      className={`absolute inset-0 pointer-events-none ${className}`}
    >
      {codes.length > 0 && (
        <div
          data-testid="personnel-icons"
          className="absolute flex flex-col"
          style={{ top: iconTop, left: iconLeft, gap: iconGap }}
        >
          {codes.map((code, index) => (
            <img
              key={`${code}-${index}`}
              data-icon={code}
              src={PERSONNEL_ICON_IMAGES[code].src}
              alt=""
              aria-hidden="true"
              className="block object-contain drop-shadow"
              style={{ width: iconSize, height: iconSize }}
            />
          ))}
        </div>
      )}
      <div
        data-testid="personnel-attributes"
        role="img"
        aria-label={ATTRIBUTES.map((attribute, index) => `${attributeName(attribute)} ${values[index]}`).join(', ')}
        className="absolute"
        style={{ top: bandTop, left: border, right: border, height: bandHeight }}
      >
        <div
          data-testid="personnel-attributes-plate"
          className="absolute inset-x-0 bottom-0"
          style={{ top: centre, backgroundImage: CHROME_PLATE_IMAGE }}
        />
        <div
          data-testid="personnel-attributes-rail"
          className="absolute inset-x-0"
          style={{ top: centre - rail / 2, height: rail, backgroundImage: CHROME_RAIL_IMAGE }}
        />
        {values.map((value, index) => (
          // The black backing, which breaks the rail.
          <div
            key={ATTRIBUTES[index]}
            className="absolute top-0 rounded-full bg-black flex items-center justify-center"
            style={{ left: layout.discLefts[index] - border, width: backing, height: backing }}
          >
            <div className="rounded-full" style={{ width: ring, height: ring, padding: rim, backgroundImage: CHROME_RING_IMAGE }}>
              <div
                className="w-full h-full rounded-full bg-black flex items-center justify-center font-sans font-bold leading-none text-white"
                style={{ fontSize }}
              >
                <span data-testid={`personnel-${ATTRIBUTES[index]}`} style={CHROME_NUMERAL_STYLE}>
                  {value}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
