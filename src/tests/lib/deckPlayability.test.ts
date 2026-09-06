import { deckPlayabilityMatches } from '../../lib/deckPlayability';

const makeCard = (name: string, extra: Record<string, string> = {}): Record<string, any> => ({
  name,
  type: 'personnel',
  icons: '',
  ...extra,
});

const makeShip = (icons: string): Record<string, any> => ({
  name: 'a ship',
  type: 'ship',
  icons,
});

describe('deckPlayabilityMatches', () => {
  it('matches a [Rom]-gated personnel when a [Rom] ship is in the deck', () => {
    const card = makeCard("telek r'mor astrophysical researcher");
    expect(deckPlayabilityMatches(card, [makeShip('[rom]')])).toBe(true);
  });

  it('does not match a [Rom]-gated personnel without a qualifying ship in the deck', () => {
    const card = makeCard("telek r'mor astrophysical researcher");
    expect(deckPlayabilityMatches(card, [makeShip('[tos]')])).toBe(false);
    expect(deckPlayabilityMatches(card, [])).toBe(false);
  });

  it('matches a [TOS]-gated personnel when a [TOS] ship is in the deck', () => {
    const card = makeCard('spock experienced officer');
    expect(deckPlayabilityMatches(card, [makeShip('[tos]')])).toBe(true);
  });

  it('matches a *VP variant of a [TOS]-gated personnel via the shared base name', () => {
    const card = makeCard('benjamin sisko command staffer *vp');
    expect(deckPlayabilityMatches(card, [makeShip('[tos]')])).toBe(true);
  });

  it('matches a [Car]-gated personnel when a [Car] ship is in the deck', () => {
    const card = makeCard('kira nerys ambitious ally');
    expect(deckPlayabilityMatches(card, [makeShip('[car]')])).toBe(true);
  });

  it('matches a [DS9]-gated personnel when a [DS9] ship is in the deck', () => {
    const card = makeCard('worf mentoring "klingons"');
    expect(deckPlayabilityMatches(card, [makeShip('[ds9]')])).toBe(true);
  });

  it('matches a [Dom]-gated personnel when a [Dom] ship is in the deck', () => {
    const card = makeCard('matthew dougherty "partner" in crime');
    expect(deckPlayabilityMatches(card, [makeShip('[dom]')])).toBe(true);
  });

  it('matches an [E]-gated personnel when an [E] ship is in the deck', () => {
    const card = makeCard('quark frontline observer');
    expect(deckPlayabilityMatches(card, [makeShip('[e]')])).toBe(true);
  });

  it('matches an [SF]-gated personnel when an [SF] ship is in the deck', () => {
    const card = makeCard('sim sacrificial lamb');
    expect(deckPlayabilityMatches(card, [makeShip('[sf]')])).toBe(true);
  });

  it('matches a [Sta]-gated personnel when a [Sta] ship is in the deck', () => {
    const card = makeCard('daniels timeless guardian');
    expect(deckPlayabilityMatches(card, [makeShip('[sta]')])).toBe(true);
  });

  it('matches a non-[Bor][Voy]-gated personnel when a non-Borg/Voyager ship is in the deck', () => {
    const card = makeCard("telek r'mor anachronistic visitor");
    expect(deckPlayabilityMatches(card, [makeShip('[rom]')])).toBe(true);
  });

  it('does not match a non-[Bor][Voy]-gated personnel when only [Bor] or [Voy] ships are in the deck', () => {
    const card = makeCard("telek r'mor anachronistic visitor");
    expect(deckPlayabilityMatches(card, [makeShip('[bor]')])).toBe(false);
    expect(deckPlayabilityMatches(card, [makeShip('[voy]')])).toBe(false);
  });

  it('does not match a card with no gametext-based deck playability entry', () => {
    const card = makeCard('worf');
    expect(deckPlayabilityMatches(card, [makeShip('[tos]')])).toBe(false);
  });
});
