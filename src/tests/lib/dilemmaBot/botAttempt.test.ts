// Issue #1298: the pure inputs of a bot attempt on the practice table.
import { RANDOM_CHOICE, botAttemptOf, drawnDilemmaIds, stackCardIds } from '../../../lib/dilemmaBot/botAttempt';
import { collectorsKey, DILEMMA_BY_ID, DilemmaId } from '../../../lib/dilemmaBot/opponentPile';
import { attemptingCards, botTableFactsOf } from '../../../app/decks/practice/attempt';
import { CardInstance, initialTableState, MissionSlot, TableState } from '../../../app/decks/practice/tableReducer';
import { BotAttempt } from '../../../lib/dilemmaBot/simulator';
import { BOT_SKILLS } from '../../../lib/dilemmaBot/requirements';

const row = (name: string, type: string, extra: Record<string, string> = {}) => ({
  name: name.toLowerCase(),
  originalName: name,
  type,
  cost: '2',
  integrity: '5',
  cunning: '6',
  strength: '4',
  skills: '',
  ...extra,
});

const inst = (id: string, card: ReturnType<typeof row>, stopped = false): CardInstance => ({
  id,
  card,
  face: 'up',
  ...(stopped ? { stopped } : {}),
});

const chula = (id: string, dilemma: DilemmaId): CardInstance => ({
  id,
  card: { name: DILEMMA_BY_ID[dilemma].title.toLowerCase(), type: 'dilemma', collectorsinfo: collectorsKey(DILEMMA_BY_ID[dilemma].collectorsInfo) },
  face: 'down',
});

const REQUIREMENTS = 'Anthropology, 2 Diplomacy and Integrity>20';

const slot = (overrides: Partial<MissionSlot>): MissionSlot => ({ mission: null, ships: [], awayTeam: [], underMission: [], ...overrides });

// Slot 0 a planet mission with an away team, slot 1 a space mission with a crewed ship.
const table = (): TableState => ({
  ...initialTableState,
  missions: [
    slot({
      mission: { ...inst('m0', row('Moab IV', 'mission', { missiontype: 'p', skills: REQUIREMENTS })), placedOn: [chula('g1', 'game'), chula('e1', 'echoes')] },
      awayTeam: [
        inst('a1', row('Away One', 'personnel', { skills: 'Anthropology, 2 Diplomacy' })),
        inst('a2', row('Away Two', 'personnel'), true),
        inst('a3', row('Kit', 'equipment')),
      ],
    }),
    slot({
      mission: inst('m1', row('Bilana System', 'mission', { missiontype: 's', skills: 'total Weapons at this mission>10' })),
      ships: [{ ...inst('s1', row('Ship', 'ship')), crew: [inst('c1', row('Crew One', 'personnel')), inst('c2', row('Crew Two', 'personnel'))] }],
      awayTeam: [inst('a9', row('Not Crew', 'personnel'))],
    }),
    slot({}),
    slot({}),
    slot({}),
  ],
});

describe('botAttemptOf (#1298)', () => {
  it('keeps only the unstopped personnel of the away team at a planet mission, no equipment', () => {
    const t = table();
    const slot0 = t.missions[0];
    const attempt = botAttemptOf(attemptingCards(t, 0)!, slot0.mission!.card, (slot0.mission!.placedOn ?? []).map((c) => c.card)) as BotAttempt;

    expect(attempt.personnel.map((p) => p.name)).toEqual(['Away One']);
    expect(attempt.personnel[0].attrs).toEqual([5, 6, 4]);
    expect(attempt.choice).toBe('best');
    expect(attempt.requirements).toHaveLength(1);
  });

  it('uses the crew of the ship at a space mission, not the away team', () => {
    const t = table();
    const cards = attemptingCards(t, 1, 's1')!;
    const attempt = botAttemptOf(cards, { skills: REQUIREMENTS }, []) as BotAttempt;

    expect(attempt.personnel.map((p) => p.name)).toEqual(['Crew One', 'Crew Two']);
    expect(attemptingCards(t, 1)).toBeNull();
    expect(attemptingCards(t, 0, 's1')).toBeNull();
  });

  it('counts only the copies of Chula: The Game on the mission', () => {
    const placed = [chula('g1', 'game'), chula('e1', 'echoes'), chula('g2', 'game'), inst('x', row('Event', 'event'))];
    const attempt = botAttemptOf([], { skills: REQUIREMENTS }, placed.map((c) => c.card)) as BotAttempt;

    expect(attempt.gameOnMission).toBe(2);
  });

  it('gives the random marker for requirements it cannot read', () => {
    const t = table();
    expect(botAttemptOf(attemptingCards(t, 1, 's1')!, t.missions[1].mission!.card, [])).toBe(RANDOM_CHOICE);
  });
});

