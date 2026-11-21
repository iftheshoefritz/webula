import React from 'react';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fireEvent, render, screen } from '@testing-library/react';
import { gameReducer, GameAction, GameState, initialGameState, logEntryText, withShuffleOrders } from '../../../app/decks/practice/gameLog';
import { CardInstance, initialTableState, MISSION_SLOTS, MissionSlot, TableState } from '../../../app/decks/practice/tableReducer';
import {
  completionBatch,
  completionEffectOf,
  involvedSpecies,
  scoreActions,
  scoreHolds,
} from '../../../app/decks/practice/completionEffects';
import { CompletionEffectPanel } from '../../../app/decks/practice/CompletionEffectPanel';
import { attemptMissionRulesOf, pileTableInputOf } from '../../../app/decks/practice/attempt';
import { attemptMissionRules, CALDOS_IV_DOWNLOAD } from '../../../app/decks/practice/attemptMissions';
import { costFactsOf } from '../../../app/decks/practice/costFacts';
import { toSavedGame, fromSavedGame } from '../../../app/decks/practice/savedGame';
import { missionRequires } from '../../../lib/costModels/titles/completedMission';
import { pileAttemptOf } from '../../../lib/dilemmaBot/pile/tableAttempt';
import { pileResolveOf } from '../../../lib/dilemmaBot/pile/resolve';
import { SKILL_INDEX } from '../../../lib/dilemmaBot/requirements';
import { addedRequirements, parsedRequirementsOf, requirementTextsOf } from '../../../lib/requirementRules';
import { cardTitleOf } from '../../../lib/cardTitle';
import { DeckList } from '../../../types';

// The mission models of set 67 (60S, #1828): Cheron Aid Planetary Recovery, Crescent Nebula Take Out the
// Trash and Caldos IV Upgrade Colony, read from the card data. Every other card here is invented. The rows
// follow the card data: lowercased fields, `originalName` as printed, and `missiontype` from `Mission`.

