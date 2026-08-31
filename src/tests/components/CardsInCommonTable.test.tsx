import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import CardsInCommonTable from '../../components/CardsInCommonTable';

const makeRow = (overrides = {}) => ({
  name: 'test card',
  count: 1,
  ...overrides,
});

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
          { id: 'b', name: 'Deck B', rows: [makeRow({ name: 'Picard', count: 1 })] },
        ]}
      />
    );

    fireEvent.change(screen.getByLabelText('Minimum decks'), { target: { value: '1' } });

    const row = screen.getByText('Riker').closest('tr')!;
    const cells = within(row).getAllByRole('cell');
    expect(cells[2]).toHaveTextContent('0');
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

    expect(screen.getByLabelText('Minimum decks')).toHaveValue(3);
  });

  it('filters out cards below the threshold', () => {
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

    // Default threshold is 2 (deck count), so Picard (in 1 deck) is filtered out.
    expect(screen.getByText('Riker')).toBeInTheDocument();
    expect(screen.queryByText('Picard')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Minimum decks'), { target: { value: '1' } });

    expect(screen.getByText('Riker')).toBeInTheDocument();
    expect(screen.getByText('Picard')).toBeInTheDocument();
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

    fireEvent.change(screen.getByLabelText('Minimum decks'), { target: { value: '0' } });

    expect(screen.getByLabelText('Minimum decks')).toHaveValue(1);
    expect(screen.getByText('Picard')).toBeInTheDocument();
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

    fireEvent.change(screen.getByLabelText('Minimum decks'), { target: { value: '5' } });

    expect(screen.getByLabelText('Minimum decks')).toHaveValue(2);
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
        ]}
      />
    );

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
        ]}
      />
    );

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
          { id: 'b', name: 'Deck B', rows: [makeRow({ name: 'Riker' })] },
        ]}
      />
    );

    fireEvent.change(screen.getByLabelText('Minimum decks'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: /# decks/i }));

    const rows = screen.getAllByRole('row').slice(1);
    const nameCells = rows.map((r) => within(r).getAllByRole('cell')[0].textContent);
    expect(nameCells).toEqual(['Riker', 'Picard']);
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
        ]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Card' }));

    const rows = screen.getAllByRole('row').slice(1);
    const nameCells = rows.map((r) => within(r).getAllByRole('cell')[0].textContent);
    expect(nameCells).toEqual(['Riker', 'Picard']);
  });
});
