import { getCardCounts, formatCardCountLabel, stripVariantSuffix } from '../../lib/cardCount';

describe('stripVariantSuffix', () => {
  it('removes a trailing *VP suffix', () => {
    expect(stripVariantSuffix('Ezri Dax *VP')).toBe('Ezri Dax');
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
});

describe('formatCardCountLabel', () => {
  it('uses singular wording for a single card', () => {
    expect(formatCardCountLabel({ total: 1, unique: 1 })).toBe('1 unique · 1 card');
  });

  it('uses plural wording for multiple cards', () => {
    expect(formatCardCountLabel({ total: 42, unique: 38 })).toBe('38 unique · 42 cards');
  });

  it('handles the zero-result case', () => {
    expect(formatCardCountLabel({ total: 0, unique: 0 })).toBe('0 unique · 0 cards');
  });
});
