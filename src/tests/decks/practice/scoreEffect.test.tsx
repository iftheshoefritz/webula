import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { initialTableState, CardInstance, TableState, MISSION_SLOTS, SCORE_MAX } from '../../../app/decks/practice/tableReducer';
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
import type { CommandedTraits, CostMission } from '../../../lib/costModels/model';
import { PlayConditionFacts, playConditionLine, playConditionOf, playModelOf, PlayModel, playStagesOf } from '../../../lib/playModels';
import { playModelCoverage } from '../../../lib/playModels/coverage';
import { recordStepName } from '../../../app/decks/practice/gameLog';

// The stages of a model as the record names them (#1863), and whether each is a "may".
const stageSummary = (m: PlayModel) => playStagesOf(m).map((s) => ({ step: recordStepName(s.lead), may: s.may }));

// Issue #1812: the "when you play" kind "score points", with Annexation Drone, DaiMon Solok, Opaka and Kira Taban.
// With invented cards, and the real titles, the keys of their models.

const card = (id: string, row: Record<string, unknown>, extra: Partial<CardInstance> = {}): CardInstance => ({
  id,
  card: { collectorsinfo: id, imagefile: id, ...row } as CardInstance['card'],
  face: 'up',
  ...extra,
});
const personnel = (id: string, name: string, affiliation = 'borg') =>
  card(id, { type: 'personnel', name: name.toLowerCase(), originalName: name, cost: '3', affiliation });
const DRONE = personnel('drone', 'Annexation Drone');
const SOLOK = personnel('solok', 'DaiMon Solok Cargo Runner', 'ferengi');
const KIRA = personnel('kira', 'Kira Taban Husband and Father', 'bajoran');

const mission = (i: number, quadrant: string, missiontype = 'p') =>
  card(`m${i}`, { type: 'mission', name: `mission ${i}`, originalName: `Mission ${i}`, missiontype, skills: '', quadrant });

function table(quadrants: string[] = ['a', 'a', 'a', 'a', 'a'], extra: Partial<TableState> = {}): TableState {
  return {
    ...initialTableState,
    hand: [DRONE, SOLOK, KIRA],
    missions: Array.from({ length: MISSION_SLOTS }, (_, i) => ({
      mission: mission(i, quadrants[i], i === 4 ? 'h' : 'p'),
      ships: [],
      awayTeam: [],
      underMission: [],
    })),
    ...extra,
  };
}

const AWAY_TEAM = { zone: 'missionPile', missionIndex: 0, pile: 'awayTeam' } as const;
const dispatch = (game: GameState, action: Parameters<typeof withShuffleOrders>[1]): GameState =>
  gameReducer(game, withShuffleOrders(game.table, action, game.log));
const played = (id = 'drone', t: TableState = table()): GameState => dispatch(initialGameState(t), { type: 'move', id, to: AWAY_TEAM });
const lastText = (game: GameState) => logEntryText(game.log[game.log.length - 1]);
const model = (name: string) => playModelOf(name)!;

const costMission = (type: string, extra: Partial<CostMission> = {}): CostMission => ({
  completed: false,
  name: type ? 'Mission' : '',
  requirements: '',
  points: 30,
  type,
  icons: [],
  quadrant: 'a',
  dilemmasUnder: 0,
  ...extra,
});
const commanded = (affiliation: string, species: string[] = []): CommandedTraits => ({
  name: 'someone',
  affiliation,
  species,
  keywords: [],
  icons: [],
  skills: [],
});
const status = (name: string, facts: PlayConditionFacts) => playConditionOf(model(name), facts)?.status;

