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

describe('useFilterData — reportsto filter', () => {
  const bajorPersonnel = makeCard({ name: 'Kira Nerys', affiliation: 'bajoran', icons: '', keywords: '' });
  const ds9Personnel = makeCard({ name: 'Benjamin Sisko', affiliation: 'bajoran', icons: '[cmd][ds9]', keywords: '' });
  const fedPersonnel = makeCard({ name: 'Robin Lefler', affiliation: 'federation', icons: '[cmd][tng]', keywords: '' });
  const nonAligned = makeCard({ name: 'Guinan', affiliation: 'non-aligned', icons: '', keywords: '' });
  const equipment = makeCard({ name: 'Phaser', type: 'equipment', affiliation: '', icons: '', keywords: '' });
  const borgPersonnel = makeCard({ name: 'Locutus', affiliation: 'borg', icons: '[cmd]', keywords: '' });
  const klingonPersonnel = makeCard({ name: 'Worf', affiliation: 'klingon', icons: '[cmd]', keywords: '' });
  const maquis = makeCard({ name: 'Chakotay', affiliation: 'federation', icons: '[cmd][maq]', keywords: '' });

  const allCards = [bajorPersonnel, ds9Personnel, fedPersonnel, nonAligned, equipment, borgPersonnel, klingonPersonnel, maquis];

  it('reportsto:"bajor gift of the prophets" returns bajoran personnel, NA, and equipment', () => {
    const result = getFiltered(allCards, 'reportsto:"bajor gift of the prophets"');
    const names = result.map(c => c.name);
    expect(names).toContain('Kira Nerys');
    expect(names).toContain('Benjamin Sisko');
    expect(names).toContain('Guinan');
    expect(names).toContain('Phaser');
    expect(names).not.toContain('Robin Lefler');
    expect(names).not.toContain('Locutus');
    expect(names).not.toContain('Worf');
  });

  it('reportsto:"mouth of the wormhole deep space 9" returns cards with [ds9] icon, NA, and equipment', () => {
    const result = getFiltered(allCards, 'reportsto:"mouth of the wormhole deep space 9"');
    const names = result.map(c => c.name);
    expect(names).toContain('Benjamin Sisko');
    expect(names).toContain('Guinan');
    expect(names).toContain('Phaser');
    expect(names).not.toContain('Kira Nerys'); // no [ds9] icon
    expect(names).not.toContain('Robin Lefler'); // [tng] not [ds9]
  });

  it('reportsto:"unicomplex root of the hive mind" returns borg and equipment but NOT non-aligned', () => {
    const result = getFiltered(allCards, 'reportsto:"unicomplex root of the hive mind"');
    const names = result.map(c => c.name);
    expect(names).toContain('Locutus');
    expect(names).toContain('Phaser');
    expect(names).not.toContain('Guinan');
  });

  it('reportsto:"athos iv maquis base" returns cards with [maq] icon', () => {
    const result = getFiltered(allCards, 'reportsto:"athos iv maquis base"');
    const names = result.map(c => c.name);
    expect(names).toContain('Chakotay');
    expect(names).not.toContain('Robin Lefler');
  });

  it('rt: abbreviation works the same as reportsto:', () => {
    const full = getFiltered(allCards, 'reportsto:"bajor gift of the prophets"');
    const abbrev = getFiltered(allCards, 'rt:"bajor gift of the prophets"');
    expect(abbrev.map(c => c.name)).toEqual(full.map(c => c.name));
  });

  it('unknown HQ name returns no cards', () => {
    const result = getFiltered(allCards, 'reportsto:"unknown planet hq"');
    expect(result).toHaveLength(0);
  });

  it('-reportsto:"bajor gift of the prophets" excludes bajoran, NA, and equipment', () => {
    const result = getFiltered(allCards, '-reportsto:"bajor gift of the prophets"');
    const names = result.map(c => c.name);
    expect(names).not.toContain('Kira Nerys');
    expect(names).not.toContain('Guinan');
    expect(names).not.toContain('Phaser');
    expect(names).toContain('Locutus');
    expect(names).toContain('Worf');
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

describe('useFilterData — reportsto:"bajor terok nor" non-unique personnel', () => {
  const auBajPersonnel = makeCard({ name: 'AU Bajoran', affiliation: 'bajoran', icons: '[au]', unique: 'y', keywords: '' });
  const auCarPersonnel = makeCard({ name: 'AU Cardassian', affiliation: 'cardassian', icons: '[au]', unique: 'y', keywords: '' });
  const nonUniqueCarPersonnel = makeCard({ name: 'Non-Unique Cardassian', affiliation: 'cardassian', icons: '', unique: 'n', keywords: '' });
  const uniqueCarPersonnel = makeCard({ name: 'Unique Cardassian', affiliation: 'cardassian', icons: '', unique: 'y', keywords: '' });
  const nonUniqueKliPersonnel = makeCard({ name: 'Non-Unique Klingon', affiliation: 'klingon', icons: '', unique: 'n', keywords: '' });
  const uniqueKliPersonnel = makeCard({ name: 'Unique Klingon', affiliation: 'klingon', icons: '', unique: 'y', keywords: '' });
  const nonUniqueKliAU = makeCard({ name: 'Non-Unique Klingon AU', affiliation: 'klingon', icons: '[au]', unique: 'n', keywords: '' });
  const equipment = makeCard({ name: 'Equipment', type: 'equipment', affiliation: '', icons: '', unique: 'n', keywords: '' });

  const allCards = [auBajPersonnel, auCarPersonnel, nonUniqueCarPersonnel, uniqueCarPersonnel, nonUniqueKliPersonnel, uniqueKliPersonnel, nonUniqueKliAU, equipment];

  it('includes [AU] Bajoran personnel', () => {
    const result = getFiltered(allCards, 'reportsto:"bajor terok nor"');
    expect(result.map(c => c.name)).toContain('AU Bajoran');
  });

  it('includes [AU] Cardassian personnel', () => {
    const result = getFiltered(allCards, 'reportsto:"bajor terok nor"');
    expect(result.map(c => c.name)).toContain('AU Cardassian');
  });

  it('includes non-unique Cardassian personnel without [AU] icon', () => {
    const result = getFiltered(allCards, 'reportsto:"bajor terok nor"');
    expect(result.map(c => c.name)).toContain('Non-Unique Cardassian');
  });

  it('excludes unique Cardassian personnel without [AU] icon', () => {
    const result = getFiltered(allCards, 'reportsto:"bajor terok nor"');
    expect(result.map(c => c.name)).not.toContain('Unique Cardassian');
  });

  it('includes non-unique Klingon personnel without [AU] icon', () => {
    const result = getFiltered(allCards, 'reportsto:"bajor terok nor"');
    expect(result.map(c => c.name)).toContain('Non-Unique Klingon');
  });

  it('excludes unique Klingon personnel without [AU] icon', () => {
    const result = getFiltered(allCards, 'reportsto:"bajor terok nor"');
    expect(result.map(c => c.name)).not.toContain('Unique Klingon');
  });

  it('includes non-unique Klingon personnel who also have [AU] icon', () => {
    const result = getFiltered(allCards, 'reportsto:"bajor terok nor"');
    expect(result.map(c => c.name)).toContain('Non-Unique Klingon AU');
  });

  it('includes equipment', () => {
    const result = getFiltered(allCards, 'reportsto:"bajor terok nor"');
    expect(result.map(c => c.name)).toContain('Equipment');
  });
});

describe('useFilterData — reportsto filter with apostrophes in HQ names', () => {
  const starfleetPersonnel = makeCard({ name: 'Archer', affiliation: 'starfleet', icons: '', keywords: '' });
  const foundersPersonnel = makeCard({ name: 'Odo', affiliation: 'dominion', icons: '', keywords: '' });
  const klingonPersonnel = makeCard({ name: 'Martok', affiliation: 'klingon', icons: '', keywords: '' });
  const nonAligned = makeCard({ name: 'Guinan', affiliation: 'non-aligned', icons: '', keywords: '' });
  const equipment = makeCard({ name: 'Phaser', type: 'equipment', affiliation: '', icons: '', keywords: '' });

  const allCards = [starfleetPersonnel, foundersPersonnel, klingonPersonnel, nonAligned, equipment];

  it('reportsto:"earth humanity\'s home" returns starfleet, NA, and equipment', () => {
    const result = getFiltered(allCards, 'reportsto:"earth humanity\'s home"');
    const names = result.map(c => c.name);
    expect(names).toContain('Archer');
    expect(names).toContain('Guinan');
    expect(names).toContain('Phaser');
    expect(names).not.toContain('Martok');
    expect(names).not.toContain('Odo');
  });

  it('reportsto:"founders\' homeworld contingent refuge" returns dominion and equipment but not NA', () => {
    const result = getFiltered(allCards, 'reportsto:"founders\' homeworld contingent refuge"');
    const names = result.map(c => c.name);
    expect(names).toContain('Odo');
    expect(names).toContain('Phaser');
    expect(names).not.toContain('Guinan');
    expect(names).not.toContain('Martok');
  });

  it('reportsto:"founders\' homeworld home of the great link" returns dominion, NA, and equipment', () => {
    const result = getFiltered(allCards, 'reportsto:"founders\' homeworld home of the great link"');
    const names = result.map(c => c.name);
    expect(names).toContain('Odo');
    expect(names).toContain('Guinan');
    expect(names).toContain('Phaser');
    expect(names).not.toContain('Martok');
  });

  it('reportsto:"qo\'nos heart of the empire" returns klingon, NA, and equipment', () => {
    const result = getFiltered(allCards, 'reportsto:"qo\'nos heart of the empire"');
    const names = result.map(c => c.name);
    expect(names).toContain('Martok');
    expect(names).toContain('Guinan');
    expect(names).toContain('Phaser');
    expect(names).not.toContain('Archer');
    expect(names).not.toContain('Odo');
  });
});

describe('useFilterData — reportsto sort order', () => {
  const tngPersonnel = makeCard({ name: 'TNG Personnel', type: 'personnel', affiliation: 'federation', icons: '[tng]', keywords: '' });
  const naPersonnel = makeCard({ name: 'NA Personnel', type: 'personnel', affiliation: 'non-aligned', icons: '', keywords: '' });
  const tngShip = makeCard({ name: 'TNG Ship', type: 'ship', affiliation: 'federation', icons: '[tng]', keywords: '' });
  const naShip = makeCard({ name: 'NA Ship', type: 'ship', affiliation: 'non-aligned', icons: '', keywords: '' });
  const equipment = makeCard({ name: 'Equipment', type: 'equipment', affiliation: '', icons: '', keywords: '' });

  // All match 'earth cradle of the federation': [tng] or [e] icon, or NA, or equipment
  const allCards = [equipment, naShip, tngShip, naPersonnel, tngPersonnel];

  it('sorts reportsto results: non-NA personnel first, then NA personnel, then non-NA ships, then NA ships, then equipment', () => {
    const result = getFiltered(allCards, 'reportsto:"earth cradle of the federation"');
    const names = result.map(c => c.name);
    const tngPersonnelIdx = names.indexOf('TNG Personnel');
    const naPersonnelIdx = names.indexOf('NA Personnel');
    const tngShipIdx = names.indexOf('TNG Ship');
    const naShipIdx = names.indexOf('NA Ship');
    const equipmentIdx = names.indexOf('Equipment');
    expect(tngPersonnelIdx).toBeLessThan(naPersonnelIdx);
    expect(naPersonnelIdx).toBeLessThan(tngShipIdx);
    expect(tngShipIdx).toBeLessThan(naShipIdx);
    expect(naShipIdx).toBeLessThan(equipmentIdx);
  });

  it('preserves relative order within each group', () => {
    const tngPersonnel2 = makeCard({ name: 'TNG Personnel 2', type: 'personnel', affiliation: 'federation', icons: '[tng]', keywords: '' });
    const cards = [tngPersonnel2, equipment, tngPersonnel];
    const result = getFiltered(cards, 'reportsto:"earth cradle of the federation"');
    const names = result.map(c => c.name);
    // Both TNG personnel should appear before equipment
    expect(names.indexOf('TNG Personnel 2')).toBeLessThan(names.indexOf('Equipment'));
    expect(names.indexOf('TNG Personnel')).toBeLessThan(names.indexOf('Equipment'));
    // Relative order within group preserved
    expect(names.indexOf('TNG Personnel 2')).toBeLessThan(names.indexOf('TNG Personnel'));
  });

  it('does not apply reportsto sort when no reportsto filter is present', () => {
    // Input order should be preserved (no sort applied)
    const cards = [equipment, naShip, tngPersonnel];
    const result = getFiltered(cards, 'type:personnel');
    // Only tngPersonnel matches, so just verify no error
    expect(result.map(c => c.name)).toContain('TNG Personnel');
    expect(result.map(c => c.name)).not.toContain('Equipment');
  });
});
