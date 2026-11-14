// Issue #1666: with the setting "Apply card text to attributes" on (#1668), the bands of the
// personnel and the ships show the attributes on the table, and each value that differs from the
// printed one carries an arrow, up in green or down in red. A ship's Range compares its Range on the
// table, never the range left. Every card here is invented but the models' titles.
jest.mock('@dnd-kit/core', () => {
  const actual = jest.requireActual('@dnd-kit/core');
  return {
    ...actual,
    useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, isDragging: false }),
    useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
  };
});

import React from 'react';
import { render, screen, within } from '@testing-library/react';
import PersonnelOverlay, {
  ARROW_COLORS,
  ShipOverlay,
  ShipRangeLeftBox,
  attributeLabelRoom,
  personnelLabelBesideArrow,
  personnelOverlayLayout,
  shipLabelTier,
  shipOverlayLayout,
  shipRangeShown,
} from '../../../app/decks/practice/PersonnelOverlay';
import TableCard, { cardBorderWidth } from '../../../app/decks/practice/TableCard';
import { RangeUsedProvider } from '../../../app/decks/practice/RangeUsedContext';
import { attributeDirection, attributesOnTableOf } from '../../../app/decks/practice/attributesOnTable';
import { MISSION_SLOTS, type CardInstance, type MissionSlot } from '../../../app/decks/practice/tableReducer';
import { artCropHeight } from '../../../app/decks/practice/viewerCardSize';

let next = 0;
const card = (originalName: string, type: string, extra: Record<string, string> = {}): CardInstance => ({
  id: `card-${++next}`,
  card: { name: originalName.toLowerCase(), originalName, type, imagefile: 'x', ...extra },
  face: 'up',
});
const personnel = (name: string, extra: Record<string, string> = {}) =>
  card(name, 'personnel', { integrity: '5', cunning: '6', strength: '4', affiliation: 'Bajoran', ...extra });
const ship = (name: string, extra: Record<string, string> = {}, crew: CardInstance[] = []): CardInstance => ({
  ...card(name, 'ship', { range: '7', weapons: '7', shields: '6', ...extra }),
  crew,
});
const slotsOf = (slots: Partial<MissionSlot>[]): MissionSlot[] =>
  Array.from({ length: MISSION_SLOTS }, (_, i) => ({ mission: null, ships: [], awayTeam: [], underMission: [], ...slots[i] }));

const width = 100;
const renderPersonnel = (c: CardInstance, onTable?: Parameters<typeof PersonnelOverlay>[0]['onTable']) =>
  render(<PersonnelOverlay card={c.card} width={width} cropHeight={artCropHeight(width)} border={cardBorderWidth(width)} onTable={onTable} />);

describe('attributesOnTableOf (#1666)', () => {
  it('gives a [TN] personnel at a mission Dark Dissension\'s values with the setting on', () => {
    const tn = personnel('Tn Dissident', { icons: '[TN]' });
    const other = personnel('Plain Officer');
    const missions = slotsOf([{ awayTeam: [tn, other] }]);
    expect(attributesOnTableOf(missions, [card('Dark Dissension', 'event')], true)).toEqual({ [tn.id]: { integrity: 4, cunning: 7 } });
  });

  it('is empty with the setting off', () => {
    const tn = personnel('Tn Dissident', { icons: '[TN]' });
    expect(attributesOnTableOf(slotsOf([{ awayTeam: [tn] }]), [card('Dark Dissension', 'event')], false)).toEqual({});
  });

  it('covers the crew of a ship and the ship, its Range too', () => {
    const medic = personnel('Medic', { affiliation: 'Federation', skills: 'Medical' });
    const pasteur = ship('U.S.S. Pasteur Medical Ship', { icons: '[TN]' }, [medic]);
    const missions = slotsOf([{ ships: [pasteur] }]);
    const map = attributesOnTableOf(missions, [], true);
    expect(map[pasteur.id]).toEqual({ range: 12 });
    expect(map[medic.id]).toBeUndefined();
    expect(attributesOnTableOf(missions, [], false)).toEqual({});
  });

  it('never marks a blank printed value', () => {
    expect(attributeDirection(1, '')).toBeUndefined();
    expect(attributeDirection(1, '—')).toBeUndefined();
    expect(attributeDirection(3, '2')).toBe('up');
    expect(attributeDirection(1, '2')).toBe('down');
    expect(attributeDirection(2, '2')).toBeUndefined();
  });
});