describe('the score models (#1812)', () => {
  it('each scores 5 points in one step that Skip may skip', () => {
    for (const name of ['Annexation Drone', 'DaiMon Solok Cargo Runner', 'Opaka Collaborator', 'Kira Taban Husband and Father']) {
      expect(model(name).steps).toEqual([{ kind: 'score', points: 5, may: true }]);
      expect(stageSummary(model(name))).toEqual([{ step: 'score', may: true }]);
    }
    expect(model('Opaka Collaborator').text).toBe('You may score 5 points.');
    expect(model('Annexation Drone').text).toBe('Score 5 points.');
  });

  it('Annexation Drone: every non-headquarters mission is an [AQ] mission', () => {
    const met = { missions: [costMission('p'), costMission('s'), costMission('h', { quadrant: 'g' }), costMission('')] };
    expect(status('Annexation Drone', met)).toBe('met');
    expect(playConditionLine(model('Annexation Drone'), playConditionOf(model('Annexation Drone'), met)!)).toBe(
      'Condition met: each of your non-headquarters missions is an [AQ] mission'
    );
    expect(status('Annexation Drone', { missions: [costMission('p'), costMission('s', { quadrant: 'd' })] })).toBe('notMet');
  });

  it('DaiMon Solok: three [Fer] personnel commanded', () => {
    const fer = commanded('ferengi');
    expect(status('DaiMon Solok Cargo Runner', { missions: [], commanded: [fer, fer, fer] })).toBe('met');
    expect(status('DaiMon Solok Cargo Runner', { missions: [], commanded: [fer, fer, commanded('bajoran')] })).toBe('notMet');
    expect(status('DaiMon Solok Cargo Runner', { missions: [] })).toBe('notMet');
  });

  it('Opaka: Bajor and no other headquarters mission', () => {
    const bajor = costMission('h', { name: 'Bajor Gift of the Prophets', cardTitle: 'bajor' });
    expect(status('Opaka Collaborator', { missions: [costMission('p'), bajor] })).toBe('met');
    expect(status('Opaka Collaborator', { missions: [bajor, costMission('h', { name: 'Cardassia Prime Hardscrabble World' })] })).toBe('notMet');
    expect(status('Opaka Collaborator', { missions: [costMission('h', { name: 'Bajoran Exosphere Deliver Evidence', cardTitle: 'bajoran exosphere' })] })).toBe('notMet');
  });

  it('Kira Taban: not checked, it needs the opponent\'s score', () => {
    const kira = model('Kira Taban Husband and Father');
    const state = playConditionOf(kira, { missions: [] })!;
    expect(state.status).toBe('unchecked');
    expect(playConditionLine(kira, state)).toBe("Condition not checked: needs the opponent's score");
  });

  it('Eris, Klaa and Brunt read the commanded species, the events and the missions', () => {
    expect(status('Eris Harbinger of the Dominion', { missions: [], commanded: [commanded('dominion', ['founder']), commanded('dominion', ['vorta'])] })).toBe('met');
    expect(status('Eris Harbinger of the Dominion', { missions: [], commanded: [commanded('dominion', ['founder'])] })).toBe('notMet');
    expect(status('Klaa Dauntless Hunter *VP', { missions: [], events: [{ title: 'Ambush', keywords: ['maneuver'] }] })).toBe('met');
    expect(status('Klaa Dauntless Hunter', { missions: [], events: [] })).toBe('notMet');
    const fer = commanded('ferengi');
    expect(status('Brunt Acting Grand Nagus', { missions: [costMission('p', { points: 40 })], commanded: [fer, fer, fer] })).toBe('met');
    expect(status('Brunt Acting Grand Nagus', { missions: [costMission('p', { points: 35 })], commanded: [fer, fer, fer] })).toBe('notMet');
  });

  it('the play-model backlog loses the score titles', () => {
    const row = (name: string) => ({ name, type: 'Personnel', gametext: 'When you play this personnel, score 5 points.' });
    const { modelled, missing } = playModelCoverage(['Annexation Drone', 'DaiMon Solok Cargo Runner', 'Opaka Collaborator', 'Kira Taban Husband and Father'].map(row));
    expect(missing).toEqual([]);
    expect(modelled).toHaveLength(4);
  });
});

describe('the score step (#1812)', () => {
  it('a play of Annexation Drone leaves its score pending with its condition met', () => {
    const game = played();
    expect(pendingPlayEffectOf(game)).toMatchObject({ id: 'drone', stage: { lead: { kind: 'score' } }, condition: { status: 'met' } });
    expect(pendingPlayEffectOf(played('drone', table(['a', 'g', 'a', 'a', 'a'])))?.condition?.status).toBe('notMet');
  });

  it('Score adds 5 points in the play\'s own entry, and one undo puts back the score and the card in the hand', () => {
    const start = played();
    const before = start.undo[start.undo.length - 1];
    const done = dispatch(start, { type: 'effectStep' });
    expect(done.table.score).toBe(5);
    expect(done.log).toHaveLength(1);
    expect(pendingPlayEffectOf(done)).toBeNull();
    expect(lastText(done)).toBe('Played Annexation Drone at Mission 0 (cost 3); scored 5 points');
    expect(isLogEntry(JSON.parse(JSON.stringify(done.log[0])))).toBe(true);

    const undone = gameReducer(done, { type: 'undo' });
    expect(undone.table).toBe(before);
    expect(undone.table.score).toBe(0);
    expect(undone.table.hand.map((c) => c.id)).toEqual(['drone', 'solok', 'kira']);
  });

  it('Skip leaves the score as it was, in one entry', () => {
    const start = played('solok');
    const skipped = dispatch(start, { type: 'effectSkip' });
    expect(skipped.table.score).toBe(0);
    expect(skipped.log).toHaveLength(1);
    expect(lastText(skipped)).toBe('Played DaiMon Solok Cargo Runner at Mission 0 (cost 3); skipped its play text (condition not met)');
  });

  it('the score clamps, and the record holds the points it added', () => {
    const done = dispatch(played('kira', table(undefined, { score: SCORE_MAX - 2 })), { type: 'effectStep' });
    expect(done.table.score).toBe(SCORE_MAX);
    expect(lastText(done)).toBe('Played Kira Taban Husband and Father at Mission 0 (cost 3); scored 2 points (condition not checked)');
  });

  it('refuses a score with no pending score effect', () => {
    const game = initialGameState(table());
    expect(gameReducer(game, { type: 'effectStep' })).toBe(game);
  });
});

describe('the score panel (#1812)', () => {
  it('shows the points and the condition, and Score calls back', () => {
    const onScore = jest.fn();
    const kira = model('Kira Taban Husband and Father');
    render(
      <DndContext>
        <ResolvingPanel
          instance={KIRA}
          hidden={false}
          escapeActive={false}
          onViewTable={jest.fn()}
          step={{ step: 'score', points: 5, onScore }}
          played={{
            text: kira.text,
            condition: playConditionLine(kira, playConditionOf(kira, { missions: [] })!),
            started: false,
            endable: true,
            skippable: true,
            onEnd: jest.fn(),
          }}
        />
      </DndContext>
    );
    expect(screen.getByTestId('resolve-condition')).toHaveTextContent("Condition not checked: needs the opponent's score");
    expect(screen.getByTestId('resolving-skip')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('resolve-score'));
    expect(onScore).toHaveBeenCalled();
  });
});
