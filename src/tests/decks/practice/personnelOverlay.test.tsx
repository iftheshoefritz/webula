// #1176: a personnel drawn as the art crop shows its icons in a column at the left of the art and
// its integrity, cunning and strength in a band along the bottom, in the boxes the card prints
// there, the word beside the number (#1219). On a small crop the band is a little taller and the
// words are "Int", "Cun" and "Str" (#1254).
jest.mock('@dnd-kit/core', () => ({
  useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, isDragging: false }),
  useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
  useDndContext: () => ({ active: null, over: null }),
}));

import React from 'react';
import { render, screen } from '@testing-library/react';
import CardListPanel, { PanelLocation } from '../../../app/decks/practice/CardListPanel';
import { CardInstance } from '../../../app/decks/practice/tableReducer';
import TableCard, { STOPPED_IMAGE_CLASSNAME, cardBorderWidth } from '../../../app/decks/practice/TableCard';
import PersonnelOverlay, {
  ATTRIBUTE_BOX_FILLS,
  ShipOverlay,
  PERSONNEL_MAX_ICONS,
  attributeBoxFill,
  attributeLabelLength,
  personnelIconCodes,
  personnelOverlayLayout,
} from '../../../app/decks/practice/PersonnelOverlay';
import { artCropHeight } from '../../../app/decks/practice/viewerCardSize';

const makeCard = (n: number, overrides: Record<string, unknown> = {}, instance: Partial<CardInstance> = {}): CardInstance =>
  ({
    id: `card-${n}`,
    face: 'up',
    ...instance,
    card: {
      collectorsinfo: `1U0${n}`,
      originalName: `Card ${n}`,
      type: 'personnel',
      affiliation: 'federation',
      name: `card ${n}`,
      imagefile: `card_${n}`,
      icons: '[cmd][tos][pa][au]',
      integrity: '6',
      cunning: 7,
      strength: '5',
      ...overrides,
    },
  }) as unknown as CardInstance;

const renderPanel = (cards: CardInstance[], artCrop = true, location: PanelLocation = 'awayTeam') =>
  render(
    <CardListPanel
      location={location}
      cards={cards}
      host={location === 'crew' ? makeCard(9, { type: 'ship' }) : undefined}
      onClose={() => {}}
      selectedIds={[]}
      onToggleSelect={() => {}}
      artCrop={artCrop}
    />
  );

describe('personnelIconCodes', () => {
  it('keeps the order of the icons', () => {
    expect(personnelIconCodes('[cmd][tos][pa][au]')).toEqual(['cmd', 'tos', 'pa', 'au']);
  });

  it('reads an empty or missing value as no icons', () => {
    expect(personnelIconCodes('')).toEqual([]);
    expect(personnelIconCodes(undefined)).toEqual([]);
  });

  it('drops a code it has no image for', () => {
    expect(personnelIconCodes('[Stf][xyz][DS9]')).toEqual(['stf', 'ds9']);
  });
});

describe('personnelOverlayLayout', () => {
  // The attempt row's 69, a panel card at scale 1, at the minimum screen, 667x375:
  // round(72 x 375/320 x 1.5) = 126, and a large one.
  it.each([69, 108, 126, 200])('fits four icons above three boxes inside the border at width %s', (width) => {
    const cropHeight = artCropHeight(width);
    const border = cardBorderWidth(width);
    const { iconTop, iconSize, iconGap, iconLeft, bandTop, bandHeight, boxLefts, boxWidth } = personnelOverlayLayout(
      width,
      cropHeight,
      border
    );
    // The affiliation icon sits in about the top fifth of the card's width.
    expect(iconTop).toBeGreaterThanOrEqual(width * 0.19);
    expect(iconLeft).toBeGreaterThan(border);
    const columnBottom = iconTop + PERSONNEL_MAX_ICONS * iconSize + (PERSONNEL_MAX_ICONS - 1) * iconGap;
    expect(columnBottom).toBeLessThanOrEqual(bandTop);
    // The band ends at the bottom edge of the crop (#1236).
    expect(bandTop + bandHeight).toBe(cropHeight);
    // The three boxes sit inside the card's border, on its centre, and do not touch.
    expect(boxLefts[0]).toBeGreaterThan(border);
    expect(boxLefts[2] + boxWidth).toBeLessThan(width - border);
    expect(Math.abs(boxLefts[0] - (width - boxLefts[2] - boxWidth))).toBeLessThanOrEqual(1);
    expect(boxLefts[1] - boxLefts[0]).toBeGreaterThan(boxWidth);
    expect(boxLefts[2] - boxLefts[1]).toBe(boxLefts[1] - boxLefts[0]);
  });
});

