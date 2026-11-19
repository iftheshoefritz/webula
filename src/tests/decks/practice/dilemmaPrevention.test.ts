import { tableReducer, initialTableState, CardInstance, TableState, MISSION_SLOTS } from '../../../app/decks/practice/tableReducer';
import { botResolveOf } from '../../../app/decks/practice/attempt';
import { GameAction, GameState, gameReducer, initialGameState, logEntryText, withShuffleOrders } from '../../../app/decks/practice/gameLog';
import {
  SIGMA_IOTIA,
  TRISTAN_ADAMS,
  namedDilemmasOf,
  nameableDilemmaTitles,
  preventionOf,
} from '../../../app/decks/practice/dilemmaPrevention';
import { modelRequiresSkill, textRequiresSkill } from '../../../lib/dilemmaBot/pile/requiresSkill';
import { modelOf } from '../../../lib/dilemmaBot/pile/registry';
import { pileAttemptOf } from '../../../lib/dilemmaBot/pile/tableAttempt';

// Issue #1761: Sigma Iotia II and Tristan Adams prevent and overcome a dilemma, in a bot game. The
// personnel and the missions other than the two titles are invented.

const card = (id: string, row: Record<string, unknown>, extra: Partial<CardInstance> = {}): CardInstance => ({
  id,
  card: { collectorsinfo: id, imagefile: id, ...row } as CardInstance['card'],
  face: 'up',
  ...extra,
});
const person = (id: string, name: string, extra: Record<string, unknown> = {}) =>
  card(id, { type: 'personnel', name: name.toLowerCase(), originalName: name, skills: 'Physics', integrity: 5, cunning: 5, strength: 5, cost: '2', ...extra });
const dilemma = (id: string, title: string, cost = '2', gametext = '') =>
  card(id, { type: 'dilemma', name: title.toLowerCase(), originalName: title, cost, gametext }, { face: 'down' });

const SIGMA = 'Sigma Iotia II Assess Contamination';
const mission = (title: string) =>
  card('m0', { type: 'mission', name: title.toLowerCase(), originalName: title, missiontype: 'p', skills: 'Physics', points: 35, span: 3 });

// Racial Tension: cost 2, a check of species, no skill. Environmental Contaminants: a check of skills.
const NO_SKILL = 'Racial Tension';
const SKILL = 'Environmental Contaminants';

function attemptTable(stack: CardInstance[], { missionTitle = SIGMA, crew = [person('p1', 'Alpha'), person('p2', 'Beta'), person('p3', 'Gamma')], bot = true } = {}): TableState {
  return {
    ...initialTableState,
    ...(bot ? { opponent: 'bot' as const } : {}),
    missions: Array.from({ length: MISSION_SLOTS }, (_, i) => ({
      mission: i === 0 ? mission(missionTitle) : null,
      ships: [],
      awayTeam: i === 0 ? crew : [],
      underMission: [],
    })),
    dilemmaStack: stack,
    attempt: {
      missionIndex: 0,
      personnel: crew.length,
      subtract: 0,
      draw: 9,
      spend: 9,
      phase: 'face',
      drawn: 0,
      ...(bot ? { botDraw: 9, botSpend: 9 } : {}),
      botStack: stack.map((c) => c.id),
      botRevealed: [],
    },
  };
}

const reveal = (table: TableState) => tableReducer(table, { type: 'flip', id: table.dilemmaStack[0].id });

// The page's press: the Resolve with the prevention, as one `resolveDilemma`.
function press(game: GameState): GameState {
  const top = game.table.dilemmaStack[0];
  const r = botResolveOf(game.table, undefined, [], preventionOf(game.table, game.log));
  if (!r.resolvable) throw new Error(r.reason);
  return gameReducer(game, {
    type: 'resolveDilemma',
    dilemmaId: top.id,
    dilemma: top.card.originalName,
    changes: r.changes,
    notes: r.notes,
    ...(r.move ? { move: r.move } : {}),
    ...(r.prevented ? { prevented: r.prevented } : {}),
  });
}

describe('what requires a skill (#1761)', () => {
  const attempt = pileAttemptOf({
    cards: [{ card: person('p1', 'Alpha').card }, { card: person('p2', 'Beta').card }],
    mission: mission('Moab IV').card,
    placedOn: [],
    underMission: [],
    missions: [{ mission: mission('Moab IV').card }],
    hand: [],
    discard: [],
    turn: 1,
  }).attempt;

  it('reads the model: a check of skills requires one, a check of species does not', () => {
    expect(modelRequiresSkill(modelOf(SKILL)!, attempt)).toBe(true);
    expect(modelRequiresSkill(modelOf(NO_SKILL)!, attempt)).toBe(false);
  });

  it('reads the text of a dilemma with no model', () => {
    expect(textRequiresSkill('Unless you have Diplomacy and 2 Law, all your personnel are stopped.')).toBe(true);
    expect(textRequiresSkill('Randomly select a personnel to be stopped.')).toBe(false);
    expect(textRequiresSkill(undefined)).toBe(false);
  });
});

