jest.mock('@dnd-kit/core', () => ({
  useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, isDragging: false }),
  useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
}));

import React from 'react';
import { render } from '@testing-library/react';
import MissionRow, {
  missionCardHeight,
  missionColumnHeight,
  shipRowLineHeight,
  underMissionHeadroom,
} from '../../../app/decks/practice/MissionRow';
import { fullCardHeight } from '../../../app/decks/practice/TableCard';
import { CardInstance, MissionSlot } from '../../../app/decks/practice/tableReducer';

// #992: on a desktop the missions, the dilemmas under them, and the ships show the whole card.
const card = (id: string, name: string): CardInstance => ({ id, card: { name, imagefile: id }, face: 'up' });

const slot: MissionSlot = {
  mission: card('m1', 'A Mission'),
  ships: [card('s1', 'A Ship')],
  awayTeam: [],
  underMission: [card('d1', 'A Dilemma')],
};

function renderRow(desktop?: boolean) {
  render(
    <MissionRow
      missions={[slot]}
      onOpenPile={() => {}}
      onShipClick={() => {}}
      onOpenShipRow={() => {}}
      onOpenPlacedOn={() => {}}
      desktop={desktop}
    />
  );
}

const imageOf = (id: string) => document.body.querySelector(`[data-card-id="${id}"] img`) as HTMLElement;
const boxOf = (id: string) => imageOf(id).parentElement!.parentElement as HTMLElement;

describe('MissionRow on a desktop (#992)', () => {
  it('shows the whole mission, dilemma, and ship card', () => {
    renderRow(true);
    for (const id of ['m1', 'd1', 's1']) {
      expect(imageOf(id)).toHaveClass('object-contain');
      expect(imageOf(id)).not.toHaveClass('object-top');
    }
    expect(boxOf('m1').style.height).toBe(`${fullCardHeight(72)}px`);
    expect(boxOf('s1').style.height).toBe(`${fullCardHeight(34)}px`);
  });

  it('keeps the art crop on a touch screen', () => {
    renderRow();
    for (const id of ['m1', 'd1', 's1']) expect(imageOf(id)).toHaveClass('object-cover', 'object-top');
    expect(boxOf('m1').style.height).toBe('64px');
    expect(boxOf('s1').style.height).toBe('32px');
  });

  it('sizes the desktop column with the whole cards', () => {
    expect(missionCardHeight(1, true)).toBe(fullCardHeight(72));
    expect(shipRowLineHeight(1, true)).toBe(fullCardHeight(34));
    expect(underMissionHeadroom(2, true)).toBeGreaterThan(underMissionHeadroom(2));
    // headroom + mission + gap + badge + gap + two ship rows and the gap between them
    expect(missionColumnHeight(1, true, 2)).toBe(underMissionHeadroom(1, true) + 100 + 4 + 14 + 4 + 47 * 2 + 4);
  });
});
