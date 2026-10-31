import { readStartPage, writeStartPage, startPageHref, START_PAGE_KEY } from '../../lib/startPage';

describe('startPage', () => {
  beforeEach(() => localStorage.clear());

  it('reads nothing when nothing is stored', () => {
    expect(readStartPage()).toBeNull();
  });

  it('writes and reads a choice', () => {
    writeStartPage('decks');
    expect(localStorage.getItem(START_PAGE_KEY)).toBe('decks');
    expect(readStartPage()).toBe('decks');
  });

  it('clears the choice with null', () => {
    writeStartPage('practice');
    writeStartPage(null);
    expect(localStorage.getItem(START_PAGE_KEY)).toBeNull();
  });

  it('ignores a stored value that is not a choice', () => {
    localStorage.setItem(START_PAGE_KEY, 'junk');
    expect(readStartPage()).toBeNull();
  });

  it('sends Practice to the deck picker when there is no deck and no saved game', () => {
    expect(startPageHref('practice')).toBe('/decks/practice?openPicker=true');
    localStorage.setItem('currentDeck', '{}');
    expect(startPageHref('practice')).toBe('/decks/practice?openPicker=true');
  });

  it('sends Practice to the table when there is a current deck or a saved game', () => {
    localStorage.setItem('currentDeck', JSON.stringify({ '1R000': { row: {}, count: 1 } }));
    expect(startPageHref('practice')).toBe('/decks/practice');
    localStorage.clear();
    localStorage.setItem('practiceGame', '{}');
    expect(startPageHref('practice')).toBe('/decks/practice');
  });

  it('maps search and decks to their pages', () => {
    expect(startPageHref('search')).toBe('/');
    expect(startPageHref('decks')).toBe('/decks');
  });
});
