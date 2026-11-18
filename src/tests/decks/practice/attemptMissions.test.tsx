// Issue #1759: the missions that change the opponent's dilemma draw and spend as an attempt there
// begins, and the draw and the spend every attempt keeps. The personnel are invented cards.
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { AttemptDialog } from '../../../app/decks/practice/AttemptPanel';
import { attemptMissionRules } from '../../../app/decks/practice/attemptMissions';
import { attemptMissionRulesOf } from '../../../app/decks/practice/attempt';
import { gameReducer, initialGameState, logEntryText } from '../../../app/decks/practice/gameLog';
import { fromSavedGame, toSavedGame } from '../../../app/decks/practice/savedGame';
import {
  CardInstance,
  MISSION_SLOTS,
  MissionSlot,
  TableState,
  initialTableState,
  tableReducer,
} from '../../../app/decks/practice/tableReducer';

const person = (id: string, affiliation: string, keywords = '', stopped = false): CardInstance => ({
  id,
  card: { name: `person ${id}`, originalName: `Person ${id}`, type: 'personnel', affiliation, keywords },
  face: 'up',
  ...(stopped ? { stopped: true } : {}),
});

const missionCard = (name: string) => ({ name: name.toLowerCase(), originalName: name, type: 'mission', missiontype: 'p' });

const CLASS_9 = missionCard('Class 9 Nebula Bypass Disputed Region');
const MOUTH = missionCard('Mouth of the Wormhole Form Labor Union');
const RIGEL = missionCard('Rigel X Locate Mysterious Contact');

const many = (n: number, make: (i: number) => CardInstance) => Array.from({ length: n }, (_, i) => make(i));

describe('attemptMissionRules (#1759)', () => {
  it('Class 9 Nebula: draw −1 and spend −1 when every unstopped personnel shares an affiliation', () => {
    const team = [person('a', 'klingon'), person('b', 'klingon'), person('c', 'federation', '', true)];
    expect(attemptMissionRules(CLASS_9, team).auto).toEqual({ source: 'Class 9 Nebula', draw: -1, spend: -1 });
    expect(attemptMissionRules(CLASS_9, [person('a', 'klingon')]).auto).toBeDefined();
    expect(attemptMissionRules(CLASS_9, [person('a', 'klingon'), person('b', 'federation')]).auto).toBeUndefined();
  });

  it('Mouth of the Wormhole: offers Spend −1 for 6 unstopped Dabo Girls or Waiters, each counted once', () => {
    const staff = (i: number) => person(`d${i}`, 'ferengi', i % 2 ? 'dabo girl. dissident.' : 'waiter.');
    const six = many(6, staff);
    expect(attemptMissionRules(MOUTH, six).offers).toEqual([
      { key: 'mouth-of-the-wormhole', label: 'Spend −1', source: 'Mouth of the Wormhole', draw: 0, spend: -1 },
    ]);
    // A stopped one does not count, and one with both keywords counts once.
    const fiveAndStopped = [...many(5, staff), person('x', 'ferengi', 'waiter.', true)];
    expect(attemptMissionRules(MOUTH, fiveAndStopped).offers).toEqual([]);
    const fiveAndBoth = [...many(4, staff), person('y', 'ferengi', 'dabo girl. waiter.'), person('z', 'ferengi', 'smuggler.')];
    expect(attemptMissionRules(MOUTH, fiveAndBoth).offers).toEqual([]);
  });

  it('Rigel X: offers Draw 2 cards for 6 unstopped personnel', () => {
    const six = many(6, (i) => person(`p${i}`, 'bajoran'));
    expect(attemptMissionRules(RIGEL, six).offers).toEqual([
      { key: 'rigel-x', label: 'Draw 2 cards', source: 'Rigel X', draw: 1, spend: 1, drawCards: 2 },
    ]);
    const fivePlusStopped = [...many(5, (i) => person(`p${i}`, 'bajoran')), person('s', 'bajoran', '', true)];
    expect(attemptMissionRules(RIGEL, fivePlusStopped).offers).toEqual([]);
  });

  it('names a mission by its whole title only', () => {
    const team = many(6, (i) => person(`d${i}`, 'bajoran', 'waiter.'));
    expect(attemptMissionRules(missionCard('Mouth of the Wormhole Deep Space 9'), team)).toEqual({ offers: [] });
    expect(attemptMissionRules(missionCard('Class 9 Nebula Bypass Disputed Region *VP'), team).auto).toBeDefined();
  });
});

