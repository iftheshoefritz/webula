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
//
// With the setting "Apply card text to attributes" on (#1668), both bands show the attributes on the
// table (#1666, `attributesOnTableOf`) in place of the printed ones, and each value that differs from
// the printed value carries an arrow left of its number: up in green for a rise, down in red for a
// fall. The arrow takes its width from the word: a ship's words drop a tier sooner, and a personnel's
// word that would squeeze below `MIN_LABEL_SQUEEZE` beside an arrow goes, leaving the arrow and the
// number. Range compares the Range on the table with the printed Range, never the range left.
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
import type { RangeLeft } from './shipRange';
import { type AttributeDirection, type AttributesOnTable, attributeDirection } from './attributesOnTable';

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

// The arrow of a modified attribute (#1666): its width and the gap right of it, of the font size. It
// is as tall as a capital.
const ARROW_EM = 0.5;
const ARROW_GAP_EM = 0.15;
export const ARROW_COLORS: Record<AttributeDirection, string> = { up: '#4ade80', down: '#f87171' };
// The width an arrow takes from the room of a word at `fontSize`.
export const modifiedArrowReserve = (fontSize: number): number => fontSize * (ARROW_EM + ARROW_GAP_EM);

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

// The room a box's word has beside its number, and beside the arrow of a modified value (#1666).
export function attributeLabelRoom(
  value: string,
  layout: Pick<ReturnType<typeof personnelOverlayLayout>, 'boxWidth' | 'line' | 'pad' | 'fontSize'>,
  arrow = false
): number {
  const { boxWidth, line, pad, fontSize } = layout;
  return boxWidth - 2 * line - 3 * pad - fontSize * GLYPH_EM * value.length - (arrow ? modifiedArrowReserve(fontSize) : 0);
}

// The `textLength` of a box's word: none when the word fits beside its number, or else the width
// left, which squeezes it in. `smallCaps` false measures the word in plain capitals. `arrow` leaves
// room for the arrow of a modified value (#1666).
export function attributeLabelLength(
  label: string,
  value: string,
  layout: Pick<ReturnType<typeof personnelOverlayLayout>, 'boxWidth' | 'line' | 'pad' | 'fontSize'>,
  smallCaps = true,
  arrow = false
): number | undefined {
  const room = attributeLabelRoom(value, layout, arrow);
  const width = smallCaps ? smallCapsWidth(label, layout.fontSize) : capitalsWidth(label, layout.fontSize);
  return width <= room ? undefined : Math.max(1, Math.floor(room));
}

