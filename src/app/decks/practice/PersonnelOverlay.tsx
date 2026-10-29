'use client';

// The format of a personnel table card (#1176), the counterpart of the mission's span (#1133,
// #1141, `MissionSpan` in `MissionRow.tsx`). The art crop cuts off the column of icons the card
// prints left of its skill box and the integrity, cunning and strength it prints along its bottom,
// so the crop draws them again from the card data: the icons in a column at the left of the art,
// below the affiliation icon the crop already shows, and the three attributes in a band whose bottom
// is the bottom edge of the crop (#1236). On a larger crop the band is drawn as the card prints it
// (#1219): three boxes, each a black frame with a silver line along its top and its bottom, filled
// with the colour of the affiliation, and in it the word in white small capitals, "Integrity",
// "Cunning" or "Strength", and the number right of it. On a small crop, where those words are too
// small to read, the boxes keep their widths and their look, the band is a little taller, and the
// words are "Int", "Cun" and "Str" (#1254). The layout picks the form from its own font size, so
// every place that draws the band follows one rule. Only a
// cropped, face-up personnel draws it, the brig's too (#1234): the whole card prints both, so a
// desktop panel draws none.
//
// A cropped, face-up ship draws the same band (#1336), `ShipOverlay`, with its range, weapons and
// shields, which the crop cuts off too: the same boxes, fill and height rule, and the words in plain
// capitals. It has no icon column. The band picks its words by what fits, never by a squeeze that
// leaves them unreadable: "RNG", "WPN" and "SHD" where they fit, else "R", "W" and "S", else the
// numbers alone (`shipLabelTier`). The ship band has a horizontal spacing of its own,
// `shipOverlayLayout` (#1348): with the personnel's pad, three plain capitals beside one digit fill
// about 0.71 of the room on every abbreviated crop, just under `MIN_LABEL_SQUEEZE`, so the words
// flipped between three letters and one with the rounding of each width. Its plain capitals and
// short words need no inset as wide as the personnel's small capitals do.
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

// Whether a card draws the ship's band over its crop (#1336): a ship, face up where it is drawn.
export function hasShipOverlay(card: { type?: unknown } | undefined): boolean {
  return typeof card?.type === 'string' && card.type.toLowerCase() === 'ship';
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
// The font size below which the band abbreviates the words and grows to `SMALL_BOX_HEIGHT` (#1254):
// every crop at the minimum screen, 667x375, and none of a panel at 1024x768.
const ABBREVIATE_BELOW_FONT = 12;
const SMALL_BOX_HEIGHT = 0.16;
// The width of a glyph of a condensed sans, as a share of its font size: the estimate of a word's
// width, past which `textLength` squeezes it into its box, as the card's condensed face is narrow.
export const GLYPH_EM = 0.55;
const SMALL_CAP_SCALE = 0.8; // the size of a small capital, of a capital
const CAP_HEIGHT = 0.72; // the height of a capital or a digit, of the font size

export const PERSONNEL_MAX_ICONS = 4;

export const ATTRIBUTES = ['integrity', 'cunning', 'strength'] as const;
const attributeName = (attribute: string): string => attribute[0].toUpperCase() + attribute.slice(1);
const attributeAbbreviation = (attribute: string): string => attributeName(attribute).slice(0, 3);

// The ship's attributes and the owner's words for them (#1336).
export const SHIP_ATTRIBUTES = ['range', 'weapons', 'shields'] as const;
const SHIP_ATTRIBUTE_LABELS: Record<(typeof SHIP_ATTRIBUTES)[number], string> = {
  range: 'RNG',
  weapons: 'WPN',
  shields: 'SHD',
};
// The forms of the ship's words, longest first: three letters, one letter, or none.
export type ShipLabelTier = 'three' | 'one' | 'none';
const shipLabel = (attribute: (typeof SHIP_ATTRIBUTES)[number], tier: ShipLabelTier): string =>
  tier === 'three' ? SHIP_ATTRIBUTE_LABELS[attribute] : tier === 'one' ? SHIP_ATTRIBUTE_LABELS[attribute][0] : '';
// The least share of its own width that `textLength` may squeeze a ship's word to. The personnel band
// squeezes "Int" to about 0.82 to 0.88 of its width on the crops of the brig and the panels, where it
// reads; the capitals of "WPN" are wider glyphs and take a little more.
export const MIN_LABEL_SQUEEZE = 0.75;

// The pad of the ship band, of the box's height: half the personnel's (#1348).
const SHIP_PAD = 0.1;
// The narrowest crop that draws the ship's three-letter words (#1348). From it on, "RNG", "WPN" and
// "SHD" fit beside one digit at every width with `SHIP_PAD`; below it they fit at 50 to 53 px and not
// at 54 or 55, and a ship smaller than a personnel crop draws one letter.
export const SHIP_THREE_LETTERS_MIN_WIDTH = 56;

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

// The width of a word in plain capitals at `fontSize`, such as the ship's "WPN" (#1336).
const capitalsWidth = (word: string, fontSize: number): number => fontSize * GLYPH_EM * word.length;

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
  abbreviated: boolean;
} {
  const inner = width - 2 * border;
  const gap = Math.max(1, Math.round(width * BOX_GAP));
  const boxWidth = Math.floor((inner - 4 * gap) / 3);
  // The pixels left over go to the margins, so the three boxes sit on the card's centre.
  const first = border + Math.floor((inner - 3 * boxWidth - 2 * gap) / 2);
  const abbreviated = Math.round(width * BOX_HEIGHT) * BOX_FONT < ABBREVIATE_BELOW_FONT;
  const boxHeight = Math.max(7, Math.round(width * (abbreviated ? SMALL_BOX_HEIGHT : BOX_HEIGHT)));
  const fontSize = Math.round(boxHeight * BOX_FONT * 10) / 10;
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
    fontSize,
    abbreviated,
  };
}

