import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import ControlsPanel from '../../../app/decks/practice/ControlsPanel';
import { CONTROL_ROWS, CONTROL_SECTIONS } from '../../../app/decks/practice/controls';

const mockPointer = (fine: boolean) => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches: fine,
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    })),
  });
};

describe('controls.ts (#1088)', () => {
  it('gives every row a unique id', () => {
    const ids = CONTROL_ROWS.map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('puts every row in a known section, with text for touch and for a mouse', () => {
    for (const row of CONTROL_ROWS) {
      expect(CONTROL_SECTIONS).toContain(row.section);
      expect(row.action).not.toBe('');
      expect(row.touch).not.toBe('');
      expect(row.mouse).not.toBe('');
    }
  });
});

describe('ControlsPanel (#1088)', () => {
  it('renders every row, under a heading for each section', () => {
    mockPointer(false);
    render(<ControlsPanel onClose={jest.fn()} />);
    const panel = screen.getByTestId('controls-panel');
    for (const section of CONTROL_SECTIONS) {
      expect(within(panel).getByRole('heading', { name: section })).toBeInTheDocument();
    }
    for (const row of CONTROL_ROWS) {
      const item = screen.getByTestId(`control-${row.id}`);
      expect(item).toHaveTextContent(row.action);
      expect(item).toHaveTextContent(row.touch);
    }
  });

  it('opens on the touch column on a touch device, and the switch shows the mouse column', () => {
    mockPointer(false);
    render(<ControlsPanel onClose={jest.fn()} />);
    const panel = screen.getByTestId('controls-panel');
    expect(panel).toHaveAttribute('data-column', 'touch');
    expect(screen.getByRole('button', { name: 'Touch' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Mouse' }));
    expect(panel).toHaveAttribute('data-column', 'mouse');
    const row = CONTROL_ROWS.find((r) => r.touch !== r.mouse)!;
    expect(screen.getByTestId(`control-${row.id}`)).toHaveTextContent(row.mouse);
  });

  it('opens on the mouse column with a fine pointer, every time', () => {
    mockPointer(true);
    const { unmount } = render(<ControlsPanel onClose={jest.fn()} />);
    expect(screen.getByTestId('controls-panel')).toHaveAttribute('data-column', 'mouse');
    fireEvent.click(screen.getByRole('button', { name: 'Touch' }));
    expect(screen.getByTestId('controls-panel')).toHaveAttribute('data-column', 'touch');
    unmount();

    render(<ControlsPanel onClose={jest.fn()} />);
    expect(screen.getByTestId('controls-panel')).toHaveAttribute('data-column', 'mouse');
  });

  it('closes on Escape and on a tap on the backdrop', () => {
    mockPointer(false);
    const onClose = jest.fn();
    render(<ControlsPanel onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Close controls' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