describe('the table facts of a bot attempt (#1352)', () => {
  const DOCTOR = 'while you do not command a completed mission, this personnel gains medical and programming.';
  const MEDICAL = BOT_SKILLS.indexOf('medical');

  it('reads the completed missions, the discard pile, the events in the core and the commanded personnel, and nothing of the brig', () => {
    const t = table();
    const withCards: TableState = {
      ...t,
      missions: t.missions.map((s, i) => (i === 1 ? { ...s, completed: true } : s)),
      discard: [inst('d1', row('Navigator', 'personnel', { skills: 'Navigation', affiliation: 'bajoran' })), inst('d2', row('Event', 'event'))],
      core: [inst('k1', row('Event One', 'event')), inst('k2', row('Event Two', 'event')), inst('k3', row('Gear', 'equipment'))],
      brig: [inst('b1', row('Captive', 'personnel'))],
    };

    const facts = botTableFactsOf(withCards);
    expect(facts.completedMissions).toEqual(['s']);
    expect(facts.discardPile.map((c) => [c.name, c.type, c.affiliation])).toEqual([
      ['navigator', 'personnel', 'bajoran'],
      ['event', 'event', ''],
    ]);
    expect(facts.discardPile[0].skills[BOT_SKILLS.indexOf('navigation')]).toBe(1);
    expect(facts.coreEvents).toBe(2);
    // Every away team and every crew, at every mission, the stopped personnel too: no equipment, no brig (#1360).
    expect(facts.commanded.map((c) => c.name)).toEqual(['away one', 'away two', 'not crew', 'crew one', 'crew two']);
    expect(botTableFactsOf({ ...table(), missions: [] })).toEqual({ completedMissions: [], discardPile: [], coreEvents: 0, commanded: [] });
  });

  it('counts a table gain while its condition holds on the table, and always without facts', () => {
    const cards = [{ card: row('Doctor', 'personnel', { skills: 'Medical', gametext: DOCTOR }) }];
    const medicalOf = (attempt: unknown) => (attempt as BotAttempt).personnel[0].skills[MEDICAL];
    const t = table();
    const done: TableState = { ...t, missions: t.missions.map((s, i) => (i === 0 ? { ...s, completed: true } : s)) };

    expect(medicalOf(botAttemptOf(cards, { skills: REQUIREMENTS }, [], botTableFactsOf(t)))).toBe(2);
    expect(medicalOf(botAttemptOf(cards, { skills: REQUIREMENTS }, [], botTableFactsOf(done)))).toBe(1);
    expect(medicalOf(botAttemptOf(cards, { skills: REQUIREMENTS }, []))).toBe(2);
  });
});

describe('drawnDilemmaIds (#1298)', () => {
  it('gives the id of each drawn row in draw order, duplicates included, and leaves out a card with none', () => {
    const drawn = [chula('d1', 'dice'), inst('x', row('Other', 'dilemma')), chula('d2', 'game'), chula('d3', 'dice')];

    expect(drawnDilemmaIds(drawn.map((c) => c.card))).toEqual(['dice', 'game', 'dice']);
  });
});

describe('stackCardIds, the map back (#1298)', () => {
  const drawn = [chula('d1', 'dice'), chula('d2', 'echoes'), chula('d3', 'game'), chula('d4', 'dice'), chula('d5', 'game')];

  it('puts a Game card first when the stack starts with Chula: The Game', () => {
    const ids = stackCardIds(drawn, ['game', 'dice']);

    expect(ids[0]).toBe('d3');
    expect(drawn.find((c) => c.id === ids[0])!.card.collectorsinfo).toBe(collectorsKey(DILEMMA_BY_ID.game.collectorsInfo));
  });

  it('takes the first drawn copy of a title, and does not return the other', () => {
    expect(stackCardIds(drawn, ['dice'])).toEqual(['d1']);
    expect(stackCardIds(drawn, ['dice', 'dice'])).toEqual(['d1', 'd4']);
  });

  it('returns only drawn card ids, each once', () => {
    const ids = stackCardIds(drawn, ['game', 'game', 'echoes', 'dice', 'dice']);

    expect(ids).toEqual(['d3', 'd5', 'd2', 'd1', 'd4']);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => drawn.some((c) => c.id === id))).toBe(true);
  });
});
