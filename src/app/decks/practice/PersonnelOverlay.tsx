'use client';

// The format of a personnel table card (#1176), the counterpart of the mission's span (#1133,
// #1141, `MissionSpan` in `MissionRow.tsx`). The art crop cuts off the column of icons the card
// prints left of its skill box and the integrity, cunning and strength it prints along its bottom,
// so the crop draws them again from the card data: the icons in a column at the left of the art,
// below the affiliation icon the crop already shows, and the three attributes in a band whose bottom
// is the bottom edge of the crop (#1236), drawn as the card prints them (#1219): three boxes, each a black frame with a silver line
// along its top and its bottom, filled with the colour of the affiliation, and in it the word in
// white small capitals, "Integrity", "Cunning" or "Strength", and the number right of it. Only a
// cropped, face-up personnel draws it, the brig's too (#1234): the whole card prints both, so a
// desktop panel draws none.
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
// The card prints its boxes 71 of 357 wide and 23 tall, with wide margins. On a crop 69 to 130 px
// wide the words would be 2 to 4 px tall at that size, so the boxes take the whole width, less a
// gap at either side and between them, and are taller.
const BOX_GAP = 0.02;
const BOX_HEIGHT = 0.13;
const BOX_FONT = 0.62; // the capital's font size, of the box's height
// The width of a glyph of a condensed sans, as a share of its font size: the estimate of a word's
// width, past which `textLength` squeezes it into its box, as the card's condensed face is narrow.
const GLYPH_EM = 0.55;
const SMALL_CAP_SCALE = 0.8; // the size of a small capital, of a capital

export const PERSONNEL_MAX_ICONS = 4;

export const ATTRIBUTES = ['integrity', 'cunning', 'strength'] as const;
const attributeName = (attribute: string): string => attribute[0].toUpperCase() + attribute.slice(1);

// The fill of the boxes, by affiliation: the median colour of the boxes on the scans of each
// affiliation's personnel. An affiliation with no entry gets the Borg's grey.
export const ATTRIBUTE_BOX_FILLS: Record<string, string> = {
  bajoran: '#432542',
  borg: '#686973',
  cardassian: '#4a4e68',
  dominion: '#2d1f2f',
  federation: '#3a87ad',
  ferengi: '#b58124',
  klingon: '#780d1b',
  'non-aligned': '#8f7940',
  romulan: '#10462c',
  starfleet: '#0e6292',
  vidiian: '#8d8c41',
  xindi: '#44716a',
};

export function attributeBoxFill(affiliation: unknown): string {
  const key = typeof affiliation === 'string' ? affiliation.trim().toLowerCase() : '';
  return ATTRIBUTE_BOX_FILLS[key] ?? ATTRIBUTE_BOX_FILLS.borg;
}

// The width of a word in small capitals at `fontSize`, by the estimate of `GLYPH_EM`: the first
// letter a capital, the rest small capitals.
const smallCapsWidth = (word: string, fontSize: number): number =>
  word.length === 0 ? 0 : fontSize * GLYPH_EM * (1 + SMALL_CAP_SCALE * (word.length - 1));

// The geometry of the overlay on a crop `cropHeight` tall of a card `width` wide, whose border is
// `border` wide. Every length is a share of the width, so the overlay scales with the card. The band
// ends at the bottom of the crop (#1236), over the card's border there, so no art or frame shows
// under it.
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
  boxLefts: number[];
  boxWidth: number;
  line: number;
  pad: number;
  fontSize: number;
} {
  const inner = width - 2 * border;
  const gap = Math.max(1, Math.round(width * BOX_GAP));
  const boxWidth = Math.floor((inner - 4 * gap) / 3);
  // The pixels left over go to the margins, so the three boxes sit on the card's centre.
  const first = border + Math.floor((inner - 3 * boxWidth - 2 * gap) / 2);
  const boxHeight = Math.max(7, Math.round(width * BOX_HEIGHT));
  return {
    iconTop: Math.round(width * ICON_COLUMN_TOP),
    iconLeft: Math.max(border + 1, Math.round(width * ICON_COLUMN_LEFT)),
    iconSize: Math.round(width * ICON_SIZE),
    iconGap: Math.max(1, Math.round(width * ICON_GAP)),
    bandTop: cropHeight - boxHeight,
    bandHeight: boxHeight,
    boxLefts: [0, 1, 2].map((index) => first + index * (boxWidth + gap)),
    boxWidth,
    // The silver lines, and the black between them and the fill: each about a fourteenth of the
    // box's height, as the card prints them.
    line: Math.max(1, Math.round(boxHeight / 14)),
    pad: Math.max(1, Math.round(boxHeight * 0.2)),
    fontSize: Math.round(boxHeight * BOX_FONT * 10) / 10,
  };
}

