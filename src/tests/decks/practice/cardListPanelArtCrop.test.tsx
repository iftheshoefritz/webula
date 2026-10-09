// #1071: on a phone or a tablet (`artCrop`, no fine pointer) the crew panel and the away team
// panel draw their cards as the art crop the table card shows, at 64/72 of the card's width, so
// the panel shows more rows. A desktop, and every other panel, keeps the whole card (#806). This
// renders `CardListPanel` directly, the same way `cardListPanelFullCard.test.tsx` does.
jest.mock('@dnd-kit/core', () => ({
  useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, isDragging: false }),
  useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
  useDndContext: () => ({ active: null, over: null }),
}));

import React from 'react';
import { render, screen } from '@testing-library/react';
import CardListPanel from '../../../app/decks/practice/CardListPanel';
import { PanelLocation } from '../../../app/decks/practice/CardListPanel';
import { CardInstance } from '../../../app/decks/practice/tableReducer';

const makeCard = (n: number, stopped = false): CardInstance =>
  ({
    id: `card-${n}`,
    stopped,
    face: 'up',
    card: {
      collectorsinfo: `1U0${n}`,
      originalName: `Card ${n}`,
      type: 'personnel',
      name: `card ${n}`,
      imagefile: `card_${n}`,
    },
  }) as unknown as CardInstance;

const cardImage = (id: string) =>
  document.body.querySelector(`[data-card-id="${id}"] img`) as HTMLImageElement;

const renderPanel = (location: PanelLocation, artCrop: boolean, cards = [makeCard(0)]) =>
  render(
    <CardListPanel
      location={location}
      cards={cards}
      host={location === 'crew' ? makeCard(9) : undefined}
      onClose={() => {}}
      selectedIds={[]}
      onToggleSelect={() => {}}
      artCrop={artCrop}
    />
  );

describe('Practice table: the crew and away team panels show the art crop on a touch screen (#1071)', () => {
  it.each<PanelLocation>(['awayTeam', 'crew'])('crops the %s cards to the art', (location) => {
    renderPanel(location, true);

    const box = screen.getByTestId('panel-card-art');
    expect(box.style.width).toBe('108px');
    // round(108 x 64 / 72)
    expect(box.style.height).toBe('96px');
    expect(box.className).toMatch(/overflow-hidden/);
    const image = cardImage('card-0');
    expect(image.className).toMatch(/object-cover/);
    expect(image.className).toMatch(/object-top/);
  });

  it('keeps the ship of the crew panel whole', () => {
    renderPanel('crew', true);

    const ship = screen.getByTestId('card-list-panel-crew-ship').querySelector('img') as HTMLImageElement;
    expect(ship.style.height).toBe('150px');
  });

  it.each<PanelLocation>(['awayTeam', 'crew'])('keeps the whole %s card on a desktop', (location) => {
    renderPanel(location, false);

    expect(screen.queryByTestId('panel-card-art')).toBeNull();
    const image = cardImage('card-0');
    expect(image.style.height).toBe('150px');
    expect(image.className).not.toMatch(/object-cover/);
  });

  it.each<PanelLocation>(['underMission', 'core', 'brig', 'drawDeck', 'on'])(
    'keeps the whole card in the %s panel on a touch screen',
    (location) => {
      renderPanel(location, true);

      expect(screen.queryByTestId('panel-card-art')).toBeNull();
      expect(cardImage('card-0').style.height).toBe('150px');
    }
  );

  it('keeps the stopped look on the cropped card', () => {
    renderPanel('awayTeam', true, [makeCard(0, true)]);

    expect(cardImage('card-0').className).toMatch(/grayscale/);
  });
});