// A personnel's word beside the arrow of a modified value (#1666): the word, or none when it would
// squeeze below `MIN_LABEL_SQUEEZE` of its width.
export function personnelLabelBesideArrow(
  label: string,
  value: string,
  layout: Pick<ReturnType<typeof personnelOverlayLayout>, 'boxWidth' | 'line' | 'pad' | 'fontSize'>
): string {
  return smallCapsWidth(label, layout.fontSize) * MIN_LABEL_SQUEEZE <= attributeLabelRoom(value, layout, true) ? label : '';
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
// `arrows` names the attributes that carry the arrow of a modified value (#1666), whose words have
// less room.
export function shipLabelTier(
  values: Record<(typeof SHIP_ATTRIBUTES)[number], string>,
  layout: Pick<ReturnType<typeof shipOverlayLayout>, 'boxWidth' | 'line' | 'pad' | 'fontSize' | 'width'>,
  arrows: Partial<Record<(typeof SHIP_ATTRIBUTES)[number], boolean>> = {}
): ShipLabelTier {
  const { fontSize, width } = layout;
  const fits = (tier: ShipLabelTier) =>
    SHIP_ATTRIBUTES.every((attribute) => {
      const room = attributeLabelRoom(values[attribute], layout, !!arrows[attribute]);
      return capitalsWidth(shipLabel(attribute, tier), fontSize) * MIN_LABEL_SQUEEZE <= room;
    });
  return width >= SHIP_THREE_LETTERS_MIN_WIDTH && fits('three') ? 'three' : fits('one') ? 'one' : 'none';
}

// The words of the ship band are measured against a condensed face (`GLYPH_EM`). A device without
// one draws them in a wider fallback, such as Arial, where "RNG" ran into its digit on a 127 px crop
// (follow-up of #1348). So a word that the estimate lets stand at its own width is measured once it
// draws, and squeezed to the room left of its number, `pad` clear of it, only when it is wider. A box
// with the arrow of a modified value (#1666) measures to the arrow's left edge, `data-arrow-left`.
export function fitShipLabel(box: SVGGElement | null, pad: number): void {
  const [label, number] = box ? Array.from(box.querySelectorAll('text')) : [];
  if (!label || !number || typeof label.getComputedTextLength !== 'function') return;
  label.removeAttribute('textLength');
  label.removeAttribute('lengthAdjust');
  const arrowLeft = box?.querySelector('[data-arrow-left]')?.getAttribute('data-arrow-left');
  const end = arrowLeft != null ? Number(arrowLeft) : Number(number.getAttribute('x')) - number.getComputedTextLength();
  const room = end - pad - Number(label.getAttribute('x'));
  if (room > 0 && label.getComputedTextLength() > room) {
    label.setAttribute('textLength', String(Math.floor(room)));
    label.setAttribute('lengthAdjust', 'spacingAndGlyphs');
  }
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

// The arrow of a modified value (#1666), `width` wide from `left` and as tall as a capital, its
// bottom on `baseline`: up for a rise, down for a fall, with a dark edge so its colour reads on every
// fill. It is `aria-hidden`: the band's `aria-label` names the printed value.
function ModifiedArrow({
  testId,
  direction,
  left,
  width,
  baseline,
  fontSize,
}: {
  testId: string;
  direction: AttributeDirection;
  left: number;
  width: number;
  baseline: number;
  fontSize: number;
}) {
  const height = fontSize * CAP_HEIGHT;
  const top = baseline - height;
  const [tip, base] = direction === 'up' ? [top, baseline] : [baseline, top];
  const neck = top + height / 2;
  const x = (share: number) => left + width * share;
  const points = [
    [x(0.5), tip],
    [x(1), neck],
    [x(0.7), neck],
    [x(0.7), base],
    [x(0.3), base],
    [x(0.3), neck],
    [x(0), neck],
  ];
  return (
    <polygon
      data-testid={testId}
      data-direction={direction}
      data-arrow-left={left}
      aria-hidden="true"
      points={points.map(([px, py]) => `${px},${py}`).join(' ')}
      fill={ARROW_COLORS[direction]}
      stroke="rgba(0,0,0,0.85)"
      strokeWidth={Math.max(0.5, fontSize * 0.08)}
      strokeLinejoin="round"
    />
  );
}

// The band of three attribute boxes, shared by the personnel and the ship (#1336). The test ids are
// `<prefix>-attributes`, `<prefix>-<attribute>-box`, `-fill`, `-label`, `-modified` (the arrow of
// a modified value, #1666) and `<prefix>-<attribute>`.
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
  // `ariaValue` names the value in the `aria-label` when it differs from `value` (#1636), and
  // `direction` draws the arrow of a value that differs from the printed one (#1666).
  attributes: { key: string; name: string; label: string; value: string; ariaValue?: string; direction?: AttributeDirection }[];
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
      aria-label={attributes.map(({ name, value, ariaValue }) => `${name} ${ariaValue ?? value}`).join(', ')}
      className="absolute left-0 bottom-0 overflow-visible"
      width={width}
      height={bandHeight}
      fontFamily={ATTRIBUTE_FONT_FAMILY}
      fontWeight={700}
      fontSize={fontSize}
      data-label-tier={labelTier}
    >
      {attributes.map(({ key, label, value, direction }, index) => {
        const left = boxLefts[index];
        const labelLength = attributeLabelLength(label, value, layout, smallCaps, !!direction);
        // The number's right edge, and the arrow left of it, by the estimate of its width. With no
        // word, the number and the arrow sit together on the middle of the box.
        const arrowWidth = fontSize * ARROW_EM;
        const numberWidth = fontSize * GLYPH_EM * value.length;
        const besideWidth = direction ? arrowWidth + fontSize * ARROW_GAP_EM : 0;
        const numberRight =
          label === '' ? left + boxWidth / 2 + (numberWidth + besideWidth) / 2 : left + boxWidth - line - pad;
        return (
          <g
            key={key}
            data-testid={`${prefix}-${key}-box`}
            ref={smallCaps || label === '' || labelLength !== undefined ? undefined : (box) => fitShipLabel(box, pad)}
          >
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
            {direction && (
              <ModifiedArrow
                testId={`${prefix}-${key}-modified`}
                direction={direction}
                left={numberRight - numberWidth - besideWidth}
                width={arrowWidth}
                baseline={baseline}
                fontSize={fontSize}
              />
            )}
            {/* With no word, the number sits on the middle of its box. */}
            <text
              data-testid={`${prefix}-${key}`}
              x={label === '' && !direction ? left + boxWidth / 2 : numberRight}
              y={baseline}
              textAnchor={label === '' && !direction ? 'middle' : 'end'}
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
  onTable,
}: {
  card: { icons?: unknown; affiliation?: unknown; integrity?: unknown; cunning?: unknown; strength?: unknown };
  width: number;
  cropHeight: number;
  border: number;
  className?: string;
  // The attributes on the table that differ from the printed ones (#1666).
  onTable?: AttributesOnTable;
}) {
  const layout = personnelOverlayLayout(width, cropHeight, border);
  const { iconTop, iconLeft, iconSize, iconGap, abbreviated } = layout;
  const codes = personnelIconCodes(card.icons).slice(0, PERSONNEL_MAX_ICONS);
  const attributes = ATTRIBUTES.map((attribute) => {
    const printed = String(card[attribute] ?? '').trim();
    const direction = attributeDirection(onTable?.[attribute], printed);
    const value = direction ? String(onTable![attribute]) : printed;
    const label = abbreviated ? attributeAbbreviation(attribute) : attributeName(attribute);
    return {
      key: attribute,
      name: attributeName(attribute),
      label: direction ? personnelLabelBesideArrow(label, value, layout) : label,
      value,
      ...(direction ? { direction, ariaValue: `${value}, printed ${printed}` } : {}),
    };
  });
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
              draggable={false}
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
// in full in every tier. A ship that moved this turn (#1636) shows the range it has left, `rangeLeft`,
// in place of its printed Range, never below 0, and the `aria-label` reads "Range 4 left of 8".
// `onTable` gives the attributes on the table that differ from the printed ones (#1666): each shows
// with its arrow, and the `aria-label` adds the printed value, "Range 4 left of 9, printed 7".
export function ShipOverlay({
  card,
  width,
  cropHeight,
  border,
  className = '',
  rangeLeft,
  onTable,
}: {
  card: { affiliation?: unknown; range?: unknown; weapons?: unknown; shields?: unknown };
  width: number;
  cropHeight: number;
  border: number;
  className?: string;
  rangeLeft?: RangeLeft | null;
  onTable?: AttributesOnTable;
}) {
  const layout = shipOverlayLayout(width, cropHeight, border);
  const range = shipRangeShown(card, rangeLeft, onTable);
  const weapons = attributeDirection(onTable?.weapons, card.weapons);
  const shields = attributeDirection(onTable?.shields, card.shields);
  const printed = {
    range: String(card.range ?? '').trim(),
    weapons: String(card.weapons ?? '').trim(),
    shields: String(card.shields ?? '').trim(),
  };
  const values = {
    range: range ? range.text : printed.range,
    weapons: weapons ? String(onTable!.weapons) : printed.weapons,
    shields: shields ? String(onTable!.shields) : printed.shields,
  };
  const directions = { range: range?.direction, weapons, shields };
  const labelTier = shipLabelTier(values, layout, {
    range: !!directions.range,
    weapons: !!directions.weapons,
    shields: !!directions.shields,
  });
  const attributes = SHIP_ATTRIBUTES.map((attribute) => ({
    key: attribute,
    name: attributeName(attribute),
    label: shipLabel(attribute, labelTier),
    value: values[attribute],
    ...(attribute === 'range' && range ? { ariaValue: range.ariaValue } : {}),
    ...(attribute !== 'range' && directions[attribute] ? { ariaValue: `${values[attribute]}, printed ${printed[attribute]}` } : {}),
    ...(directions[attribute] ? { direction: directions[attribute] } : {}),
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

// What a ship shows for its Range, when that is not its printed Range: the range it has left this
// turn (#1636), or its Range on the table when card text changes it (#1666), with the arrow that
// compares the Range on the table, never the range left, with the printed Range. Null for a ship that
// has not moved and whose Range is the printed one. `ariaValue` follows the word "Range" in an
// `aria-label`, and `label` is the whole name, "Range 4 left of 9, printed 7".
export interface ShipRangeShown {
  text: string;
  ariaValue: string;
  label: string;
  direction?: AttributeDirection;
}

export function shipRangeShown(
  card: { range?: unknown } | undefined,
  rangeLeft: RangeLeft | null | undefined,
  onTable: AttributesOnTable | undefined
): ShipRangeShown | null {
  const direction = attributeDirection(onTable?.range, card?.range);
  if (!rangeLeft && !direction) return null;
  const printed = String(card?.range ?? '').trim();
  const shown = rangeLeft ? `${rangeLeft.left} left of ${rangeLeft.total}` : String(onTable!.range);
  const ariaValue = direction ? `${shown}, printed ${printed}` : shown;
  return {
    text: rangeLeft ? rangeLeft.text : String(onTable!.range),
    ariaValue,
    label: `Range ${ariaValue}`,
    ...(direction ? { direction } : {}),
  };
}

// The printed Range box of a whole ship card (#1636), in the pixels of a 357x496 scan: the same on
// every ship. Its silver lines run from x 52 to 122 and from y 433 to 455, and a dark line runs inside
// them; the fill inside that runs from y 437 to 453 and to x 119.5. The word "Range" ends by x 93, and
// the number, one digit or two, sits right-aligned between x 103 and 116.5, its capitals from y 441 to
// 450. Between the word and the number every row of the fill is one colour across.
const SCAN_WIDTH = 357;
const SCAN_HEIGHT = 496;
const RANGE_FILL = { top: 437.5, bottom: 452.5 };
const RANGE_PLAIN = { left: 93, right: 102.5 };
const RANGE_NUMBER = { left: 103, right: 119, end: 116.5, capTop: 441, capBottom: 450 };

// The range a ship has left this turn over the printed Range box of the whole card (#1636), where no
// `ShipOverlay` draws: the desktop table and the crew panel. The card keeps its own box, its frame, its
// fill and its word "Range", so the style is the printing's for every affiliation and every printing:
// only the number changes. A patch of the card's own image, the plain part of the box between the word
// and the number stretched across, covers the printed number inside the fill, so the frame is the
// card's own, and the range left is drawn on it in the printed number's place and size. A ship that has not moved this turn draws none, so its printed Range
// shows. It takes no pointer events. A ship whose Range card text changes (#1666, `shipRangeShown`)
// draws it too, moved or not, with the arrow left of the number: the patch then starts where the word
// ends, so the plain part covers the room the arrow takes.
export function ShipRangeLeftBox({
  imageSrc,
  width,
  height,
  range,
}: {
  imageSrc: string;
  width: number;
  height: number;
  range: ShipRangeShown;
}) {
  const x = (scan: number) => (scan * width) / SCAN_WIDTH;
  const y = (scan: number) => (scan * height) / SCAN_HEIGHT;
  const left = x(range.direction ? RANGE_PLAIN.left + 0.5 : RANGE_NUMBER.left);
  const top = y(RANGE_FILL.top);
  const patchWidth = x(RANGE_NUMBER.right) - left;
  const patchHeight = y(RANGE_FILL.bottom) - top;
  // The stretch that lays the plain part over the number.
  const stretch = (RANGE_NUMBER.right - (range.direction ? RANGE_PLAIN.left + 0.5 : RANGE_NUMBER.left)) / (RANGE_PLAIN.right - RANGE_PLAIN.left);
  const capHeight = y(RANGE_NUMBER.capBottom) - y(RANGE_NUMBER.capTop);
  const fontSize = capHeight / CAP_HEIGHT;
  const numberEnd = x(RANGE_NUMBER.end) - left;
  const baseline = y(RANGE_NUMBER.capBottom) - top;
  return (
    <div
      data-testid="ship-range-left"
      role="img"
      aria-label={range.label}
      className="absolute pointer-events-none"
      style={{
        left,
        top,
        width: patchWidth,
        height: patchHeight,
        backgroundImage: `url("${imageSrc}")`,
        backgroundRepeat: 'no-repeat',
        backgroundSize: `${width * stretch}px ${height}px`,
        backgroundPosition: `${-x(RANGE_PLAIN.left) * stretch}px ${-top}px`,
      }}
    >
      <svg
        className="absolute inset-0 overflow-visible"
        width={patchWidth}
        height={patchHeight}
        fontFamily={ATTRIBUTE_FONT_FAMILY}
        fontWeight={700}
        fontSize={fontSize}
      >
        {range.direction && (
          <ModifiedArrow
            testId="ship-range-left-modified"
            direction={range.direction}
            left={numberEnd - fontSize * GLYPH_EM * range.text.length - fontSize * (ARROW_EM + ARROW_GAP_EM)}
            width={fontSize * ARROW_EM}
            baseline={baseline}
            fontSize={fontSize}
          />
        )}
        <text data-testid="ship-range-left-value" x={numberEnd} y={baseline} textAnchor="end" fill="#fff">
          {range.text}
        </text>
      </svg>
    </div>
  );
}
