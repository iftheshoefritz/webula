import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import DilemmaLabClient, { LabDeck, LabMission } from '../../components/DilemmaLabClient';
import type { DilemmaId } from '../../lib/dilemmaBot/opponentPile';
import type { CardData } from '../../lib/loadCards';

const missions: LabMission[] = [
  { name: 'Alpha', requirements: 'Physics, 2 Treachery, Cunning>34' },
  { name: 'Beta', requirements: 'Engineer, Cunning>32, and total Weapons at this mission>10' },
  { name: 'Gamma', requirements: 'Medical, and any attribute>32' },
  { name: 'Delta', requirements: 'Physics, Cunning>30' },
];

const decks: LabDeck[] = [
  { label: 'Deck one', personnel: [], missions: ['Beta', 'Gamma', 'Alpha'] },
  { label: 'Deck two', personnel: [], missions: ['Delta'] },
];

const renderLab = () =>
  render(
    <DilemmaLabClient
      missions={missions}
      personnel={[]}
      decks={decks}
      dilemmaCards={{} as Record<DilemmaId, CardData>}
    />,
  );

const missionOptions = () =>
  Array.from((screen.getByTestId('lab-mission') as HTMLSelectElement).options).map((o) => o.value);

describe('DilemmaLabClient mission choice', () => {
  it('shows no mission dropdown until a deck is chosen', () => {
    renderLab();
    expect(screen.queryByTestId('lab-mission')).toBeNull();
    expect(screen.getByTestId('lab-random-crew')).toBeDisabled();
  });

  it('lists only the missions of the chosen deck, in its order, and starts on the first the bot reads', () => {
    renderLab();
    fireEvent.change(screen.getByTestId('lab-deck'), { target: { value: '0' } });

    expect(missionOptions()).toEqual(['', 'Beta', 'Gamma', 'Alpha']);
    expect(screen.getByTestId('lab-mission')).toHaveValue('Gamma');
    expect(screen.getByRole('option', { name: 'Beta (the bot cannot read its requirements)' })).toBeInTheDocument();
    expect(screen.getByTestId('lab-requirements')).toHaveTextContent('Medical, and any attribute>32');
    expect(screen.getByTestId('lab-random-crew')).toBeEnabled();
  });

  it('changes the mission list with the deck', () => {
    renderLab();
    fireEvent.change(screen.getByTestId('lab-deck'), { target: { value: '0' } });
    fireEvent.change(screen.getByTestId('lab-deck'), { target: { value: '1' } });

    expect(missionOptions()).toEqual(['', 'Delta']);
    expect(screen.getByTestId('lab-mission')).toHaveValue('Delta');

    fireEvent.change(screen.getByTestId('lab-deck'), { target: { value: '' } });
    expect(screen.queryByTestId('lab-mission')).toBeNull();
  });
});
