import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import CardsInCommonTable from '../../components/CardsInCommonTable';

const makeRow = (overrides = {}) => ({
  name: 'test card',
  count: 1,
  ...overrides,
});

const decreaseThreshold = (times = 1) => {
  const button = screen.getByLabelText('Decrease appearing in more than threshold');
  for (let i = 0; i < times; i++) fireEvent.click(button);
};

const increaseThreshold = (times = 1) => {
  const button = screen.getByLabelText('Increase appearing in more than threshold');
  for (let i = 0; i < times; i++) fireEvent.click(button);
};

const getThresholdValue = () => screen.getByLabelText('Appearing in more than').textContent;

describe('CardsInCommonTable', () => {
  it('groups rows by name across decks, summing print-variant copies', () => {
    render(
      <CardsInCommonTable
        decks={[
          {
            id: 'a',
            name: 'Deck A',
            rows: [
              makeRow({ name: 'Riker', count: 1 }),
              makeRow({ name: 'Riker', count: 1 }), // differing print variant, same name
            ],
          },
          { id: 'b', name: 'Deck B', rows: [makeRow({ name: 'Riker', count: 3 })] },
        ]}
      />
    );

    decreaseThreshold(); // default threshold is 2 (deck count); lower it to 1

    const row = screen.getByText('Riker').closest('tr')!;
    const cells = within(row).getAllByRole('cell');
    expect(cells[1]).toHaveTextContent('2');
    expect(cells[2]).toHaveTextContent('3');
    expect(cells[3]).toHaveTextContent('2'); // # decks
  });

  it('shows 0 for a deck missing the card', () => {
    render(
      <CardsInCommonTable
        decks={[
          { id: 'a', name: 'Deck A', rows: [makeRow({ name: 'Riker', count: 1 })] },
          { id: 'b', name: 'Deck B', rows: [makeRow({ name: 'Riker', count: 1 })] },
          { id: 'c', name: 'Deck C', rows: [makeRow({ name: 'Picard', count: 1 })] },
        ]}
      />
    );

    decreaseThreshold(2); // default threshold is 3 (deck count); lower it to 1

    const row = screen.getByText('Riker').closest('tr')!;
    const cells = within(row).getAllByRole('cell');
    expect(cells[3]).toHaveTextContent('0'); // Deck C, which lacks Riker
  });

  it('defaults the threshold to the current deck count', () => {
    render(
      <CardsInCommonTable
        decks={[
          { id: 'a', name: 'Deck A', rows: [makeRow({ name: 'Riker' })] },
          { id: 'b', name: 'Deck B', rows: [makeRow({ name: 'Riker' })] },
          { id: 'c', name: 'Deck C', rows: [makeRow({ name: 'Riker' })] },
        ]}
      />
    );

    expect(getThresholdValue()).toBe('3');
  });

  it('shows no cards at the default threshold, since it equals the deck count', () => {
    render(
      <CardsInCommonTable
        decks={[
          {
            id: 'a',
            name: 'Deck A',
            rows: [makeRow({ name: 'Riker' }), makeRow({ name: 'Picard' })],
          },
          { id: 'b', name: 'Deck B', rows: [makeRow({ name: 'Riker' })] },
        ]}
      />
    );

    // Default threshold is 2 (deck count); the strict `>` comparison means nothing
    // can exceed it by default, so the user must lower the threshold to see any cards.
    expect(screen.queryByText('Riker')).not.toBeInTheDocument();
    expect(screen.queryByText('Picard')).not.toBeInTheDocument();

    decreaseThreshold();

    // Riker is in 2 decks (>1); Picard is in only 1 deck (not >1).
    expect(screen.getByText('Riker')).toBeInTheDocument();
    expect(screen.queryByText('Picard')).not.toBeInTheDocument();
  });

  it('clamps the threshold to at least 1', () => {
    render(
      <CardsInCommonTable
        decks={[
          {
            id: 'a',
            name: 'Deck A',
            rows: [makeRow({ name: 'Riker' }), makeRow({ name: 'Picard' })],
          },
          { id: 'b', name: 'Deck B', rows: [makeRow({ name: 'Riker' })] },
        ]}
      />
    );

    decreaseThreshold(5); // attempt to go well below the minimum of 1

    expect(getThresholdValue()).toBe('1');
    // Riker is in 2 decks (>1), so it's visible once clamped to the minimum threshold of 1.
    expect(screen.getByText('Riker')).toBeInTheDocument();
    expect(screen.queryByText('Picard')).not.toBeInTheDocument();
  });

  it('clamps the threshold to at most the deck count', () => {
    render(
      <CardsInCommonTable
        decks={[
          { id: 'a', name: 'Deck A', rows: [makeRow({ name: 'Riker' })] },
          { id: 'b', name: 'Deck B', rows: [makeRow({ name: 'Riker' })] },
        ]}
      />
    );

    increaseThreshold(5); // attempt to go well above the deck count of 2

    expect(getThresholdValue()).toBe('2');
  });

  it('applies hover/rounded row styling matching the deck builder list rows', () => {
    render(
      <CardsInCommonTable
        decks={[
          { id: 'a', name: 'Deck A', rows: [makeRow({ name: 'Riker' })] },
          { id: 'b', name: 'Deck B', rows: [makeRow({ name: 'Riker' })] },
        ]}
      />
    );

    decreaseThreshold();

    const row = screen.getByText('Riker').closest('tr')!;
    expect(row.className).toContain('group');
    const cells = within(row).getAllByRole('cell');
    expect(cells[0].className).toContain('group-hover:bg-white/[0.04]');
    expect(cells[0].className).toContain('rounded-l');
    expect(cells[cells.length - 1].className).toContain('rounded-r');
  });

  it('sorts rows by a deck column descending on first header click', () => {
    render(
      <CardsInCommonTable
        decks={[
          {
            id: 'a',
            name: 'Deck A',
            rows: [
              makeRow({ name: 'Riker', count: 1 }),
              makeRow({ name: 'Picard', count: 5 }),
              makeRow({ name: 'Data', count: 3 }),
            ],
          },
          {
            id: 'b',
            name: 'Deck B',
            rows: [
              makeRow({ name: 'Riker', count: 1 }),
              makeRow({ name: 'Picard', count: 1 }),
              makeRow({ name: 'Data', count: 1 }),
            ],
          },
        ]}
      />
    );

    decreaseThreshold();
    fireEvent.click(screen.getByRole('button', { name: 'Deck A' }));

    const rows = screen.getAllByRole('row').slice(1);
    const nameCells = rows.map((r) => within(r).getAllByRole('cell')[0].textContent);
    expect(nameCells).toEqual(['Picard', 'Data', 'Riker']);
  });

  it('toggles to ascending on a second click of the same header', () => {
    render(
      <CardsInCommonTable
        decks={[
          {
            id: 'a',
            name: 'Deck A',
            rows: [
              makeRow({ name: 'Riker', count: 1 }),
              makeRow({ name: 'Picard', count: 5 }),
              makeRow({ name: 'Data', count: 3 }),
            ],
          },
          {
            id: 'b',
            name: 'Deck B',
            rows: [
              makeRow({ name: 'Riker', count: 1 }),
              makeRow({ name: 'Picard', count: 1 }),
              makeRow({ name: 'Data', count: 1 }),
            ],
          },
        ]}
      />
    );

    decreaseThreshold();
    const header = screen.getByRole('button', { name: 'Deck A' });
    fireEvent.click(header);
    fireEvent.click(header);

    const rows = screen.getAllByRole('row').slice(1);
    const nameCells = rows.map((r) => within(r).getAllByRole('cell')[0].textContent);
    expect(nameCells).toEqual(['Riker', 'Data', 'Picard']);
  });

  it('sorts by the # decks column', () => {
    render(
      <CardsInCommonTable
        decks={[
          {
            id: 'a',
            name: 'Deck A',
            rows: [makeRow({ name: 'Riker' }), makeRow({ name: 'Picard' })],
          },
          {
            id: 'b',
            name: 'Deck B',
            rows: [makeRow({ name: 'Riker' }), makeRow({ name: 'Picard' })],
          },
          { id: 'c', name: 'Deck C', rows: [makeRow({ name: 'Riker' })] },
        ]}
      />
    );

    decreaseThreshold(2);
    fireEvent.click(screen.getByRole('button', { name: /# decks/i }));

    const rows = screen.getAllByRole('row').slice(1);
    const nameCells = rows.map((r) => within(r).getAllByRole('cell')[0].textContent);
    expect(nameCells).toEqual(['Riker', 'Picard']);
  });

  it('excludes rows that do not match filterFunction', () => {
    render(
      <CardsInCommonTable
        decks={[
          {
            id: 'a',
            name: 'Deck A',
            rows: [
              makeRow({ name: 'Riker', count: 1, pile: 'draw' }),
              makeRow({ name: 'Kobayashi Maru', count: 1, pile: 'mission' }),
            ],
          },
          {
            id: 'b',
            name: 'Deck B',
            rows: [
              makeRow({ name: 'Riker', count: 1, pile: 'draw' }),
              makeRow({ name: 'Kobayashi Maru', count: 1, pile: 'mission' }),
            ],
          },
        ]}
        filterFunction={(row) => row.pile === 'mission'}
      />
    );

    decreaseThreshold();

    expect(screen.getByText('Kobayashi Maru')).toBeInTheDocument();
    expect(screen.queryByText('Riker')).not.toBeInTheDocument();
  });

  it('sorts by the card name column', () => {
    render(
      <CardsInCommonTable
        decks={[
          {
            id: 'a',
            name: 'Deck A',
            rows: [makeRow({ name: 'Riker' }), makeRow({ name: 'Picard' })],
          },
          {
            id: 'b',
            name: 'Deck B',
            rows: [makeRow({ name: 'Riker' }), makeRow({ name: 'Picard' })],
          },
        ]}
      />
    );

    decreaseThreshold();
    fireEvent.click(screen.getByRole('button', { name: 'Card' }));

    const rows = screen.getAllByRole('row').slice(1);
    const nameCells = rows.map((r) => within(r).getAllByRole('cell')[0].textContent);
    expect(nameCells).toEqual(['Riker', 'Picard']);
  });
});
