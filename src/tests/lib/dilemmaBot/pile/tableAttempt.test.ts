// Issue #1508: the practice table's bot attempt builds a `PileAttempt` from card rows, and maps the
// pile bot's stack of titles back to the drawn cards.
import { PileCardRow, PileTableInput, drawnPileTitles, pileAttemptOf, pileStackCardIds } from '../../../../lib/dilemmaBot/pile/tableAttempt';
import { BOT_SKILLS, parseRequirementBranches } from '../../../../lib/dilemmaBot/requirements';

const person = (name: string, extra: Record<string, unknown> = {}) => ({
  type: 'personnel',
  name: name.toLowerCase(),
  originalName: name,
  skills: 'Physics, Science',
  integrity: 5,
  cunning: 5,
  strength: 5,
  cost: 2,
  ...extra,
});
const mission = (missiontype: string, extra: Partial<PileCardRow> = {}): PileCardRow => ({
  type: 'mission',
  name: `mission ${missiontype}`,
  originalName: `Mission ${missiontype}`,
  missiontype,
  skills: 'Physics, 2 Science',
  points: 35,
  span: 3,
  ...extra,
});
const named = (originalName: string, extra: Partial<PileCardRow> = {}): PileCardRow => ({ name: originalName.toLowerCase(), originalName, ...extra });

const input = (overrides: Partial<PileTableInput> = {}): PileTableInput => ({
  cards: [
    { card: person('Alpha') },
    { card: person('Beta'), stopped: true },
    { card: { ...person('Tricorder'), type: 'equipment' } },
    { card: person('Gamma') },
  ],
  mission: mission('p'),
  placedOn: [],
  underMission: [],
  missions: [{ mission: mission('p') }, { mission: null }],
  hand: [],
  discard: [],
  turn: 4,
  ...overrides,
});

describe('pileAttemptOf (#1508)', () => {
  it('sets the bot deck\'s affiliations when the table has them, and leaves them out for the Chula pile (#1520)', () => {
    expect(pileAttemptOf(input({ botAffiliations: ['bajoran', 'federation'] })).attempt.botAffiliations).toEqual(['bajoran', 'federation']);
    expect('botAffiliations' in pileAttemptOf(input()).attempt).toBe(false);
  });

  it('takes the unstopped personnel only, and the parsed requirements', () => {
    const { attempt, random } = pileAttemptOf(input());
    expect(random).toBe(false);
    expect(attempt.personnel.map((p) => p.name)).toEqual(['Alpha', 'Gamma']);
    expect(attempt.personnel[0].skills[BOT_SKILLS.indexOf('physics')]).toBe(1);
    expect(attempt.requirements).toEqual(parseRequirementBranches('Physics, 2 Science'));
    expect(attempt.mission).toEqual({ kind: 'planet', points: 35, span: 3, nebula: false });
    expect(attempt.table.turn).toBe(4);
  });

  it('counts the copies of Chula: The Game placed on the mission', () => {
    const placedOn = [named('Chula: The Game'), named('Chula: Echoes'), named('Chula: The Game'), null];
    expect(pileAttemptOf(input({ placedOn })).attempt.gameOnMission).toBe(2);
    expect(pileAttemptOf(input()).attempt.gameOnMission).toBe(0);
  });

  it('counts the headquarters and the completed missions, and reads the skills of each non-headquarters mission', () => {
    const missions = [
      { mission: mission('h') },
      { mission: mission('p', { skills: 'Diplomacy' }), completed: true },
      { mission: mission('s', { skills: 'Navigation' }), completed: true },
      { mission: mission('h') },
      { mission: null, completed: true },
    ];
    const { table } = pileAttemptOf(input({ missions })).attempt;
    expect(table.headquarters).toBe(2);
    expect(table.completedMissions).toBe(2);
    expect(table.completedSpaceMission).toBe(true);
    expect(table.missionSkills).toEqual([[BOT_SKILLS.indexOf('diplomacy')], [BOT_SKILLS.indexOf('navigation')]]);
    const planetOnly = pileAttemptOf(input({ missions: [{ mission: mission('p'), completed: true }] })).attempt.table;
    expect(planetOnly.completedSpaceMission).toBe(false);
  });

  it('reads the hand and the discard pile', () => {
    const hand = [person('Seven', { cunning: 7 }), named('An Event', { type: 'event' })];
    const discard = [named('Sylvia'), named('Sylvia *VP'), named('Kira'), named('Sylvia (SS)')];
    const { table } = pileAttemptOf(input({ hand, discard })).attempt;
    expect(table.handSize).toBe(2);
    expect(table.handHasCunning7Or11).toBe(true);
    expect(table.discardCopiesMax).toBe(3);
    expect(table.discardCopiesTitle).toBe('Sylvia');
    const empty = pileAttemptOf(input({ hand: [person('Six', { cunning: 6 }), named('Eleven', { type: 'event', cunning: 11 })] })).attempt.table;
    expect(empty.handHasCunning7Or11).toBe(false);
    expect(empty.discardCopiesMax).toBe(0);
    expect(empty.discardCopiesTitle).toBeUndefined();
  });

  it('gives each personnel of the hand with its skill indexes and Strength, and leaves out the equipment (#1525)', () => {
    const hand = [person('Seven', { skills: 'Medical, 2 Security', strength: 6 }), { ...person('Tricorder'), type: 'equipment' }, null];
    expect(pileAttemptOf(input({ hand })).attempt.table.hand).toEqual([
      { skills: [BOT_SKILLS.indexOf('medical'), BOT_SKILLS.indexOf('security')].sort((a, b) => a - b), strength: 6 },
    ]);
    expect(pileAttemptOf(input()).attempt.table.hand).toEqual([]);
  });

  it('sets completedPlanetMission for a completed planet mission only (#1525)', () => {
    const completedOf = (missiontype: string) =>
      pileAttemptOf(input({ missions: [{ mission: mission(missiontype), completed: true }, { mission: mission('p') }] })).attempt.table.completedPlanetMission;
    expect(completedOf('p')).toBe(true);
    expect(completedOf('s')).toBe(false);
    expect(completedOf('h')).toBe(false);
  });

  it('names the dilemmas under the mission by title, with no version suffix', () => {
    const underMission = [named('Chula: Echoes'), named('Timescape (Promo)'), named('Stripped Down *AP')];
    expect(pileAttemptOf(input({ underMission })).attempt.table.underMission).toEqual(['Chula: Echoes', 'Timescape', 'Stripped Down']);
  });

  it('gives the ship at a space mission, and none at a planet mission', () => {
    const ship = named('U.S.S. Defiant', { type: 'ship', range: 8, weapons: 9, shields: 7 });
    const space = pileAttemptOf(input({ mission: mission('s', { keywords: 'Nebula' }), ship })).attempt;
    expect(space.mission.kind).toBe('space');
    expect(space.mission.nebula).toBe(true);
    expect(space.ship).toEqual({ name: 'U.S.S. Defiant', range: 8, weapons: 9, shields: 7 });
    expect(pileAttemptOf(input({ ship })).attempt.ship).toBeUndefined();
  });

  it('signals a random choice when the requirements cannot be read, and still builds the attempt', () => {
    const { attempt, random } = pileAttemptOf(input({ mission: mission('s', { skills: '' }), turn: 2 }));
    expect(random).toBe(true);
    expect(attempt.requirements).toEqual([]);
    expect(attempt.mission.kind).toBe('space');
    expect(attempt.personnel).toHaveLength(2);
    expect(attempt.table.turn).toBe(2);
  });
});

