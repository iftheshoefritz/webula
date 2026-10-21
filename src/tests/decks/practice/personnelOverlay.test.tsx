// #1176: a personnel drawn as the art crop shows its icons in a column at the left of the art and
// its integrity, cunning and strength in a band along the bottom, styled like the mission's chrome.
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
  PERSONNEL_MAX_ICONS,
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
  // A panel card at scale 1, and at the minimum screen, 667x375: round(72 x 375/320 x 1.5) = 126.
  it.each([108, 126, 200])('fits four icons between the affiliation icon and the band at width %s', (width) => {
    const cropHeight = artCropHeight(width);
    const border = cardBorderWidth(width);
    const { iconTop, iconSize, iconGap, iconLeft, bandTop, bandHeight, discLefts, backing } = personnelOverlayLayout(
      width,
      cropHeight,
      border
    );
    // The affiliation icon sits in about the top fifth of the card's width.
    expect(iconTop).toBeGreaterThanOrEqual(width * 0.19);
    expect(iconLeft).toBeGreaterThan(border);
    const columnBottom = iconTop + PERSONNEL_MAX_ICONS * iconSize + (PERSONNEL_MAX_ICONS - 1) * iconGap;
    expect(columnBottom).toBeLessThanOrEqual(bandTop);
    expect(bandTop + bandHeight).toBe(cropHeight - border);
    expect(iconSize).toBeGreaterThanOrEqual(12);
    // The three discs sit inside the card's border and do not touch.
    expect(discLefts[0]).toBeGreaterThanOrEqual(border);
    expect(discLefts[2] + backing).toBeLessThanOrEqual(width - border);
    expect(discLefts[1] - discLefts[0]).toBeGreaterThan(backing);
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
    expect(screen.getByRole('img', { name: 'Integrity 6, Cunning 7, Strength 5' })).toBeTruthy();
    expect(screen.getByTestId('personnel-overlay').className).toMatch(/pointer-events-none/);
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
