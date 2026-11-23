import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { initialTableState, CardInstance, TableState, MISSION_SLOTS } from '../../../app/decks/practice/tableReducer';
import {
  GameState,
  downloadPlaceShipsOf,
  entryCharges,
  gameReducer,
  initialGameState,
  isLogEntry,
  logEntryText,
  pendingPlayEffectOf,
  segmentCounters,
  withShuffleOrders,
} from '../../../app/decks/practice/gameLog';
import { ResolvingPanel } from '../../../app/decks/practice/ResolvingPanel';
import { downloadTakes, playConditionLine, playModelOf, PlayModel, playStagesOf } from '../../../lib/playModels';
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

// Issue #1811: the "when you play" kind "download to the played card's place", with Gelnon Aloof Tactician, U.S.S.
// Enterprise Where She Belongs and Reconnaissance Drone. With invented deck cards, and the real titles, the keys of
// their models.

const card = (id: string, row: Record<string, unknown>, extra: Partial<CardInstance> = {}): CardInstance => ({
  id,
  card: { collectorsinfo: id, imagefile: id, cost: '2', ...row } as CardInstance['card'],
  face: 'up',
  ...extra,
});
const deckCard = (id: string, row: Record<string, unknown>) =>
  card(id, { name: `card ${id}`, originalName: `Card ${id}`, ...row }, { face: 'down' });
const named = (id: string, name: string, row: Record<string, unknown>) => card(id, { name: name.toLowerCase(), originalName: name, ...row });
const GELNON = named('gelnon', 'Gelnon Aloof Tactician', { type: 'personnel', affiliation: 'dominion', species: 'vorta', cost: '3' });
const ENTERPRISE = named('ent', 'U.S.S. Enterprise Where She Belongs', { type: 'ship', affiliation: 'federation', icons: '[tos][pa]', cost: '7' });
const DRONE = named('drone', 'Reconnaissance Drone', { type: 'personnel', affiliation: 'borg', species: 'borg', keywords: 'drone.', cost: '3' });
const ship = (id: string, affiliation: string) => named(id, `Ship ${id}`, { type: 'ship', affiliation });

// The draw deck: a Jem'Hadar, two [TOS] personnel of cost 5 and 3, a Drone, and an event.
const DECK = [
  deckCard('jh', { type: 'personnel', affiliation: 'dominion', species: "jem'hadar" }),
  deckCard('k5', { type: 'personnel', affiliation: 'federation', icons: '[cmd][tos][pa]', cost: '5' }),
  deckCard('d1', { type: 'personnel', affiliation: 'borg', species: 'borg', keywords: 'drone.' }),
  deckCard('k3', { type: 'personnel', affiliation: 'federation', icons: '[tos]', cost: '3' }),
  deckCard('ev', { type: 'event', icons: '[tos]', cost: '5' }),
];

const mission = (i: number, quadrant: string) =>
  card(`m${i}`, { type: 'mission', name: `mission ${i}`, originalName: `Mission ${i}`, missiontype: i === 4 ? 'h' : 'p', quadrant });

// Mission 0 holds a [Dom] ship, mission 1 a [Fed] ship and mission 3 a second [Dom] ship.
function table(quadrant = 'a', drawDeck: CardInstance[] = DECK): TableState {
  const ships: Record<number, CardInstance[]> = { 0: [ship('dom0', 'dominion')], 1: [ship('fed1', 'federation')], 3: [ship('dom3', 'dominion')] };
  return {
    ...initialTableState,
    hand: [GELNON, ENTERPRISE, DRONE],
    drawDeck,
    missions: Array.from({ length: MISSION_SLOTS }, (_, i) => ({ mission: mission(i, quadrant), ships: ships[i] ?? [], awayTeam: [], underMission: [] })),
  };
}

const dispatch = (game: GameState, action: Parameters<typeof withShuffleOrders>[1]): GameState =>
  gameReducer(game, withShuffleOrders(game.table, action, game.log));
