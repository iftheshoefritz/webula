// Issue #1588: the Resolve of the revealed dilemma, from the reveal snapshot's group: the preview, the
// random picks of a press, and the player's own moves.
import { PileResolveWhere, pileResolveOf, pileRevealPicksOf } from '../../../../lib/dilemmaBot/pile/resolve';
import { modelOf } from '../../../../lib/dilemmaBot/pile/registry';
import { PileCardRow, PileTableInput, pileAttemptOf } from '../../../../lib/dilemmaBot/pile/tableAttempt';

const person = (name: string, skills = 'Physics') => ({
  type: 'personnel',
  name: name.toLowerCase(),
  originalName: name,
  skills,
  integrity: 5,
  cunning: 5,
  strength: 5,
  cost: 2,
});
const mission: PileCardRow = { type: 'mission', name: 'mission p', originalName: 'Mission p', missiontype: 'p', skills: 'Physics', points: 35, span: 3 };
const spaceMission: PileCardRow = { ...mission, missiontype: 's' };

const NAMES = ['Alpha', 'Beta', 'Gamma', 'Delta'];
const IDS = NAMES.map((_, i) => `card-${i + 1}`);

function setup(overrides: Partial<PileTableInput> = {}, skills: string[] = NAMES.map(() => 'Physics')) {
  const input: PileTableInput = {
    cards: NAMES.map((name, i) => ({ card: person(name, skills[i]), id: IDS[i] })),
    mission,
    placedOn: [],
    underMission: [],
    missions: [{ mission }],
    hand: [],
    discard: [],
    turn: 3,
    ...overrides,
  };
  return pileAttemptOf(input);
}

/** Every card in the row, unstopped, unless `moved` puts it elsewhere. */
const whereOf = (moved: Record<string, PileResolveWhere> = {}) => (id: string): PileResolveWhere => moved[id] ?? { at: 'row', stopped: false };

const row = (title: string) => ({ originalName: title });

function resolve(title: string, moved: Record<string, PileResolveWhere> = {}, press: { rand?: () => number; picks?: string[][]; selected?: string[] } = {}, overrides: Partial<PileTableInput> = {}, skills?: string[]) {
  const { attempt, personnelIds } = setup(overrides, skills);
  return pileResolveOf(row(title), attempt, { personnelIds, snapshotIds: IDS, where: whereOf(moved), ...press });
}

const nameOf = (id: string) => NAMES[IDS.indexOf(id)];

