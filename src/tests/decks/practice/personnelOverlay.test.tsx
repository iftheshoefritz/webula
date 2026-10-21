// #1176: a personnel drawn as the art crop shows its icons in a column at the left of the art and
// its integrity, cunning and strength in a band along the bottom, in the boxes the card prints
// there, the word beside the number (#1219).
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
import {
  ATTRIBUTE_BOX_FILLS,
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
    expect(bandTop + bandHeight).toBeLessThan(cropHeight - border);
    // The three boxes sit inside the card's border, on its centre, and do not touch.
    expect(boxLefts[0]).toBeGreaterThan(border);
    expect(boxLefts[2] + boxWidth).toBeLessThan(width - border);
    expect(Math.abs(boxLefts[0] - (width - boxLefts[2] - boxWidth))).toBeLessThanOrEqual(1);
    expect(boxLefts[1] - boxLefts[0]).toBeGreaterThan(boxWidth);
    expect(boxLefts[2] - boxLefts[1]).toBe(boxLefts[1] - boxLefts[0]);
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

describe('Practice table: the personnel overlay in the crew and away team panels (#1176)', () => {
  it.each<PanelLocation>(['awayTeam', 'crew'])('draws the icons and the attributes of a %s personnel', (location) => {
    renderPanel([makeCard(0)], true, location);

    const icons = screen.getByTestId('personnel-icons').querySelectorAll('img');
    expect(Array.from(icons, (icon) => icon.getAttribute('data-icon'))).toEqual(['cmd', 'tos', 'pa', 'au']);
    expect(screen.getByTestId('personnel-integrity').textContent).toBe('6');
    expect(screen.getByTestId('personnel-cunning').textContent).toBe('7');
    expect(screen.getByTestId('personnel-strength').textContent).toBe('5');
    expect(screen.getByTestId('personnel-integrity-label').textContent).toBe('Integrity');
    expect(screen.getByTestId('personnel-cunning-label').textContent).toBe('Cunning');
    expect(screen.getByTestId('personnel-strength-label').textContent).toBe('Strength');
    expect(screen.getByTestId('personnel-cunning-label').getAttribute('style')).toContain('small-caps');
    expect(screen.getByTestId('personnel-cunning-fill').getAttribute('fill')).toBe(ATTRIBUTE_BOX_FILLS.federation);
    expect(screen.getByRole('img', { name: 'Integrity 6, Cunning 7, Strength 5' })).toBeTruthy();
    expect(screen.getByTestId('personnel-overlay').className).toMatch(/pointer-events-none/);
  });

  it("fills the boxes with the colour of the personnel's affiliation", () => {
    renderPanel([makeCard(0, { affiliation: 'romulan' })]);

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

    expect(screen.getByTestId('personnel-overlay').className).toContain(STOPPED_IMAGE_CLASSNAME);
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

  it('draws none on a whole card, a face-down card, or another type', () => {
    const { rerender } = render(<TableCard instance={makeCard(0)} uncropped />);
    expect(screen.queryByTestId('personnel-overlay')).toBeNull();

    rerender(<TableCard instance={makeCard(0, {}, { face: 'down' })} />);
    expect(screen.queryByTestId('personnel-overlay')).toBeNull();

    rerender(<TableCard instance={makeCard(0, { type: 'ship' })} />);
    expect(screen.queryByTestId('personnel-overlay')).toBeNull();
  });
});
