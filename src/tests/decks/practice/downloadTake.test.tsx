import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { initialTableState, CardInstance, TableState, MISSION_SLOTS } from '../../../app/decks/practice/tableReducer';
import {
  GameState,
  gameReducer,
  initialGameState,
  isLogEntry,
  logEntryText,
  pendingPlayEffectOf,
  withShuffleOrders,
} from '../../../app/decks/practice/gameLog';
import { ResolvingPanel } from '../../../app/decks/practice/ResolvingPanel';
import { downloadTakes, DownloadTakeModel, playConditionLine, playModelOf, playStepsOf } from '../../../lib/playModels';

// Issue #1810: the "when you play" kind "download a card into hand", with Opaka Kai of Bajor, Jean-Luc Picard
// Vintner, Mavek and the other plain downloads. With invented deck cards, and the real titles, the keys of their
// models.

const card = (id: string, row: Record<string, unknown>, extra: Partial<CardInstance> = {}): CardInstance => ({
  id,
  card: { collectorsinfo: id, imagefile: id, cost: '2', ...row } as CardInstance['card'],
  face: 'up',
  ...extra,
});
const deckCard = (id: string, row: Record<string, unknown>) =>
  card(id, { name: `card ${id}`, originalName: `Card ${id}`, ...row }, { face: 'down' });
const personnel = (id: string, name: string, row: Record<string, unknown> = {}) =>
  card(id, { type: 'personnel', name: name.toLowerCase(), originalName: name, ...row });
const OPAKA = personnel('opaka', 'Opaka Kai of Bajor', { affiliation: 'bajoran', species: 'bajoran' });
const PICARD = personnel('picard', 'Jean-Luc Picard Vintner', { affiliation: 'federation', species: 'human', icons: '[stf][tng][fut]' });
const MAVEK = personnel('mavek', 'Mavek Science Officer', { affiliation: 'cardassian', species: 'cardassian' });

// The draw deck: two [Baj] personnel, three [TNG] personnel, an event and an equipment.
const DECK = [
  deckCard('b1', { type: 'personnel', affiliation: 'bajoran', species: 'bajoran' }),
  deckCard('t1', { type: 'personnel', affiliation: 'federation', icons: '[tng]' }),
  deckCard('e1', { type: 'event', keywords: 'maneuver.' }),
  deckCard('t2', { type: 'personnel', affiliation: 'federation', icons: '[cmd][tng]' }),
  deckCard('b2', { type: 'personnel', affiliation: 'bajoran', species: 'bajoran' }),
  deckCard('t3', { type: 'personnel', affiliation: 'starfleet', icons: '[tng]' }),
  deckCard('q1', { type: 'equipment' }),
];

const mission = (i: number, skills = '') =>
  card(`m${i}`, { type: 'mission', name: `mission ${i}`, originalName: `Mission ${i}`, missiontype: i === 4 ? 'h' : 'p', skills });

function table(drawDeck: CardInstance[] = DECK, skills = 'biology'): TableState {
  return {
    ...initialTableState,
    hand: [OPAKA, PICARD, MAVEK],
    drawDeck,
    missions: Array.from({ length: MISSION_SLOTS }, (_, i) => ({ mission: mission(i, skills), ships: [], awayTeam: [], underMission: [] })),
  };
}

const AWAY_TEAM = { zone: 'missionPile', missionIndex: 0, pile: 'awayTeam' } as const;
const dispatch = (game: GameState, action: Parameters<typeof withShuffleOrders>[1]): GameState =>
  gameReducer(game, withShuffleOrders(game.table, action, game.log));
const played = (id = 'opaka', t: TableState = table()): GameState => dispatch(initialGameState(t), { type: 'move', id, to: AWAY_TEAM });
const lastText = (game: GameState) => logEntryText(game.log[game.log.length - 1]);
const ids = (cards: CardInstance[]) => cards.map((c) => c.id);
const model = (name: string) => playModelOf(name) as DownloadTakeModel;
const passing = (name: string, cards: CardInstance[] = DECK) => cards.filter((c) => downloadTakes(model(name), c.card)).map((c) => c.id);

