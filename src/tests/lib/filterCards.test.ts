import { filterCards } from '../../lib/filterCards';

// Minimal card fixture helpers
const makeCard = (name: string, type: string, extra: Record<string, string> = {}): Record<string, any> => ({
  name,
  type,
  affiliation: '',
  skills: '',
  keywords: '',
  gametext: '',
  lore: '',
  species: '',
  cost: '',
  span: '',
  points: '',
  integrity: '',
  cunning: '',
  strength: '',
  reportsto: '',
  ...extra,
});

const COLUMNS = ['name', 'type'];

// Card data is normalized to lowercase by useDataFetching (matches real app behaviour)
const CARDS = [
  makeCard('ezri dax', 'personnel'),
  makeCard('benjamin sisko', 'personnel'),
  makeCard('badlands', 'mission'),
  makeCard('dilemma card', 'dilemma'),
];

describe('filterCards free-text with field filters', () => {
  it('filters by free text when combined with exclusion field filters', () => {
    // Reproduces the bug: typing "Ezri" after clicking + for draw pile
    // produces the query "-type:mission -type:dilemma Ezri"
    const result = filterCards(CARDS, COLUMNS, '-type:mission -type:dilemma Ezri');
    expect(result.map(c => c.name)).toEqual(['ezri dax']);
  });

  it('applies exclusion filters alongside free text', () => {
    const result = filterCards(CARDS, COLUMNS, '-type:mission -type:dilemma Benjamin');
    expect(result.map(c => c.name)).toEqual(['benjamin sisko']);
  });

  it('returns empty when free text matches nothing after exclusion', () => {
    const result = filterCards(CARDS, COLUMNS, '-type:mission Picard');
    expect(result).toHaveLength(0);
  });

  it('returns all non-excluded cards when free text is absent', () => {
    const result = filterCards(CARDS, COLUMNS, '-type:mission -type:dilemma');
    expect(result.map(c => c.name)).toEqual(['ezri dax', 'benjamin sisko']);
  });
});
