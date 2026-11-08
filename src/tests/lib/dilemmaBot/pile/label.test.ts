// Issue #1519: the label of the bot's choice on the dilemma the player faces.
import { OPPONENT_DILEMMAS } from '../../../../lib/dilemmaBot/opponentPile';
import { pileLabelOf } from '../../../../lib/dilemmaBot/pile/label';
import { playPileStack } from '../../../../lib/dilemmaBot/pile/play';
import { modelOf } from '../../../../lib/dilemmaBot/pile/registry';
import { seededRandom } from '../../../../lib/dilemmaBot/simulator';
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
    expect(pileLabelOf({ originalName: '"Well-Prepared Defenses"' }, attempt())).toBe("Bot's missions: more points; Chose Alpha");
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

// Issue #1574: the bot makes the choice of every "your opponent chooses" or "names" dilemma, and the
// label gives that choice, never the title of the dilemma.
describe('the label of the bot\'s choice (#1574)', () => {
  // Alpha alone has Physics, so the bot chooses Alpha first: its loss breaks the mission. Then Beta, the
  // first whose loss, with Alpha's, still breaks it.
  const cards = [
    { card: person('Alpha') },
    { card: person('Beta', { skills: 'Engineer' }) },
    { card: person('Gamma', { skills: 'Security', integrity: 9 }) },
  ];
  const completedSpace: PileCardRow = { ...mission, name: 'mission s', originalName: 'Mission s', missiontype: 's' };
  const headquarters: PileCardRow = { ...mission, name: 'hq', originalName: 'HQ', missiontype: 'h' };
  const label = (title: string, overrides: Partial<PileTableInput> = {}) => pileLabelOf({ originalName: title }, attempt({ cards, ...overrides }));
  // The personnel the play of `title` kills, read from its trace.
  const killed = (title: string, overrides: Partial<PileTableInput> = {}) => {
    const lines: string[] = [];
    playPileStack(attempt({ cards, ...overrides }), [modelOf(title)!], seededRandom(1), (l) => lines.push(l));
    return lines.filter((l) => /^ {2}kills /.test(l)).map((l) => l.replace(/^ {2}kills /, ''));
  };

  it('gives Necessary Execution the two personnel the play kills, or one with a completed space mission', () => {
    expect(label('Necessary Execution')).toBe('Chose Alpha, Beta');
    expect(killed('Necessary Execution')).toEqual(['Alpha, Beta']);
    const missions = [{ mission }, { mission: completedSpace, completed: true }];
    expect(label('Necessary Execution', { missions })).toBe('Chose Alpha');
    expect(killed('Necessary Execution', { missions })).toEqual(['Alpha']);
  });

  it('gives a title of the botChooses family the personnel it chooses', () => {
    // The Needs of the Few: an Engineer or Security personnel; Gamma is the more valuable.
    expect(label('The Needs of the Few')).toBe('Chose Gamma');
  });

  it('gives no label when the bot chooses nobody', () => {
    // Neural Parasites kills one per headquarters, and the player commands none.
    expect(label('Neural Parasites')).toBeNull();
    expect(label('Neural Parasites', { missions: [{ mission }, { mission: headquarters }] })).toBe('Chose Alpha');
  });

  it('keeps "Named <skill>" for The Clown: Guillotine', () => {
    expect(label('The Clown: Guillotine')).toMatch(/^Named [A-Z][a-z]+$/);
  });

  it('gives He Wasn\'t Nice only the title it names', () => {
    expect(label('He Wasn\'t Nice')).toBe('Named Alpha');
  });

  it('gives Secret Identity and Dead Ringer the personnel the bot chooses, with their effect unchanged', () => {
    expect(label('Secret Identity')).toBe('Chose Alpha');
    const identity = playPileStack(attempt({ cards }), [modelOf('Secret Identity')!], seededRandom(1));
    expect(identity).toMatchObject({ stopped: 0, killed: 0 });
    expect(label('Dead Ringer')).toBe('Chose Alpha');
    expect(playPileStack(attempt({ cards }), [modelOf('Dead Ringer')!], seededRandom(1))).toMatchObject({ stopped: 3 });
  });

  // Every title of the registry whose text has the opponent choose personnel, or name a skill, an
  // attribute or a title, with a group where the choice applies.
  const CHOOSES: Array<[string, Partial<PileTableInput>]> = [
    ...[
      'Abrasive Allies', 'Brave Words', 'Bynars\' Password', 'Dead Ringer', 'Inequitable Exchange', 'Lending a Hand',
      'Necessary Execution', 'Mr. Tricorder', 'Secret Identity', 'Spatial Interphase', 'Suspicion',
      'The Caretaker\'s "Guests"', 'The Needs of the Few', 'The Oracle\'s Punishment', 'Well-Prepared Defenses',
    ].map((title): [string, Partial<PileTableInput>] => [title, {}]),
    ['Neural Parasites', { missions: [{ mission }, { mission: headquarters }] }],
  ];
  const NAMES = [
    'Agonizing Encounter', 'Artificial Ability', 'Garak Has Some Issues', 'He Wasn\'t Nice', 'Name and Shame',
    'Overindulgence', 'The Clown: Guillotine', 'The Clown: Bitter Medicine',
  ];

  it.each(CHOOSES)('gives %s a "Chose" label', (title, overrides) => {
    const text = label(title, overrides);
    expect(text).toMatch(/(^|; )Chose /);
    expect(text).not.toContain(title);
  });

  it.each(NAMES)('gives %s a "Named" label and no "Chose"', (title) => {
    const text = label(title, { cards: [...cards, { card: person('Delta', { skills: 'Medical' }) }], missions: [{ mission }, { mission: headquarters }] });
    expect(text).toMatch(/^Named /);
    expect(text).not.toContain('Chose');
    expect(text).not.toContain(title);
  });
});