describe('the map back from titles to drawn cards (#1508)', () => {
  const drawn = [
    { id: 'd0', card: named('Chula: The Game') },
    { id: 'd1', card: named('Chula: Echoes') },
    { id: 'd2', card: named('Chula: The Game') },
    { id: 'd3', card: null },
  ];

  it('names the drawn cards by title, leaving out a card with no name', () => {
    expect(drawnPileTitles(drawn.map((c) => c.card))).toEqual(['Chula: The Game', 'Chula: Echoes', 'Chula: The Game']);
  });

  it('keeps two copies of a title apart, in stack order, and skips a title with no card left', () => {
    expect(pileStackCardIds(drawn, ['Chula: Echoes', 'Chula: The Game', 'Chula: The Game', 'Chula: The Game', 'Chula: Echoes'])).toEqual([
      'd1',
      'd0',
      'd2',
    ]);
  });
});

// Issue #1575: the title of the event Compromised Experiment chooses.
describe('eventDecayTitle', () => {
  it('names the first core event of the highest Decay, and is absent with no event in the core', () => {
    const core = [
      named('Decay One', { type: 'event', keywords: 'Decay: 1.' }),
      named('Decay Three *VP', { type: 'event', keywords: 'Decay: 3.' }),
      named('Also Three', { type: 'event', keywords: 'Decay: 3.' }),
      named('An Interrupt', { type: 'interrupt', keywords: 'Decay: 9.' }),
    ];
    const { table } = pileAttemptOf(input({ core })).attempt;
    expect(table.eventDecayMax).toBe(3);
    expect(table.eventDecayTitle).toBe('Decay Three');
    expect(pileAttemptOf(input({ core: [named('No Decay', { type: 'event' })] })).attempt.table.eventDecayTitle).toBe('No Decay');
    expect(pileAttemptOf(input()).attempt.table.eventDecayTitle).toBeUndefined();
  });
});
