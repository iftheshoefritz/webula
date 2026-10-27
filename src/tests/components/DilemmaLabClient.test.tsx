import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import DilemmaLabClient, { LabDeck, LabMission, LabPersonnel } from '../../components/DilemmaLabClient';
import { OPPONENT_DILEMMAS, type DilemmaId } from '../../lib/dilemmaBot/opponentPile';
import { makeCardData } from '../fixtures/makeCardData';
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

const physicist: LabPersonnel = {
  originalName: 'Physicist',
  name: 'Physicist',
  cost: '2',
  integrity: '6',
  cunning: '31',
  strength: '5',
  skills: 'Physics, 2 Science',
};

const dilemmaCards = Object.fromEntries(
  OPPONENT_DILEMMAS.map((d) => [d.id, makeCardData({ name: d.title, originalName: d.title, type: 'dilemma' })]),
) as Record<DilemmaId, CardData>;

describe('DilemmaLabClient search feedback', () => {
  const renderWithCrew = () => {
    render(
      <DilemmaLabClient
        missions={missions}
        personnel={[physicist]}
        decks={[{ label: 'Deck three', personnel: ['Physicist'], missions: ['Delta'] }]}
        dilemmaCards={dilemmaCards}
      />,
    );
    fireEvent.change(screen.getByTestId('lab-deck'), { target: { value: '0' } });
    fireEvent.click(screen.getByTestId('lab-random-crew'));
    fireEvent.change(screen.getByTestId('lab-n'), { target: { value: '2' } });
    fireEvent.click(screen.getByTestId('lab-draw'));
  };

  it('says why the full search waits on the bot, then shows its result and explains damage', () => {
    renderWithCrew();
    expect(screen.getByTestId('lab-full')).toBeDisabled();
    expect(screen.getByTestId('lab-full-hint')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('lab-choose'));
    expect(screen.queryByTestId('lab-full-hint')).toBeNull();
    expect(screen.getByTestId('lab-damage-help')).toHaveTextContent('Stops do not count');
    expect(screen.getByTestId('lab-full')).toBeEnabled();

    fireEvent.click(screen.getByTestId('lab-full'));
    expect(screen.getByTestId('lab-comparison')).toBeInTheDocument();
    expect(screen.queryByTestId('lab-status')).toBeNull();
  });

  // A result belongs to the inputs it came from (#1309).
  it('clears both results when an input changes', () => {
    renderWithCrew();
    fireEvent.click(screen.getByTestId('lab-choose'));
    fireEvent.click(screen.getByTestId('lab-full'));
    expect(screen.getByTestId('lab-comparison')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('lab-n'), { target: { value: '3' } });
    expect(screen.queryByTestId('lab-comparison')).toBeNull();
    expect(screen.getByTestId('lab-full-hint')).toBeInTheDocument();
  });
});
