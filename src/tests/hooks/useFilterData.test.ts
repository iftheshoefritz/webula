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

describe('useFilterData — exclusion filter using full column name', () => {
  const cmdPersonnel = makeCard({ name: 'Picard', icons: 'cmd', type: 'personnel' });
  const noIconPersonnel = makeCard({ name: 'Ensign Ro', icons: '', type: 'personnel' });
  const dualDilemma = makeCard({ name: 'Antedean Assassins', type: 'dilemma', dilemmatype: 'd' });
  const spaceDilemma = makeCard({ name: 'Spatial Rift', type: 'dilemma', dilemmatype: 's' });

  it('-icons:Cmd excludes personnel with command icons', () => {
    const result = getFiltered([cmdPersonnel, noIconPersonnel], '-icons:Cmd');
    const names = result.map(c => c.name);
    expect(names).not.toContain('Picard');
    expect(names).toContain('Ensign Ro');
  });

  it('-dilemmatype:d type:Dilemma excludes dual dilemmas', () => {
    const result = getFiltered([dualDilemma, spaceDilemma], '-dilemmatype:d type:Dilemma');
    const names = result.map(c => c.name);
    expect(names).not.toContain('Antedean Assassins');
    expect(names).toContain('Spatial Rift');
  });
});

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

describe('useFilterData — affiliation exclusion clause filter', () => {
  const borgMission = makeCard({ name: 'Borg Mission', type: 'mission', affiliation: '[bor]' });
  const anyExceptBorgMission = makeCard({
    name: 'Hromi Cluster',
    type: 'mission',
    affiliation: 'any affiliation (except [bor]) may attempt this mission.',
  });
  const fedMission = makeCard({ name: 'Establish Relations', type: 'mission', affiliation: '[fed]' });

  const allCards = [borgMission, anyExceptBorgMission, fedMission];

  it('does not return missions where borg appears only in an exclusion clause for affiliation:borg', () => {
    const result = getFiltered(allCards, 'affiliation:borg');
    const names = result.map(c => c.name);
    expect(names).toContain('Borg Mission');
    expect(names).not.toContain('Hromi Cluster');
  });

  it('does not exclude missions where borg appears only in an exclusion clause for -affiliation:borg', () => {
    const result = getFiltered(allCards, '-a:borg');
    const names = result.map(c => c.name);
    expect(names).not.toContain('Borg Mission');
    expect(names).toContain('Hromi Cluster');
    expect(names).toContain('Establish Relations');
  });
});

describe('useFilterData — open "any affiliation" missions', () => {
  const borgMission = makeCard({ name: 'Borg Mission', type: 'mission', affiliation: '[bor]' });
  const fedMission = makeCard({ name: 'Establish Relations', type: 'mission', affiliation: '[fed]' });
  const anyExceptBorgMission = makeCard({
    name: 'Hromi Cluster',
    type: 'mission',
    affiliation: 'any affiliation (except [bor]) may attempt this mission.',
  });
  const anyOpenMission = makeCard({
    name: 'Open Mission',
    type: 'mission',
    affiliation: 'any affiliation may attempt this mission.',
  });

  const allCards = [borgMission, fedMission, anyExceptBorgMission, anyOpenMission];

  it('returns "any affiliation (except borg)" mission when filtering for federation', () => {
    const result = getFiltered(allCards, 'affiliation:federation');
    const names = result.map(c => c.name);
    expect(names).toContain('Hromi Cluster');
  });

  it('returns "any affiliation (except borg)" mission when filtering for bajoran', () => {
    const result = getFiltered(allCards, 'affiliation:bajoran');
    const names = result.map(c => c.name);
    expect(names).toContain('Hromi Cluster');
  });

  it('does not return "any affiliation (except borg)" mission when filtering for borg', () => {
    const result = getFiltered(allCards, 'affiliation:borg');
    const names = result.map(c => c.name);
    expect(names).not.toContain('Hromi Cluster');
  });

  it('returns fully open "any affiliation" mission for any affiliation filter', () => {
    const result1 = getFiltered(allCards, 'affiliation:federation');
    expect(result1.map(c => c.name)).toContain('Open Mission');

    const result2 = getFiltered(allCards, 'affiliation:borg');
    expect(result2.map(c => c.name)).toContain('Open Mission');

    const result3 = getFiltered(allCards, 'affiliation:klingon');
    expect(result3.map(c => c.name)).toContain('Open Mission');
  });

  it('does not return regular affiliation missions that do not match', () => {
    const result = getFiltered(allCards, 'affiliation:federation');
    const names = result.map(c => c.name);
    expect(names).not.toContain('Borg Mission');
  });
});

describe('useFilterData — affiliation match sorting order', () => {
  const fedPersonnel = makeCard({ name: 'Robin Lefler', affiliation: 'federation' });
  const fedMission = makeCard({ name: 'Establish Relations', type: 'mission', affiliation: '[fed]' });
  const bajFedMission = makeCard({ name: 'Rescue Captives', type: 'mission', affiliation: '[baj][fed][kli]' });
  const anyOpenMission = makeCard({
    name: 'Open Mission',
    type: 'mission',
    affiliation: 'any affiliation may attempt this mission.',
  });
  const anyExceptBorgMission = makeCard({
    name: 'Hromi Cluster',
    type: 'mission',
    affiliation: 'any affiliation (except [bor]) may attempt this mission.',
  });

  it('places exact affiliation matches before "any affiliation" missions', () => {
    const allCards = [anyOpenMission, fedMission, anyExceptBorgMission, fedPersonnel];
    const result = getFiltered(allCards, 'affiliation:federation');
    const names = result.map(c => c.name);
    const openIdx = names.indexOf('Open Mission');
    const hromiIdx = names.indexOf('Hromi Cluster');
    const fedMissionIdx = names.indexOf('Establish Relations');
    const fedPersonnelIdx = names.indexOf('Robin Lefler');
    expect(fedMissionIdx).toBeLessThan(openIdx);
    expect(fedPersonnelIdx).toBeLessThan(openIdx);
    expect(fedMissionIdx).toBeLessThan(hromiIdx);
    expect(fedPersonnelIdx).toBeLessThan(hromiIdx);
  });

  it('preserves relative order within exact-match group', () => {
    const allCards = [anyOpenMission, fedMission, bajFedMission, fedPersonnel];
    const result = getFiltered(allCards, 'affiliation:federation');
    const names = result.map(c => c.name);
    expect(names.indexOf('Establish Relations')).toBeLessThan(names.indexOf('Rescue Captives'));
    expect(names.indexOf('Rescue Captives')).toBeLessThan(names.indexOf('Robin Lefler'));
  });

  it('preserves relative order within "any affiliation" group', () => {
    const allCards = [anyOpenMission, fedMission, anyExceptBorgMission];
    const result = getFiltered(allCards, 'affiliation:federation');
    const names = result.map(c => c.name);
    expect(names.indexOf('Open Mission')).toBeLessThan(names.indexOf('Hromi Cluster'));
  });

  it('does not sort when there is no affiliation filter', () => {
    const allCards = [anyOpenMission, fedMission];
    const result = getFiltered(allCards, 'type:mission');
    // Both cards should still appear, just not reordered by affiliation logic
    expect(result.map(c => c.name)).toContain('Open Mission');
    expect(result.map(c => c.name)).toContain('Establish Relations');
  });
});