describe('personnelOverlayLayout: the form of the band (#1254)', () => {
  const layoutAt = (width: number) => personnelOverlayLayout(width, artCropHeight(width), cardBorderWidth(width));

  it.each([69, 108, 126])('abbreviates the words and grows the band at width %s', (width) => {
    const { abbreviated, bandHeight } = layoutAt(width);
    expect(abbreviated).toBe(true);
    expect(bandHeight).toBeGreaterThan(Math.round(width * 0.13));
  });

  it.each([200, 238])('keeps the whole words and the band of #1219 at width %s', (width) => {
    const { abbreviated, bandHeight } = layoutAt(width);
    expect(abbreviated).toBe(false);
    expect(bandHeight).toBe(Math.round(width * 0.13));
  });
});

describe('attributeLabelLength', () => {
  it('leaves a word that fits beside its number at its own width', () => {
    expect(attributeLabelLength('Integrity', '6', { boxWidth: 200, line: 1, pad: 2, fontSize: 10 })).toBeUndefined();
  });

  it('squeezes a word that does not fit into the width its box leaves', () => {
    const layout = personnelOverlayLayout(69, artCropHeight(69), cardBorderWidth(69));
    const length = attributeLabelLength('Integrity', '6', layout);
    expect(length).toBeGreaterThan(0);
    expect(length).toBeLessThan(layout.boxWidth - layout.fontSize);
  });
});

describe('attributeBoxFill', () => {
  it('fills the boxes with the colour of the affiliation', () => {
    expect(attributeBoxFill('federation')).toBe(ATTRIBUTE_BOX_FILLS.federation);
    expect(attributeBoxFill('Klingon')).toBe(ATTRIBUTE_BOX_FILLS.klingon);
    expect(attributeBoxFill('non-aligned')).toBe(ATTRIBUTE_BOX_FILLS['non-aligned']);
  });

  it('falls back to grey for an affiliation it has no colour for', () => {
    expect(attributeBoxFill('q continuum')).toBe(ATTRIBUTE_BOX_FILLS.borg);
    expect(attributeBoxFill(undefined)).toBe(ATTRIBUTE_BOX_FILLS.borg);
  });
});

const renderOverlay = (width: number, overrides: Record<string, unknown> = {}) =>
  render(
    <PersonnelOverlay
      card={makeCard(0, overrides).card}
      width={width}
      cropHeight={artCropHeight(width)}
      border={cardBorderWidth(width)}
    />
  );

