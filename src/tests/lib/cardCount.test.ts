import { getCardCounts, formatCardCountLabel, stripVersionSuffix, cardDisplayName, cardTitleDisplay } from '../../lib/cardCount';

describe('stripVersionSuffix', () => {
  it('removes a trailing *VP suffix', () => {
    expect(stripVersionSuffix('Ezri Dax *VP')).toBe('Ezri Dax');
  });

  it('removes a trailing *A suffix', () => {
    expect(stripVersionSuffix('Ezri Dax *A')).toBe('Ezri Dax');
  });

  it('removes a trailing *AP suffix', () => {
    expect(stripVersionSuffix('Ezri Dax *AP')).toBe('Ezri Dax');
  });

  it('removes a trailing *VAP suffix', () => {
    expect(stripVersionSuffix('Ezri Dax *VAP')).toBe('Ezri Dax');
  });

  it('leaves names without the suffix unchanged', () => {
    expect(stripVersionSuffix('Ezri Dax')).toBe('Ezri Dax');
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

  it('collapses *VP versions into a single unique entry while still counting them in total', () => {
    const cards = [
      { originalName: 'Ezri Dax' },
      { originalName: 'Ezri Dax *VP' },
      { originalName: 'Benjamin Sisko' },
    ];
    expect(getCardCounts(cards)).toEqual({ total: 3, unique: 2 });
  });

  it('collapses *A, *AP, and *VAP versions into a single unique entry', () => {
    const cards = [
      { originalName: 'Ezri Dax' },
      { originalName: 'Ezri Dax *A' },
      { originalName: 'Ezri Dax *AP' },
      { originalName: 'Ezri Dax *VAP' },
      { originalName: 'Benjamin Sisko' },
    ];
    expect(getCardCounts(cards)).toEqual({ total: 5, unique: 2 });
  });

  it('collapses all versions of Enterprise-J into a single unique entry', () => {
    const cards = [
      { originalName: 'U.S.S. Enterprise-J' },
      { originalName: 'U.S.S. Enterprise-J *A' },
      { originalName: 'U.S.S. Enterprise-J *VP' },
    ];
    expect(getCardCounts(cards)).toEqual({ total: 3, unique: 1 });
  });
});

describe('getCardCounts by title (#1976)', () => {
  // Invented cards.
  it('counts two subtitles of one title as one title and two cards', () => {
    const cards = [
      { originalName: 'Zorbo Brave Captain', title: 'zorbo', subtitle: 'brave captain' },
      { originalName: 'Zorbo Quiet Scholar', title: 'zorbo', subtitle: 'quiet scholar' },
    ];
    expect(getCardCounts(cards)).toEqual({ total: 2, unique: 1 });
  });

  it('collapses a *VP reprint of a title', () => {
    const cards = [
      { originalName: 'Zorbo Brave Captain', title: 'zorbo' },
      { originalName: 'Zorbo Brave Captain *VP', title: 'zorbo' },
    ];
    expect(getCardCounts(cards)).toEqual({ total: 2, unique: 1 });
  });

  it('counts a title that starts with another as a different title', () => {
    const cards = [
      { originalName: 'Odo', title: 'odo' },
      { originalName: 'Odo Founder', title: 'odo founder' },
    ];
    expect(getCardCounts(cards)).toEqual({ total: 2, unique: 2 });
  });

  it('falls back to the name less its suffix for a row without a title', () => {
    const cards = [
      { originalName: 'Zorbo', title: 'zorbo' },
      { originalName: 'Quux Plinth *VP' },
      { originalName: 'Quux Plinth' },
    ];
    expect(getCardCounts(cards)).toEqual({ total: 3, unique: 2 });
  });
});

describe('cardTitleDisplay', () => {
  it('reads originalTitle', () => {
    expect(cardTitleDisplay({ originalName: 'Zorbo Brave Captain', originalTitle: 'Zorbo' })).toBe('Zorbo');
  });

  it('falls back to the name less its suffix', () => {
    expect(cardTitleDisplay({ originalName: 'Quux Plinth *VP' })).toBe('Quux Plinth');
  });
});

describe('formatCardCountLabel', () => {
  it('reads titles, then cards, singular and plural', () => {
    expect(formatCardCountLabel({ total: 1, unique: 1 })).toBe('1 title, 1 card');
    expect(formatCardCountLabel({ total: 3, unique: 2 })).toBe('2 titles, 3 cards');
    expect(formatCardCountLabel({ total: 0, unique: 0 })).toBe('0 titles, 0 cards');
  });
});

describe('cardDisplayName', () => {
  it('shows the printed name in its original letter case', () => {
    expect(cardDisplayName({ name: 'moab iv avert danger', originalName: 'Moab IV Avert Danger' })).toBe('Moab IV Avert Danger');
  });

  it('removes a version suffix from the printed name', () => {
    expect(cardDisplayName({ name: "t'pol austere commander *ap", originalName: "T'Pol Austere Commander *AP" })).toBe("T'Pol Austere Commander");
  });

  it('falls back to name when the row has no originalName', () => {
    expect(cardDisplayName({ name: 'tricorder' })).toBe('tricorder');
  });
});
