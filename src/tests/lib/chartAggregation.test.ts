import { unionAlignValues, unionSortedLabels } from '../../lib/chartAggregation';

describe('unionSortedLabels', () => {
  it('returns the primary labels sorted when there is no comparison', () => {
    const labels = unionSortedLabels({ b: 1, a: 2 }, undefined, (x, y) => x.localeCompare(y));
    expect(labels).toEqual(['a', 'b']);
  });

  it('unions labels from both series, sorted', () => {
    const labels = unionSortedLabels({ a: 1, c: 2 }, { b: 3, c: 4 }, (x, y) => x.localeCompare(y));
    expect(labels).toEqual(['a', 'b', 'c']);
  });

  it('does not duplicate labels present in both series', () => {
    const labels = unionSortedLabels({ a: 1 }, { a: 2 }, (x, y) => x.localeCompare(y));
    expect(labels).toEqual(['a']);
  });
});

describe('unionAlignValues', () => {
  it('returns only primary values when there is no comparison', () => {
    const { values, compareValues } = unionAlignValues({ a: 1, b: 2 }, undefined, ['a', 'b']);
    expect(values).toEqual([1, 2]);
    expect(compareValues).toBeUndefined();
  });

  it('zero-fills labels missing from the primary series', () => {
    const { values } = unionAlignValues({ a: 1 }, { b: 2 }, ['a', 'b']);
    expect(values).toEqual([1, 0]);
  });

  it('zero-fills labels missing from the comparison series', () => {
    const { compareValues } = unionAlignValues({ a: 1, b: 2 }, { a: 3 }, ['a', 'b']);
    expect(compareValues).toEqual([3, 0]);
  });

  it('keeps both value arrays index-aligned with the shared label list', () => {
    const { values, compareValues } = unionAlignValues(
      { a: 1, c: 3 },
      { b: 2, c: 4 },
      ['a', 'b', 'c']
    );
    expect(values).toEqual([1, 0, 3]);
    expect(compareValues).toEqual([0, 2, 4]);
  });
});