const toAwayTeam = (missionIndex: number) => ({ zone: 'missionPile', missionIndex, pile: 'awayTeam' }) as const;
const playGelnon = (t: TableState = table()) => dispatch(initialGameState(t), { type: 'move', id: 'gelnon', to: toAwayTeam(3) });
const playEnterprise = (t: TableState = table()) => dispatch(initialGameState(t), { type: 'move', id: 'ent', to: { zone: 'shipRow', missionIndex: 2 } });
const playDrone = (t: TableState = table()) => dispatch(initialGameState(t), { type: 'move', id: 'drone', to: toAwayTeam(0) });
const lastText = (game: GameState) => logEntryText(game.log[game.log.length - 1]);
const ids = (cards: CardInstance[]) => cards.map((c) => c.id);
const model = (name: string) => playModelOf(name)!;
const passing = (name: string, cards: CardInstance[] = DECK) => cards.filter((c) => downloadTakes(downloadOf(model(name)), c.card)).map((c) => c.id);

describe('the download-to-a-place models (#1811)', () => {
  it('each title, its *VP too, is a "may" download', () => {
    for (const name of ['Gelnon Aloof Tactician', 'U.S.S. Enterprise Where She Belongs *VP', 'Reconnaissance Drone']) {
      const m = model(name);
      expect(stepOf(m.steps, 'download')?.to.kind).not.toBe('hand');
      expect(stageSummary(m)).toEqual([{ step: 'download', may: true }]);
    }
    expect(stepOf(model('Gelnon Aloof Tactician *VP').steps, 'download')?.to).toEqual({ kind: 'aboardShip', affiliation: 'dominion', text: 'your [Dom] ship' });
  });

  it('the tests: a Jem\'Hadar, a [TOS] personnel of cost 4 or more, a non-Drone personnel', () => {
    expect(passing('Gelnon Aloof Tactician')).toEqual(['jh']);
    expect(passing('U.S.S. Enterprise Where She Belongs')).toEqual(['k5']);
    expect(passing('Reconnaissance Drone')).toEqual(['jh', 'k5', 'k3']);
  });

  it("Gelnon's condition: each non-headquarters mission is an [AQ] mission", () => {
    const met = pendingPlayEffectOf(playGelnon())!;
    expect(playConditionLine(met.model, met.condition!)).toBe('Condition met: each of your non-headquarters missions is an [AQ] mission');
    expect(pendingPlayEffectOf(playGelnon(table('g')))?.condition?.status).toBe('notMet');
  });

  it("Gelnon's ships are the [Dom] ships, his mission's first; the Enterprise's only itself", () => {
    const gelnon = playGelnon();
    expect(ids(downloadPlaceShipsOf(gelnon.table, pendingPlayEffectOf(gelnon)!, stepOf(model('Gelnon Aloof Tactician').steps, 'download')!.to))).toEqual(['dom3', 'dom0']);
    const ent = playEnterprise();
    expect(ids(downloadPlaceShipsOf(ent.table, pendingPlayEffectOf(ent)!, stepOf(model('U.S.S. Enterprise Where She Belongs').steps, 'download')!.to))).toEqual(['ent']);
  });
});

