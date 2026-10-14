import { act, fireEvent, screen } from '@testing-library/react';

// The hand size the practice table tests play with: the opening hand of 7 that a new game dealt
// before #1115.
export const TEST_HAND_SIZE = 7;

const handCount = (): number => {
  const badge = screen.queryByRole('button', { name: /^hand, \d+ cards?, tap to open$/i, hidden: true });
  const match = badge?.getAttribute('aria-label')?.match(/^hand, (\d+) card/i);
  return match ? Number(match[1]) : 0;
};

// Draws from the draw deck, one tap at a time, until the closed hand holds `size` cards or the
// draw deck is empty (#1116). A draw takes the top card, so the hand and the draw deck end up as a
// deal of `size` cards would leave them. A test that needs cards in the hand calls this after it
// renders the page, so it does not rely on the opening hand of a new game, which #1115 removes.
export const drawOpeningHand = async (size: number = TEST_HAND_SIZE) => {
  let count = handCount();
  while (count < size) {
    const draw = screen.queryByRole('button', { name: 'Draw deck bottom, tap to draw', hidden: true });
    if (!draw || (draw as HTMLButtonElement).disabled) return;
    await act(async () => {
      fireEvent.click(draw);
    });
    const next = handCount();
    if (next <= count) return;
    count = next;
  }
};