describe('the download models (#1810)', () => {
  it('Opaka downloads one [Baj] personnel, a "may"', () => {
    const opaka = model('Opaka Kai of Bajor');
    expect(opaka).toMatchObject({ kind: 'downloadTake', upTo: 1 });
    expect(playStepsOf(opaka)).toEqual([{ step: 'download', may: true }]);
    expect(passing('Opaka Kai of Bajor')).toEqual(['b1', 'b2']);
  });

  it('Picard, his *VP too, downloads up to three [TNG] personnel', () => {
    expect(model('Jean-Luc Picard Vintner *VP')).toMatchObject({ kind: 'downloadTake', upTo: 3 });
    expect(passing('Jean-Luc Picard Vintner')).toEqual(['t1', 't2', 't3']);
  });

  it('reads a title, a type, an icon, a keyword, a species and a skill', () => {
    const cards = [
      deckCard('ret', { type: 'interrupt', name: 'retaliation' }),
      deckCard('kah', { type: 'personnel', name: 'kahless the unforgettable' }),
      deckCard('kahe', { type: 'event', name: 'kahless the unforgettable' }),
      deckCard('maq', { type: 'ship', icons: '[maq]' }),
      deckCard('inf', { type: 'event', keywords: 'capture. infiltration.' }),
      deckCard('chg', { type: 'personnel', species: 'changeling' }),
      deckCard('trb', { type: 'personnel', species: 'bajoran', skills: '2 treachery leadership' }),
      deckCard('bj', { type: 'personnel', species: 'bajoran', skills: 'leadership' }),
      deckCard('hw', { type: 'equipment', keywords: 'hand weapon.' }),
    ];
    expect(passing('Niles', cards)).toEqual(['ret']);
    expect(passing('Koroth High Cleric of Boreth', cards)).toEqual(['kah']);
    expect(passing('Cal Hudson Attache to the Demilitarized Zone', cards)).toEqual(['maq']);
    expect(passing("O'Brien Founder Agent Provocateur", cards)).toEqual(['inf']);
    expect(passing('Founder Leader Forbidding Judge', cards)).toEqual(['chg']);
    expect(passing('Winn Adami Devious Manipulator', cards)).toEqual(['trb']);
    expect(passing("Chu'lak Calculating Killer", cards)).toEqual(['hw']);
    expect(passing('Kargan Rash Captain')).toEqual(['e1']);
    expect(passing('Mavek Science Officer')).toEqual(['q1']);
    expect(passing('Haakona', [deckCard('ec', { type: 'interrupt', name: 'engage cloak' }), deckCard('pu', { type: 'event', keywords: 'pursuit.' })])).toEqual(['ec', 'pu']);
  });

  it("Picard's condition: each non-headquarters mission requires Biology", () => {
    const met = pendingPlayEffectOf(played('picard'))!;
    expect(playConditionLine(met.model, met.condition!)).toBe('Condition met: each of your non-headquarters missions requires Biology');
    const notMet = pendingPlayEffectOf(played('picard', table(DECK, 'diplomacy')))!;
    expect(notMet.condition?.status).toBe('notMet');
  });

  it("Mavek's condition: another personnel at his mission who is not Cardassian", () => {
    const alone = pendingPlayEffectOf(played('mavek'))!;
    expect(playConditionLine(alone.model, alone.condition!)).toBe('Condition not met: your non-Cardassian is at this mission');
    const withOpaka = played('mavek', { ...table(), missions: table().missions.map((s, i) => (i === 0 ? { ...s, awayTeam: [OPAKA] } : s)) });
    expect(pendingPlayEffectOf(withOpaka)?.condition?.status).toBe('met');
  });
});