// The `textLength` of a box's word: none when the word fits beside its number, or else the width
// left, which squeezes it in. `smallCaps` false measures the word in plain capitals.
export function attributeLabelLength(
  label: string,
  value: string,
  layout: Pick<ReturnType<typeof personnelOverlayLayout>, 'boxWidth' | 'line' | 'pad' | 'fontSize'>,
  smallCaps = true
): number | undefined {
  const { boxWidth, line, pad, fontSize } = layout;
  const room = boxWidth - 2 * line - 3 * pad - fontSize * GLYPH_EM * value.length;
  const width = smallCaps ? smallCapsWidth(label, fontSize) : capitalsWidth(label, fontSize);
  return width <= room ? undefined : Math.max(1, Math.floor(room));
}

// The layout of the ship band (#1348): the personnel's, with the ship's own pad. The tier, the
// squeeze and the places of the words and the numbers all read this pad.
export function shipOverlayLayout(
  width: number,
  cropHeight: number,
  border: number
): ReturnType<typeof personnelOverlayLayout> & { width: number } {
  const layout = personnelOverlayLayout(width, cropHeight, border);
  return { ...layout, pad: Math.max(1, Math.round(layout.bandHeight * SHIP_PAD)), width };
}

// The longest form of the ship's words that fits every box of the band (#1336): a word fits when
// its plain-capitals width, squeezed to no less than `MIN_LABEL_SQUEEZE` of it, fits beside its number.
// It reads the spacing of `shipOverlayLayout`, and draws three letters only from
// `SHIP_THREE_LETTERS_MIN_WIDTH` on, so the words never lose letters as the crop grows (#1348).
export function shipLabelTier(
  values: Record<(typeof SHIP_ATTRIBUTES)[number], string>,
  layout: Pick<ReturnType<typeof shipOverlayLayout>, 'boxWidth' | 'line' | 'pad' | 'fontSize' | 'width'>
): ShipLabelTier {
  const { boxWidth, line, pad, fontSize, width } = layout;
  const fits = (tier: ShipLabelTier) =>
    SHIP_ATTRIBUTES.every((attribute) => {
      const room = boxWidth - 2 * line - 3 * pad - fontSize * GLYPH_EM * values[attribute].length;
      return capitalsWidth(shipLabel(attribute, tier), fontSize) * MIN_LABEL_SQUEEZE <= room;
    });
  return width >= SHIP_THREE_LETTERS_MIN_WIDTH && fits('three') ? 'three' : fits('one') ? 'one' : 'none';
}

// The face of the words and the numbers: the card's is a bold, condensed sans.
const ATTRIBUTE_FONT_FAMILY = '"Futura Condensed", "Arial Narrow", "Roboto Condensed", Arial, sans-serif';

// The frame of a box of the band, `width` wide.
function AttributeBoxFrame({
  left,
  width,
  height,
  line,
  fill,
  fillTestId,
}: {
  left: number;
  width: number;
  height: number;
  line: number;
  fill: string;
  fillTestId: string;
}) {
  return (
    <>
      {/* The shadow the box casts to the right. It stops at the bottom of the band, which is the
          bottom of the crop (#1236). */}
      <rect x={left + line} y={line} width={width} height={height - line} fill="rgba(0,0,0,0.6)" />
      {/* The black frame, a silver line along its top and its bottom, and the fill inside. */}
      <rect x={left} y={0} width={width} height={height} fill="#000" />
      <rect x={left} y={0} width={width} height={line} fill="#f3f4f6" />
      <rect x={left} y={height - line} width={width} height={line} fill="#f3f4f6" />
      <rect data-testid={fillTestId} x={left + line} y={2 * line} width={width - 2 * line} height={height - 4 * line} fill={fill} />
    </>
  );
}

