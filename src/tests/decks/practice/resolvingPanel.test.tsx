// `?fixture=resolving` (#1728): These Are The Voyages resolving, and the hold on the turn. Since #1870 it resolves
// in the prompt, with no modal panel: a row of candidate personnel, then picks in the hand arc. The panel's own
// buttons are tested with At What Cost? in `playTarget.test.tsx`.
let mockSearchParamsValue = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  useSearchParams: () => mockSearchParamsValue,
}));

// The rows are read by hand, normalised as `parseCardData` does: Jest does not load the real d3.
// One stable array: a fresh `data` each render would rerun the page's deck load forever.
const mockData: any[] = (() => {
  const { readFileSync } = jest.requireActual('fs');
  const { join } = jest.requireActual('path');
  const [head, ...rows] = (readFileSync(join(process.cwd(), 'public', 'cards_with_processed_columns.txt'), 'utf-8') as string)
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\t').map((cell) => cell.replace(/^"|"$/g, '')));
  return rows.map((r) => {
    const row: any = Object.fromEntries(head.map((h, i) => [h.toLowerCase(), (r[i] ?? '').toLowerCase()]));
    row.collectorsinfo = row.collectorsinfo.replace(/(^|[^0-9])0+(\d+)/g, '$1$2');
    row.originalName = r[head.indexOf('Name')];
    row.missiontype = row.type === 'mission' ? row.mission : '';
    return row;
  });
})();
jest.mock('../../../hooks/useDataFetching', () => ({
  __esModule: true,
  default: () => ({ data: mockData, loading: false }),
}));

jest.mock('next-auth/react', () => ({
  getSession: jest.fn().mockResolvedValue(null),
  signIn: jest.fn(),
}));

jest.mock('posthog-js', () => ({ capture: jest.fn() }));

jest.mock('next/link', () => {
  return function MockLink({ children, href }: { children: React.ReactNode; href: string }) {
    return <a href={href}>{children}</a>;
  };
});

import React from 'react';
import { render, act, fireEvent, screen, within } from '@testing-library/react';
import PracticeDrawPage from '../../../app/decks/practice/PracticeTable';

const saved = () => JSON.parse(localStorage.getItem('practiceGame:fixture=resolving')!);
const nameOf = (key: string) => saved().dealtDeck[key].row.originalName;
const nextTurnButton = () => screen.getByTestId('turn-counter').closest('button')!;

