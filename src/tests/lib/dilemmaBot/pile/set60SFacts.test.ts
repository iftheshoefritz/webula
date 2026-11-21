// Issue #1846: the six dilemmas of set 67, 60S, that read a new fact of the table or a new Resolve op.
// Each is played by its Resolve, with the roll the reveal keeps from a seeded random function.
import { costOf } from '../../../../lib/dilemmaBot/pile/model';
import { pileLabelOf } from '../../../../lib/dilemmaBot/pile/label';
import { REGISTRY } from '../../../../lib/dilemmaBot/pile/registry';
import { PileResolveInput, pileResolveOf, pileRevealPicksOf } from '../../../../lib/dilemmaBot/pile/resolve';
import { PileCardRow, PileTableInput, pileAttemptOf } from '../../../../lib/dilemmaBot/pile/tableAttempt';
import { seededRandom } from '../../../../lib/dilemmaBot/simulator';
import { parseRequirementBranches } from '../../../../lib/dilemmaBot/requirements';

const SIX: [string, 'planet' | 'space' | 'dual', number][] = [
  ['Crossroads', 'dual', 1], ['Interdimensional Aperture', 'space', 6], ['Stupid Cave Mission', 'planet', 6],
  ['Status Report', 'dual', 3], ['Kobayashi Maru Scenario', 'dual', 2], ['Jailbreak', 'dual', 3],
];

type Attrs = [number, number, number];
interface Crew {
  skills?: string;
  attrs?: Attrs;
}

const IDS = ['card-1', 'card-2', 'card-3', 'card-4'];
const NAMES = ['Alpha', 'Beta', 'Gamma', 'Delta'];
const missionRow = (missiontype: string, extra: Partial<PileCardRow> = {}): PileCardRow =>
  ({ type: 'mission', name: `mission ${missiontype}`, originalName: `Mission ${missiontype}`, missiontype, skills: 'Physics and Cunning>20', points: 35, span: 3, ...extra });
const event = (name: string, keywords = ''): PileCardRow => ({ type: 'event', name: name.toLowerCase(), originalName: name, keywords });
const song = (name: string): PileCardRow => ({ type: 'dilemma', name: name.toLowerCase(), originalName: name, keywords: 'song.' });

function setup(crew: Crew[], table: Partial<PileTableInput> = {}) {
  const mission = table.mission ?? missionRow('p');
  return pileAttemptOf({
    cards: crew.map(({ skills = 'Physics', attrs = [5, 5, 5] }, i) => ({
      card: { type: 'personnel', name: NAMES[i].toLowerCase(), originalName: NAMES[i], skills, keywords: '', integrity: attrs[0], cunning: attrs[1], strength: attrs[2], cost: 2 },
      id: IDS[i],
    })),
    mission,
    placedOn: [],
    underMission: [],
    missions: [{ mission }],
    hand: [],
    discard: [],
    turn: 3,
    ...table,
  });
}

const four = (crew: Crew = {}) => IDS.map(() => crew);
const strong = (n: number) => IDS.map((_, i) => ({ attrs: (i < n ? [7, 7, 7] : [5, 5, 5]) as Attrs }));

/** The Resolve of `title` with the roll the reveal keeps from `seed`. */
function resolve(title: string, crew: Crew[], table: Partial<PileTableInput> = {}, extra: Partial<PileResolveInput> = {}, seed = 3) {
  const { attempt, personnelIds } = setup(crew, table);
  const row = { originalName: title };
  const revealPicks = pileRevealPicksOf(row, attempt, { personnelIds, rand: seededRandom(seed) });
  const r = pileResolveOf(row, attempt, {
    personnelIds, snapshotIds: IDS.slice(0, crew.length), where: () => ({ at: 'row' as const, stopped: false }), ...(revealPicks ? { revealPicks } : {}), ...extra,
  });
  const label = pileLabelOf(row, attempt, { personnelIds, ...(revealPicks ? { revealPicks } : {}) });
  return { r, picks: revealPicks ?? [], label, attempt };
}

