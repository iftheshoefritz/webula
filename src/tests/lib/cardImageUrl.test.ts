import { CARD_MISSING_URL, cardImageUrl, isPlaytestCard, setPlaytestImageVersion } from '../../lib/cardImageUrl';

// Invented cards only (#1614).
const publicCard = { imagefile: 'ab001', backimagefile: '', set: 'premiere' };
const publicMission = { imagefile: 'ab010', backimagefile: 'ab010b', set: 'premiere' };
const playtestCard = { imagefile: 'PT-Gizmo', backimagefile: '', set: 'playtest' };
const playtestMission = { imagefile: 'PT-Front', backimagefile: 'PT-Back', set: 'playtest' };

afterEach(() => setPlaytestImageVersion(null));

describe('cardImageUrl (#1614)', () => {
  it('gives a public card its static image', () => {
    expect(cardImageUrl(publicCard)).toBe('/cardimages/ab001.jpg');
    expect(cardImageUrl(publicCard, 'front', 7)).toBe('/cardimages/ab001.jpg');
  });

  it('gives a playtest card the gated route with the version', () => {
    expect(cardImageUrl(playtestCard, 'front', 3)).toBe('/api/playtest/images/PT-Gizmo.jpg?v=3');
  });

  it('gives the back of a double-sided mission, public and playtest', () => {
    expect(cardImageUrl(publicMission, 'back')).toBe('/cardimages/ab010b.jpg');
    expect(cardImageUrl(playtestMission, 'back', 4)).toBe('/api/playtest/images/PT-Back.jpg?v=4');
    expect(cardImageUrl(playtestMission, 'front', 4)).toBe('/api/playtest/images/PT-Front.jpg?v=4');
  });

  it('never gives a playtest card a URL with no version', () => {
    expect(cardImageUrl(playtestCard)).toBe(CARD_MISSING_URL);
    expect(cardImageUrl(playtestCard, 'front', null)).toBe(CARD_MISSING_URL);
  });

  it('reads the current version by default', () => {
    setPlaytestImageVersion(9);
    expect(cardImageUrl(playtestCard)).toBe('/api/playtest/images/PT-Gizmo.jpg?v=9');
  });
});

describe('isPlaytestCard', () => {
  it('is true only for a row whose set is playtest', () => {
    expect(isPlaytestCard(playtestCard)).toBe(true);
    expect(isPlaytestCard(publicCard)).toBe(false);
    expect(isPlaytestCard(null)).toBe(false);
  });
});
