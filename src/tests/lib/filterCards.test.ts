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
  icons: '',
  unique: 'y',
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

describe('filterCards reportsto:"grid 296 holographic training facility"', () => {
  const hologramPersonnel = makeCard('the doctor', 'personnel', { species: 'hologram', keywords: '' });
  const nonHologramPersonnel = makeCard('worf', 'personnel', { species: 'klingon', keywords: '' });
  const naShip = makeCard('na shuttle', 'ship', { affiliation: 'non-aligned', species: '' });
  const fedShip = makeCard('fed ship', 'ship', { affiliation: 'federation', species: '' });
  const equipment = makeCard('phaser', 'equipment', { species: '' });

  const GRID296_CARDS = [hologramPersonnel, nonHologramPersonnel, naShip, fedShip, equipment];

  it('returns hologram personnel when filtering by grid 296', () => {
    const result = filterCards(GRID296_CARDS, COLUMNS, 'reportsto:"grid 296 holographic training facility"');
    expect(result.map(c => c.name)).toContain('the doctor');
  });

  it('excludes non-hologram personnel when filtering by grid 296', () => {
    const result = filterCards(GRID296_CARDS, COLUMNS, 'reportsto:"grid 296 holographic training facility"');
    expect(result.map(c => c.name)).not.toContain('worf');
  });

  it('returns [NA] ships when filtering by grid 296', () => {
    const result = filterCards(GRID296_CARDS, COLUMNS, 'reportsto:"grid 296 holographic training facility"');
    expect(result.map(c => c.name)).toContain('na shuttle');
  });

  it('excludes non-NA ships when filtering by grid 296', () => {
    const result = filterCards(GRID296_CARDS, COLUMNS, 'reportsto:"grid 296 holographic training facility"');
    expect(result.map(c => c.name)).not.toContain('fed ship');
  });

  it('returns equipment when filtering by grid 296', () => {
    const result = filterCards(GRID296_CARDS, COLUMNS, 'reportsto:"grid 296 holographic training facility"');
    expect(result.map(c => c.name)).toContain('phaser');
  });
});

describe('filterCards reportsto per-card HQ-location override', () => {
  // Odo, Bajoran Representative's own gametext grants play at any "Mouth of
  // the Wormhole" HQ, but his own affiliation/icons ([TN]) only satisfy the
  // existing predicate for the Terok Nor variant, not the DS9 variant.
  const odoBajoranRep = makeCard('odo bajoran representative', 'personnel', {
    affiliation: 'bajoran', icons: '[cmd][tn]',
  });
  // Kira Nerys has no own-icon coverage for either Bajor or Cardassia Prime.
  const kiraNerys = makeCard('kira nerys starfleet emissary', 'personnel', {
    affiliation: 'federation', icons: '[cmd][ds9]',
  });
  const kiraNerysVP = makeCard('kira nerys starfleet emissary *vp', 'personnel', {
    affiliation: 'federation', icons: '[cmd][ds9]',
  });
  const unrelatedPersonnel = makeCard('worf', 'personnel', { affiliation: 'klingon', icons: '' });

  const CARDS = [odoBajoranRep, kiraNerys, kiraNerysVP, unrelatedPersonnel];

  it('includes a card via its own granted location even without icon coverage', () => {
    const result = filterCards(CARDS, COLUMNS, 'reportsto:"mouth of the wormhole deep space 9"');
    expect(result.map(c => c.name)).toContain('odo bajoran representative');
  });

  it('still includes a card at HQs already covered by its icons', () => {
    const result = filterCards(CARDS, COLUMNS, 'reportsto:"mouth of the wormhole terok nor"');
    expect(result.map(c => c.name)).toContain('odo bajoran representative');
  });

  it('matches every HQ name starting with a granted location', () => {
    const bajorResult = filterCards(CARDS, COLUMNS, 'reportsto:"bajor terok nor"');
    expect(bajorResult.map(c => c.name)).toContain('kira nerys starfleet emissary');

    const cardassiaResult = filterCards(CARDS, COLUMNS, 'reportsto:"cardassia prime bastion of resistance"');
    expect(cardassiaResult.map(c => c.name)).toContain('kira nerys starfleet emissary');
  });

  it('applies the override to *VP variants sharing the same base card name', () => {
    const result = filterCards(CARDS, COLUMNS, 'reportsto:"bajor terok nor"');
    expect(result.map(c => c.name)).toContain('kira nerys starfleet emissary *vp');
  });

  it('excludes cards with no granted location and no icon coverage', () => {
    const result = filterCards(CARDS, COLUMNS, 'reportsto:"bajor terok nor"');
    expect(result.map(c => c.name)).not.toContain('worf');
  });

  it('excludes the card when negated even though its own gametext grants access', () => {
    const result = filterCards(CARDS, COLUMNS, '-reportsto:"mouth of the wormhole deep space 9"');
    expect(result.map(c => c.name)).not.toContain('odo bajoran representative');
  });
});

