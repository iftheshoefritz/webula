import { costModelOf } from '../../lib/costModels/registry';
import { CostFacts } from '../../lib/costModels/model';
import { moveCharge } from '../../lib/playCost';
import { partnerTraitsOf } from '../../lib/dilemmaBot/simulator';

// Batch 5 of the cost models (#1698): "you may play this card at cost +N / −N to …", and the plays
// from the discard pile. Invented facts only.

const facts = (overrides: Partial<CostFacts> = {}): CostFacts => ({ commanded: [], core: [], hand: [], ...overrides });
const fullFacts = facts({
  commanded: [partnerTraitsOf({ name: 'invented officer', species: 'Human', affiliation: 'federation' })],
  core: ['Invented Event'],
  hand: [{ id: 'h1', title: 'Invented Gadget', type: 'equipment' }],
});

// title, type, printed cost, delta, label
const MAY: [string, string, number, number, string][] = [
  ['Christopher Pike Bold Commander', 'personnel', 2, 1, 'Draw two cards: +1'],
  ['George Stocker Starbase Commodore', 'personnel', 2, 2, 'Download a [TOS] ship: +2'],
  ['U.S.S. Constitution', 'ship', 3, 3, 'Draw four cards: +3'],
  ['U.S.S. Enterprise Beautiful Lady', 'ship', 3, 4, 'Score 5 points: +4'],
  ['Josephs', 'personnel', 1, 5, 'Discard from decks: +5'],
  ['Hikaru Sulu Experienced Helmsman', 'personnel', 4, -2, 'Ignore his next ability: −2'],
  ['Ilia Finest Navigator in Starfleet', 'personnel', 4, -2, 'Ignore her next ability: −2'],
  ['U.S.S. Enterprise Where She Belongs', 'ship', 7, -4, 'Ignore its next ability: −4'],
  ['Spock Experienced Officer', 'personnel', 1, -1, 'Ignore his next ability: −1'],
  ['Pavel A. Chekov Experienced Adept', 'personnel', 1, -2, 'Ignore his next ability: −2'],
];

const ALL_MAY_TITLES = [
  'Christopher Pike Bold Commander', 'Number One Reputable Officer', 'Ronald Tracey Delusional Captain',
  'Nilz Baris Agricultural Undersecretary', 'George Stocker Starbase Commodore', 'Matt Decker Vengeful Commodore',
  'Pavel A. Chekov Young Navigator', 'Leonard H. McCoy Chief Medical Officer', 'Evans', 'James T. Kirk Dubious Duplicate',
  'Laurence T. Stone Portmaster', 'Sarek Vulcan Delegate', 'U.S.S. Constitution', 'Helen Noel Enterprise Psychiatrist',
  'Giotto Security Chief', 'Areel Shaw', 'Hikaru Sulu Senior Helmsman', 'James T. Kirk Highly-Decorated Captain',
  "Janice Rand Captain's Yeoman", 'Josephs', 'Montgomery Scott Chief Engineer', 'Spock Science Officer',
  'Uhura Skilled Technician', 'U.S.S. Constellation Dead Hulk', 'U.S.S. Enterprise Beautiful Lady',
  'Starship Defiant Ripe for the Taking', 'Spock Flirting with Danger', 'Christine Chapel Clandestine Vessel',
  'Karl Jaeger', 'Nagata', 'Mark Piper', 'Benjamin Finney Bitter Records Officer', "U.S.S. Exeter Fleet's Finest",
  'Jeffrey Pierce On The Edge', 'Hikaru Sulu Experienced Helmsman', 'Ilia Finest Navigator in Starfleet',
  'Montgomery Scott Experienced Engineer', 'Willard Decker Recommended Replacement', 'Uhura Experienced Technician',
  'U.S.S. Enterprise Where She Belongs', 'James T. Kirk Experienced Commander', 'Spock Experienced Officer',
  'Pavel A. Chekov Experienced Adept',
];

const placeOf = (type: string) => (type === 'ship' ? 'shipRow' : 'awayTeam');