// The `textLength` of a box's word: none when the word fits beside its number, or else the width
// left, which squeezes it in.
export function attributeLabelLength(
  label: string,
  value: string,
  layout: Pick<ReturnType<typeof personnelOverlayLayout>, 'boxWidth' | 'line' | 'pad' | 'fontSize'>
): number | undefined {
  const { boxWidth, line, pad, fontSize } = layout;
  const room = boxWidth - 2 * line - 3 * pad - fontSize * GLYPH_EM * value.length;
  return smallCapsWidth(label, fontSize) <= room ? undefined : Math.max(1, Math.floor(room));
}

// The face of the words and the numbers: the card's is a bold, condensed sans.
const ATTRIBUTE_FONT_FAMILY = '"Futura Condensed", "Arial Narrow", "Roboto Condensed", Arial, sans-serif';

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
  card: { icons?: unknown; affiliation?: unknown; integrity?: unknown; cunning?: unknown; strength?: unknown };
  width: number;
  cropHeight: number;
  border: number;
  className?: string;
}) {
  const layout = personnelOverlayLayout(width, cropHeight, border);
  const { iconTop, iconLeft, iconSize, iconGap, bandHeight, boxLefts, boxWidth, line, pad, fontSize } = layout;
  const codes = personnelIconCodes(card.icons).slice(0, PERSONNEL_MAX_ICONS);
  const values = ATTRIBUTES.map((attribute) => String(card[attribute] ?? '').trim());
  const fill = attributeBoxFill(card.affiliation);
  const middle = bandHeight / 2;
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
      <svg
        data-testid="personnel-attributes"
        role="img"
        aria-label={ATTRIBUTES.map((attribute, index) => `${attributeName(attribute)} ${values[index]}`).join(', ')}
        className="absolute left-0 bottom-0 overflow-visible"
        width={width}
        height={bandHeight}
        fontFamily={ATTRIBUTE_FONT_FAMILY}
        fontWeight={700}
        fontSize={fontSize}
      >
        {ATTRIBUTES.map((attribute, index) => {
          const left = boxLefts[index];
          const label = attributeName(attribute);
          const labelLength = attributeLabelLength(label, values[index], layout);
          return (
            <g key={attribute} data-testid={`personnel-${attribute}-box`}>
              {/* The shadow the box casts to the right. It stops at the bottom of the band, which is
                  the bottom of the crop (#1236). */}
              <rect x={left + line} y={line} width={boxWidth} height={bandHeight - line} fill="rgba(0,0,0,0.6)" />
              {/* The black frame, a silver line along its top and its bottom, and the fill inside. */}
              <rect x={left} y={0} width={boxWidth} height={bandHeight} fill="#000" />
              <rect x={left} y={0} width={boxWidth} height={line} fill="#f3f4f6" />
              <rect x={left} y={bandHeight - line} width={boxWidth} height={line} fill="#f3f4f6" />
              <rect
                data-testid={`personnel-${attribute}-fill`}
                x={left + line}
                y={2 * line}
                width={boxWidth - 2 * line}
                height={bandHeight - 4 * line}
                fill={fill}
              />
              <text
                data-testid={`personnel-${attribute}-label`}
                x={left + line + pad}
                y={middle}
                dominantBaseline="central"
                fill="#fff"
                style={{ fontVariant: 'small-caps' }}
                {...(labelLength === undefined ? {} : { textLength: labelLength, lengthAdjust: 'spacingAndGlyphs' })}
              >
                {label}
              </text>
              <text
                data-testid={`personnel-${attribute}`}
                x={left + boxWidth - line - pad}
                y={middle}
                dominantBaseline="central"
                textAnchor="end"
                fill="#fff"
              >
                {values[index]}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
