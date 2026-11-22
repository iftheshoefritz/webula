let mockOverId: string | null = null;
jest.mock('@dnd-kit/core', () => ({
  useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, isDragging: false }),
  useDroppable: ({ id }: { id: string }) => ({ setNodeRef: () => {}, isOver: id === mockOverId }),
}));

import React from 'react';
import { render } from '@testing-library/react';
import MissionRow from '../../../app/decks/practice/MissionRow';
import { DraggedCardTypeProvider, PlayPlacesProvider } from '../../../app/decks/practice/DraggedCardTypeContext';
import type { PlayPlaces } from '../../../app/decks/practice/playPlaces';
import { CardInstance, MissionSlot } from '../../../app/decks/practice/tableReducer';

// #1856: during a drag of a hand card in play and draw, the mission cards, ships and ship rows the
// play-place model names show `eligible`, the others `dimmed`; with no places, the highlight of before.
const card = (id: string, type: string): CardInstance => ({ id, card: { name: id, imagefile: id, type }, face: 'up' });

const slot = (i: number, ships: CardInstance[]): MissionSlot => ({
  mission: card(`mission-${i}`, 'mission'),
  ships,
  awayTeam: [],
  underMission: [],
});

const missions = [slot(0, [card('ship-a', 'ship')]), slot(1, [card('ship-b', 'ship')]), slot(2, [])];

const renderRow = (draggedType: string | null, places: PlayPlaces | null) =>
  render(
    <DraggedCardTypeProvider value={draggedType}>
      <PlayPlacesProvider value={places}>
        <MissionRow
          missions={missions}
          onOpenPile={() => {}}
          onShipClick={() => {}}
          onOpenShipRow={() => {}}
          onOpenPlacedOn={() => {}}
        />
      </PlayPlacesProvider>
    </DraggedCardTypeProvider>
  );

const highlightOf = (zone: string) => document.querySelector(`[data-zone="${zone}"]`)!.getAttribute('data-highlight');

afterEach(() => {
  mockOverId = null;
});

describe('the play-place highlight (#1856)', () => {
  it("shows a personnel's away team and crew as eligible, and dims the other mission cards and ships", () => {
    renderRow('personnel', { awayTeams: new Set([0]), crews: new Set(['ship-a']), shipRows: new Set() });
    expect(highlightOf('mission-on-0')).toBe('eligible');
    expect(highlightOf('crew-ship-a')).toBe('eligible');
    expect(highlightOf('mission-on-1')).toBe('dimmed');
    expect(highlightOf('crew-ship-b')).toBe('dimmed');
    expect(highlightOf('mission-on-2')).toBe('dimmed');
  });

  it("shows a ship's ship rows as eligible, an empty one too, and hides `dimmed` on an empty row", () => {
    renderRow('ship', { awayTeams: new Set(), crews: new Set(), shipRows: new Set([1, 2]) });
    expect(highlightOf('ship-row-1')).toBe('eligible');
    expect(highlightOf('ship-row-2')).toBe('eligible');
    expect(highlightOf('mission-on-2')).toBe('eligible');
    expect(highlightOf('crew-ship-b')).toBe('eligible');
    expect(highlightOf('ship-row-0')).toBe('dimmed');
    expect(highlightOf('crew-ship-a')).toBe('dimmed');
    expect(highlightOf('mission-on-0')).toBe('dimmed');
  });

  it('shows `over` under the pointer on a zone that is not eligible', () => {
    mockOverId = 'mission-on-1';
    renderRow('personnel', { awayTeams: new Set([0]), crews: new Set(), shipRows: new Set() });
    expect(highlightOf('mission-on-1')).toBe('over');
  });

  it('keeps the highlight of before with no play places', () => {
    renderRow('personnel', null);
    expect(highlightOf('mission-on-0')).toBe('valid');
    expect(highlightOf('crew-ship-a')).toBe('valid');
    expect(highlightOf('ship-row-0')).toBeNull();
  });
});