// The band of three attribute boxes, shared by the personnel and the ship (#1336). The test ids are
// `<prefix>-attributes`, `<prefix>-<attribute>-box`, `-fill`, `-label` and `<prefix>-<attribute>`.
function AttributeBand({
  prefix,
  attributes,
  smallCaps,
  layout,
  fill,
  width,
  labelTier,
}: {
  prefix: string;
  attributes: { key: string; name: string; label: string; value: string }[];
  smallCaps: boolean;
  layout: ReturnType<typeof personnelOverlayLayout>;
  fill: string;
  width: number;
  labelTier?: ShipLabelTier;
}) {
  const { bandHeight, boxLefts, boxWidth, line, pad, fontSize } = layout;
  // The baseline that puts the capitals and the digits on the middle of the box, with as much fill
  // above them as below: `central` centres the em box, whose descender space pushes them up.
  const baseline = bandHeight / 2 + (fontSize * CAP_HEIGHT) / 2;
  return (
    <svg
      data-testid={`${prefix}-attributes`}
      role="img"
      aria-label={attributes.map(({ name, value }) => `${name} ${value}`).join(', ')}
      className="absolute left-0 bottom-0 overflow-visible"
      width={width}
      height={bandHeight}
      fontFamily={ATTRIBUTE_FONT_FAMILY}
      fontWeight={700}
      fontSize={fontSize}
      data-label-tier={labelTier}
    >
      {attributes.map(({ key, label, value }, index) => {
        const left = boxLefts[index];
        const labelLength = attributeLabelLength(label, value, layout, smallCaps);
        return (
          <g key={key} data-testid={`${prefix}-${key}-box`}>
            <AttributeBoxFrame
              left={left}
              width={boxWidth}
              height={bandHeight}
              line={line}
              fill={fill}
              fillTestId={`${prefix}-${key}-fill`}
            />
            {label !== '' && (
              <text
                data-testid={`${prefix}-${key}-label`}
                x={left + line + pad}
                y={baseline}
                fill="#fff"
                style={smallCaps ? { fontVariant: 'small-caps' } : undefined}
                {...(labelLength === undefined ? {} : { textLength: labelLength, lengthAdjust: 'spacingAndGlyphs' })}
              >
                {label}
              </text>
            )}
            {/* With no word, the number sits on the middle of its box. */}
            <text
              data-testid={`${prefix}-${key}`}
              x={label === '' ? left + boxWidth / 2 : left + boxWidth - line - pad}
              y={baseline}
              textAnchor={label === '' ? 'middle' : 'end'}
              fill="#fff"
            >
              {value}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// The overlay. It takes no pointer events, is not a droppable, and has no `data-zone` or
// `data-card-id`: a tap, a hold and a drop on it reach the card under it. `className` carries the
// stopped look, `STOPPED_OVERLAY_CLASSNAME`: grey but opaque, so nothing under the band shows
// through (#1339), while the art under it greys and fades (#679).
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
  const { iconTop, iconLeft, iconSize, iconGap, abbreviated } = layout;
  const codes = personnelIconCodes(card.icons).slice(0, PERSONNEL_MAX_ICONS);
  const attributes = ATTRIBUTES.map((attribute) => ({
    key: attribute,
    name: attributeName(attribute),
    label: abbreviated ? attributeAbbreviation(attribute) : attributeName(attribute),
    value: String(card[attribute] ?? '').trim(),
  }));
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
      <AttributeBand
        prefix="personnel"
        attributes={attributes}
        smallCaps
        layout={layout}
        fill={attributeBoxFill(card.affiliation)}
        width={width}
      />
    </div>
  );
}

// The ship's overlay (#1336): the band alone, with the words of `shipLabelTier`. It takes no pointer
// events and the same `className` as the personnel overlay. The `aria-label` names every attribute
// in full in every tier.
export function ShipOverlay({
  card,
  width,
  cropHeight,
  border,
  className = '',
}: {
  card: { affiliation?: unknown; range?: unknown; weapons?: unknown; shields?: unknown };
  width: number;
  cropHeight: number;
  border: number;
  className?: string;
}) {
  const layout = shipOverlayLayout(width, cropHeight, border);
  const values = {
    range: String(card.range ?? '').trim(),
    weapons: String(card.weapons ?? '').trim(),
    shields: String(card.shields ?? '').trim(),
  };
  const labelTier = shipLabelTier(values, layout);
  const attributes = SHIP_ATTRIBUTES.map((attribute) => ({
    key: attribute,
    name: attributeName(attribute),
    label: shipLabel(attribute, labelTier),
    value: values[attribute],
  }));
  return (
    <div data-testid="ship-overlay" className={`absolute inset-0 pointer-events-none ${className}`}>
      <AttributeBand
        prefix="ship"
        attributes={attributes}
        smallCaps={false}
        labelTier={labelTier}
        layout={layout}
        fill={attributeBoxFill(card.affiliation)}
        width={width}
      />
    </div>
  );
}