describe('Practice table: the personnel overlay in the crew and away team panels (#1176)', () => {
  // A panel card at scale 1 is 108 px wide (`viewerCardSize(1)`), a small crop: the words are
  // abbreviated (#1254).
  it.each<PanelLocation>(['awayTeam', 'crew'])('draws the icons and the attributes of a %s personnel', (location) => {
    renderPanel([makeCard(0)], true, location);

    const icons = screen.getByTestId('personnel-icons').querySelectorAll('img');
    expect(Array.from(icons, (icon) => icon.getAttribute('data-icon'))).toEqual(['cmd', 'tos', 'pa', 'au']);
    expect(screen.getByTestId('personnel-integrity').textContent).toBe('6');
    expect(screen.getByTestId('personnel-cunning').textContent).toBe('7');
    expect(screen.getByTestId('personnel-strength').textContent).toBe('5');
    expect(screen.getByTestId('personnel-integrity-label').textContent).toBe('Int');
    expect(screen.getByTestId('personnel-cunning-label').textContent).toBe('Cun');
    expect(screen.getByTestId('personnel-strength-label').textContent).toBe('Str');
    expect(screen.getByTestId('personnel-cunning-label').getAttribute('style')).toContain('small-caps');
    expect(screen.getByTestId('personnel-integrity-fill').getAttribute('fill')).toBe(ATTRIBUTE_BOX_FILLS.federation);
    expect(screen.getByRole('img', { name: 'Integrity 6, Cunning 7, Strength 5' })).toBeTruthy();
    expect(screen.getByTestId('personnel-overlay').className).toMatch(/pointer-events-none/);
  });

  it.each([69, 126])('draws three boxes with abbreviated words and two-digit values at width %s', (width) => {
    renderOverlay(width, { affiliation: 'romulan', integrity: '10', cunning: '12', strength: '11' });

    expect(screen.getByTestId('personnel-strength-label').textContent).toBe('Str');
    expect(screen.getByTestId('personnel-strength').textContent).toBe('11');
    expect(screen.getByTestId('personnel-cunning-fill').getAttribute('fill')).toBe(ATTRIBUTE_BOX_FILLS.romulan);
    expect(screen.getByRole('img', { name: 'Integrity 10, Cunning 12, Strength 11' })).toBeTruthy();
  });

  it('draws the three labelled boxes on a large crop (#1219)', () => {
    renderOverlay(238);

    expect(screen.getByTestId('personnel-integrity').textContent).toBe('6');
    expect(screen.getByTestId('personnel-cunning').textContent).toBe('7');
    expect(screen.getByTestId('personnel-strength').textContent).toBe('5');
    expect(screen.getByTestId('personnel-integrity-label').textContent).toBe('Integrity');
    expect(screen.getByTestId('personnel-cunning-label').textContent).toBe('Cunning');
    expect(screen.getByTestId('personnel-strength-label').textContent).toBe('Strength');
    expect(screen.getByTestId('personnel-cunning-label').getAttribute('style')).toContain('small-caps');
    expect(screen.getByRole('img', { name: 'Integrity 6, Cunning 7, Strength 5' })).toBeTruthy();
  });

  it("fills the boxes with the colour of the personnel's affiliation", () => {
    renderOverlay(238, { affiliation: 'romulan' });

    for (const attribute of ['integrity', 'cunning', 'strength']) {
      expect(screen.getByTestId(`personnel-${attribute}-fill`).getAttribute('fill')).toBe(ATTRIBUTE_BOX_FILLS.romulan);
    }
  });

  it('draws no icon column for a personnel with no icons', () => {
    renderPanel([makeCard(0, { icons: '' })]);

    expect(screen.queryByTestId('personnel-icons')).toBeNull();
    expect(screen.getByTestId('personnel-attributes')).toBeTruthy();
  });

  it('draws no overlay on an equipment', () => {
    renderPanel([makeCard(0, { type: 'equipment', icons: '', integrity: '', cunning: '', strength: '' })]);

    expect(screen.queryByTestId('personnel-overlay')).toBeNull();
  });

  it('draws no overlay on the whole card of a desktop', () => {
    renderPanel([makeCard(0)], false);

    expect(screen.queryByTestId('personnel-overlay')).toBeNull();
  });

  it('greys the overlay of a stopped personnel', () => {
    renderPanel([makeCard(0, {}, { stopped: true })]);

    const overlay = screen.getByTestId('personnel-overlay');
    expect(overlay.className).toMatch(/\bgrayscale\b/);
    // At full opacity, so the card under the band does not show through (#1339).
    expect(overlay.className).not.toMatch(/\bopacity-/);
  });

  it('shows the overlay of a face-down away team member, whose face the panel shows (#964)', () => {
    renderPanel([makeCard(0, {}, { face: 'down' })]);

    expect(screen.getByTestId('personnel-overlay')).toBeTruthy();
  });
});

