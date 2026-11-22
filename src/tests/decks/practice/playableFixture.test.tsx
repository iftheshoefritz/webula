// `?fixture=playable` (#1856): the play-place highlight of a drag from the hand, on the page, in play and
// draw only. The drag is driven through `onDragStart`, as `coreBrigDrop.test.tsx` does.
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

let mockOnDragStart: ((event: { active: { id: string } }) => void) | null = null;
let mockOnDragCancel: (() => void) | null = null;
jest.mock('@dnd-kit/core', () => {
  const actual = jest.requireActual('@dnd-kit/core');
  return {
    ...actual,
    DndContext: ({ children, onDragStart, onDragCancel }: any) => {
      mockOnDragStart = onDragStart;
      mockOnDragCancel = onDragCancel;
      return children;
    },
    DragOverlay: ({ children }: any) => <div data-testid="drag-overlay">{children}</div>,
    useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, isDragging: false }),
    useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
  };
});

import React from 'react';
import { render, act, fireEvent, screen } from '@testing-library/react';
import PracticeDrawPage from '../../../app/decks/practice/PracticeTable';

const highlightOf = (zone: string) => document.querySelector(`[data-zone="${zone}"]`)?.getAttribute('data-highlight') ?? null;

describe('?fixture=playable (#1856)', () => {
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      })),
    });
  });

  const deal = async () => {
    mockSearchParamsValue = new URLSearchParams('fixture=playable&reset=1&menu=0');
    await act(async () => {
      render(<PracticeDrawPage />);
    });
    const saved = JSON.parse(localStorage.getItem('practiceGame:fixture=playable')!);
    const nameOf = (c: { key: string }) => saved.dealtDeck[c.key].row.originalName as string;
    const inHand = (name: string) => (saved.table.hand as { id: string; key: string }[]).find((c) => nameOf(c) === name)!.id;
    return { saved, nameOf, inHand };
  };
  const drag = (id: string) =>
    act(() => {
      mockOnDragStart!({ active: { id } });
    });
  const cancel = () =>
    act(() => {
      mockOnDragCancel!();
    });

  it('deals Earth on the crewed ship\'s slot, a [Rom] ship on slot 3, and the four cards at the end of the hand', async () => {
    const { saved, nameOf } = await deal();
    expect(nameOf(saved.table.missions[2].mission)).toBe('Earth Cradle of the Federation');
    expect(saved.table.missions[2].ships.map(nameOf)).toEqual(['U.S.S. Relativity Federation Timeship (BP)']);
    expect(saved.table.missions[2].ships[0].crew.map(nameOf)).toContain('Robert Tomlinson');
    expect(saved.table.missions[3].ships.map(nameOf)).toEqual(['Haakona']);
    expect(saved.table.hand.slice(-4).map(nameOf)).toEqual([
      "Deanna Troi Ship's Counselor",
      'Tomek Displaced Alien',
      'U.S.S. Reliant Searching for Lifeless Planets',
      'Shuttlepod One Reliable Transport',
    ]);
  });

  it('highlights the play places of a hand card in play and draw, and the highlight of before in orders', async () => {
    const { saved, inHand } = await deal();
    const relativity = saved.table.missions[2].ships[0].id;
    const haakona = saved.table.missions[3].ships[0].id;

    drag(inHand("Deanna Troi Ship's Counselor"));
    expect(highlightOf('mission-on-2')).toBe('eligible');
    expect(highlightOf(`crew-${relativity}`)).toBe('eligible');
    expect(highlightOf('mission-on-0')).toBe('dimmed');
    expect(highlightOf(`crew-${haakona}`)).toBe('dimmed');
    expect(highlightOf('core')).toBe('valid');
    cancel();

    drag(inHand('Tomek Displaced Alien'));
    expect(highlightOf(`crew-${haakona}`)).toBe('eligible');
    expect(highlightOf(`crew-${relativity}`)).toBe('dimmed');
    cancel();

    drag(inHand('U.S.S. Reliant Searching for Lifeless Planets'));
    expect(highlightOf('ship-row-2')).toBe('eligible');
    expect(highlightOf('mission-on-2')).toBe('eligible');
    expect(highlightOf('mission-on-1')).toBe('dimmed');
    cancel();

    // Shuttlepod One has no Enterprise to play with: the highlight of before.
    drag(inHand('Shuttlepod One Reliable Transport'));
    expect(highlightOf('mission-on-0')).toBe('valid');
    expect(highlightOf('ship-row-2')).toBe('valid');
    cancel();

    // A ship already on the table is no hand card.
    drag(relativity);
    expect(highlightOf('mission-on-0')).toBe('valid');
    cancel();

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Go to orders' }));
    });
    drag(inHand("Deanna Troi Ship's Counselor"));
    expect(highlightOf('mission-on-2')).toBe('valid');
    expect(highlightOf('mission-on-0')).toBe('valid');
  });
});
