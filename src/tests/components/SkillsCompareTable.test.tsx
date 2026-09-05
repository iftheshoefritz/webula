import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import SkillsCompareTable from '../../components/SkillsCompareTable';

const makeRow = (overrides = {}) => ({
  pile: 'draw',
  type: 'personnel',
  skills: '',
  count: 1,
  ...overrides,
});

describe('SkillsCompareTable', () => {
  it('renders one row per canonical skill with no decks selected', () => {
    render(<SkillsCompareTable decks={[]} />);
    expect(screen.getByText('acquisition')).toBeInTheDocument();
    expect(screen.getByText('diplomacy')).toBeInTheDocument();
    expect(screen.getByText('treachery')).toBeInTheDocument();
    // No deck header columns.
    expect(screen.queryAllByRole('columnheader')).toHaveLength(1);
  });

  it('renders a single data column for one deck', () => {
    render(
      <SkillsCompareTable
        decks={[{ id: 'a', name: 'Deck A', rows: [makeRow({ skills: 'diplomacy', count: 3 })] }]}
      />
    );
    expect(screen.getByText('Deck A (3)')).toBeInTheDocument();
    const row = screen.getByText('diplomacy').closest('tr')!;
    expect(within(row).getByText('3')).toBeInTheDocument();
  });

  it('renders one column per deck with correct aggregated counts', () => {
    render(
      <SkillsCompareTable
        decks={[
          { id: 'a', name: 'Deck A', rows: [makeRow({ skills: 'diplomacy', count: 2 })] },
          { id: 'b', name: 'Deck B', rows: [makeRow({ skills: 'diplomacy', count: 3 }), makeRow({ skills: 'diplomacy', count: 4 })] },
        ]}
      />
    );
    expect(screen.getByText('Deck A (2)')).toBeInTheDocument();
    expect(screen.getByText('Deck B (7)')).toBeInTheDocument();
    const row = screen.getByText('diplomacy').closest('tr')!;
    const cells = within(row).getAllByRole('cell');
    expect(cells[1]).toHaveTextContent('2');
    expect(cells[2]).toHaveTextContent('7');
  });

  it('parses multi-level skill strings like "2 security"', () => {
    render(
      <SkillsCompareTable
        decks={[{ id: 'a', name: 'Deck A', rows: [makeRow({ skills: '2 security', count: 1 })] }]}
      />
    );
    const row = screen.getByText('security').closest('tr')!;
    expect(within(row).getByText('1')).toBeInTheDocument();
  });

  it('shows zero for skills a deck has no cards for', () => {
    render(
      <SkillsCompareTable
        decks={[{ id: 'a', name: 'Deck A', rows: [makeRow({ skills: 'diplomacy', count: 1 })] }]}
      />
    );
    const row = screen.getByText('security').closest('tr')!;
    expect(within(row).getByText('0')).toBeInTheDocument();
  });

  it('sorts rows by a deck column descending on first header click', () => {
    render(
      <SkillsCompareTable
        decks={[
          {
            id: 'a',
            name: 'Deck A',
            rows: [
              makeRow({ skills: 'diplomacy', count: 1 }),
              makeRow({ skills: 'security', count: 5 }),
              makeRow({ skills: 'medical', count: 3 }),
            ],
          },
        ]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Deck A (9)' }));

    const rows = screen.getAllByRole('row').slice(1); // skip header row
    const skillCells = rows.map((r) => within(r).getAllByRole('cell')[0].textContent);
    expect(skillCells[0]).toBe('security');
    expect(skillCells[1]).toBe('medical');
    expect(skillCells[2]).toBe('diplomacy');
  });

  it('toggles to ascending on a second click of the same header', () => {
    render(
      <SkillsCompareTable
        decks={[
          {
            id: 'a',
            name: 'Deck A',
            rows: [
              makeRow({ skills: 'diplomacy', count: 1 }),
              makeRow({ skills: 'security', count: 5 }),
              makeRow({ skills: 'medical', count: 3 }),
            ],
          },
        ]}
      />
    );

    const header = screen.getByRole('button', { name: 'Deck A (9)' });
    fireEvent.click(header);
    fireEvent.click(header);

    const rows = screen.getAllByRole('row').slice(1);
    const skillCells = rows.map((r) => within(r).getAllByRole('cell')[0].textContent);
    const relevant = ['diplomacy', 'medical', 'security'].map((s) => skillCells.indexOf(s));
    expect(relevant).toEqual([...relevant].sort((a, b) => a - b));
  });

  it('applies hover/rounded row styling matching the deck builder list rows', () => {
    render(
      <SkillsCompareTable
        decks={[{ id: 'a', name: 'Deck A', rows: [makeRow({ skills: 'diplomacy', count: 1 })] }]}
      />
    );
    const row = screen.getByText('diplomacy').closest('tr')!;
    expect(row.className).toContain('group');
    const cells = within(row).getAllByRole('cell');
    expect(cells[0].className).toContain('group-hover:bg-white/[0.04]');
    expect(cells[0].className).toContain('rounded-l');
    expect(cells[cells.length - 1].className).toContain('rounded-r');
  });

  it('re-sorts by a different deck column when a different header is clicked, resetting to descending', () => {
    render(
      <SkillsCompareTable
        decks={[
          {
            id: 'a',
            name: 'Deck A',
            rows: [
              makeRow({ skills: 'diplomacy', count: 5 }),
              makeRow({ skills: 'security', count: 1 }),
            ],
          },
          {
            id: 'b',
            name: 'Deck B',
            rows: [
              makeRow({ skills: 'diplomacy', count: 1 }),
              makeRow({ skills: 'security', count: 5 }),
            ],
          },
        ]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Deck A (6)' }));
    let rows = screen.getAllByRole('row').slice(1);
    let skillCells = rows.map((r) => within(r).getAllByRole('cell')[0].textContent);
    expect(skillCells[0]).toBe('diplomacy');

    fireEvent.click(screen.getByRole('button', { name: 'Deck B (6)' }));
    rows = screen.getAllByRole('row').slice(1);
    skillCells = rows.map((r) => within(r).getAllByRole('cell')[0].textContent);
    expect(skillCells[0]).toBe('security');
  });
});
