import { getCardCounts, formatCardCountLabel, stripVariantSuffix } from '../../lib/cardCount';

describe('stripVariantSuffix', () => {
  it('removes a trailing *VP suffix', () => {
    expect(stripVariantSuffix('Ezri Dax *VP')).toBe('Ezri Dax');
  });

  it('removes a trailing *A suffix', () => {
    expect(stripVariantSuffix('Ezri Dax *A')).toBe('Ezri Dax');
  });

  it('removes a trailing *AP suffix', () => {
    expect(stripVariantSuffix('Ezri Dax *AP')).toBe('Ezri Dax');
  });

  it('removes a trailing *VAP suffix', () => {
    expect(stripVariantSuffix('Ezri Dax *VAP')).toBe('Ezri Dax');
  });

  it('leaves names without the suffix unchanged', () => {
    expect(stripVariantSuffix('Ezri Dax')).toBe('Ezri Dax');
  });
});

describe('getCardCounts', () => {
  it('returns 0 for both counts when given no cards', () => {
    expect(getCardCounts([])).toEqual({ total: 0, unique: 0 });
  });

  it('counts genuinely different names separately', () => {
    const cards = [{ originalName: 'Ezri Dax' }, { originalName: 'Benjamin Sisko' }];
    expect(getCardCounts(cards)).toEqual({ total: 2, unique: 2 });
  });

  it('collapses *VP variant reprints into a single unique entry while still counting them in total', () => {
    const cards = [
      { originalName: 'Ezri Dax' },
      { originalName: 'Ezri Dax *VP' },
      { originalName: 'Benjamin Sisko' },
    ];
    expect(getCardCounts(cards)).toEqual({ total: 3, unique: 2 });
  });

  it('collapses *A, *AP, and *VAP variant reprints into a single unique entry', () => {
    const cards = [
      { originalName: 'Ezri Dax' },
      { originalName: 'Ezri Dax *A' },
      { originalName: 'Ezri Dax *AP' },
      { originalName: 'Ezri Dax *VAP' },
      { originalName: 'Benjamin Sisko' },
    ];
    expect(getCardCounts(cards)).toEqual({ total: 5, unique: 2 });
  });

  it('collapses all reprint variants of Enterprise-J into a single unique entry', () => {
    const cards = [
      { originalName: 'U.S.S. Enterprise-J' },
      { originalName: 'U.S.S. Enterprise-J *A' },
      { originalName: 'U.S.S. Enterprise-J *VP' },
    ];
    expect(getCardCounts(cards)).toEqual({ total: 3, unique: 1 });
  });
});

describe('formatCardCountLabel', () => {
  it('uses singular wording when both counts are 1', () => {
    expect(formatCardCountLabel({ total: 1, unique: 1 })).toBe('1 card, 1 version');
  });

  it('uses plural wording for versions when unique is 1 but total is more', () => {
    expect(formatCardCountLabel({ total: 3, unique: 1 })).toBe('1 card, 3 versions');
  });

  it('uses plural wording for both counts', () => {
    expect(formatCardCountLabel({ total: 42, unique: 38 })).toBe('38 cards, 42 versions');
  });

  it('handles the zero-result case', () => {
    expect(formatCardCountLabel({ total: 0, unique: 0 })).toBe('0 cards, 0 versions');
  });
});