describe('PersonnelOverlay with attributes on the table (#1666)', () => {
  it('shows Dark Dissension\'s Integrity down, Cunning up and Strength as printed', () => {
    renderPersonnel(personnel('Tn Dissident'), { integrity: 4, cunning: 7 });
    expect(screen.getByTestId('personnel-integrity')).toHaveTextContent('4');
    expect(screen.getByTestId('personnel-cunning')).toHaveTextContent('7');
    expect(screen.getByTestId('personnel-strength')).toHaveTextContent('4');
    const down = screen.getByTestId('personnel-integrity-modified');
    expect(down).toHaveAttribute('data-direction', 'down');
    expect(down).toHaveAttribute('fill', ARROW_COLORS.down);
    expect(down).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('personnel-cunning-modified')).toHaveAttribute('data-direction', 'up');
    expect(screen.getByTestId('personnel-cunning-modified')).toHaveAttribute('fill', ARROW_COLORS.up);
    expect(screen.queryByTestId('personnel-strength-modified')).toBeNull();
    expect(screen.getByTestId('personnel-attributes')).toHaveAttribute(
      'aria-label',
      'Integrity 4, printed 5, Cunning 7, printed 6, Strength 4'
    );
  });

  it('draws no arrow and the same label with nothing on the table, or the printed values', () => {
    const { unmount } = renderPersonnel(personnel('Plain'));
    expect(screen.queryByTestId(/-modified$/)).toBeNull();
    expect(screen.getByTestId('personnel-attributes')).toHaveAttribute('aria-label', 'Integrity 5, Cunning 6, Strength 4');
    unmount();
    renderPersonnel(personnel('Plain'), { integrity: 5 });
    expect(screen.queryByTestId(/-modified$/)).toBeNull();
  });

  it('draws the arrow left of the number, clear of the word', () => {
    renderPersonnel(personnel('Tn Dissident'), { integrity: 4 });
    const arrow = screen.getByTestId('personnel-integrity-modified');
    const number = screen.getByTestId('personnel-integrity');
    expect(Number(arrow.getAttribute('data-arrow-left'))).toBeLessThan(Number(number.getAttribute('x')));
  });

  it('reads the values of the context on a table card', () => {
    const tn = personnel('Tn Dissident');
    render(
      <RangeUsedProvider value={{ attributes: { [tn.id]: { cunning: 7 } } }}>
        <TableCard instance={tn} />
      </RangeUsedProvider>
    );
    expect(screen.getByTestId('personnel-cunning')).toHaveTextContent('7');
    expect(screen.getByTestId('personnel-cunning-modified')).toHaveAttribute('data-direction', 'up');
  });
});

