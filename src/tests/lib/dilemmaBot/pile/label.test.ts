// Issue #1519: the label of the bot's choice on the dilemma the player faces.
import { OPPONENT_DILEMMAS } from '../../../../lib/dilemmaBot/opponentPile';
import { pileLabelOf } from '../../../../lib/dilemmaBot/pile/label';
import { PileCardRow, PileTableInput, pileAttemptOf } from '../../../../lib/dilemmaBot/pile/tableAttempt';

const person = (name: string, extra: Record<string, unknown> = {}) => ({
  type: 'personnel',
  name: name.toLowerCase(),
  originalName: name,
  skills: 'Physics',
  integrity: 5,
  cunning: 5,
  strength: 5,
  cost: 2,
  ...extra,
});
const mission: PileCardRow = {
  type: 'mission',
  name: 'mission p',
  originalName: 'Mission p',
  missiontype: 'p',
  skills: 'Physics',
  points: 35,
  span: 3,
};

const input = (overrides: Partial<PileTableInput> = {}): PileTableInput => ({
  cards: [{ card: person('Alpha') }, { card: person('Beta') }],
  mission,
  placedOn: [],
  underMission: [],
  missions: [{ mission }],
  hand: [],
  discard: [],
  turn: 3,
  ...overrides,
});

const attempt = (overrides: Partial<PileTableInput> = {}) => pileAttemptOf(input(overrides)).attempt;

describe('pileLabelOf (#1519)', () => {
  it('gives the label of a title whose play makes one', () => {
    expect(pileLabelOf({ originalName: '"Well-Prepared Defenses"' }, attempt())).toBe("Bot's missions: more points");
  });

  it('gives no label for any title of the Chula pile', () => {
    for (const d of OPPONENT_DILEMMAS) expect(pileLabelOf({ originalName: d.title }, attempt())).toBeNull();
  });

  it('gives no label for a title the registry lacks, or a row with no name', () => {
    expect(pileLabelOf({ originalName: 'Not A Dilemma Anyone Printed' }, attempt())).toBeNull();
    expect(pileLabelOf(null, attempt())).toBeNull();
  });

  it('reads only the personnel the player has not stopped', () => {
    // Stopped, Alpha leaves Beta the one with Physics, so naming Cunning breaks the mission.
    const cards = (alphaStopped: boolean) => [
      { card: person('Alpha', { integrity: 9 }), stopped: alphaStopped },
      { card: person('Beta', { cunning: 9 }) },
    ];
    expect(pileLabelOf({ originalName: 'Artificial Ability' }, attempt({ cards: cards(true) }))).toBe('Named Cunning');
    expect(pileLabelOf({ originalName: 'Artificial Ability' }, attempt({ cards: cards(false) }))).toBe('Named Integrity');
  });

  it('gives Show Trial its label only once the player has a point (#1541)', () => {
    const cards = [{ card: person('Leader', { skills: 'Leadership' }) }, { card: person('Beta') }, { card: person('Gamma') }];
    expect(pileLabelOf({ originalName: 'Show Trial' }, attempt({ cards, score: 5 }))).toBe('You have more points');
    expect(pileLabelOf({ originalName: 'Show Trial' }, attempt({ cards, score: 0 }))).toBeNull();
    expect(pileLabelOf({ originalName: 'Show Trial' }, attempt({ cards }))).toBeNull();
  });

  // Issue #1552: Vault of Tomorrow names the dilemma it takes from the bot's pile.
  it('gives Vault of Tomorrow the dilemma of cost 2 or less it takes from the bot\'s pile (#1552)', () => {
    const dilemmaPile = [{ originalName: 'Hard Time' }, { originalName: 'Unconventional Consideration' }, { originalName: 'Covert Extraction' }];
    expect(attempt({ dilemmaPile }).botPile).toEqual(['Hard Time', 'Unconventional Consideration', 'Covert Extraction']);
    expect(pileLabelOf({ originalName: 'Vault of Tomorrow' }, attempt({ dilemmaPile }))).toBe('Added Unconventional Consideration');
  });

  it('gives Vault of Tomorrow no label when the bot\'s pile holds nothing it can take (#1552)', () => {
    // Hard Time costs 3, and Covert Extraction is a space dilemma.
    const dilemmaPile = [{ originalName: 'Hard Time' }, { originalName: 'Covert Extraction' }];
    expect(pileLabelOf({ originalName: 'Vault of Tomorrow' }, attempt({ dilemmaPile }))).toBeNull();
    expect(pileLabelOf({ originalName: 'Vault of Tomorrow' }, attempt({ dilemmaPile: [] }))).toBeNull();
    expect(pileLabelOf({ originalName: 'Vault of Tomorrow' }, attempt())).toBeNull();
  });
});
