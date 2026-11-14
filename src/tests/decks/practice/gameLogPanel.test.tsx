import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import GameLogPanel from '../../../app/decks/practice/GameLogPanel';
import { LogEntry } from '../../../app/decks/practice/gameLog';

// jsdom does no layout, so the scroller's sizes are stubbed: 1000 px of content in a 200 px box.
const SCROLL_HEIGHT = 1000;
const CLIENT_HEIGHT = 200;

const shuffle = (turn: number): LogEntry => ({ turn, kind: 'shuffle', place: { kind: 'drawDeck' } });
const log: LogEntry[] = [shuffle(1), shuffle(1), shuffle(2), shuffle(3)];

describe('the game log opens at the newest entry (#1562)', () => {
  const scrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight');
  const clientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');

  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get: () => SCROLL_HEIGHT });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => CLIENT_HEIGHT });
  });

  afterAll(() => {
    if (scrollHeight) Object.defineProperty(HTMLElement.prototype, 'scrollHeight', scrollHeight);
    if (clientHeight) Object.defineProperty(HTMLElement.prototype, 'clientHeight', clientHeight);
  });

  it('opens scrolled to the end, with the turns still oldest first', () => {
    render(<GameLogPanel log={log} onClose={() => {}} />);
    expect(screen.getByTestId('game-log-scroll').scrollTop).toBe(SCROLL_HEIGHT);
    const turns = Array.from(document.querySelectorAll('[data-testid^="game-log-turn-"]')).map((s) =>
      s.getAttribute('data-testid')
    );
    expect(turns).toEqual(['game-log-turn-1', 'game-log-turn-2', 'game-log-turn-3']);
  });

  it('follows a new entry while it is at the end', () => {
    const { rerender } = render(<GameLogPanel log={log} onClose={() => {}} />);
    const scroller = screen.getByTestId('game-log-scroll');
    scroller.scrollTop = SCROLL_HEIGHT - CLIENT_HEIGHT;
    fireEvent.scroll(scroller);
    scroller.scrollTop = 0;
    rerender(<GameLogPanel log={[...log, shuffle(3)]} onClose={() => {}} />);
    expect(scroller.scrollTop).toBe(SCROLL_HEIGHT);
  });

  it('keeps its place on a new entry when the player scrolled up', () => {
    const { rerender } = render(<GameLogPanel log={log} onClose={() => {}} />);
    const scroller = screen.getByTestId('game-log-scroll');
    scroller.scrollTop = 100;
    fireEvent.scroll(scroller);
    rerender(<GameLogPanel log={[...log, shuffle(3)]} onClose={() => {}} />);
    expect(scroller.scrollTop).toBe(100);
  });
});

describe('the total of a play and draw segment (#1606)', () => {
  it('shows the counters under the heading, and none for a segment that charged nothing', () => {
    const entries: LogEntry[] = [
      { turn: 1, segment: 'playAndDraw', kind: 'draw', from: 'drawDeck', to: 'hand', cost: 1 },
      {
        turn: 1,
        segment: 'playAndDraw',
        kind: 'move',
        moves: [{ cards: ['Goran'], from: { kind: 'hand' }, to: { kind: 'core' }, costs: [3] }],
      },
      { turn: 2, kind: 'nextTurn' },
    ];
    render(<GameLogPanel log={entries} onClose={() => {}} />);
    expect(screen.getAllByTestId('game-log-segment-total').map((p) => p.textContent)).toEqual(['4 counters: 3 on cards, 1 on draws']);
  });
});