describe('filterCards quadrant filter', () => {
  const alphaMission = makeCard('bajor', 'mission', { quadrant: 'a' });
  const deltaMission = makeCard('borg space', 'mission', { quadrant: 'd' });
  const gammaMission = makeCard('dominion world', 'mission', { quadrant: 'g' });

  const QUADRANT_CARDS = [alphaMission, deltaMission, gammaMission];
  const QUADRANT_COLUMNS = ['name', 'type', 'quadrant'];

  it('filters by alpha quadrant using single-letter code', () => {
    const result = filterCards(QUADRANT_CARDS, QUADRANT_COLUMNS, 'quadrant:a');
    expect(result.map(c => c.name)).toEqual(['bajor']);
  });

  it('filters by delta quadrant using single-letter code', () => {
    const result = filterCards(QUADRANT_CARDS, QUADRANT_COLUMNS, 'quadrant:d');
    expect(result.map(c => c.name)).toEqual(['borg space']);
  });

  it('does not match full quadrant name against single-letter code', () => {
    // Prior to the fix, "alpha" would not match "a" in the card data
    const result = filterCards(QUADRANT_CARDS, QUADRANT_COLUMNS, 'quadrant:alpha');
    expect(result).toHaveLength(0);
  });
});

describe('filterCards skills exact match', () => {
  const exobiologyPersonnel = makeCard('exo person', 'personnel', { skills: 'exobiology intelligence' });
  const biologyPersonnel = makeCard('bio person', 'personnel', { skills: 'biology leadership' });
  const leveledBiologyPersonnel = makeCard('leveled bio person', 'personnel', { skills: 'leadership 2 biology' });

  const SKILLS_CARDS = [exobiologyPersonnel, biologyPersonnel, leveledBiologyPersonnel];

  it('excludes cards whose only relevant skill is exobiology when searching biology', () => {
    const result = filterCards(SKILLS_CARDS, COLUMNS, 'skills:biology');
    expect(result.map(c => c.name)).not.toContain('exo person');
  });

  it('includes cards with an exact biology skill', () => {
    const result = filterCards(SKILLS_CARDS, COLUMNS, 'skills:biology');
    expect(result.map(c => c.name)).toEqual(expect.arrayContaining(['bio person', 'leveled bio person']));
  });

  it('excludes the biology card and keeps exobiology when negated', () => {
    const result = filterCards(SKILLS_CARDS, COLUMNS, '-skills:biology');
    expect(result.map(c => c.name)).toEqual(['exo person']);
  });
});

describe('filterCards skills exact match against mission skill requirements', () => {
  // Mission skills cells are boolean expressions with adjacent punctuation,
  // e.g. "Transporters, Treachery, Cunning>34, and (Intelligence and Leadership or Law and Officer)"
  const requirementMission = makeCard('mission with requirements', 'mission', {
    skills: 'transporters, treachery, cunning>34, and (intelligence and leadership or law and officer)',
  });
  const otherMission = makeCard('unrelated mission', 'mission', { skills: 'diplomacy, and (security or honor)' });

  const REQUIREMENT_CARDS = [requirementMission, otherMission];

  it('matches a skill token immediately followed by a comma', () => {
    const result = filterCards(REQUIREMENT_CARDS, COLUMNS, 'skills:transporters');
    expect(result.map(c => c.name)).toEqual(['mission with requirements']);
  });

  it('matches a skill token immediately followed by an attribute comparison and comma', () => {
    const result = filterCards(REQUIREMENT_CARDS, COLUMNS, 'skills:cunning');
    expect(result.map(c => c.name)).toEqual(['mission with requirements']);
  });

  it('matches a skill token immediately preceded by an open parenthesis', () => {
    const result = filterCards(REQUIREMENT_CARDS, COLUMNS, 'skills:intelligence');
    expect(result.map(c => c.name)).toEqual(['mission with requirements']);
  });

  it('matches a skill token immediately followed by a closing parenthesis', () => {
    const result = filterCards(REQUIREMENT_CARDS, COLUMNS, 'skills:officer');
    expect(result.map(c => c.name)).toEqual(['mission with requirements']);
  });

  it('does not match a skill that is not present', () => {
    const result = filterCards(REQUIREMENT_CARDS, COLUMNS, 'skills:biology');
    expect(result).toHaveLength(0);
  });
});