describe('the download-to-a-place step (#1811)', () => {
  it('Gelnon places a Jem\'Hadar aboard the chosen [Dom] ship, shuffled in the carried order, one entry, one undo', () => {
    const start = playGelnon();
    const before = start.undo[start.undo.length - 1];
    const action = withShuffleOrders(start.table, { type: 'effectStep', ids: ['jh'], shipId: 'dom0' }, start.log);
    expect([...(action as { order: string[] }).order].sort()).toEqual(['d1', 'ev', 'k3', 'k5']);
    const done = gameReducer(start, { type: 'effectStep', ids: ['jh'], shipId: 'dom0', order: ['ev', 'k3', 'd1', 'k5'] });
    expect(done.log).toHaveLength(1);
    expect(ids(done.table.missions[0].ships[0].crew ?? [])).toEqual(['jh']);
    expect(ids(done.table.drawDeck)).toEqual(['ev', 'k3', 'd1', 'k5']);
    expect(pendingPlayEffectOf(done)).toBeNull();
    expect(lastText(done)).toBe('Played Gelnon Aloof Tactician at Mission 3 (cost 3); downloaded Card jh, shuffled the draw deck, placed it aboard Ship dom0');
    expect(isLogEntry(JSON.parse(JSON.stringify(done.log[0])))).toBe(true);
    expect(gameReducer(done, { type: 'undo' }).table).toBe(before);
  });

  it('Gelnon refuses a ship that is not a [Dom] ship, and a card the test does not allow', () => {
    const start = playGelnon();
    expect(gameReducer(start, { type: 'effectStep', ids: ['jh'], shipId: 'fed1' })).toBe(start);
    expect(gameReducer(start, { type: 'effectStep', ids: ['jh'] })).toBe(start);
    expect(gameReducer(start, { type: 'effectStep', ids: ['k5'], shipId: 'dom0' })).toBe(start);
    expect(gameReducer(start, { type: 'effectStep', ids: ['jh', 'jh'], shipId: 'dom0' })).toBe(start);
  });

  it('the Enterprise plays a [TOS] personnel of cost 5 aboard itself at cost 1, in the same entry, one undo for both', () => {
    const start = playEnterprise();
    const before = start.undo[start.undo.length - 1];
    const done = dispatch(start, { type: 'effectStep', ids: ['k5'], shipId: 'ent' });
    expect(done.log).toHaveLength(1);
    expect(ids(done.table.missions[2].ships[0].crew ?? [])).toEqual(['k5']);
    expect(done.table.drawDeck).toHaveLength(4);
    expect(lastText(done)).toBe(
      'Played U.S.S. Enterprise Where She Belongs at Mission 2 (cost 7, U.S.S. Enterprise Where She Belongs: you may play it at cost −4); downloaded Card k5, shuffled the draw deck; Card k5 to the crew of U.S.S. Enterprise Where She Belongs (cost 1, U.S.S. Enterprise Where She Belongs: played aboard this ship at cost −4)'
    );
    expect(segmentCounters(done.log)).toEqual({ cards: 8, draws: 0 });
    expect(entryCharges(done.log, 0).map((c) => [c.card, c.cost])).toEqual([
      ['U.S.S. Enterprise Where She Belongs', 7],
      ['Card k5', 1],
    ]);
    expect(pendingPlayEffectOf(done)).toBeNull();
    const undone = gameReducer(done, { type: 'undo' });
    expect(undone.table).toBe(before);
    expect(undone.log).toHaveLength(0);
  });

  it('after a correction of its charge, the Enterprise\'s step and second play are one new entry, one undo', () => {
    const corrected = dispatch(playEnterprise(), { type: 'correctCharge', target: { entry: 0, move: 0, card: 0 }, cost: 3 });
    const done = dispatch(corrected, { type: 'effectStep', ids: ['k5'], shipId: 'ent' });
    expect(done.log).toHaveLength(3);
    expect(lastText(done)).toBe(
      'U.S.S. Enterprise Where She Belongs: downloaded Card k5, shuffled the draw deck; played Card k5 to the crew of U.S.S. Enterprise Where She Belongs (cost 1, U.S.S. Enterprise Where She Belongs: played aboard this ship at cost −4)'
    );
    expect(pendingPlayEffectOf(done)).toBeNull();
    expect(segmentCounters(done.log)?.cards).toBe(8);
    const undone = gameReducer(done, { type: 'undo' });
    expect(undone.table).toBe(corrected.table);
    expect(stageName(pendingPlayEffectOf(undone))).toBe('download');
  });

  it("the Enterprise's cost choice, which ignores its next ability, ends the download", () => {
    const start = playEnterprise();
    const source = entryCharges(start.log, 0)[0].source!;
    expect(source.choice).toBeDefined();
    const ignored = dispatch(start, { type: 'correctCharge', target: { entry: 0, move: 0, card: 0 }, cost: 3, source: source.title });
    expect(pendingPlayEffectOf(ignored)).toBeNull();
  });

  it('Reconnaissance Drone puts the card on top of the draw deck, after the shuffle', () => {
    const start = playDrone();
    const action = withShuffleOrders(start.table, { type: 'effectStep', ids: ['k3'] }, start.log);
    expect([...(action as { order: string[] }).order].sort()).toEqual(['d1', 'ev', 'jh', 'k5']);
    const done = gameReducer(start, { type: 'effectStep', ids: ['k3'], order: ['ev', 'jh', 'd1', 'k5'] });
    expect(ids(done.table.drawDeck)).toEqual(['k3', 'ev', 'jh', 'd1', 'k5']);
    expect(done.log).toHaveLength(1);
    expect(lastText(done)).toContain('; downloaded Card k3, shuffled the draw deck, placed it on top of the draw deck');
    expect(gameReducer(start, { type: 'effectStep', ids: ['d1'] })).toBe(start);
  });

  it('Skip leaves the draw deck as it was', () => {
    for (const start of [playGelnon(), playEnterprise(), playDrone()]) {
      const skipped = dispatch(start, { type: 'effectSkip' });
      expect(skipped.log).toHaveLength(1);
      expect(skipped.table.drawDeck).toBe(start.table.drawDeck);
      expect(pendingPlayEffectOf(skipped)).toBeNull();
    }
  });

  it('no match: nothing to download, and Skip still ends it', () => {
    const start = playEnterprise(table('a', DECK.filter((c) => c.id !== 'k5')));
    expect(gameReducer(start, { type: 'effectStep', ids: ['k3'], shipId: 'ent' })).toBe(start);
    expect(pendingPlayEffectOf(dispatch(start, { type: 'effectSkip' }))).toBeNull();
  });
});