describe('Practice table: the personnel overlay on a table card (#1176)', () => {
  it('draws the overlay over a cropped face-up personnel', () => {
    render(<TableCard instance={makeCard(0)} />);

    expect(screen.getByTestId('personnel-overlay')).toBeTruthy();
  });

  it('anchors the band to the bottom of the crop, clipped to its rounded corners (#1236)', () => {
    render(<TableCard instance={makeCard(0)} />);

    const band = screen.getByTestId('personnel-attributes');
    expect(band.getAttribute('class')).toMatch(/\bbottom-0\b/);
    expect(band.getAttribute('style') ?? '').not.toMatch(/top/);
    const height = Number(band.getAttribute('height'));
    for (const rect of Array.from(band.querySelectorAll('rect'))) {
      expect(Number(rect.getAttribute('y')) + Number(rect.getAttribute('height'))).toBeLessThanOrEqual(height);
    }
    const clip = screen.getByTestId('personnel-overlay').parentElement!;
    expect(clip.className).toMatch(/overflow-hidden/);
    expect(clip.className).toMatch(/rounded-md/);
  });

  it('greys the overlay of a stopped personnel at full opacity, and greys and fades its art (#1339)', () => {
    const { container } = render(<TableCard instance={makeCard(0, {}, { stopped: true })} />);

    const overlay = screen.getByTestId('personnel-overlay');
    expect(overlay.className).toMatch(/\bgrayscale\b/);
    expect(overlay.className).not.toMatch(/\bopacity-/);
    expect(container.querySelector('img')!.className).toContain(STOPPED_IMAGE_CLASSNAME);
  });

  it('draws none on a whole card, a face-down card, or another type', () => {
    const { rerender } = render(<TableCard instance={makeCard(0)} uncropped />);
    expect(screen.queryByTestId('personnel-overlay')).toBeNull();

    rerender(<TableCard instance={makeCard(0, {}, { face: 'down' })} />);
    expect(screen.queryByTestId('personnel-overlay')).toBeNull();

    rerender(<TableCard instance={makeCard(0, { type: 'ship' })} />);
    expect(screen.queryByTestId('personnel-overlay')).toBeNull();
  });
});

// #1336: a cropped ship draws its range, weapons and shields in the same band, with the words
// "RNG", "WPN" and "SHD" in plain capitals on every crop size, and no icon column.
const makeShip = (n: number, overrides: Record<string, unknown> = {}, instance: Partial<CardInstance> = {}) =>
  makeCard(
    n,
    { type: 'Ship', icons: '[stf]', integrity: '', cunning: '', strength: '', range: '7', weapons: '8', shields: '9', ...overrides },
    instance
  );

const renderShipOverlay = (width: number, overrides: Record<string, unknown> = {}) =>
  render(
    <ShipOverlay
      card={makeShip(0, overrides).card}
      width={width}
      cropHeight={artCropHeight(width)}
      border={cardBorderWidth(width)}
    />
  );