describe('pileResolveOf (#1588)', () => {
  it('names the personnel the bot chooses for Well-Prepared Defenses, and stops exactly that one', () => {
    const r = resolve('Well-Prepared Defenses');
    if (!r.resolvable) throw new Error(r.reason);
    expect(r.changes).toHaveLength(1);
    const [chosen] = r.changes[0].ids;
    expect(r.changes).toEqual([{ op: 'stop', ids: [chosen] }]);
    expect(r.preview).toBe(`Stops ${nameOf(chosen)}`);
    expect(r.done).toEqual([]);
  });

  it('gives no changes and "1 of 1 already stopped" when the player already stopped that personnel', () => {
    const first = resolve('Well-Prepared Defenses');
    if (!first.resolvable) throw new Error(first.reason);
    const chosen = first.changes[0].ids[0];
    const r = resolve('Well-Prepared Defenses', { [chosen]: { at: 'row', stopped: true } });
    if (!r.resolvable) throw new Error(r.reason);
    expect(r.changes).toEqual([]);
    expect(r.done).toEqual([{ op: 'stop', done: 1, of: 1 }]);
    expect(r.preview).toBe(`Stops ${nameOf(chosen)}; 1 of 1 already stopped`);
  });

  it('gives a count for a random kill, and a press kills the ids it rolls', () => {
    const preview = resolve('Environmental Contaminants');
    if (!preview.resolvable) throw new Error(preview.reason);
    expect(preview.preview).toBe('Kills 2 random personnel');
    // Each roll takes the first unaffected personnel left.
    const pressed = resolve('Environmental Contaminants', {}, { rand: () => 0 });
    if (!pressed.resolvable) throw new Error(pressed.reason);
    expect(pressed.changes).toEqual([{ op: 'kill', ids: ['card-1', 'card-2'] }]);
    expect(pressed.picks).toEqual([['card-1', 'card-2']]);
    expect(pressed.preview).toBe(preview.preview);
  });

  it('counts a pool personnel the player already discarded first, and rolls only 1 more, never an affected one', () => {
    const moved: Record<string, PileResolveWhere> = { 'card-3': { at: 'zone', zone: 'discard' } };
    for (const roll of [0, 0.5, 0.99]) {
      const r = resolve('Environmental Contaminants', moved, { rand: () => roll });
      if (!r.resolvable) throw new Error(r.reason);
      expect(r.picks![0][0]).toBe('card-3');
      expect(r.changes).toHaveLength(1);
      expect(r.changes[0].op).toBe('kill');
      expect(r.changes[0].ids).toHaveLength(1);
      expect(r.changes[0].ids[0]).not.toBe('card-3');
      expect(r.done).toEqual([{ op: 'kill', done: 1, of: 2 }]);
    }
  });

  it('gives the same changes again from the picks a press returned', () => {
    const pressed = resolve('Environmental Contaminants', {}, { rand: () => 0.7 });
    if (!pressed.resolvable) throw new Error(pressed.reason);
    const again = resolve('Environmental Contaminants', {}, { picks: pressed.picks });
    expect(again).toEqual(pressed);
  });

  it('gives "No effect" and no changes when the group meets the unless check', () => {
    const r = resolve('Environmental Contaminants', {}, {}, {}, ['Biology', '2 Diplomacy', '2 Science', 'Physics']);
    expect(r).toEqual({ resolvable: true, preview: 'No effect', changes: [], done: [], byTable: [], destination: 'under' });
  });

  it('gives a reason and no Resolve for a player choice, a move, a lost ship and a title the registry lacks', () => {
    expect(resolve('Chula: Pick One to Save Two')).toEqual({ resolvable: false, reason: 'the player chooses' });
    const nebula: PileCardRow = { ...spaceMission, name: 'a nebula', originalName: 'A Nebula' };
    const move = resolve('Alternatives to Fighting', {}, {}, { mission: spaceMission, missions: [{ mission: spaceMission }, { mission: nebula }] });
    expect(move.resolvable).toBe(false);
    const lose = resolve('Where No One Has Gone Before', {}, {}, { mission: spaceMission, missions: [{ mission: spaceMission }] });
    expect(lose.resolvable).toBe(false);
    expect(resolve('Not A Dilemma Anyone Printed').resolvable).toBe(false);
  });

  it('gives no Resolve when the number of personnel depends on the roll', () => {
    expect(resolve('Chula: The Precipice')).toEqual({ resolvable: false, reason: 'the number of personnel depends on the roll' });
  });

  it('gives the brig, core, hand and remove ops', () => {
    const ops = (title: string, overrides: Partial<PileTableInput> = {}) => {
      const r = resolve(title, {}, { rand: () => 0 }, overrides);
      if (!r.resolvable) throw new Error(`${title}: ${r.reason}`);
      return r.changes.map((c) => c.op);
    };
    expect(ops('Space Seed')).toEqual(['brig']);
    expect(ops('Soul Searching')).toEqual(['holdInCore']);
    expect(ops('Standing Trial', { score: 5 })).toEqual(['returnToHand']);
    expect(ops('Frozen by Fear')).toEqual(['remove']);
  });

  it('counts an op as done where the card already is, and a card moved elsewhere goes by the table', () => {
    // On the press, the two pool personnel the player moved by hand are the picks of the brig.
    const r = resolve('Space Seed', { 'card-1': { at: 'zone', zone: 'botBrig' }, 'card-2': { at: 'zone', zone: 'hand' } }, { rand: () => 0 });
    if (!r.resolvable) throw new Error(r.reason);
    expect(r.picks).toEqual([['card-1', 'card-2']]);
    expect(r.changes).toEqual([]);
    expect(r.done).toEqual([{ op: 'brig', done: 1, of: 2 }]);
    expect(r.byTable).toEqual(['card-2']);
  });

  it('puts a snapshot personnel the player moved, whom the dilemma does not touch, by the table', () => {
    const r = resolve('Environmental Contaminants', { 'card-4': { at: 'gone' } }, {}, {}, ['Biology', '2 Diplomacy', '2 Science', 'Physics']);
    if (!r.resolvable) throw new Error(r.reason);
    expect(r.byTable).toEqual(['card-4']);
  });
});