describe('Sigma Iotia II (#1761)', () => {
  it('prevents and overcomes the first dilemma of the turn that costs 1 or more and requires no skill', () => {
    const table = reveal(attemptTable([dilemma('d1', NO_SKILL), dilemma('d2', NO_SKILL)]));
    expect(preventionOf(table, [])).toBe(SIGMA_IOTIA);
    expect(botResolveOf(table, undefined, [], SIGMA_IOTIA)).toEqual({
      resolvable: true,
      preview: 'Prevented and overcome (Sigma Iotia II)',
      changes: [],
      notes: [],
      prevented: SIGMA_IOTIA,
      move: { to: { zone: 'missionPile', missionIndex: 0, pile: 'underMission' } },
    });
  });

  it('moves it beneath the mission with no effect, in one entry that one undo takes back', () => {
    const start = initialGameState(reveal(attemptTable([dilemma('d1', NO_SKILL), dilemma('d2', NO_SKILL)])));
    const resolved = press(start);
    expect(resolved.table.missions[0].underMission.map((c) => c.id)).toEqual(['d1']);
    expect(resolved.table.missions[0].awayTeam.every((c) => !c.stopped)).toBe(true);
    expect(resolved.log).toHaveLength(1);
    expect(logEntryText(resolved.log[0])).toBe(`Resolved ${NO_SKILL}: prevented and overcome (Sigma Iotia II); it goes under ${SIGMA}`);
    expect(gameReducer(resolved, { type: 'undo' }).table).toBe(start.table);
  });

  it('lets a later dilemma of the turn resolve as usual', () => {
    const resolved = press(initialGameState(reveal(attemptTable([dilemma('d1', NO_SKILL), dilemma('d2', NO_SKILL)]))));
    const next = { ...resolved, table: reveal(resolved.table) };
    expect(next.table.dilemmaStack[0].id).toBe('d2');
    expect(preventionOf(next.table, next.log)).toBeNull();
    // In a later attempt of the same turn, too: the log says Sigma Iotia II was used.
    const again = { ...next, table: reveal(attemptTable([dilemma('d3', NO_SKILL)])) };
    expect(preventionOf(again.table, again.log)).toBeNull();
    // The next turn it prevents again.
    const nextTurn = { ...again.table, turn: again.table.turn + 1 };
    expect(preventionOf(nextTurn, again.log)).toBe(SIGMA_IOTIA);
  });

  it('prevents only the first dilemma that qualifies, not a later one after a dilemma that did not', () => {
    // The first revealed requires a skill, so the second, which does not, is the first that qualifies.
    const first = reveal(attemptTable([dilemma('d1', SKILL), dilemma('d2', NO_SKILL)]));
    expect(preventionOf(first, [])).toBeNull();
    const second = reveal({ ...first, dilemmaStack: first.dilemmaStack.slice(1) });
    expect(preventionOf(second, [])).toBe(SIGMA_IOTIA);
    // A dilemma of cost 0 does not qualify.
    expect(preventionOf(reveal(attemptTable([dilemma('d1', NO_SKILL, '0')])), [])).toBeNull();
  });

  it('reads the text of a dilemma the bot has no model of', () => {
    expect(preventionOf(reveal(attemptTable([dilemma('d1', 'An Invented Dilemma', '1', 'Unless you have Diplomacy, stop all.')])), [])).toBeNull();
    expect(preventionOf(reveal(attemptTable([dilemma('d1', 'An Invented Dilemma', '1', 'Randomly select a personnel to be stopped.')])), [])).toBe(SIGMA_IOTIA);
  });

  it('does nothing at another mission, in a game by hand, or before the card is revealed', () => {
    expect(preventionOf(reveal(attemptTable([dilemma('d1', NO_SKILL)], { missionTitle: 'Moab IV' })), [])).toBeNull();
    expect(preventionOf(reveal(attemptTable([dilemma('d1', NO_SKILL)], { bot: false })), [])).toBeNull();
    expect(preventionOf(attemptTable([dilemma('d1', NO_SKILL)]), [])).toBeNull();
  });
});

