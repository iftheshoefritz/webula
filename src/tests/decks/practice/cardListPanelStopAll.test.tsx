// Issue #995: a ship's crew panel and a mission's away team panel get a "Stop all" button, which
// stops every personnel card of the panel.
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import CardListPanel from '../../../app/decks/practice/CardListPanel';

const instance = (id: string, type: string, stopped?: boolean) =>
  ({
    id,
    face: 'up',
    stopped,
    card: { collectorsinfo: id, originalName: id, type, name: id, imagefile: id, pile: 'draw', count: 1 },
  }) as any;

describe('CardListPanel: Stop all (#995)', () => {
  it.each(['crew', 'awayTeam'] as const)('stops every unstopped personnel card of the %s panel, with no selection', (location) => {
    const onSetStopped = jest.fn();
    const cards = [instance('a', 'personnel'), instance('b', 'personnel', true), instance('c', 'equipment'), instance('d', 'personnel')];
    render(
      <CardListPanel location={location} cards={cards} onClose={() => {}} selectedIds={[]} onToggleSelect={() => {}} onSetStopped={onSetStopped} />
    );
    const stopAll = within(screen.getByTestId('panel-controls')).getByRole('button', { name: 'Stop all' });
    expect(stopAll).toBeEnabled();
    fireEvent.click(stopAll);
    expect(onSetStopped).toHaveBeenCalledWith(['a', 'd'], true);
  });

  it('is disabled once every personnel card of the panel is stopped', () => {
    const cards = [instance('a', 'personnel', true), instance('c', 'equipment')];
    render(
      <CardListPanel location="crew" cards={cards} onClose={() => {}} selectedIds={[]} onToggleSelect={() => {}} onSetStopped={() => {}} />
    );
    expect(screen.getByRole('button', { name: 'Stop all' })).toBeDisabled();
  });

  it.each(['core', 'brig', 'on', 'shipRow'] as const)('shows no Stop all button in the %s panel', (location) => {
    render(
      <CardListPanel
        location={location}
        cards={[instance('a', 'personnel')]}
        onClose={() => {}}
        selectedIds={[]}
        onToggleSelect={() => {}}
        onSetStopped={() => {}}
      />
    );
    expect(screen.queryByRole('button', { name: 'Stop all' })).toBeNull();
  });
});