// Issue #1593: a dilemma where the player chooses resolves with the row selection.
describe('pileResolveOf with the player\'s choice (#1593)', () => {
  // Covert Extraction: "Choose a personnel who has Intelligence or Transporters to be stopped." Alpha and Gamma qualify.
  const COVERT = ['Intelligence', 'Physics', 'Transporters', 'Physics'];
  const covert = (moved: Record<string, PileResolveWhere> = {}, press: { rand?: () => number; selected?: string[] } = {}) =>
    resolve('Covert Extraction', moved, press, { mission: spaceMission, missions: [{ mission: spaceMission }] }, COVERT);

  it('is pending with no selection: it reads the task, names nobody, and has no changes', () => {
    for (const press of [{}, { rand: () => 0 }]) {
      const r = covert({}, press);
      if (!r.resolvable) throw new Error(r.reason);
      expect(r.preview).toBe('Choose 1 personnel to be stopped');
      for (const name of NAMES) expect(r.preview).not.toContain(name);
      expect(r.changes).toEqual([]);
      expect(r.pending).toEqual({ candidates: ['card-1', 'card-3'] });
    }
  });

  it('stays pending with a selected non-candidate, and stops exactly the one candidate selected', () => {
    const stray = covert({}, { selected: ['card-2'] });
    if (!stray.resolvable) throw new Error(stray.reason);
    expect(stray.pending).toBeDefined();
    expect(stray.changes).toEqual([]);
    const both = covert({}, { selected: ['card-3', 'card-2'] });
    if (!both.resolvable) throw new Error(both.reason);
    expect(both.pending).toBeDefined();
    for (const chosen of ['card-1', 'card-3']) {
      const preview = covert({}, { selected: [chosen] });
      if (!preview.resolvable) throw new Error(preview.reason);
      expect(preview.pending).toBeUndefined();
      expect(preview.changes).toEqual([{ op: 'stop', ids: [chosen] }]);
      expect(preview.preview).toBe(`Stops ${nameOf(chosen)}`);
      const pressed = covert({}, { selected: [chosen], rand: () => 0.5 });
      if (!pressed.resolvable) throw new Error(pressed.reason);
      expect(pressed.changes).toEqual([{ op: 'stop', ids: [chosen] }]);
    }
  });

  it('takes a candidate stopped by hand as the choice, with no selection', () => {
    const r = covert({ 'card-3': { at: 'row', stopped: true } }, { rand: () => 0 });
    if (!r.resolvable) throw new Error(r.reason);
    expect(r.pending).toBeUndefined();
    expect(r.changes).toEqual([]);
    expect(r.done).toEqual([{ op: 'stop', done: 1, of: 1 }]);
  });

  it('needs one of each candidate set for Pitching In', () => {
    // Alpha and Beta have Leadership; Gamma and Delta have Engineer.
    const skills = ['Leadership', 'Leadership', 'Engineer', 'Engineer'];
    const pitching = (selected: string[]) => resolve('Pitching In', {}, { selected }, {}, skills);
    const wrong = pitching(['card-1', 'card-2']);
    if (!wrong.resolvable) throw new Error(wrong.reason);
    expect(wrong.pending).toBeDefined();
    expect(wrong.changes).toEqual([]);
    expect(wrong.preview).toContain('Choose 1 personnel to be stopped');
    const right = pitching(['card-2', 'card-4']);
    if (!right.resolvable) throw new Error(right.reason);
    expect(right.pending).toBeUndefined();
    expect(right.changes).toEqual([{ op: 'stop', ids: ['card-2', 'card-4'] }]);
  });

  it('gives no Resolve for A Pattern of Lies with no kept roll, Distraction and Dramatis Personae', () => {
    expect(resolve('A Pattern of Lies')).toEqual({ resolvable: false, reason: 'the roll before the choice is not made yet' });
    expect(resolve('Distraction').resolvable).toBe(false);
    expect(resolve('Dramatis Personae').resolvable).toBe(false);
  });
});