const candidates = () => screen.getAllByTestId('resolve-candidate');
const arcCard = (id: string) => within(screen.getByTestId('hand-arc')).getByRole('button', { name: new RegExp(nameOfId(id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) });
const nameOfId = (id: string) => nameOf(saved().table.hand.find((c: any) => c.id === id).key);
const handIds = (): string[] => saved().table.hand.map((c: any) => c.id);
const pickNumberOf = (id: string) =>
  screen.getByTestId('hand-arc').querySelector(`[data-card-id="${id}"]`)!.parentElement!.querySelector('[data-testid="hand-pick-number"]');

// Picks the first candidate of cost 1 or more and draws.
const drawFromFirstCostly = () => {
  const card = candidates().find((c) => Number(within(c).getByTestId('resolve-candidate-cost').textContent) > 0)!;
  const cost = Number(within(card).getByTestId('resolve-candidate-cost').textContent);
  fireEvent.click(card);
  fireEvent.click(screen.getByTestId('resolve-prompt-done'));
  return cost;
};

describe('?fixture=resolving (#1728, #1870)', () => {
  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem('practice-turn-counters', 'true');
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      })),
    });
    mockSearchParamsValue = new URLSearchParams('fixture=resolving&reset=1&menu=0');
    await act(async () => {
      render(<PracticeDrawPage />);
    });
  });

  it('deals These Are The Voyages resolving, charged 1, in the prompt and not the panel', () => {
    expect(nameOf(saved().table.resolving.key)).toBe('These Are The Voyages');
    expect(screen.queryByTestId('resolving-panel')).toBeNull();
    expect(screen.getByTestId('resolve-prompt')).toBeInTheDocument();
    expect(screen.getByTestId('resolve-prompt-task')).toHaveTextContent('Choose one of your personnel: draw its cost');
    expect(screen.getByTestId('resolve-prompt-count')).toHaveTextContent('0 of 1');
    expect(screen.getByTestId('resolve-prompt-done')).toBeDisabled();
    expect(screen.getByTestId('resolve-prompt-cancel')).toBeInTheDocument();
    // The small card shows beside the prompt, and drags out of the zone.
    const mini = screen.getByTestId('resolving-mini');
    expect(mini).toHaveAttribute('data-zone', 'resolving');
    expect(mini.querySelector('[data-card-id]')).toHaveAttribute('data-card-id', saved().table.resolving.id);
    expect(screen.getByTestId('turn-counters')).toHaveTextContent('1/7');
  });

  it('lists every personnel of the away teams and crews, stopped ones too, never the brig, with its place and cost', () => {
    // The save keeps keys, not cards: the personnel of the away teams in mission order, then of the crews.
    const isPersonnel = (c: any) => saved().dealtDeck[c.key].row.type === 'personnel';
    const missions = saved().table.missions;
    const expected = [
      ...missions.flatMap((m: any) => m.awayTeam.filter(isPersonnel)),
      ...missions.flatMap((m: any) => m.ships.flatMap((s: any) => (s.crew ?? []).filter(isPersonnel))),
    ].map((c: any) => c.id);
    expect(expected.length).toBeGreaterThan(0);
    expect(candidates().map((c) => c.getAttribute('data-card-id'))).toEqual(expected);
    const brig = saved().table.brig.map((c: any) => c.id);
    expect(candidates().some((c) => brig.includes(c.getAttribute('data-card-id')))).toBe(false);
    const places = new Set(candidates().map((c) => c.getAttribute('data-place')));
    // The card data names a card with its subtitle.
    expect(places).toContain('Moab IV Avert Danger');
    expect(places).toContain('U.S.S. Relativity Federation Timeship at Bilana System Evaluate Soliton Wave');
    for (const c of candidates()) {
      const id = c.getAttribute('data-card-id')!;
      const all = [...saved().table.missions.flatMap((m: any) => [...m.awayTeam, ...m.ships.flatMap((s: any) => s.crew ?? [])])];
      const instance = all.find((i: any) => i.id === id);
      expect(within(c).getByTestId('resolve-candidate-cost')).toHaveTextContent(String(Number(saved().dealtDeck[instance.key].row.cost) || 0));
      expect(within(c).getByTestId('resolve-candidate-place')).toHaveTextContent(c.getAttribute('data-place')!);
    }
  });

  it('holds the next-turn button while the event resolves, and says why', () => {
    expect(nextTurnButton()).toBeDisabled();
    expect(nextTurnButton()).toHaveAttribute('aria-label', 'Resolve These Are The Voyages first');
    expect(nextTurnButton()).toHaveAttribute('title', 'Resolve These Are The Voyages first');
  });

  it('moves the pick with a second tap, and reads Draw N', () => {
    const [a, b] = candidates();
    fireEvent.click(a);
    expect(a).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(b);
    expect(a).toHaveAttribute('aria-pressed', 'false');
    expect(b).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('resolve-prompt-count')).toHaveTextContent('1 of 1');
    expect(screen.getByTestId('resolve-prompt-done')).not.toBeDisabled();
    expect(screen.getByTestId('resolve-prompt-done')).toHaveTextContent(`Draw ${within(b).getByTestId('resolve-candidate-cost').textContent}`);
  });

  it('cancels back to the end of the hand with 0 spent, and one undo puts it back charged', () => {
    const id = saved().table.resolving.id;
    fireEvent.click(screen.getByTestId('resolve-prompt-cancel'));
    expect(screen.queryByTestId('resolve-prompt')).toBeNull();
    const hand = saved().table.hand;
    expect(hand[hand.length - 1].id).toBe(id);
    expect(screen.getByTestId('turn-counters')).toHaveTextContent('0/7');
    expect(screen.getByTestId('undo-button')).toHaveAttribute('aria-label', 'Undo: Cancelled playing These Are The Voyages');
    expect(nextTurnButton()).not.toBeDisabled();
    fireEvent.click(screen.getByTestId('undo-button'));
    expect(screen.getByTestId('resolve-prompt')).toBeInTheDocument();
    expect(screen.getByTestId('turn-counters')).toHaveTextContent('1/7');
  });

  it('draws the cost, then picks 3 in the arc in tap order and places them on the bottom, each step one undo', () => {
    const id = saved().table.resolving.id;
    const before = handIds().length;
    const cost = drawFromFirstCostly();
    expect(handIds()).toHaveLength(before + cost);
    expect(screen.queryByTestId('resolve-candidates')).toBeNull();
    expect(screen.getByTestId('resolve-prompt')).toHaveAttribute('data-step', 'bottom');
    expect(screen.queryByTestId('resolve-prompt-cancel')).toBeNull();
    expect(screen.getByTestId('resolve-prompt-done')).toHaveTextContent('Place on bottom');
    expect(screen.getByTestId('resolve-prompt-count')).toHaveTextContent('0 of 3');
    // The arc opened, with no "→ top"/"→ bottom" row.
    expect(screen.getByTestId('hand-arc')).toBeInTheDocument();
    const [x, y, z, w] = handIds().slice(-4).reverse();
    fireEvent.click(arcCard(x));
    fireEvent.click(arcCard(y));
    fireEvent.click(arcCard(z));
    expect(pickNumberOf(x)).toHaveTextContent('1');
    expect(pickNumberOf(y)).toHaveTextContent('2');
    expect(pickNumberOf(z)).toHaveTextContent('3');
    expect(pickNumberOf(x)!.className).toMatch(/left-0\.5 top-0\.5/);
    expect(screen.queryByTestId('hand-controls')).toBeNull();
    // A fourth tap adds nothing; a tap on #2 removes it, and the rest renumber.
    fireEvent.click(arcCard(w));
    expect(pickNumberOf(w)).toBeNull();
    fireEvent.click(arcCard(y));
    expect(pickNumberOf(y)).toBeNull();
    expect(pickNumberOf(z)).toHaveTextContent('2');
    expect(screen.getByTestId('resolve-prompt-done')).toBeDisabled();
    fireEvent.click(arcCard(y));
    expect(pickNumberOf(y)).toHaveTextContent('3');
    expect(screen.getByTestId('resolve-prompt-count')).toHaveTextContent('3 of 3');
    // The picks are not the hand's selection.
    expect(within(screen.getByTestId('hand-arc')).queryAllByRole('button', { name: /^Deselect/ })).toHaveLength(0);
    fireEvent.click(screen.getByTestId('resolve-prompt-done'));
    // In tap order: the last pick at the very bottom.
    expect(saved().table.drawDeck.slice(-3).map((c: any) => c.id)).toEqual([x, z, y]);
    expect(saved().table.resolving).toBeNull();
    expect(saved().table.discard.map((c: any) => c.id)).toEqual([id]);
    expect(screen.queryByTestId('resolve-prompt')).toBeNull();
    expect(nextTurnButton()).not.toBeDisabled();
    // One undo for the bottom step, one for the draw.
    fireEvent.click(screen.getByTestId('undo-button'));
    expect(saved().table.resolving.id).toBe(id);
    expect(screen.getByTestId('resolve-prompt')).toHaveAttribute('data-step', 'bottom');
    expect(screen.getByTestId('resolve-prompt-count')).toHaveTextContent('0 of 3');
    fireEvent.click(screen.getByTestId('undo-button'));
    expect(handIds()).toHaveLength(before);
    expect(screen.getByTestId('resolve-prompt')).toHaveAttribute('data-step', 'draw');
    expect(screen.getByTestId('resolve-prompt-count')).toHaveTextContent('0 of 1');
  });

  it('collapses to the small card on Escape and keeps the picks, and closing the arc keeps them too', () => {
    const [a] = candidates();
    fireEvent.click(a);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('resolve-prompt')).toBeNull();
    expect(screen.queryByTestId('resolve-candidates')).toBeNull();
    expect(saved().table.resolving).not.toBeNull();
    expect(nextTurnButton()).toBeDisabled();
    fireEvent.click(screen.getByTestId('resolving-mini').querySelector('button')!);
    expect(screen.getByTestId('resolve-prompt-count')).toHaveTextContent('1 of 1');
    expect(candidates()[0]).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByTestId('resolve-prompt-done'));
    const [x, y] = handIds().slice(-2);
    fireEvent.click(arcCard(x));
    fireEvent.click(arcCard(y));
    // The first Escape closes the arc, the picks kept; the second collapses the prompt.
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('hand-arc')?.style.visibility ?? 'hidden').toBe('hidden');
    expect(screen.getByTestId('resolve-prompt-count')).toHaveTextContent('2 of 3');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('resolve-prompt')).toBeNull();
    fireEvent.click(screen.getByTestId('resolving-mini').querySelector('button')!);
    expect(screen.getByTestId('resolve-prompt-count')).toHaveTextContent('2 of 3');
    fireEvent.click(screen.getByRole('button', { name: /^hand, \d+ cards, tap to open$/ }));
    expect(pickNumberOf(x)).toHaveTextContent('1');
    expect(pickNumberOf(y)).toHaveTextContent('2');
  });
});
