// Missions 3/3 (#1909): a kill step and replaced requirements. Ba'ku Planet Collect Metaphasic Particles kills up
// to three of the player's [NA] Honor personnel at it and scores 5 for each; Gelyan Moon Harness Omega Particle and
// Rura Penthe Escape Gulag replace their requirements during an attempt by [Fed] or [Kli] personnel. Every
// personnel is invented.
import { pileTableInputOf } from '../../../app/decks/practice/attempt';
import { completionBatch, completionEffectOf, killActions, killCandidates } from '../../../app/decks/practice/completionEffects';
import { gameEventsOf } from '../../../app/decks/practice/gameEvents';
import { gameReducer, initialGameState, logEntryText, withShuffleOrders, type GameAction, type GameState } from '../../../app/decks/practice/gameLog';
import { initialTableState, MISSION_SLOTS, type CardInstance, type MissionSlot, type TableState } from '../../../app/decks/practice/tableReducer';
import { kill, scorePerPick, scorePoints, stagesOf } from '../../../lib/effectSteps';
import { abilityOf, missionModelOf } from '../../../lib/missionModels';
import { addedRequirements, parsedRequirementsOf, replacedRequirementsOf, requirementTextsOf } from '../../../lib/requirementRules';

jest.mock('posthog-js', () => ({ capture: jest.fn() }));

const card = (name: string, type: string, extra: Record<string, string> = {}): Record<string, string> & { originalName: string } => ({ name: name.toLowerCase(), originalName: name, type, ...extra });
const inst = (id: string, name: string, type = 'personnel', extra: Record<string, string> = {}, more: Partial<CardInstance> = {}): CardInstance => ({
  id,
  card: card(name, type, extra),
  face: 'up',
  ...more,
});
const mission = (id: string, name: string, missiontype: string, extra: Record<string, string> = {}) => inst(id, name, 'mission', { missiontype, ...extra });
const slots = (overrides: Partial<MissionSlot>[] = []): MissionSlot[] =>
  Array.from({ length: MISSION_SLOTS }, (_, i) => ({ mission: null, ships: [], awayTeam: [], underMission: [], ...overrides[i] }));
const table = (overrides: Partial<TableState> = {}): TableState => ({ ...initialTableState, missions: slots(), ...overrides });
const play = (state: GameState, ...actions: GameAction[]) => actions.reduce((s, a) => gameReducer(s, withShuffleOrders(s.table, a, s.log)), state);

const BAKU = "Ba'ku Planet Collect Metaphasic Particles";
const honor = (id: string, name: string, more: Partial<CardInstance> = {}) =>
  inst(id, name, 'personnel', { affiliation: 'non-aligned', skills: 'honor, leadership', cost: '3' }, more);

describe('the kill step (#1909)', () => {
  it('is a "may" of up to N with its test, and a score for each pick runs in the same stage', () => {
    const steps = [kill(3, '[NA] Honor personnel', [{ affiliations: ['non-aligned'], skills: ['honor'] }]), scorePerPick(5)];
    expect(steps[0]).toMatchObject({ kind: 'kill', upTo: 3, may: true });
    expect(stagesOf(steps)).toHaveLength(1);
    expect(scorePoints(steps[1] as { points: number; perPick?: true }, 3)).toBe(15);
    expect(scorePoints({ points: 5 }, 3)).toBe(5);
  });
});

describe("Ba'ku Planet Collect Metaphasic Particles (#1909)", () => {
  const baku = mission('m0', BAKU, 'p', { affiliation: '[dom]' });
  const vina = honor('p1', 'Vina Invented');
  const kor = honor('p2', 'Kor Invented', { stopped: true });
  const fed = inst('p3', 'Fed Honor Invented', 'personnel', { affiliation: 'federation', skills: 'honor', cost: '2' });
  const noHonor = inst('p4', 'Plain Invented', 'personnel', { affiliation: 'non-aligned', skills: 'science', cost: '2' });
  const crewman = honor('p5', 'Crewman Invented');
  const ship = inst('s1', 'Invented Ship', 'ship', { affiliation: 'non-aligned' }, { crew: [crewman] } as Partial<CardInstance>);
  const elsewhere = honor('p6', 'Elsewhere Invented');
  const start = () =>
    table({
      missions: slots([
        { mission: baku, awayTeam: [vina, kor, fed, noHonor], ships: [ship] },
        { mission: mission('m1', 'Invented Planet', 'p'), awayTeam: [elsewhere] },
      ]),
    });

  it('offers its [NA] Honor personnel at the mission, stopped or not, a crew too, and no one elsewhere', () => {
    const effect = completionEffectOf(start(), 0)!;
    expect(effect).toMatchObject({ kind: 'kill', upTo: 3, points: 5, killText: '[NA] Honor personnel' });
    expect(killCandidates(start(), 0, effect).map((c) => c.id)).toEqual(['p1', 'p2', 'p5']);
  });

  it('kills the picks and scores 5 for each, in one entry and one undo', () => {
    const t = start();
    const effect = completionEffectOf(t, 0)!;
    const before = initialGameState(t);
    const after = play(before, completionBatch(0, killActions(['p1', 'p5'], effect)));
    expect(after.table.missions[0].completed).toBe(true);
    expect(after.table.discard.map((c) => c.id)).toEqual(['p1', 'p5']);
    expect(after.table.score).toBe(10);
    expect(after.log).toHaveLength(1);
    const entry = after.log[0];
    expect(entry.kind === 'missionCompleted' && entry.effect?.killed).toEqual(['Vina Invented', 'Crewman Invented']);
    expect(logEntryText(entry)).toBe(`Completed ${BAKU}: killed Vina Invented and Crewman Invented; scored 10 points`);
    const undone = gameReducer(after, { type: 'undo' });
    expect(undone.table).toEqual(t);
    expect(undone.log).toHaveLength(0);
  });

  it('reads the kills as killed game events, by no dilemma', () => {
    const after = play(initialGameState(start()), completionBatch(0, killActions(['p1'], completionEffectOf(start(), 0)!)));
    const events = gameEventsOf(after.log[0], after.table);
    expect(events.map((e) => e.kind)).toEqual(['missionCompleted', 'killed']);
    expect(events[1]).toMatchObject({ kind: 'killed', byDilemma: false, cards: [{ id: 'p1', name: 'Vina Invented' }] });
  });

  it('completes with no effect on a Skip', () => {
    const after = play(initialGameState(start()), completionBatch(0, []));
    expect(after.table.missions[0].completed).toBe(true);
    expect(after.table.score).toBe(0);
    expect(logEntryText(after.log[0])).toBe(`Marked ${BAKU} complete`);
  });
});