const idsOf = (r: ReturnType<typeof resolve>['r'], op: string) => (r.resolvable ? r.changes.filter((c) => c.op === op).flatMap((c) => c.ids) : []);
const sorted = (ids: string[]) => ids.slice().sort();

describe('the six dilemmas of 60S that read a new fact (#1846)', () => {
  it.each(SIX)('models %s as a %s dilemma of printed cost %d', (title, kind, cost) => {
    expect(REGISTRY.get(title)).toMatchObject({ kind, printedCost: cost, status: 'play' });
  });

  it.each([['Crossroads', 1], ['Status Report', 3], ['Kobayashi Maru Scenario', 2], ['Jailbreak', 3]] as const)('%s costs %d', (title, cost) => {
    expect(costOf(REGISTRY.get(title)!, setup(four()).attempt)).toBe(cost);
  });

  it.each(['Interdimensional Aperture', 'Stupid Cave Mission'])('%s costs 3 with nothing beneath the mission, and 6 otherwise', (title) => {
    const model = REGISTRY.get(title)!;
    expect(costOf(model, setup(four()).attempt)).toBe(3);
    expect(costOf(model, setup(four(), { underMission: [{ originalName: 'Limited Welcome' }] }).attempt)).toBe(6);
  });

  it('never labels a dilemma with its own title (#1574)', () => {
    for (const [title] of SIX) expect(resolve(title, four()).label ?? '').not.toContain(title);
  });
});

describe('Crossroads', () => {
  it('counts the bracketed affiliation icons of the attempted mission, and none for a mission any affiliation attempts', () => {
    expect(setup(four(), { mission: missionRow('p', { affiliation: '[baj][car][fed]' }) }).attempt.mission.affiliationIcons).toBe(3);
    expect(setup(four()).attempt.mission.affiliationIcons).toBeUndefined();
  });

  it('adds 2 to each attribute requirement for each icon, for the rest of the attempt, and is placed on the mission', () => {
    const { r } = resolve('Crossroads', four(), { mission: missionRow('p', { affiliation: '[baj][car][fed]' }) });
    expect(r.resolvable && r.changes).toEqual([]);
    expect(r.resolvable && r.destination).toBe('placedOn');
    expect(r.resolvable && r.modifiers?.requirements).toEqual(
      parseRequirementBranches('Physics and Cunning>26')
    );
  });

  it('changes nothing with no icon', () => {
    const { r } = resolve('Crossroads', four());
    expect(r.resolvable && r.modifiers).toBeUndefined();
    expect(r.resolvable && r.destination).toBe('placedOn');
  });
});

describe('Interdimensional Aperture and Stupid Cave Mission', () => {
  const space = missionRow('s');
  const missions = [{ mission: missionRow('p') }, { mission: missionRow('p') }, { mission: space }, { mission: missionRow('h') }];

  it('read the player\'s planet and space missions from the mission slots', () => {
    const { table } = setup(four(), { missions }).attempt;
    expect([table.planetMissions, table.spaceMissions]).toEqual([2, 1]);
  });

  it('Interdimensional Aperture stops one at random for each planet mission you command and each space mission of the bot', () => {
    const { r, picks } = resolve('Interdimensional Aperture', strong(4), { mission: space, missions, botMissions: { planet: 3, space: 1 } });
    expect(picks[0]).toHaveLength(3);
    expect(sorted(idsOf(r, 'stop'))).toEqual(sorted(picks[0]));
    expect(r.resolvable && r.destination).toBe('under');
  });

  it('Stupid Cave Mission stops one for each space mission you command and each planet mission of the bot', () => {
    const { r, picks } = resolve('Stupid Cave Mission', strong(4), { missions, botMissions: { planet: 2, space: 1 } });
    expect(picks[0]).toHaveLength(3);
    expect(sorted(idsOf(r, 'stop'))).toEqual(sorted(picks[0]));
  });

  it('count only the player\'s missions in a Chula game, with no deck behind the pile', () => {
    expect(resolve('Stupid Cave Mission', strong(4), { missions }).picks[0]).toHaveLength(1);
  });

  it.each(['Interdimensional Aperture', 'Stupid Cave Mission'])('%s stops nobody with three personnel of no attribute > 6', (title) => {
    expect(resolve(title, strong(1), { missions }).r).toMatchObject({ changes: [] });
    expect(idsOf(resolve(title, strong(2), { missions }).r, 'stop').length).toBeGreaterThan(0);
  });
});

