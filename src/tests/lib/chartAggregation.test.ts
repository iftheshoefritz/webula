import { unionAlignValues, unionSortedLabels } from '../../lib/chartAggregation';

describe('unionSortedLabels', () => {
  it('returns an empty label list for zero series', () => {
    const labels = unionSortedLabels([], (x, y) => x.localeCompare(y));
    expect(labels).toEqual([]);
  });

  it('returns a single series labels sorted', () => {
    const labels = unionSortedLabels([{ b: 1, a: 2 }], (x, y) => x.localeCompare(y));
    expect(labels).toEqual(['a', 'b']);
  });

  it('unions labels from two series, sorted', () => {
    const labels = unionSortedLabels(
      [{ a: 1, c: 2 }, { b: 3, c: 4 }],
      (x, y) => x.localeCompare(y)
    );
    expect(labels).toEqual(['a', 'b', 'c']);
  });

  it('does not duplicate labels present in both series', () => {
    const labels = unionSortedLabels([{ a: 1 }, { a: 2 }], (x, y) => x.localeCompare(y));
    expect(labels).toEqual(['a']);
  });

  it('unions and de-duplicates labels across five series', () => {
    const labels = unionSortedLabels(
      [
        { a: 1, e: 1 },
        { b: 2 },
        { c: 3, a: 3 },
        { d: 4 },
        { e: 5, b: 5 },
      ],
      (x, y) => x.localeCompare(y)
    );
    expect(labels).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});

describe('unionAlignValues', () => {
  it('returns an empty array of value arrays for zero series', () => {
    const result = unionAlignValues([], ['a', 'b']);
    expect(result).toEqual([]);
  });

  it('returns one values array for a single series, equal to primary-only case', () => {
    const result = unionAlignValues([{ a: 1, b: 2 }], ['a', 'b']);
    expect(result).toEqual([[1, 2]]);
  });

  it('zero-fills labels missing from a series', () => {
    const result = unionAlignValues([{ a: 1 }, { b: 2 }], ['a', 'b']);
    expect(result).toEqual([
      [1, 0],
      [0, 2],
    ]);
  });

  it('keeps both value arrays index-aligned with the shared label list', () => {
    const result = unionAlignValues(
      [{ a: 1, c: 3 }, { b: 2, c: 4 }],
      ['a', 'b', 'c']
    );
    expect(result).toEqual([
      [1, 0, 3],
      [0, 2, 4],
    ]);
  });

  it('index-aligns five series against the shared label list', () => {
    const result = unionAlignValues(
      [
        { a: 1 },
        { b: 2 },
        { c: 3 },
        { d: 4 },
        { e: 5 },
      ],
      ['a', 'b', 'c', 'd', 'e']
    );
    expect(result).toEqual([
      [1, 0, 0, 0, 0],
      [0, 2, 0, 0, 0],
      [0, 0, 3, 0, 0],
      [0, 0, 0, 4, 0],
      [0, 0, 0, 0, 5],
    ]);
  });
});