describe('replaced requirements (#1909)', () => {
  const gelyan = card('Gelyan Moon Harness Omega Particle', 'mission', { missiontype: 'p', affiliation: '[bor][na]', skills: 'Anthropology, Biology, Exobiology, and Cunning>36' });
  const rura = card('Rura Penthe Escape Gulag', 'mission', { missiontype: 'p', affiliation: 'any affiliation (except [kli]) may attempt this mission.', skills: 'Honor, Security, and Strength>36' });
  const crescent = card('Crescent Nebula Take Out the Trash', 'mission', { missiontype: 's', affiliation: '[fed]', skills: 'Leadership' });

  it('are rows of the mission registry', () => {
    expect(abilityOf(missionModelOf(gelyan.originalName), 'requirements')?.requirements).toMatchObject({ kind: 'replace', icon: '[fed]', affiliation: 'federation' });
    expect(abilityOf(missionModelOf(rura.originalName), 'requirements')?.requirements).toMatchObject({ kind: 'replace', icon: '[kli]', affiliation: 'klingon' });
  });

  it('replace the requirements only when every attempting personnel is of the affiliation', () => {
    expect(replacedRequirementsOf(gelyan, ['federation', 'federation/bajoran'])).toBe(
      'Engineer, Medical, Officer, Physics, Science, Security, Transporters, and Cunning>48'
    );
    expect(replacedRequirementsOf(gelyan, ['federation', 'borg'])).toBeUndefined();
    expect(replacedRequirementsOf(gelyan, [])).toBeUndefined();
    expect(replacedRequirementsOf(rura, ['klingon'])).toBe('Geology, Officer, Security, and Strength>28');
    expect(replacedRequirementsOf(crescent, ['federation'])).toBeUndefined();
  });

  it("add nothing to the other missions, and Crescent Nebula's Intelligence still reaches them", () => {
    expect(addedRequirements([gelyan, rura, crescent])).toEqual([['Intelligence'], ['Intelligence'], []]);
    expect(requirementTextsOf([gelyan])).toEqual([gelyan.skills]);
  });

  it('show in the deck builder as one more branch, Crescent Nebula added to every branch', () => {
    const [parsed] = parsedRequirementsOf([gelyan]);
    expect(parsed.orBranches).toHaveLength(2);
    // No skill is in both branches.
    expect(parsed.mandatory).toEqual({});
    expect(parsed.orBranches![0]).toEqual({ anthropology: 1, biology: 1, exobiology: 1 });
    expect(Object.keys(parsed.orBranches![1]).sort()).toEqual(['engineer', 'medical', 'officer', 'physics', 'science', 'security', 'transporters']);
    const [withNebula] = parsedRequirementsOf([gelyan, crescent]);
    expect(withNebula.mandatory).toEqual({ intelligence: 1 });
    // A mission with no replacement parses as before.
    expect(parsedRequirementsOf([crescent])[0]).toEqual({ mandatory: { leadership: 1 }, orBranches: null });
  });

  it("feed the bot the replacement during an attempt by the mission's affiliation", () => {
    const moon = inst('m0', gelyan.originalName, 'mission', { missiontype: 'p', affiliation: '[bor][na]', skills: gelyan.skills });
    const fedA = inst('p1', 'Fed A Invented', 'personnel', { affiliation: 'federation' });
    const fedB = inst('p2', 'Fed B Invented', 'personnel', { affiliation: 'federation' });
    const borg = inst('p3', 'Borg Invented', 'personnel', { affiliation: 'borg' });
    const stoppedBorg = { ...borg, stopped: true };
    const at = (awayTeam: CardInstance[]) => pileTableInputOf(table({ missions: slots([{ mission: moon, awayTeam }]) }), 0).mission?.skills;
    expect(at([fedA, fedB])).toBe('Engineer, Medical, Officer, Physics, Science, Security, Transporters, and Cunning>48');
    expect(at([fedA, borg])).toBe(gelyan.skills);
    // A stopped personnel is not attempting.
    expect(at([fedA, stoppedBorg])).toBe('Engineer, Medical, Officer, Physics, Science, Security, Transporters, and Cunning>48');
  });
});