describe('the download-to-a-place panel (#1811)', () => {
  const renderStep = (ships: CardInstance[] | undefined, cards: CardInstance[], onDownload = jest.fn()) =>
    render(
      <DndContext>
        <ResolvingPanel
          instance={GELNON}
          hidden={false}
          escapeActive={false}
          onViewTable={jest.fn()}
          step={{ step: 'downloadCards', cards, max: 1, testText: "a Jem'Hadar", placeText: 'and place it aboard your [Dom] ship', ...(ships ? { ships } : {}), onDownload }}
          played={{ text: "You may download a Jem'Hadar and place it aboard your [Dom] ship.", condition: 'Condition met: …', started: false, endable: true, skippable: true, onEnd: jest.fn() }}
        />
      </DndContext>
    );

  it('picks a card and a ship, the first ship at first', () => {
    const onDownload = jest.fn();
    renderStep([ship('dom3', 'dominion'), ship('dom0', 'dominion')], [DECK[0]], onDownload);
    fireEvent.click(screen.getAllByTestId('download-choice-card')[0]);
    expect(screen.getAllByTestId('resolve-download-ship')[0]).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getAllByTestId('resolve-download-ship')[1]);
    fireEvent.click(screen.getByTestId('resolve-download-cards'));
    expect(onDownload).toHaveBeenCalledWith(['jh'], 'dom0');
  });

  it('says so when the player has no ship to place it aboard', () => {
    renderStep([], [DECK[0]]);
    expect(screen.getByTestId('resolve-download-no-ship')).toBeInTheDocument();
    expect(screen.queryByTestId('resolve-download-cards')).toBeNull();
  });

  it('a place with no ship downloads with no ship id', () => {
    const onDownload = jest.fn();
    renderStep(undefined, [DECK[1]], onDownload);
    fireEvent.click(screen.getAllByTestId('download-choice-card')[0]);
    fireEvent.click(screen.getByTestId('resolve-download-cards'));
    expect(onDownload).toHaveBeenCalledWith(['k5']);
  });
});
