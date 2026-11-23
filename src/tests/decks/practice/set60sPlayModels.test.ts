import { initialTableState, CardInstance, TableState, MISSION_SLOTS } from '../../../app/decks/practice/tableReducer';
import { GameState, gameReducer, initialGameState, logEntryText, pendingPlayEffectOf, withShuffleOrders } from '../../../app/decks/practice/gameLog';
import { downloadTakes, playModelOf, PlayModel, playStagesOf } from '../../../lib/playModels';
import { playModelCoverage } from '../../../lib/playModels/coverage';
import { recordStepName, type PendingPlayEffect } from '../../../app/decks/practice/gameLog';
import { stepOf } from '../../../lib/effectSteps';

// The stages of a model as the record names them (#1863), and whether each is a "may".
const stageSummary = (m: PlayModel) => playStagesOf(m).map((s) => ({ step: recordStepName(s.lead), may: s.may }));
const stageName = (p: PendingPlayEffect | null) => (p ? recordStepName(p.stage.lead) : undefined);
// The test of a model's download step.
const downloadOf = (m: PlayModel) => {
  const of = stepOf(m.steps, 'download')?.of;
  return of?.kind === 'test' ? of : { test: [] };
};

// Issue #1826: Tavana Reinvigorated Soldier and Qartum Delegation Transport of 60S download a named card when
// played, with the 'downloadTake' kind of #1810. Their titles are real; the deck cards are invented, but for the
// two named cards.

const card = (id: string, row: Record<string, unknown>, extra: Partial<CardInstance> = {}): CardInstance => ({
  id,
  card: { collectorsinfo: id, imagefile: id, cost: '2', ...row } as CardInstance['card'],
  face: 'up',
  ...extra,
});
const deckCard = (id: string, name: string, type: string) =>
  card(id, { type, name: name.toLowerCase(), originalName: name }, { face: 'down' });

// "When you play this personnel, you may download {The Warrior's Anthem}."
const TAVANA = card('tavana', { type: 'personnel', name: 'tavana reinvigorated soldier', originalName: 'Tavana Reinvigorated Soldier', affiliation: 'klingon' });
// "When you play this ship, you may download {Latinum Storage}. While this ship is staffed, …"
const QARTUM = card('qartum', { type: 'ship', name: 'qartum delegation transport', originalName: 'Qartum Delegation Transport', affiliation: 'ferengi', cost: '6' });

const DECK = [
  deckCard('i1', 'Invented Interrupt', 'interrupt'),
  deckCard('anthem', "The Warrior's Anthem", 'interrupt'),
  deckCard('e1', 'Invented Event', 'event'),
  deckCard('latinum', 'Latinum Storage', 'event'),
];

function table(): TableState {
  return {
    ...initialTableState,
    hand: [TAVANA, QARTUM],
    drawDeck: DECK,
    missions: Array.from({ length: MISSION_SLOTS }, (_, i) => ({
      mission: card(`m${i}`, { type: 'mission', name: `mission ${i}`, originalName: `Mission ${i}`, missiontype: i === 2 ? 's' : 'p' }),
      ships: [],
      awayTeam: [],
      underMission: [],
    })),
  };
}

const dispatch = (game: GameState, action: Parameters<typeof withShuffleOrders>[1]): GameState =>
  gameReducer(game, withShuffleOrders(game.table, action, game.log));
const model = (name: string) => playModelOf(name)!;
const passing = (name: string) => DECK.filter((c) => downloadTakes(downloadOf(model(name)), c.card)).map((c) => c.id);
const ids = (cards: CardInstance[]) => cards.map((c) => c.id);

describe('the 60S downloads (#1826)', () => {
  it.each([
    ['Tavana Reinvigorated Soldier', 'anthem'],
    ['Qartum Delegation Transport', 'latinum'],
  ])('%s downloads its named card only, a "may"', (name, id) => {
    expect(stepOf(model(name).steps, 'download')).toMatchObject({ upTo: 1, to: { kind: 'hand' } });
    expect(stageSummary(model(name))).toEqual([{ step: 'download', may: true }]);
    expect(passing(name)).toEqual([id]);
  });

  it('counts both as modelled', () => {
    const coverage = playModelCoverage([
      { name: 'tavana reinvigorated soldier', originalName: 'Tavana Reinvigorated Soldier', type: 'personnel', gametext: "When you play this personnel, you may download {The Warrior's Anthem}." },
      { name: 'qartum delegation transport', originalName: 'Qartum Delegation Transport', type: 'ship', gametext: 'When you play this ship, you may download {Latinum Storage}.' },
    ] as never);
    expect(coverage).toEqual({ modelled: ['qartum delegation transport', 'tavana reinvigorated soldier'], missing: [] });
  });

  it('a play of Tavana into an away team leaves the download pending, and it takes The Warrior\'s Anthem', () => {
    const start = dispatch(initialGameState(table()), { type: 'move', id: 'tavana', to: { zone: 'missionPile', missionIndex: 0, pile: 'awayTeam' } });
    expect(pendingPlayEffectOf(start)).toMatchObject({ id: 'tavana', stage: { lead: { kind: 'download' } } });
    const done = dispatch(start, { type: 'effectStep', ids: ['anthem'] });
    expect(ids(done.table.hand)).toEqual(['qartum', 'anthem']);
    expect([...ids(done.table.drawDeck)].sort()).toEqual(['e1', 'i1', 'latinum']);
    expect(pendingPlayEffectOf(done)).toBeNull();
    expect(logEntryText(done.log[done.log.length - 1])).toBe("Played Tavana Reinvigorated Soldier at Mission 0 (cost 2); downloaded The Warrior's Anthem, shuffled the draw deck");
    expect(gameReducer(done, { type: 'undo' }).table).toEqual(table());
  });

  it('a play of Qartum onto a ship row leaves the download pending, and it takes Latinum Storage', () => {
    const start = dispatch(initialGameState(table()), { type: 'move', id: 'qartum', to: { zone: 'shipRow', missionIndex: 2 } });
    expect(pendingPlayEffectOf(start)).toMatchObject({ id: 'qartum', stage: { lead: { kind: 'download' } } });
    const done = dispatch(start, { type: 'effectStep', ids: ['latinum'] });
    expect(ids(done.table.hand)).toEqual(['tavana', 'latinum']);
  });
});