const slot = (overrides: Partial<MissionSlot> = {}): MissionSlot => ({
  mission: null,
  awayTeam: [],
  ships: [],
  underMission: [],
  ...overrides,
});

const deckCard = (id: string): CardInstance => ({ id, card: { name: id, originalName: id, type: 'event' }, face: 'down' });

const table = (mission = RIGEL, awayTeam: CardInstance[] = many(6, (i) => person(`p${i}`, 'bajoran'))): TableState => ({
  ...initialTableState,
  drawDeck: [deckCard('c1'), deckCard('c2'), deckCard('c3')],
  hand: [],
  missions: Array.from({ length: MISSION_SLOTS }, (_, i) =>
    slot(i === 0 ? { mission: { id: 'm0', card: mission, face: 'up' }, awayTeam } : {})
  ),
});

describe('startAttempt keeps the draw and the spend (#1759)', () => {
  it('stores N when the action names neither, and the bot numbers in a bot game', () => {
    const plain = tableReducer(table(), { type: 'startAttempt', missionIndex: 0, personnel: 6, subtract: 1 }).attempt!;
    expect(plain).toMatchObject({ draw: 5, spend: 5 });
    const bot = tableReducer(table(), { type: 'startAttempt', missionIndex: 0, personnel: 6, subtract: 1, botDraw: 7, botSpend: 4 }).attempt!;
    expect(bot).toMatchObject({ draw: 7, spend: 4 });
  });

  it('draws Rigel X\'s cards into the hand, free, and fewer when the draw deck is short', () => {
    const start = { type: 'startAttempt', missionIndex: 0, personnel: 6, subtract: 0, draw: 7, spend: 7, drawCards: 2 } as const;
    const t = tableReducer(table(), start);
    expect(t.hand.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(t.hand.every((c) => c.face === 'up')).toBe(true);
    expect(t.drawDeck.map((c) => c.id)).toEqual(['c3']);
    expect(t.attempt).toMatchObject({ draw: 7, spend: 7 });
    const short = tableReducer({ ...table(), drawDeck: [deckCard('c1')] }, start);
    expect(short.hand.map((c) => c.id)).toEqual(['c1']);
  });

  it('is one log entry that names the change and the draw, and one undo takes it all back', () => {
    const start = initialGameState(table());
    const started = gameReducer(start, {
      type: 'startAttempt',
      missionIndex: 0,
      personnel: 6,
      subtract: 0,
      draw: 7,
      spend: 7,
      drawCards: 2,
      changes: ['Rigel X: draw +1, spend +1'],
    });
    expect(started.log).toHaveLength(1);
    expect(logEntryText(started.log[0])).toBe(
      'Attempted Rigel X Locate Mysterious Contact: 6 personnel − 0 = draw/spend 7 (Rigel X: draw +1, spend +1; drew 2 cards)'
    );
    const undone = gameReducer(started, { type: 'undo' });
    expect(undone.table.attempt).toBeUndefined();
    expect(undone.table.hand).toEqual([]);
    expect(undone.table.drawDeck.map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);
  });

  it('names a draw and a spend apart with drawSpendText, and an old entry reads draw/spend N', () => {
    const started = gameReducer(initialGameState(table(MOUTH)), {
      type: 'startAttempt',
      missionIndex: 0,
      personnel: 6,
      subtract: 0,
      draw: 6,
      spend: 5,
      changes: ['Mouth of the Wormhole: spend −1'],
    });
    expect(logEntryText(started.log[0])).toBe(
      'Attempted Mouth of the Wormhole Form Labor Union: 6 personnel − 0 = draw 6, spend 5 (Mouth of the Wormhole: spend −1)'
    );
    expect(logEntryText({ turn: 1, kind: 'attemptStarted', mission: 'Moab IV', personnel: 12, subtract: 3 })).toBe(
      'Attempted Moab IV: 12 personnel − 3 = draw/spend 9'
    );
  });
});

describe('the save of the draw and the spend (#1759)', () => {
  const deck = {
    mission: { count: 1, row: { collectorsinfo: '1M1', name: 'Mission', type: 'mission', missiontype: 'p' } },
  } as any;
  const dealt = (): TableState => ({
    ...initialTableState,
    missions: Array.from({ length: MISSION_SLOTS }, (_, i) =>
      slot({ mission: i === 0 ? { id: 'card-1', card: { ...deck.mission.row }, face: 'up' } : null })
    ),
  });
  const restore = (attempt: object) => {
    const save = toSavedGame(dealt(), deck, 'builder');
    return fromSavedGame(JSON.stringify({ ...save, table: { ...save.table, attempt } }), deck)!.table.attempt;
  };

  it('restores a save from before as N, or as the bot numbers in a bot attempt', () => {
    expect(restore({ missionIndex: 0, personnel: 6, subtract: 2, phase: 'choose', drawn: 0 })).toMatchObject({ draw: 4, spend: 4 });
    expect(restore({ missionIndex: 0, personnel: 6, subtract: 2, phase: 'face', drawn: 0, botDraw: 5, botSpend: 3 })).toMatchObject({
      draw: 5,
      spend: 3,
    });
    expect(restore({ missionIndex: 0, personnel: 6, subtract: 2, draw: 3, spend: 6, phase: 'choose', drawn: 0 })).toMatchObject({
      draw: 3,
      spend: 6,
    });
    expect(restore({ missionIndex: 0, personnel: 6, subtract: 2, draw: -1, spend: 6, phase: 'choose', drawn: 0 })).toBeUndefined();
  });
});

describe('the attempt popup names the mission\'s change (#1759)', () => {
  it('reads the panel\'s cards, so a stopped personnel never counts', () => {
    const t = table(CLASS_9, [person('a', 'klingon'), person('b', 'federation', '', true)]);
    expect(attemptMissionRulesOf(t, { kind: 'awayTeam', missionIndex: 0 }).auto).toBeDefined();
  });

  it('Class 9 Nebula: starts 1 lower and names the mission', () => {
    const onStart = jest.fn();
    const rules = attemptMissionRules(CLASS_9, [person('a', 'klingon')]);
    render(<AttemptDialog mission="Class 9 Nebula" personnel={6} subtract={1} rules={rules} onStart={onStart} onCancel={() => {}} />);
    expect(screen.getByTestId('attempt-result')).toHaveTextContent(/^draw\/spend 4$/);
    expect(screen.getByTestId('attempt-mission-change')).toHaveTextContent('Class 9 Nebula: draw −1, spend −1');
    fireEvent.click(screen.getByTestId('attempt-start'));
    expect(onStart).toHaveBeenCalledWith(6, 1, undefined, { draw: 4, spend: 4, changes: ['Class 9 Nebula: draw −1, spend −1'] });
  });

  it('Mouth of the Wormhole: Spend −1 lowers only the spend when taken', () => {
    const onStart = jest.fn();
    const rules = attemptMissionRules(MOUTH, many(6, (i) => person(`d${i}`, 'ferengi', 'waiter.')));
    render(<AttemptDialog mission="Mouth" personnel={6} subtract={0} rules={rules} onStart={onStart} onCancel={() => {}} />);
    expect(screen.getByTestId('attempt-result')).toHaveTextContent(/^draw\/spend 6$/);
    fireEvent.click(screen.getByTestId('attempt-mission-offer-mouth-of-the-wormhole'));
    expect(screen.getByTestId('attempt-result')).toHaveTextContent(/^draw 6, spend 5$/);
    fireEvent.click(screen.getByTestId('attempt-start'));
    expect(onStart).toHaveBeenCalledWith(6, 0, undefined, { draw: 6, spend: 5, changes: ['Mouth of the Wormhole: spend −1'] });
  });

  it('Rigel X in a bot game: the fields start at the changed numbers, stay editable, and Start draws 2', () => {
    const onStart = jest.fn();
    const rules = attemptMissionRules(RIGEL, many(6, (i) => person(`p${i}`, 'bajoran')));
    render(<AttemptDialog mission="Rigel X" personnel={6} subtract={0} rules={rules} bot onStart={onStart} onCancel={() => {}} />);
    fireEvent.click(screen.getByTestId('attempt-mission-offer-rigel-x'));
    expect(screen.getByTestId('attempt-bot-draw')).toHaveValue('7');
    expect(screen.getByTestId('attempt-bot-spend')).toHaveValue('7');
    fireEvent.change(screen.getByTestId('attempt-bot-spend'), { target: { value: '4' } });
    fireEvent.click(screen.getByTestId('attempt-start'));
    expect(onStart).toHaveBeenCalledWith(6, 0, { botDraw: 7, botSpend: 4 }, { drawCards: 2, changes: ['Rigel X: draw +1, spend +1'] });
  });
});
