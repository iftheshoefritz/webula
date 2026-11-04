import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import DilemmaLabClient, { LabDeck, LabMission, LabPersonnel } from '../../components/DilemmaLabClient';
import { OPPONENT_DILEMMAS } from '../../lib/dilemmaBot/opponentPile';
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
      dilemmaCards={{} as Record<string, CardData>}
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
  OPPONENT_DILEMMAS.map((d) => [d.title, makeCardData({ name: d.title, originalName: d.title, type: 'dilemma' })]),
) as Record<string, CardData>;

// The lab asks the pile bot's beam search for its stack (#1509).
describe('DilemmaLabClient search feedback', () => {
  const renderWithCrew = (gameOnMission = 0) => {
    const view = render(
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
    if (gameOnMission) fireEvent.change(screen.getByLabelText(/^Copies of Chula: The Game/), { target: { value: String(gameOnMission) } });
    fireEvent.click(screen.getByTestId('lab-draw'));
    return view;
  };

  it('shows the drawn titles, the chosen stack, the baseline, the ranked stacks and three samples', () => {
    renderWithCrew();
    const drawnCards = screen.getByTestId('lab-drawn-cards').children;
    expect(drawnCards).toHaveLength(2);
    for (const card of Array.from(drawnCards)) expect(card.getAttribute('data-testid')).toMatch(/^lab-drawn-card-chula-/);

    fireEvent.click(screen.getByTestId('lab-choose'));
    expect(screen.getByTestId('lab-result-stack')).toBeInTheDocument();
    expect(screen.getByTestId('lab-result-score')).toHaveTextContent(/P\(fail\) .*lasting damage/);
    expect(screen.getByTestId('lab-baseline')).toHaveTextContent('the baseline');
    expect(screen.getByTestId('lab-ranked')).toHaveTextContent('The stacks the beam kept');
    expect(screen.getAllByTestId('lab-sample')).toHaveLength(3);
    expect(screen.getByTestId('lab-damage-help')).toHaveTextContent('Stops do not count');
    expect(screen.getByTestId('lab-damage-help')).toHaveTextContent('returned to the hand 0.75');
    expect(screen.queryByTestId('lab-full')).toBeNull();
    expect(screen.queryByTestId('lab-comparison')).toBeNull();
    expect(screen.queryByTestId('lab-status')).toBeNull();
  });

  it('traces the stop of Chula: The Game on the mission before a Chula dilemma', () => {
    renderWithCrew(1);
    // A draw of one Chula: Echoes, which costs 1, so the stack holds a Chula title.
    for (const box of screen.getAllByRole('checkbox') as HTMLInputElement[]) if (box.checked) fireEvent.click(box);
    fireEvent.click(screen.getByLabelText('Chula: Echoes (1)'));
    fireEvent.click(screen.getByTestId('lab-choose'));

    expect(screen.getByTestId('lab-result-stack')).toHaveTextContent('Chula: Echoes');
    for (const sample of screen.getAllByTestId('lab-sample')) {
      expect(sample.textContent).toMatch(/Chula: Echoes:\n {2}Chula: The Game on the mission stops Physicist/);
    }
  });

  // A result belongs to the inputs it came from (#1309).
  it('clears the result when an input changes', () => {
    renderWithCrew();
    fireEvent.click(screen.getByTestId('lab-choose'));
    expect(screen.getByTestId('lab-result')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('lab-n'), { target: { value: '3' } });
    expect(screen.queryByTestId('lab-result')).toBeNull();
  });
});