describe('Practice table: the ship band (#1336)', () => {
  it('draws the band over a cropped face-up ship, with its words and numbers and no icons', () => {
    render(<TableCard instance={makeShip(0)} />);

    expect(screen.getByTestId('ship-overlay').className).toMatch(/pointer-events-none/);
    expect(screen.getByTestId('ship-range-label').textContent).toBe('RNG');
    expect(screen.getByTestId('ship-weapons-label').textContent).toBe('WPN');
    expect(screen.getByTestId('ship-shields-label').textContent).toBe('SHD');
    expect(screen.getByTestId('ship-range').textContent).toBe('7');
    expect(screen.getByTestId('ship-weapons').textContent).toBe('8');
    expect(screen.getByTestId('ship-shields').textContent).toBe('9');
    expect(screen.getByTestId('ship-weapons-label').getAttribute('style') ?? '').not.toContain('small-caps');
    expect(screen.getByRole('img', { name: 'Range 7, Weapons 8, Shields 9' })).toBeTruthy();
    expect(screen.queryByTestId('personnel-icons')).toBeNull();
    expect(screen.queryByTestId('personnel-overlay')).toBeNull();
  });

  it.each([69, 126, 200, 238])('keeps the capital words and the height rule of the band at width %s', (width) => {
    renderShipOverlay(width);

    expect(screen.getByTestId('ship-range-label').textContent).toBe('RNG');
    expect(screen.getByTestId('ship-weapons-label').textContent).toBe('WPN');
    expect(screen.getByTestId('ship-shields-label').textContent).toBe('SHD');
    const { bandHeight } = personnelOverlayLayout(width, artCropHeight(width), cardBorderWidth(width));
    expect(Number(screen.getByTestId('ship-attributes').getAttribute('height'))).toBe(bandHeight);
  });

  it("fills the boxes with the colour of the ship's affiliation", () => {
    renderShipOverlay(126, { affiliation: 'romulan' });

    for (const attribute of ['range', 'weapons', 'shields']) {
      expect(screen.getByTestId(`ship-${attribute}-fill`).getAttribute('fill')).toBe('#10462c');
    }
  });

  it('draws the band on a cropped ship in a card list panel', () => {
    renderPanel([makeShip(0)]);

    expect(screen.getByTestId('ship-attributes')).toBeTruthy();
    expect(screen.queryByTestId('personnel-overlay')).toBeNull();
  });

  it('draws none on a whole ship, a face-down ship, or a personnel', () => {
    const { rerender } = render(<TableCard instance={makeShip(0)} uncropped />);
    expect(screen.queryByTestId('ship-overlay')).toBeNull();

    rerender(<TableCard instance={makeShip(0, {}, { face: 'down' })} />);
    expect(screen.queryByTestId('ship-overlay')).toBeNull();

    rerender(<TableCard instance={makeCard(0)} />);
    expect(screen.queryByTestId('ship-overlay')).toBeNull();
    expect(screen.getByTestId('personnel-overlay')).toBeTruthy();
  });

  it('greys the band of a stopped ship at full opacity, as a stopped personnel (#1339)', () => {
    render(<TableCard instance={makeShip(0, {}, { stopped: true })} />);

    const overlay = screen.getByTestId('ship-overlay');
    expect(overlay.className).toMatch(/\bgrayscale\b/);
    expect(overlay.className).not.toMatch(/\bopacity-/);
  });
});

describe('attributeLabelLength: plain capitals (#1336)', () => {
  it('squeezes "WPN" beside a two-digit value on a small crop', () => {
    const layout = personnelOverlayLayout(69, artCropHeight(69), cardBorderWidth(69));
    expect(attributeLabelLength('WPN', '12', layout, false)).toBeGreaterThan(0);
  });

  it('leaves "WPN" alone where it fits', () => {
    const layout = personnelOverlayLayout(238, artCropHeight(238), cardBorderWidth(238));
    expect(attributeLabelLength('WPN', '8', layout, false)).toBeUndefined();
  });

  it('measures plain capitals wider than small capitals', () => {
    // The room is 29 - 2 - 6 - 5.5 = 15.5: "WPN" in small capitals is 5.5 x 2.6 = 14.3 wide and
    // fits, in plain capitals it is 16.5 wide and does not.
    const layout = { boxWidth: 29, line: 1, pad: 2, fontSize: 10 };
    expect(attributeLabelLength('WPN', '1', layout, true)).toBeUndefined();
    expect(attributeLabelLength('WPN', '1', layout, false)).toBe(15);
  });
});
