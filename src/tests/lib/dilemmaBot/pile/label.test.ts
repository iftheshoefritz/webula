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
});