describe('the download step (#1810)', () => {
  it('a play of Opaka leaves it in the away team with its download pending', () => {
    const game = played();
    expect(ids(game.table.missions[0].awayTeam)).toEqual(['opaka']);
    expect(pendingPlayEffectOf(game)).toMatchObject({ id: 'opaka', step: { step: 'download' } });
  });

  it('take one: it goes to the hand, the draw deck is shuffled in the carried order, one entry, one undo', () => {
    const start = played();
    const before = start.undo[start.undo.length - 1];
    const action = withShuffleOrders(start.table, { type: 'playEffectDownload', ids: ['b2'] }, start.log);
    expect(action).toMatchObject({ type: 'playEffectDownload', ids: ['b2'] });
    const order = (action as { order: string[] }).order;
    expect([...order].sort()).toEqual(['b1', 'e1', 'q1', 't1', 't2', 't3']);
    const done = gameReducer(start, { type: 'playEffectDownload', ids: ['b2'], order: ['q1', 't3', 'b1', 'e1', 't2', 't1'] });
    expect(done.log).toHaveLength(1);
    expect(ids(done.table.hand)).toEqual(['picard', 'mavek', 'b2']);
    expect(ids(done.table.drawDeck)).toEqual(['q1', 't3', 'b1', 'e1', 't2', 't1']);
    expect(pendingPlayEffectOf(done)).toBeNull();
    expect(lastText(done)).toBe('Played Opaka Kai of Bajor at Mission 0 (cost 2); downloaded Card b2, shuffled the draw deck');
    expect(isLogEntry(JSON.parse(JSON.stringify(done.log[0])))).toBe(true);

    const undone = gameReducer(done, { type: 'undo' });
    expect(undone.table).toBe(before);
    expect(ids(undone.table.hand)).toEqual(['opaka', 'picard', 'mavek']);
    expect(ids(undone.table.drawDeck)).toEqual(ids(DECK));
  });

  it('Picard takes up to three, and no more', () => {
    const start = played('picard');
    expect(gameReducer(start, { type: 'playEffectDownload', ids: ['t1', 't2', 't3', 'b1'] })).toBe(start);
    const done = dispatch(start, { type: 'playEffectDownload', ids: ['t1', 't3'] });
    expect(ids(done.table.hand)).toEqual(['opaka', 'mavek', 't1', 't3']);
    expect(done.table.drawDeck).toHaveLength(5);
    expect(lastText(done)).toContain('; downloaded Card t1 and Card t3, shuffled the draw deck');
  });

  it('refuses a card the test does not allow, none, a repeat and a card not in the draw deck', () => {
    const start = played();
    expect(gameReducer(start, { type: 'playEffectDownload', ids: ['t1'] })).toBe(start);
    expect(gameReducer(start, { type: 'playEffectDownload', ids: [] })).toBe(start);
    expect(gameReducer(start, { type: 'playEffectDownload', ids: ['b1', 'b1'] })).toBe(start);
    expect(gameReducer(start, { type: 'playEffectDownload', ids: ['picard'] })).toBe(start);
    expect(gameReducer(start, { type: 'playEffectDownload', ids: ['b1', 'b2'] })).toBe(start);
  });

  it('Skip leaves the draw deck unshuffled, in one entry', () => {
    const start = played();
    const skipped = dispatch(start, { type: 'playEffectSkip' });
    expect(skipped.log).toHaveLength(1);
    expect(skipped.table.drawDeck).toBe(start.table.drawDeck);
    expect(pendingPlayEffectOf(skipped)).toBeNull();
    expect(lastText(skipped)).toBe('Played Opaka Kai of Bajor at Mission 0 (cost 2); skipped its play text');
  });

  it('a deck with no match still lets the player skip', () => {
    const start = played('opaka', table(DECK.filter((c) => !c.id.startsWith('b'))));
    expect(pendingPlayEffectOf(start)?.step.step).toBe('download');
    expect(gameReducer(start, { type: 'playEffectDownload', ids: ['t1'] })).toBe(start);
    expect(pendingPlayEffectOf(dispatch(start, { type: 'playEffectSkip' }))).toBeNull();
  });
});

describe('the download panel (#1810)', () => {
  const renderStep = (cards: CardInstance[], max: number, onDownload = jest.fn()) =>
    render(
      <DndContext>
        <ResolvingPanel
          instance={PICARD}
          hidden={false}
          escapeActive={false}
          onViewTable={jest.fn()}
          step={{ step: 'downloadCards', cards, max, testText: max > 1 ? 'up to three [TNG] personnel' : 'a [Baj] personnel', onDownload }}
          played={{ text: 'You may download up to three [TNG] personnel.', condition: 'Condition met: …', started: false, endable: true, skippable: true, onEnd: jest.fn() }}
        />
      </DndContext>
    );

  it('picks up to the cap and downloads them', () => {
    const onDownload = jest.fn();
    renderStep(DECK.filter((c) => c.id.startsWith('t')).concat(deckCard('t4', { type: 'personnel' })), 3, onDownload);
    expect(screen.getByTestId('resolve-download-cards')).toBeDisabled();
    const cards = screen.getAllByTestId('download-choice-card');
    cards.slice(0, 3).forEach((c) => fireEvent.click(c));
    expect(cards[3]).toBeDisabled();
    expect(screen.getByTestId('resolve-download-cards-summary')).toHaveTextContent('3 of 3 chosen');
    fireEvent.click(screen.getByTestId('resolve-download-cards'));
    expect(onDownload).toHaveBeenCalledWith(['t1', 't2', 't3']);
    expect(screen.getByTestId('resolving-skip')).toBeInTheDocument();
  });

  it('a cap of one moves the pick', () => {
    const onDownload = jest.fn();
    renderStep(DECK.filter((c) => c.id.startsWith('b')), 1, onDownload);
    const cards = screen.getAllByTestId('download-choice-card');
    fireEvent.click(cards[0]);
    fireEvent.click(cards[1]);
    fireEvent.click(screen.getByTestId('resolve-download-cards'));
    expect(onDownload).toHaveBeenCalledWith(['b2']);
  });

  it('says so when the draw deck holds no match', () => {
    renderStep([], 1);
    expect(screen.getByTestId('resolve-download-cards-none')).toHaveTextContent('No card of your draw deck is a [Baj] personnel.');
    expect(screen.queryByTestId('resolve-download-cards')).toBeNull();
  });
});