describe('the roll before a choice, made at the reveal and kept (#1594)', () => {
  // Alpha and Beta are Human, Gamma and Delta Vulcan.
  const SPECIES = ['Human', 'Human', 'Vulcan', 'Vulcan'];
  function pattern(picks: string[][] | undefined, selected: string[] = [], species: string[] = SPECIES, moved: Record<string, PileResolveWhere> = {}) {
    const { attempt, personnelIds } = pileAttemptOf({
      cards: NAMES.map((name, i) => ({ card: { ...person(name), species: species[i] }, id: IDS[i] })),
      mission,
      placedOn: [],
      underMission: [],
      missions: [{ mission }],
      hand: [],
      discard: [],
      turn: 3,
    });
    return {
      attempt,
      personnelIds,
      resolve: (press: { rand?: () => number } = {}) =>
        pileResolveOf(row('A Pattern of Lies'), attempt, { personnelIds, snapshotIds: IDS, where: whereOf(moved), selected, ...(picks ? { revealPicks: picks } : {}), ...press }),
    };
  }

  it('marks A Pattern of Lies and the anyOfThree titles where the player chooses, and no other', () => {
    for (const title of ['A Pattern of Lies', 'New Face', 'Discommendation', 'Moral Choice']) expect(modelOf(title)?.rollsBeforeChoice).toBe(true);
    for (const title of ['So Many Enemies', 'Murder Investigation', 'Toe to Toe', 'Covert Extraction']) expect(modelOf(title)?.rollsBeforeChoice).toBeUndefined();
  });

  it('rolls the select of a marked title with the random function, and nothing for any other title', () => {
    const { attempt, personnelIds } = pattern(undefined);
    expect(pileRevealPicksOf(row('A Pattern of Lies'), attempt, { personnelIds, rand: () => 0 })).toEqual([['card-1', 'card-2', 'card-3']]);
    expect(pileRevealPicksOf(row('A Pattern of Lies'), attempt, { personnelIds, rand: () => 0.99 })).toEqual([['card-4', 'card-3', 'card-2']]);
    expect(pileRevealPicksOf(row('Covert Extraction'), attempt, { personnelIds, rand: () => 0 })).toBeUndefined();
  });

  it('names the kept set and the task, and stays pending until a personnel of the set is selected', () => {
    const picks = [['card-1', 'card-2', 'card-3']];
    const r = pattern(picks).resolve();
    expect(r).toEqual({ resolvable: true, preview: 'Selected Alpha, Beta, Gamma; choose 1 to be stopped', changes: [], done: [], byTable: [], pending: { candidates: ['card-1', 'card-2', 'card-3'] } });
    expect(pattern(picks, ['card-4']).resolve()).toMatchObject({ pending: expect.anything(), changes: [] });
    const chosen = pattern(picks, ['card-3']).resolve({ rand: () => 0.5 });
    if (!chosen.resolvable) throw new Error(chosen.reason);
    expect(chosen.pending).toBeUndefined();
    expect(chosen.changes).toEqual([{ op: 'stop', ids: ['card-3'] }]);
    expect(chosen.preview).toBe('Selected Alpha, Beta, Gamma; Stops Gamma');
    // The press plays the kept roll, never `rand`.
    expect(chosen.picks).toEqual(picks);
  });

  it('names the definite result when the roll leaves no choice: all three of one species are stopped', () => {
    const r = pattern([['card-1', 'card-2', 'card-4']], [], ['Human', 'Human', 'Vulcan', 'Human']).resolve();
    if (!r.resolvable) throw new Error(r.reason);
    expect(r.pending).toBeUndefined();
    expect(r.preview).toBe('Selected Alpha, Beta, Delta; Stops Alpha, Beta, Delta');
    expect(r.changes).toEqual([{ op: 'stop', ids: ['card-1', 'card-2', 'card-4'] }]);
  });

  it('takes a personnel of the set stopped by hand as the choice', () => {
    const r = pattern([['card-1', 'card-2', 'card-3']], [], SPECIES, { 'card-2': { at: 'row', stopped: true } }).resolve();
    if (!r.resolvable) throw new Error(r.reason);
    expect(r.pending).toBeUndefined();
    expect(r.changes).toEqual([]);
    expect(r.done).toEqual([{ op: 'stop', done: 1, of: 1 }]);
  });
});