describe('Tristan Adams (#1761)', () => {
  const TRISTAN = 'Tristan Adams Deranged Psychiatrist';
  const tristan = person('t1', TRISTAN, { cost: '2' });
  const awayTeam = { zone: 'missionPile', missionIndex: 0, pile: 'awayTeam' } as const;
  const run = (game: GameState, ...actions: GameAction[]) => actions.reduce((g, a) => gameReducer(g, withShuffleOrders(g.table, a)), game);

  // Tristan Adams played at Moab IV, then his choice: +2, naming `named`.
  function played(named = NO_SKILL): GameState {
    const start: TableState = {
      ...attemptTable([], { missionTitle: 'Moab IV', crew: [person('p1', 'Alpha'), person('p2', 'Beta')] }),
      attempt: undefined,
      hand: [tristan],
    };
    const game = run(initialGameState(start), { type: 'move', id: 't1', to: awayTeam });
    return gameReducer(game, { type: 'correctCharge', target: { entry: 0, move: 0, card: 0 }, cost: 4, source: TRISTAN_ADAMS, named });
  }

  it('offers +2 to name a dilemma, and the choice keeps the title in one entry', () => {
    const game = played();
    expect(game.log).toHaveLength(2);
    expect(logEntryText(game.log[0])).toBe(`Played ${TRISTAN} at Moab IV (cost 2, Tristan Adams: you may name a dilemma)`);
    expect(logEntryText(game.log[1])).toBe(`Charged ${TRISTAN} 4 counters (was 2) (Tristan Adams, named ${NO_SKILL})`);
    expect(namedDilemmasOf(game.log, game.table.turn)).toEqual([NO_SKILL]);
    expect(namedDilemmasOf(gameReducer(game, { type: 'undo' }).log, game.table.turn)).toEqual([]);
  });

  it('makes no entry for the choice without a title', () => {
    const start: TableState = { ...attemptTable([], { missionTitle: 'Moab IV' }), attempt: undefined, hand: [tristan] };
    const game = run(initialGameState(start), { type: 'move', id: 't1', to: awayTeam });
    expect(gameReducer(game, { type: 'correctCharge', target: { entry: 0, move: 0, card: 0 }, cost: 4, source: TRISTAN_ADAMS })).toBe(game);
  });

  // The game after the play, now attempting Moab IV with the away team, `title` revealed on top.
  function facing(game: GameState, title: string, stopTristan = false): GameState {
    const crew = game.table.missions[0].awayTeam.map((c) => (stopTristan && c.id === 't1' ? { ...c, stopped: true } : c));
    const table = attemptTable([dilemma('d1', title), dilemma('d2', title)], { missionTitle: 'Moab IV', crew });
    return { ...game, table: reveal({ ...table, turn: game.table.turn }) };
  }

  it('prevents each copy of the named dilemma he faces this turn', () => {
    const game = facing(played(SKILL), SKILL);
    expect(preventionOf(game.table, game.log)).toBe(TRISTAN_ADAMS);
    const resolved = press(game);
    expect(resolved.table.missions[0].underMission.map((c) => c.id)).toEqual(['d1']);
    expect(logEntryText(resolved.log[resolved.log.length - 1])).toBe(`Resolved ${SKILL}: prevented and overcome (Tristan Adams); it goes under Moab IV`);
    // The second copy too.
    const second = { ...resolved, table: reveal(resolved.table) };
    expect(preventionOf(second.table, second.log)).toBe(TRISTAN_ADAMS);
  });

  it('does nothing when he was stopped before the reveal, for another title, or another turn', () => {
    expect(preventionOf(facing(played(SKILL), SKILL, true).table, played(SKILL).log)).toBeNull();
    const other = facing(played(SKILL), NO_SKILL);
    expect(preventionOf(other.table, other.log)).toBeNull();
    const game = facing(played(SKILL), SKILL);
    expect(preventionOf({ ...game.table, turn: game.table.turn + 1 }, game.log)).toBeNull();
  });

  it('keeps the prevention when he is stopped by hand after the reveal', () => {
    const game = facing(played(SKILL), SKILL);
    const stopped = tableReducer(game.table, { type: 'setStopped', ids: ['t1'], stopped: true });
    expect(preventionOf(stopped, game.log)).toBe(TRISTAN_ADAMS);
  });
});

describe('the titles a dilemma is named from (#1761)', () => {
  it("lists the bot's dilemmas in a bot game, and every dilemma title otherwise", () => {
    const table: TableState = {
      ...attemptTable([dilemma('d1', 'Wall of Fire')]),
      dilemmaPile: [dilemma('d2', NO_SKILL), dilemma('d3', NO_SKILL), dilemma('d4', SKILL)],
    };
    expect(nameableDilemmaTitles(table, [])).toEqual([SKILL, NO_SKILL, 'Wall of Fire']);
    const all = [dilemma('x', 'Zeta Dilemma').card, person('y', 'Alpha').card, dilemma('z', 'Alpha Dilemma').card];
    expect(nameableDilemmaTitles({ ...table, opponent: undefined }, all)).toEqual(['Alpha Dilemma', 'Zeta Dilemma']);
  });
});