describe('the "may" models at a changed cost (#1698)', () => {
  it.each(ALL_MAY_TITLES)('%s has an ownCost model that offers a choice, also through *VP', (title) => {
    expect(costModelOf(title)?.family).toBe('ownCost');
    expect(costModelOf(`${title} *VP`)?.title).toBe(title);
    const charge = moveCharge('playAndDraw', 'hand', 'awayTeam', { name: title, type: 'personnel', cost: '3' }, facts());
    expect(charge).toMatchObject({ kind: 'play', cost: 3, source: { title } });
    expect(charge?.kind === 'play' && charge.source?.choice?.label).toMatch(/: [+−]\d$/);
  });

  it.each(MAY)('%s charges its printed cost and offers %s', (title, type, printed, delta, label) => {
    const card = { name: title.toLowerCase(), originalName: title, type, cost: String(printed) };
    const expected = {
      kind: 'play',
      cost: printed,
      source: { title, reason: expect.stringContaining('you may play it at cost'), choice: { label, cost: Math.max(0, printed + delta) } },
    };
    expect(moveCharge('playAndDraw', 'hand', placeOf(type), card, facts())).toEqual(expected);
    expect(moveCharge('playAndDraw', 'hand', placeOf(type), card, fullFacts)).toEqual(expected);
    expect(moveCharge('orders', 'hand', placeOf(type), card, facts())).toBeNull();
    expect(moveCharge('playAndDraw', 'discard', placeOf(type), card, facts())).toBeNull();
  });
});

describe('the plays from the discard pile (#1698)', () => {
  const daniels = { name: 'daniels timeline protector', originalName: 'Daniels Timeline Protector', type: 'personnel', cost: '2' };
  const errol = { name: 'errol', originalName: 'Errol', type: 'personnel', cost: '2' };

  it('charges Daniels +2 and Errol +1 from the discard pile, with a source and no choice', () => {
    expect(costModelOf('Daniels Timeline Protector')?.family).toBe('ownCost');
    expect(moveCharge('playAndDraw', 'discard', 'awayTeam', daniels, facts())).toEqual({
      kind: 'play',
      cost: 4,
      source: { title: 'Daniels Timeline Protector', reason: 'played from your discard pile' },
    });
    expect(moveCharge('playAndDraw', 'discard', 'crew', errol, facts())).toEqual({
      kind: 'play',
      cost: 3,
      source: { title: 'Errol', reason: 'played from your discard pile' },
    });
  });

  it('charges them their printed cost from the hand, and nothing elsewhere', () => {
    expect(moveCharge('playAndDraw', 'hand', 'awayTeam', daniels, facts())).toEqual({ kind: 'play', cost: 2 });
    expect(moveCharge('playAndDraw', 'hand', 'crew', errol, facts())).toEqual({ kind: 'play', cost: 2 });
    expect(moveCharge('orders', 'discard', 'awayTeam', daniels, facts())).toBeNull();
    expect(moveCharge('playAndDraw', 'discard', 'hand', daniels, facts())).toBeNull();
    expect(moveCharge('playAndDraw', 'discard', 'brig', errol, facts())).toBeNull();
    expect(moveCharge('playAndDraw', 'drawDeck', 'awayTeam', errol, facts())).toBeNull();
  });

  it('leaves a card with no discard model out of the discard pile no play, pending discount or not', () => {
    const data = { name: 'invented officer', type: 'personnel', cost: '3' };
    const pending = [{ title: 'Invented', label: 'next personnel', amount: 2, origin: { entry: 0 }, applies: () => true }];
    expect(moveCharge('playAndDraw', 'discard', 'awayTeam', data, facts({ pending }))).toBeNull();
    const nanoprobes = { name: 'borg nanoprobes', originalName: 'Borg Nanoprobes', type: 'equipment', cost: '5' };
    const borg = partnerTraitsOf({ name: 'invented drone', species: 'Borg', affiliation: 'borg' });
    expect(moveCharge('playAndDraw', 'discard', 'crew', nanoprobes, facts({ commanded: [borg] }))).toBeNull();
  });
});
