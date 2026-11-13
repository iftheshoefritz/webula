import { CARD_MISSING_URL, cardImageUrl, isPlaytestCard, setPlaytestImageVersions } from '../../lib/cardImageUrl';

// Invented sets and cards only (#1614, #1644).
const publicCard = { imagefile: 'ab001', backimagefile: '', set: 'premiere', collectorsinfo: '1r1' };
const publicMission = { imagefile: 'ab010', backimagefile: 'ab010b', set: 'premiere', collectorsinfo: '1u10' };
const playtestCard = { imagefile: 'PT-Gizmo', backimagefile: '', set: 'testseta', collectorsinfo: 'pt-9001' };
const playtestMission = { imagefile: 'PT-Front', backimagefile: 'PT-Back', set: 'testseta', collectorsinfo: 'pt-9002' };
const otherSetCard = { imagefile: 'PT-Other', backimagefile: '', set: 'testsetb', collectorsinfo: 'pt-9101' };
// A playtest row of a game saved before #1644, whose `set` was always `playtest`.
const legacyRow = { imagefile: 'PT-Gizmo', backimagefile: '', set: 'playtest', collectorsinfo: 'pt-9001' };

const versions = (entries: [string, number][]) => new Map(entries);

afterEach(() => setPlaytestImageVersions(new Map()));

describe('cardImageUrl (#1614, #1644)', () => {
  it('gives a public card its static image', () => {
    expect(cardImageUrl(publicCard)).toBe('/cardimages/ab001.jpg');
    expect(cardImageUrl(publicCard, 'front', versions([['premiere', 7]]))).toBe('/cardimages/ab001.jpg');
  });

  it("gives a playtest card the gated route of its set with its set's version", () => {
    const v = versions([['testseta', 3], ['testsetb', 8]]);
    expect(cardImageUrl(playtestCard, 'front', v)).toBe('/api/playtest/images/testseta/PT-Gizmo.jpg?v=3');
    expect(cardImageUrl(otherSetCard, 'front', v)).toBe('/api/playtest/images/testsetb/PT-Other.jpg?v=8');
  });

  it('gives the back of a double-sided mission, public and playtest', () => {
    const v = versions([['testseta', 4]]);
    expect(cardImageUrl(publicMission, 'back')).toBe('/cardimages/ab010b.jpg');
    expect(cardImageUrl(playtestMission, 'back', v)).toBe('/api/playtest/images/testseta/PT-Back.jpg?v=4');
    expect(cardImageUrl(playtestMission, 'front', v)).toBe('/api/playtest/images/testseta/PT-Front.jpg?v=4');
  });

  it('never gives a playtest card a URL with no version: no set loaded, a set not in testing, a legacy row', () => {
    expect(cardImageUrl(playtestCard)).toBe(CARD_MISSING_URL);
    expect(cardImageUrl(otherSetCard, 'front', versions([['testseta', 3]]))).toBe(CARD_MISSING_URL);
    expect(cardImageUrl(legacyRow, 'front', versions([['testseta', 3]]))).toBe(CARD_MISSING_URL);
  });

  it('reads the current versions by default', () => {
    setPlaytestImageVersions(versions([['testseta', 9]]));
    expect(cardImageUrl(playtestCard)).toBe('/api/playtest/images/testseta/PT-Gizmo.jpg?v=9');
  });
});

describe('isPlaytestCard', () => {
  it('is true for a PT- row of any set, and false otherwise', () => {
    expect(isPlaytestCard(playtestCard)).toBe(true);
    expect(isPlaytestCard(otherSetCard)).toBe(true);
    expect(isPlaytestCard(legacyRow)).toBe(true);
    expect(isPlaytestCard(publicCard)).toBe(false);
    expect(isPlaytestCard({ set: 'playtest' })).toBe(false);
    expect(isPlaytestCard(null)).toBe(false);
  });
});