describe('Status Report', () => {
  const missions = [
    { mission: missionRow('p'), under: [song('Major-General\'s Song'), song('Major-General\'s Song'), song('Status Report')] },
    { mission: missionRow('s'), under: [{ type: 'dilemma', originalName: 'Limited Welcome', keywords: '' }] },
  ];

  it('counts the different Song dilemmas beneath your missions', () => {
    expect(setup(four(), { missions }).attempt.table.songsUnderMissions).toBe(2);
  });

  it('lets the player choose one to be stopped for each, plus the bot\'s Song cards', () => {
    const { r } = resolve('Status Report', four(), { missions, botSongCards: 1 });
    expect(r).toMatchObject({ resolvable: true, preview: 'Choose 3 personnel to be stopped', pending: { candidates: IDS } });
    const chosen = resolve('Status Report', four(), { missions, botSongCards: 1 }, { selected: ['card-1', 'card-2', 'card-4'] }).r;
    expect(sorted(idsOf(chosen, 'stop'))).toEqual(['card-1', 'card-2', 'card-4']);
  });

  it('stops nobody with no Song card', () => {
    expect(resolve('Status Report', four()).r).toMatchObject({ resolvable: true, changes: [] });
  });
});

describe('Kobayashi Maru Scenario', () => {
  const core = [event('Ritual One', 'ritual.'), event('Plain One'), event('Plain Two'), { type: 'interrupt', originalName: 'Lucky' }];

  it('counts the non-Ritual events of the core', () => {
    expect(setup(four(), { core }).attempt.table.coreNonRitualEvents).toBe(2);
  });

  it('lets the player choose one to be killed for each, with the row selection', () => {
    expect(resolve('Kobayashi Maru Scenario', four(), { core }).r).toMatchObject({ resolvable: true, pending: { candidates: IDS } });
    const { r } = resolve('Kobayashi Maru Scenario', four(), { core }, { selected: ['card-2', 'card-3'] });
    expect(sorted(idsOf(r, 'kill'))).toEqual(['card-2', 'card-3']);
  });

  it('kills nobody with only Ritual events in the core', () => {
    expect(resolve('Kobayashi Maru Scenario', four(), { core: core.slice(0, 1) }).r).toMatchObject({ resolvable: true, changes: [] });
  });
});

describe('Jailbreak', () => {
  it('puts the two selected on top of their owner\'s draw deck, and stops the rest without Law', () => {
    const { r, picks } = resolve('Jailbreak', four({ skills: '' }));
    expect(sorted(idsOf(r, 'topOfDeck'))).toEqual(sorted(picks[0]));
    expect(sorted(idsOf(r, 'stop'))).toEqual(sorted(IDS.filter((id) => !picks[0].includes(id))));
    expect(r.resolvable && r.preview).toBe('The selected personnel do not have Physics or Cunning>13: places 2 on top of the draw deck; stops all');
  });

  it('changes nothing when the selected have Cunning>13 and the group has Law', () => {
    const { r } = resolve('Jailbreak', four({ skills: 'Law', attrs: [5, 7, 5] }));
    expect(r.resolvable && r.changes).toEqual([]);
  });

  it('puts nobody on the deck with Physics, and stops everyone without Law or 3 Security', () => {
    const { r } = resolve('Jailbreak', four());
    expect(idsOf(r, 'topOfDeck')).toEqual([]);
    expect(idsOf(r, 'stop')).toHaveLength(4);
  });
});
