// Issue #1588: the Resolve of the revealed dilemma, from the reveal snapshot's group: the preview, the
// random picks of a press, and the player's own moves.
import { NOT_ROLLED, PileResolveWhere, pileResolveOf, pileRevealPicksOf } from '../../../../lib/dilemmaBot/pile/resolve';
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

/**
 * The Resolve of `title`. `roll`: the reveal rolls the random selects with a random function that returns
 * it every time (#1628), and the Resolve plays that kept roll; `revealPicks` gives the kept roll itself.
 */
function resolve(
  title: string,
  moved: Record<string, PileResolveWhere> = {},
  press: { roll?: number; revealPicks?: string[][]; selected?: string[] } = {},
  overrides: Partial<PileTableInput> = {},
  skills?: string[],
) {
  const { attempt, personnelIds } = setup(overrides, skills);
  const { roll, ...rest } = press;
  const revealPicks = roll === undefined ? rest.revealPicks : pileRevealPicksOf(row(title), attempt, { personnelIds, rand: () => roll });
  return pileResolveOf(row(title), attempt, { personnelIds, snapshotIds: IDS, where: whereOf(moved), ...rest, ...(revealPicks ? { revealPicks } : {}) });
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

  it('names the random kill the reveal kept, and kills exactly those (#1628)', () => {
    // Each roll takes the first personnel left.
    const r = resolve('Environmental Contaminants', {}, { roll: 0 });
    if (!r.resolvable) throw new Error(r.reason);
    expect(r.preview).toBe('Selected Alpha, Beta; kills Alpha, Beta');
    expect(r.changes).toEqual([{ op: 'kill', ids: ['card-1', 'card-2'] }]);
    expect(r.steps).toEqual({ selects: [['card-1', 'card-2']], checks: [] });
    expect(r.preview).not.toContain('random');
  });

  it('counts a selected personnel the player already discarded as done, and kills the other one', () => {
    const r = resolve('Environmental Contaminants', { 'card-2': { at: 'zone', zone: 'discard' } }, { revealPicks: [['card-2', 'card-4']] });
    if (!r.resolvable) throw new Error(r.reason);
    expect(r.preview).toBe('Selected Beta, Delta; kills Beta, Delta; 1 of 2 already killed');
    expect(r.changes).toEqual([{ op: 'kill', ids: ['card-4'] }]);
    expect(r.done).toEqual([{ op: 'kill', done: 1, of: 2 }]);
  });

  it('gives no Resolve for a random selection with no kept roll (#1628)', () => {
    expect(resolve('Environmental Contaminants')).toEqual({ resolvable: false, reason: NOT_ROLLED });
    expect(resolve('Becalmed')).toEqual({ resolvable: false, reason: NOT_ROLLED });
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
      const r = resolve(title, {}, { roll: 0 }, overrides);
      if (!r.resolvable) throw new Error(`${title}: ${r.reason}`);
      return r.changes.map((c) => c.op);
    };
    expect(ops('Space Seed')).toEqual(['brig']);
    expect(ops('Soul Searching')).toEqual(['holdInCore']);
    expect(ops('Standing Trial', { score: 5 })).toEqual(['returnToHand']);
    expect(ops('Frozen by Fear')).toEqual(['remove']);
  });

  it('counts an op as done where the card already is, and a card moved elsewhere goes by the table', () => {
    // The reveal selected the two personnel the player then moved by hand.
    const r = resolve('Space Seed', { 'card-1': { at: 'zone', zone: 'botBrig' }, 'card-2': { at: 'zone', zone: 'hand' } }, { roll: 0 });
    if (!r.resolvable) throw new Error(r.reason);
    expect(r.steps?.selects).toEqual([['card-1', 'card-2']]);
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
  const covert = (moved: Record<string, PileResolveWhere> = {}, press: { selected?: string[] } = {}) =>
    resolve('Covert Extraction', moved, press, { mission: spaceMission, missions: [{ mission: spaceMission }] }, COVERT);

  it('is pending with no selection: it reads the task, names nobody, and has no changes', () => {
    for (const press of [{}, { selected: [] }]) {
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
    }
  });

  it('takes a candidate stopped by hand as the choice, with no selection', () => {
    const r = covert({ 'card-3': { at: 'row', stopped: true } });
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
    expect(resolve('A Pattern of Lies')).toEqual({ resolvable: false, reason: NOT_ROLLED });
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
      resolve: () =>
        pileResolveOf(row('A Pattern of Lies'), attempt, { personnelIds, snapshotIds: IDS, where: whereOf(moved), selected, ...(picks ? { revealPicks: picks } : {}) }),
    };
  }

  it('rolls the select of A Pattern of Lies with the random function, and nothing for a title with no select', () => {
    const { attempt, personnelIds } = pattern(undefined);
    expect(pileRevealPicksOf(row('A Pattern of Lies'), attempt, { personnelIds, rand: () => 0 })).toEqual([['card-1', 'card-2', 'card-3']]);
    expect(pileRevealPicksOf(row('A Pattern of Lies'), attempt, { personnelIds, rand: () => 0.99 })).toEqual([['card-4', 'card-3', 'card-2']]);
    expect(pileRevealPicksOf(row('Well-Prepared Defenses'), attempt, { personnelIds, rand: () => 0 })).toBeUndefined();
  });

  it('names the kept set and the task, and stays pending until a personnel of the set is selected', () => {
    const picks = [['card-1', 'card-2', 'card-3']];
    const r = pattern(picks).resolve();
    expect(r).toEqual({ resolvable: true, preview: 'Selected Alpha, Beta, Gamma; choose 1 to be stopped', changes: [], done: [], byTable: [], pending: { candidates: ['card-1', 'card-2', 'card-3'] } });
    expect(pattern(picks, ['card-4']).resolve()).toMatchObject({ pending: expect.anything(), changes: [] });
    const chosen = pattern(picks, ['card-3']).resolve();
    if (!chosen.resolvable) throw new Error(chosen.reason);
    expect(chosen.pending).toBeUndefined();
    expect(chosen.changes).toEqual([{ op: 'stop', ids: ['card-3'] }]);
    expect(chosen.preview).toBe('Selected Alpha, Beta, Gamma; stops Gamma');
    expect(chosen.steps?.selects).toEqual(picks);
  });

  it('names the definite result when the roll leaves no choice: all three of one species are stopped', () => {
    const r = pattern([['card-1', 'card-2', 'card-4']], [], ['Human', 'Human', 'Vulcan', 'Human']).resolve();
    if (!r.resolvable) throw new Error(r.reason);
    expect(r.pending).toBeUndefined();
    expect(r.preview).toBe('Selected Alpha, Beta, Delta; stops Alpha, Beta, Delta');
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

// Issue #1628: every random selection of the dilemma's own play rolls at the reveal, and the preview goes
// step by step: the selection, the check on each selected personnel, and the result.
describe('every random selection rolls at the reveal, and the preview names each step (#1628)', () => {
  const rollOf = (title: string, overrides: Partial<PileTableInput> = {}) => {
    const { attempt, personnelIds } = setup(overrides);
    return pileRevealPicksOf(row(title), attempt, { personnelIds, rand: () => 0 });
  };

  it('rolls for Becalmed, stopRandom, killRandom and selectEachWithout titles', () => {
    expect(rollOf('Becalmed')).toEqual([['card-1', 'card-2', 'card-3']]);
    expect(rollOf('Cutting Remark')).toEqual([['card-1']]);
    expect(rollOf('Contaminating a Culture')).toEqual([['card-1']]);
    expect(rollOf('Temptation')).toEqual([['card-1', 'card-2', 'card-3']]);
  });

  it('rolls nothing for a title with no select, selectUntil, or Chula: The Game', () => {
    expect(rollOf('Well-Prepared Defenses')).toBeUndefined();
    expect(rollOf('Inquest', { mission: spaceMission, missions: [{ mission: spaceMission }] })).toBeUndefined();
    expect(rollOf('Chula: The Game')).toBeUndefined();
  });

  // Gamma has Strength 7, the only attribute above 6.
  const strong = (overrides: Partial<PileTableInput> = {}) => ({
    cards: NAMES.map((name, i) => ({ card: { ...person(name), ...(i === 2 ? { strength: 7 } : {}) }, id: IDS[i] })),
    ...overrides,
  });
  const becalmed = (revealPicks: string[][], moved: Record<string, PileResolveWhere> = {}) => resolve('Becalmed', moved, { revealPicks }, strong());

  it('names the three Becalmed selected, the one who meets the check, and stops exactly that one', () => {
    const r = becalmed([['card-1', 'card-3', 'card-4']]);
    if (!r.resolvable) throw new Error(r.reason);
    expect(r.preview).toBe('Selected Alpha, Gamma, Delta; Gamma has Integrity, Cunning or Strength > 6: stops Gamma');
    expect(r.changes).toEqual([{ op: 'stop', ids: ['card-3'] }]);
    expect(r.steps).toEqual({
      selects: [['card-1', 'card-3', 'card-4']],
      checks: [{ ids: ['card-1', 'card-3', 'card-4'], met: ['card-3'], text: 'Integrity, Cunning or Strength > 6' }],
    });
    // The same kept roll gives the same Resolve every time: the preview is what the press applies.
    expect(becalmed([['card-1', 'card-3', 'card-4']])).toEqual(r);
  });

  it('reads "none has …: no effect" when no selected personnel meets the check', () => {
    const r = becalmed([['card-1', 'card-2', 'card-4']]);
    if (!r.resolvable) throw new Error(r.reason);
    expect(r.preview).toBe('Selected Alpha, Beta, Delta; none has Integrity, Cunning or Strength > 6: no effect');
    expect(r.changes).toEqual([]);
  });

  it('keeps the selection when the player stops a selected personnel by hand after the reveal', () => {
    const r = becalmed([['card-1', 'card-3', 'card-4']], { 'card-3': { at: 'row', stopped: true } });
    if (!r.resolvable) throw new Error(r.reason);
    expect(r.preview).toBe('Selected Alpha, Gamma, Delta; Gamma has Integrity, Cunning or Strength > 6: stops Gamma; 1 of 1 already stopped');
    expect(r.changes).toEqual([]);
    expect(r.done).toEqual([{ op: 'stop', done: 1, of: 1 }]);
  });

  it('names the personnel killRandom(1) kills, never "1 random personnel"', () => {
    const r = resolve('Contaminating a Culture', {}, { revealPicks: [['card-2']] });
    if (!r.resolvable) throw new Error(r.reason);
    expect(r.preview).toBe('Selected Beta; kills Beta');
    expect(r.changes).toEqual([{ op: 'kill', ids: ['card-2'] }]);
  });

  it('names the check of a selectEachWithout title, and stops the ones who fail it', () => {
    // Temptation: each of three selected without Honor or Treachery is stopped. Beta has Honor.
    const r = resolve('Temptation', {}, { revealPicks: [['card-1', 'card-2', 'card-3']] }, {}, ['Physics', 'Honor', 'Physics', 'Physics']);
    if (!r.resolvable) throw new Error(r.reason);
    expect(r.preview).toBe('Selected Alpha, Beta, Gamma; Beta has Honor or Treachery: stops Alpha, Gamma');
    expect(r.changes).toEqual([{ op: 'stop', ids: ['card-1', 'card-3'] }]);
  });
});
