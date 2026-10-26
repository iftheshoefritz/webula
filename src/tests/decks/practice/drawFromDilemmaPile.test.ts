// Issue #1298: the pure draw of the bot, `drawFromDilemmaPile`, with the top-card rule of #1283.
import { CardInstance, drawFromDilemmaPile } from '../../../app/decks/practice/tableReducer';

const dilemma = (id: string, face: 'up' | 'down' = 'down'): CardInstance => ({
  id,
  card: { name: `Dilemma ${id}`, type: 'dilemma' },
  face,
});

const ids = (cards: CardInstance[]) => cards.map((c) => c.id);

describe('drawFromDilemmaPile (#1298)', () => {
  afterEach(() => jest.restoreAllMocks());

  // With Math.random at 0, shuffleArray moves the top card to the bottom: [a, b, c] becomes [b, c, a].

  it('shuffles a pile with a face-up top card before the draw, and the pile comes back face down', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const pile = [dilemma('d1', 'up'), dilemma('d2'), dilemma('d3', 'up')];

    const result = drawFromDilemmaPile(pile, 1);

    expect(ids(result.drawn)).toEqual(['d2']);
    expect(ids(result.pile)).toEqual(['d3', 'd1']);
    expect(result.pile.every((c) => c.face === 'down')).toBe(true);
  });

  it('shuffles at the draw that reaches a face-up top card, partway through', () => {
    const random = jest.spyOn(Math, 'random').mockReturnValue(0);
    const pile = [dilemma('d1'), dilemma('d2', 'up'), dilemma('d3'), dilemma('d4')];

    const result = drawFromDilemmaPile(pile, 3);

    // d1 draws with no shuffle; d2 is then on top, face up, so [d2, d3, d4] shuffles to [d3, d4, d2].
    expect(ids(result.drawn)).toEqual(['d1', 'd3', 'd4']);
    expect(ids(result.pile)).toEqual(['d2']);
    expect(result.pile[0].face).toBe('down');
    expect(random).toHaveBeenCalledTimes(2);
  });

  it('does not shuffle a pile whose face-up cards are never on top', () => {
    const random = jest.spyOn(Math, 'random');
    const pile = [dilemma('d1'), dilemma('d2'), dilemma('d3', 'up')];

    const result = drawFromDilemmaPile(pile, 2);

    expect(random).not.toHaveBeenCalled();
    expect(result.drawn).toEqual([pile[0], pile[1]]);
    expect(result.pile).toEqual([pile[2]]);
  });

  it('gives what a short pile holds', () => {
    const pile = [dilemma('d1'), dilemma('d2')];

    const result = drawFromDilemmaPile(pile, 9);

    expect(ids(result.drawn)).toEqual(['d1', 'd2']);
    expect(result.pile).toEqual([]);
  });

  it('gives nothing for a count of 0, or from an empty pile', () => {
    const pile = [dilemma('d1', 'up'), dilemma('d2')];

    expect(drawFromDilemmaPile(pile, 0)).toEqual({ drawn: [], pile });
    expect(drawFromDilemmaPile([], 3)).toEqual({ drawn: [], pile: [] });
  });
});
