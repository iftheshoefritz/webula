import { renderHook, act } from '@testing-library/react';
import useFilterData from '../../hooks/useFilterData';

// Mock @vercel/analytics
jest.mock('@vercel/analytics', () => ({ track: jest.fn() }));

const makeCard = (overrides = {}) => ({
  collectorsinfo: '1R001',
  dilemmatype: '',
  imagefile: 'card',
  name: 'Test Card',
  type: 'personnel',
  affiliation: 'federation',
  skills: '',
  gametext: '',
  cost: '2',
  integrity: '6',
  cunning: '6',
  strength: '6',
  ...overrides,
});

const columns = ['name', 'type', 'affiliation', 'skills', 'gametext', 'cost', 'integrity', 'cunning', 'strength'];

function getFiltered(data, searchQuery) {
  const { result } = renderHook(() =>
    useFilterData(false, data, columns, searchQuery)
  );
  return result.current;
}

describe('useFilterData — affiliation filter', () => {
  const federationPersonnel = makeCard({ name: 'Robin Lefler', affiliation: 'federation' });
  const bajorPersonnel = makeCard({ name: 'Kira Nerys', affiliation: 'bajoran' });
  const fedMission = makeCard({ name: 'Establish Relations', type: 'mission', affiliation: '[fed]' });
  const bajFedMission = makeCard({ name: 'Rescue Captives', type: 'mission', affiliation: '[baj][fed][kli]' });
  const fedHQMission = makeCard({ name: 'Earth', type: 'mission', affiliation: 'federation headquarters' });
  const bajMission = makeCard({ name: 'Bajor', type: 'mission', affiliation: '[baj]' });
  const romMission = makeCard({ name: 'Romulus', type: 'mission', affiliation: '[rom]' });

  const allCards = [federationPersonnel, bajorPersonnel, fedMission, bajFedMission, fedHQMission, bajMission, romMission];

  it('returns federation personnel for affiliation:federation (existing behaviour)', () => {
    const result = getFiltered(allCards, 'affiliation:federation');
    expect(result.map(c => c.name)).toContain('Robin Lefler');
  });

  it('returns planet/space missions with [fed] affiliation for affiliation:federation', () => {
    const result = getFiltered(allCards, 'affiliation:federation');
    expect(result.map(c => c.name)).toContain('Establish Relations');
  });

  it('returns missions with mixed affiliations like [baj][fed] for affiliation:federation', () => {
    const result = getFiltered(allCards, 'affiliation:federation');
    expect(result.map(c => c.name)).toContain('Rescue Captives');
  });

  it('returns HQ missions for affiliation:federation', () => {
    const result = getFiltered(allCards, 'affiliation:federation');
    expect(result.map(c => c.name)).toContain('Earth');
  });

  it('returns bajoran missions with [baj] affiliation for affiliation:bajoran', () => {
    const result = getFiltered(allCards, 'affiliation:bajoran');
    expect(result.map(c => c.name)).toContain('Bajor');
    expect(result.map(c => c.name)).toContain('Rescue Captives');
    expect(result.map(c => c.name)).toContain('Kira Nerys');
  });

  it('does not return non-matching cards for affiliation:federation', () => {
    const result = getFiltered(allCards, 'affiliation:federation');
    expect(result.map(c => c.name)).not.toContain('Kira Nerys');
    expect(result.map(c => c.name)).not.toContain('Bajor');
    expect(result.map(c => c.name)).not.toContain('Romulus');
  });

  it('exclude filter -a:federation removes federation personnel and [fed] missions', () => {
    const result = getFiltered(allCards, '-a:federation');
    const names = result.map(c => c.name);
    expect(names).not.toContain('Robin Lefler');
    expect(names).not.toContain('Establish Relations');
    expect(names).not.toContain('Rescue Captives');
    expect(names).not.toContain('Earth');
    expect(names).toContain('Kira Nerys');
    expect(names).toContain('Bajor');
  });
});
