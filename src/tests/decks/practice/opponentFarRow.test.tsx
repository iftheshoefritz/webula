import { render, screen, fireEvent } from '@testing-library/react';
import {
  CAMERA_STEPS,
  CAMERA_WHOLE_TABLE,
  CAMERA_YOUR_SIDE,
  CameraToggle,
  CameraZoom,
  mirroredSlots,
  parseOpponentLayout,
  presence,
} from '../../../app/decks/practice/OpponentFarRow';
import { botOpponent, emptySide } from '../../../app/decks/practice/opponent';
import type { CardInstance } from '../../../app/decks/practice/tableReducer';

const card = (id: string, type = 'personnel'): CardInstance => ({ id, card: { name: id, type }, face: 'up' });

describe('the layouts of the opponent\'s half on the 3D table (#1823)', () => {
  it('reads ?layout=a|b|c|d, D by default', () => {
    expect(['a', 'b', 'c', 'd'].map(parseOpponentLayout)).toEqual(['a', 'b', 'c', 'd']);
    expect(parseOpponentLayout(null)).toBe('d');
    expect(parseOpponentLayout('e')).toBe('d');
  });

  it('mirrors the opponent\'s slots, their slot 0 on the right', () => {
    expect(mirroredSlots()).toEqual([4, 3, 2, 1, 0]);
  });

  it('colours a location by who is there', () => {
    const someone = { awayTeam: [card('p')], ships: [] };
    expect(presence(emptySide(), emptySide())).toBe('none');
    expect(presence(someone, emptySide())).toBe('you');
    expect(presence(emptySide(), someone)).toBe('opponent');
    expect(presence(someone, someone)).toBe('contested');
  });

  it('D turns the camera between your side (18°) and the whole table (28°)', () => {
    const onTilt = jest.fn();
    const { rerender } = render(<CameraToggle tiltDeg={CAMERA_YOUR_SIDE} onTilt={onTilt} />);
    fireEvent.click(screen.getByTestId('camera-toggle'));
    expect(onTilt).toHaveBeenLastCalledWith(CAMERA_WHOLE_TABLE);
    rerender(<CameraToggle tiltDeg={CAMERA_WHOLE_TABLE} onTilt={onTilt} />);
    expect(screen.getByTestId('camera-toggle')).toHaveAttribute('data-view', 'whole');
    fireEvent.click(screen.getByTestId('camera-toggle'));
    expect(onTilt).toHaveBeenLastCalledWith(CAMERA_YOUR_SIDE);
  });

  it('C steps the camera, and its minimap turns it to either side', () => {
    const half = botOpponent({ opponent: 'bot', dilemmaPile: [], botBrig: [] })!;
    const sides = Array.from({ length: 5 }, emptySide);
    const onTilt = jest.fn();
    render(<CameraZoom tiltDeg={CAMERA_STEPS[1]} onTilt={onTilt} yourSides={sides} half={half} />);
    fireEvent.click(screen.getByTestId('camera-wider'));
    expect(onTilt).toHaveBeenLastCalledWith(CAMERA_STEPS[2]);
    fireEvent.click(screen.getByTestId('camera-closer'));
    expect(onTilt).toHaveBeenLastCalledWith(CAMERA_STEPS[0]);
    fireEvent.click(screen.getByTestId('overview-row-opponent'));
    expect(onTilt).toHaveBeenLastCalledWith(CAMERA_STEPS[CAMERA_STEPS.length - 1]);
    fireEvent.click(screen.getByTestId('overview-row-you'));
    expect(onTilt).toHaveBeenLastCalledWith(CAMERA_YOUR_SIDE);
  });
});