describe('ShipOverlay with attributes on the table (#1666)', () => {
  const renderShip = (s: CardInstance, props: Partial<Parameters<typeof ShipOverlay>[0]> = {}) =>
    render(<ShipOverlay card={s.card} width={width} cropHeight={artCropHeight(width)} border={cardBorderWidth(width)} {...props} />);

  it('shows a raised Range with an up arrow when the ship has not moved', () => {
    renderShip(ship('Raised'), { onTable: { range: 12 } });
    expect(screen.getByTestId('ship-range')).toHaveTextContent('12');
    expect(screen.getByTestId('ship-range-modified')).toHaveAttribute('data-direction', 'up');
    expect(screen.getByTestId('ship-attributes')).toHaveAttribute('aria-label', 'Range 12, printed 7, Weapons 7, Shields 6');
  });

  it('shows the range left of a moved ship, with the arrow of its Range on the table', () => {
    renderShip(ship('Raised'), { onTable: { range: 12 }, rangeLeft: { used: 3, total: 12, left: 9, text: '9' } });
    expect(screen.getByTestId('ship-range')).toHaveTextContent('9');
    expect(screen.getByTestId('ship-range-modified')).toHaveAttribute('data-direction', 'up');
    expect(screen.getByTestId('ship-attributes')).toHaveAttribute(
      'aria-label',
      'Range 9 left of 12, printed 7, Weapons 7, Shields 6'
    );
  });

  it('marks Weapons up and Shields down, and nothing with no values', () => {
    const { unmount } = renderShip(ship('Tn Ship'), { onTable: { weapons: 8, shields: 5 } });
    expect(screen.getByTestId('ship-weapons-modified')).toHaveAttribute('data-direction', 'up');
    expect(screen.getByTestId('ship-shields-modified')).toHaveAttribute('data-direction', 'down');
    expect(screen.queryByTestId('ship-range-modified')).toBeNull();
    unmount();
    renderShip(ship('Plain'), { rangeLeft: { used: 4, total: 7, left: 3, text: '3' } });
    expect(screen.queryByTestId(/-modified$/)).toBeNull();
    expect(screen.getByTestId('ship-attributes')).toHaveAttribute('aria-label', 'Range 3 left of 7, Weapons 7, Shields 6');
  });
});

describe('the whole-card Range box (#1666)', () => {
  it('shows over a ship whose Range is raised, moved or not, with the arrow', () => {
    const raised = shipRangeShown({ range: '7' }, null, { range: 12 })!;
    render(<ShipRangeLeftBox imageSrc="/x.jpg" width={357} height={496} range={raised} />);
    const box = screen.getByTestId('ship-range-left');
    expect(box).toHaveAttribute('aria-label', 'Range 12, printed 7');
    expect(within(box).getByTestId('ship-range-left-value')).toHaveTextContent('12');
    expect(within(box).getByTestId('ship-range-left-modified')).toHaveAttribute('data-direction', 'up');
  });

  it('is nothing for a ship that did not move and whose Range is printed', () => {
    expect(shipRangeShown({ range: '7' }, null, undefined)).toBeNull();
    expect(shipRangeShown({ range: '7' }, null, { weapons: 8 })).toBeNull();
  });
});

describe('the fit of the arrow at the minimum screen (#1666)', () => {
  // The crops of the attempt row at 667x375 (about 76 px), of the brig and of a ship there.
  const widths = [56, 62, 70, 76, 84, 99];

  it('leaves room for a two-digit value and the arrow, and never a word that runs into it', () => {
    for (const w of widths) {
      const layout = personnelOverlayLayout(w, artCropHeight(w), cardBorderWidth(w));
      // The number and the arrow alone fit in the box.
      expect(attributeLabelRoom('10', layout, true) + layout.pad).toBeGreaterThanOrEqual(0);
      for (const label of ['Int', 'Integrity']) {
        const kept = personnelLabelBesideArrow(label, '10', layout);
        if (kept !== '') expect(attributeLabelRoom('10', layout, true)).toBeGreaterThan(0);
      }
      const ship = shipOverlayLayout(w, artCropHeight(w), cardBorderWidth(w));
      const values = { range: '12', weapons: '10', shields: '9' };
      const tier = shipLabelTier(values, ship, { range: true });
      if (tier !== 'none') expect(attributeLabelRoom('12', ship, true)).toBeGreaterThan(0);
    }
  });

  it('drops a ship word tier sooner beside an arrow', () => {
    const layout = shipOverlayLayout(56, artCropHeight(56), cardBorderWidth(56));
    const values = { range: '12', weapons: '7', shields: '6' };
    const plain = shipLabelTier(values, layout);
    const arrowed = shipLabelTier(values, layout, { range: true });
    const order = ['three', 'one', 'none'];
    expect(order.indexOf(arrowed)).toBeGreaterThanOrEqual(order.indexOf(plain));
  });
});