const data = (() => {
  const [head, ...rows] = readFileSync(join(process.cwd(), 'public', 'cards_with_processed_columns.txt'), 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\t').map((cell) => cell.replace(/^"|"$/g, '')));
  return rows.map((r) => {
    const row: any = Object.fromEntries(head.map((h, i) => [h.toLowerCase(), (r[i] ?? '').toLowerCase()]));
    row.originalName = r[head.indexOf('Name')];
    if (row.type === 'mission') row.missiontype = row.mission;
    return row;
  });
})();
const rowOf = (title: string) => {
  const row = data.find((r) => cardTitleOf(r.originalName) === title);
  if (!row) throw new Error(`no card ${title}`);
  return row;
};

let next = 0;
const inst = (card: any, more: Partial<CardInstance> = {}): CardInstance => ({ id: `c${++next}`, card, face: 'up', ...more });
const invented = (name: string, type: string, extra: Record<string, string> = {}) =>
  inst({ name: name.toLowerCase(), originalName: name, type, ...extra });
const person = (name: string, species: string, more: Partial<CardInstance> = {}) =>
  inst({ name: name.toLowerCase(), originalName: name, type: 'personnel', species, affiliation: 'federation', cost: '2' }, more);
const slotsOf = (slots: Partial<MissionSlot>[]): MissionSlot[] =>
  Array.from({ length: MISSION_SLOTS }, (_, i) => ({ mission: null, ships: [], awayTeam: [], underMission: [], ...slots[i] }));
const tableOf = (slots: Partial<MissionSlot>[], extra: Partial<TableState> = {}): TableState => ({
  ...initialTableState,
  missions: slotsOf(slots),
  ...extra,
});
const play = (state: GameState, ...actions: GameAction[]) =>
  actions.reduce((s, a) => gameReducer(s, withShuffleOrders(s.table, a, s.log)), state);
const lastText = (state: GameState) => logEntryText(state.log[state.log.length - 1]);

describe('Cheron Aid Planetary Recovery (#1828)', () => {
  const cheron = () => inst(rowOf('Cheron Aid Planetary Recovery'));
  const at = (awayTeam: CardInstance[]) =>
    tableOf([{ mission: cheron(), awayTeam, involved: awayTeam.map((c) => c.id) }]);

  it('is a completion score of 5 for four different species, as the card reads', () => {
    const t = at([]);
    const effect = completionEffectOf(t, 0)!;
    expect(rowOf('Cheron Aid Planetary Recovery').gametext).toBe(effect.text.toLowerCase());
    expect(effect).toMatchObject({ kind: 'score', points: 5, minSpecies: 4 });
    expect(scoreActions(effect)).toEqual([{ type: 'adjustScore', delta: 5 }]);
  });

  it('counts a split species as one species of its own, neither half', () => {
    // Human, Vulcan and Human/Vulcan are three different species.
    expect(involvedSpecies(at([person('A', 'human'), person('B', 'vulcan'), person('C', 'human/vulcan')]), 0)).toEqual([
      'human',
      'vulcan',
      'human/vulcan',
    ]);
    // Two Human/Vulcan personnel are one species.
    expect(involvedSpecies(at([person('A', 'human/vulcan'), person('B', 'human/vulcan')]), 0)).toEqual(['human/vulcan']);
  });

  it('holds at four species and not at three; a stopped personnel is not involved', () => {
    const three = at([person('A', 'human'), person('B', 'vulcan'), person('C', 'human/vulcan')]);
    const effect = completionEffectOf(three, 0)!;
    expect(scoreHolds(three, 0, effect)).toBe(false);
    const four = at([person('A', 'human'), person('B', 'vulcan'), person('C', 'human/vulcan'), person('D', 'bajoran')]);
    expect(scoreHolds(four, 0, effect)).toBe(true);
    // An attempt in progress counts the live row: a stopped personnel is not involved.
    const live = tableOf(
      [{ mission: cheron(), awayTeam: [person('A', 'human'), person('B', 'vulcan'), person('C', 'klingon'), person('D', 'bajoran', { stopped: true })] }],
      { attempt: { missionIndex: 0, personnel: 3, subtract: 0, draw: 3, spend: 3, phase: 'face', drawn: 0 } }
    );
    expect(involvedSpecies(live, 0)).toEqual(['human', 'vulcan', 'klingon']);
  });

  it('scores 5 with the completion in one entry, which records the species, and one undo takes back both', () => {
    const t = at([person('A', 'human'), person('B', 'vulcan'), person('C', 'human/vulcan'), person('D', 'bajoran')]);
    const start: GameState = initialGameState({ ...t, score: 10 });
    const done = play(start, completionBatch(0, scoreActions(completionEffectOf(t, 0)!)));
    expect(done.table.score).toBe(15);
    expect(done.table.missions[0].completed).toBe(true);
    expect(done.log).toHaveLength(1);
    expect(done.log[0]).toMatchObject({ kind: 'missionCompleted', effect: { species: 4, scored: 5 } });
    expect(lastText(done)).toBe('Completed Cheron Aid Planetary Recovery: 4 different species involved; scored 5 points');
    const undone = play(done, { type: 'undo' });
    expect(undone.table.score).toBe(10);
    expect(undone.table.missions[0].completed).toBeFalsy();
  });

  it('a Skip, or fewer species, logs the count and no points, and the count survives a save', () => {
    const t = at([person('A', 'human'), person('B', 'vulcan'), person('C', 'human/vulcan')]);
    const done = play(initialGameState(t), { type: 'setMissionCompleted', missionIndex: 0, completed: true });
    expect(done.table.score).toBe(0);
    expect(lastText(done)).toBe('Completed Cheron Aid Planetary Recovery: 3 different species involved; no points');
    const cards = [t.missions[0].mission!, ...t.missions[0].awayTeam];
    const deck = Object.fromEntries(cards.map((c) => [c.card!.name, { count: 1, row: c.card }])) as unknown as DeckList;
    const restored = fromSavedGame(JSON.stringify(toSavedGame(done.table, deck, 'builder', undefined, undefined, done.log)), deck);
    expect(logEntryText(restored!.log[0])).toBe('Completed Cheron Aid Planetary Recovery: 3 different species involved; no points');
  });

  it('the panel offers Score 5 with four species, and says why not with fewer', () => {
    const renderPanel = (table: TableState) => {
      const onComplete = jest.fn();
      const view = render(
        <CompletionEffectPanel table={table} missionIndex={0} effect={completionEffectOf(table, 0)!} onComplete={onComplete} onClose={() => {}} />
      );
      return { onComplete, view };
    };
    const four = renderPanel(at([person('A', 'human'), person('B', 'vulcan'), person('C', 'human/vulcan'), person('D', 'bajoran')]));
    const confirm = screen.getByTestId('completion-effect-confirm') as HTMLButtonElement;
    expect(confirm.textContent).toBe('Score 5');
    expect(confirm.disabled).toBe(false);
    expect(screen.getByTestId('completion-effect-species').textContent).toBe(
      '4 different species involved: Human, Vulcan, Human/Vulcan, Bajoran.'
    );
    fireEvent.click(confirm);
    expect(four.onComplete).toHaveBeenCalledWith([{ type: 'adjustScore', delta: 5 }]);
    four.view.unmount();

    const three = renderPanel(at([person('A', 'human'), person('B', 'vulcan'), person('C', 'human/vulcan')]));
    expect((screen.getByTestId('completion-effect-confirm') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('completion-effect-species').textContent).toBe(
      'Only 3 different species were involved: Human, Vulcan, Human/Vulcan; 4 are needed.'
    );
    fireEvent.click(screen.getByTestId('completion-effect-skip'));
    expect(three.onComplete).toHaveBeenCalledWith([]);
    three.view.unmount();

    renderPanel(at([]));
    expect(screen.getByTestId('completion-effect-species').textContent).toBe('No personnel involved.');
  });
});

describe('Crescent Nebula Take Out the Trash (#1828)', () => {
  const nebula = () => rowOf('Crescent Nebula Take Out the Trash');
  const caldos = () => rowOf('Caldos IV Upgrade Colony');
  const fedMission = { name: 'fed invented', originalName: 'Fed Invented', type: 'mission', missiontype: 'p', affiliation: '[fed]', skills: 'diplomacy, law' };
  const hq = { name: 'hq invented', originalName: 'HQ Invented', type: 'mission', missiontype: 'h', affiliation: '', skills: '' };

  it('adds Intelligence to each other non-[Fed] mission with requirements, as the card reads', () => {
    expect(nebula().gametext).toBe('add intelligence to the requirements of each of your other non-[fed] missions.');
    expect(addedRequirements([nebula(), caldos(), fedMission, hq, null])).toEqual([[], ['Intelligence'], [], [], []]);
    // With no Crescent Nebula nothing changes, and two copies add it to each other, once.
    expect(addedRequirements([caldos(), fedMission])).toEqual([[], []]);
    expect(addedRequirements([nebula(), nebula(), caldos()])).toEqual([['Intelligence'], ['Intelligence'], ['Intelligence']]);
    expect(requirementTextsOf([nebula(), caldos()])[1]).toBe('Intelligence, (2 biology, engineer, geology, and integrity>36)');
  });

  it('the bot reads Intelligence in every branch of the attempted mission', () => {
    const crew = [person('A', 'human'), person('B', 'vulcan')];
    const orMission = { ...caldos(), skills: 'anthropology or law' };
    const t = tableOf([{ mission: inst(nebula()) }, { mission: inst(orMission), awayTeam: crew }]);
    const { attempt } = pileAttemptOf(pileTableInputOf(t, 1));
    expect(attempt.requirements).toHaveLength(2);
    expect(attempt.requirements.every((b) => b.skills[SKILL_INDEX.intelligence] === 1)).toBe(true);
    // Without Crescent Nebula the printed branches stand.
    const plain = pileAttemptOf(pileTableInputOf(tableOf([{}, { mission: inst(orMission), awayTeam: crew }]), 1)).attempt;
    expect(plain.requirements.every((b) => b.skills[SKILL_INDEX.intelligence] === 0)).toBe(true);
  });

  it('a dilemma that reads a skill of the mission reads Intelligence: Dead Weight spares an Intelligence personnel', () => {
    const skilled = (name: string, skills: string) =>
      inst({ name: name.toLowerCase(), originalName: name, type: 'personnel', species: 'human', affiliation: 'bajoran', cost: '2', skills, integrity: '5', cunning: '5', strength: '5' });
    const crew = [skilled('Spy', 'intelligence'), skilled('Doc', 'medical'), skilled('Bio', 'biology')];
    const resolveAt = (first: Partial<MissionSlot>) => {
      const t = tableOf([first, { mission: inst(caldos()), awayTeam: crew }]);
      const { attempt, personnelIds } = pileAttemptOf(pileTableInputOf(t, 1));
      const ids = crew.map((c) => c.id);
      const r = pileResolveOf(rowOf('Dead Weight'), attempt, { personnelIds, snapshotIds: ids, where: () => ({ at: 'row', stopped: false }) });
      if (!r.resolvable) throw new Error(r.reason);
      return r;
    };
    // With Crescent Nebula the Intelligence personnel holds a required skill, so only Doc is stopped.
    expect(resolveAt({ mission: inst(nebula()) }).preview).toMatch(/^Stops Doc\b/);
    expect(resolveAt({}).preview).toMatch(/^Stops Spy, Doc\b/);
  });

  it('the cost facts read the same requirements', () => {
    const t = tableOf([{ mission: inst(nebula()) }, { mission: inst(caldos()) }, { mission: inst(fedMission) }]);
    const missions = costFactsOf(t).missions!;
    expect(missionRequires(missions[1], 'Intelligence')).toBe(true);
    expect(missionRequires(missions[2], 'Intelligence')).toBe(false);
    expect(missionRequires(costFactsOf(tableOf([{}, { mission: inst(caldos()) }])).missions![1], 'Intelligence')).toBe(false);
  });

  it('the deck builder counts it among the skills every branch needs', () => {
    const parsed = parsedRequirementsOf([nebula(), caldos(), fedMission]);
    expect(parsed[1].mandatory.intelligence).toBe(1);
    expect(parsed[1].mandatory.biology).toBe(2);
    expect(parsed[0].mandatory.intelligence).toBe(1); // its own printed Intelligence, nothing added
    expect(parsed[2].mandatory.intelligence).toBeUndefined();
  });
});

describe('Caldos IV Upgrade Colony (#1828)', () => {
  const caldos = () => inst(rowOf('Caldos IV Upgrade Colony'));
  const candle = () => invented(CALDOS_IV_DOWNLOAD, 'equipment');
  const crew = () => [person('A', 'human'), person('B', 'vulcan')];

  it('offers the download only with no dilemma beneath it and a copy in the draw deck, as the card reads', () => {
    expect(rowOf('Caldos IV Upgrade Colony').gametext).toBe(
      'when you begin a mission attempt here, if no dilemmas are beneath this mission, you may download {howard heirloom candle}.'
    );
    const copy = candle();
    const t = tableOf([{ mission: caldos(), awayTeam: crew() }], { drawDeck: [invented('Filler', 'event'), copy] });
    const rules = attemptMissionRulesOf(t, { kind: 'awayTeam', missionIndex: 0 });
    expect(rules.offers).toEqual([
      { key: 'caldos-iv', label: `Download ${CALDOS_IV_DOWNLOAD}`, source: 'Caldos IV', draw: 0, spend: 0, downloadId: copy.id },
    ]);
    const under = { ...t, missions: slotsOf([{ ...t.missions[0], underMission: [invented('A Dilemma', 'dilemma')] }]) };
    expect(attemptMissionRulesOf(under, { kind: 'awayTeam', missionIndex: 0 }).offers).toEqual([]);
    expect(attemptMissionRules(caldos().card, crew(), { underMission: [], drawDeck: [] }).offers).toEqual([]);
  });

  it('a start with the download takes the copy into the hand and shuffles the draw deck, in one entry and one undo', () => {
    const copy = candle();
    const deck = [invented('One', 'event'), copy, invented('Two', 'event'), invented('Three', 'event')];
    const t = tableOf([{ mission: caldos(), awayTeam: crew() }], { drawDeck: deck });
    const start = initialGameState(t);
    const action = withShuffleOrders(t, { type: 'startAttempt', missionIndex: 0, personnel: 2, subtract: 0, downloadId: copy.id }, []);
    expect(action).toMatchObject({ downloadOrder: expect.any(Array) });
    const order = (action as { downloadOrder: string[] }).downloadOrder;
    const done = gameReducer(start, action);
    expect(done.table.attempt).toBeDefined();
    expect(done.table.hand.map((c) => c.id)).toEqual([copy.id]);
    expect(done.table.drawDeck.map((c) => c.id)).toEqual(order);
    expect(done.log).toHaveLength(1);
    expect(lastText(done)).toBe(
      `Attempted Caldos IV Upgrade Colony: 2 personnel − 0 = draw/spend 2 (downloaded ${CALDOS_IV_DOWNLOAD}, shuffled the draw deck)`
    );
    const undone = play(done, { type: 'undo' });
    expect(undone.table.attempt).toBeUndefined();
    expect(undone.table.drawDeck.map((c) => c.id)).toEqual(deck.map((c) => c.id));
    expect(undone.table.hand).toEqual([]);
  });
});
