// Issue #1588: the Resolve of the revealed dilemma, from the reveal snapshot's group: the preview, the
// random picks of a press, and the player's own moves.
import { PileResolveWhere, pileResolveOf } from '../../../../lib/dilemmaBot/pile/resolve';
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

function resolve(title: string, moved: Record<string, PileResolveWhere> = {}, press: { rand?: () => number; picks?: string[][] } = {}, overrides: Partial<PileTableInput> = {}, skills?: string[]) {
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
    expect(r).toEqual({ resolvable: true, preview: 'No effect', changes: [], done: [], byTable: [] });
  });

  it('gives a reason and no Resolve for a player choice, a move, a lost ship and a title the registry lacks', () => {
    const firstDuty = resolve('The First Duty', {}, {}, {}, ['Honor', 'Physics', 'Physics', 'Physics']);
    expect(firstDuty).toEqual({ resolvable: false, reason: 'the player chooses' });
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
