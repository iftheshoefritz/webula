import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { AttemptDialog } from '../../../app/decks/practice/AttemptPanel';

// Issue #1917: the attempt popup shows the attempt rules an attempt of the entered personnel would break, a line of
// its own, and Start still starts the attempt.
describe('the attempt popup warning (#1917)', () => {
  const warningsFor = (personnel: number) =>
    personnel < 6 ? [{ rule: 'attempt', text: "They're Still Coming Through!: you cannot begin a mission attempt with fewer than six personnel" }] : [];

  it('shows the warning for five personnel, none for six, and Start still starts', () => {
    const onStart = jest.fn();
    render(<AttemptDialog mission="Moab IV" personnel={5} subtract={0} warningsFor={warningsFor} onStart={onStart} onCancel={() => {}} />);
    const line = screen.getByTestId('attempt-rule-warning');
    expect(line).toHaveAttribute('data-rule', 'attempt');
    expect(line).toHaveTextContent("They're Still Coming Through!: you cannot begin a mission attempt with fewer than six personnel");
    fireEvent.change(screen.getByTestId('attempt-personnel'), { target: { value: '6' } });
    expect(screen.queryByTestId('attempt-rule-warning')).toBeNull();
    fireEvent.change(screen.getByTestId('attempt-personnel'), { target: { value: '5' } });
    fireEvent.click(screen.getByTestId('attempt-start'));
    expect(onStart).toHaveBeenCalledWith(5, 0);
  });

  it('shows no line without the warnings', () => {
    render(<AttemptDialog mission="Moab IV" personnel={5} subtract={0} onStart={() => {}} onCancel={() => {}} />);
    expect(screen.queryByTestId('attempt-rule-warning')).toBeNull();
  });
});
