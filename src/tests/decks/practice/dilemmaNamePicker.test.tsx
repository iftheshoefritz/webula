import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ChargeChip } from '../../../app/decks/practice/TurnCounters';
import { DilemmaNamePicker } from '../../../app/decks/practice/DilemmaNamePicker';
import type { LogCharge } from '../../../app/decks/practice/gameLog';

// Tristan Adams's "+2: name a dilemma" (#1761): the chip's button and the picker of a title.

const target = { entry: 0, move: 0, card: 0 };
const charge: LogCharge = {
  target,
  card: 'Tristan Adams Deranged Psychiatrist',
  draw: false,
  cost: 2,
  source: {
    title: 'Tristan Adams',
    reason: 'you may name a dilemma',
    choice: { label: '+2: name a dilemma', cost: 4, nameDilemma: true },
  },
};

describe('the choice to name a dilemma (#1761)', () => {
  it('opens the picker with the cost it sets, and corrects nothing by itself', () => {
    const onNameDilemma = jest.fn();
    const onCorrect = jest.fn();
    render(<ChargeChip charges={[charge]} onCorrect={onCorrect} onRaiseLimit={jest.fn()} onNameDilemma={onNameDilemma} />);
    fireEvent.click(screen.getByTestId('charge-choice'));
    expect(onNameDilemma).toHaveBeenCalledWith(target, 'Tristan Adams', 4);
    expect(onCorrect).not.toHaveBeenCalled();
  });
});

describe('the picker of a dilemma title (#1761)', () => {
  const titles = ['Alpha Dilemma', 'Beta Trial', 'Gamma Dilemma'];

  it('lists the titles, narrows them by a search, and hands the chosen title back', () => {
    const onChoose = jest.fn();
    render(<DilemmaNamePicker title="Tristan Adams" titles={titles} onChoose={onChoose} onClose={jest.fn()} />);
    expect(screen.getAllByTestId('dilemma-name-choice').map((b) => b.textContent)).toEqual(titles);
    fireEvent.change(screen.getByTestId('dilemma-name-search'), { target: { value: 'dilemma' } });
    expect(screen.getAllByTestId('dilemma-name-choice').map((b) => b.textContent)).toEqual(['Alpha Dilemma', 'Gamma Dilemma']);
    fireEvent.click(screen.getByText('Gamma Dilemma'));
    expect(onChoose).toHaveBeenCalledWith('Gamma Dilemma');
  });

  it('says so when nothing matches, and Cancel closes it', () => {
    const onClose = jest.fn();
    render(<DilemmaNamePicker title="Tristan Adams" titles={titles} onChoose={jest.fn()} onClose={onClose} />);
    fireEvent.change(screen.getByTestId('dilemma-name-search'), { target: { value: 'zzz' } });
    expect(screen.queryAllByTestId('dilemma-name-choice')).toHaveLength(0);
    expect(screen.getByText('No dilemma matches.')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('dilemma-name-cancel'));
    expect(onClose).toHaveBeenCalled();
  });
});
