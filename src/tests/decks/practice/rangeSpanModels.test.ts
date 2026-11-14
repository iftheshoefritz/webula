import { tableReducer, initialTableState, CardInstance, MISSION_SLOTS, TableState } from '../../../app/decks/practice/tableReducer';
import { gameReducer, initialGameState, logEntryText, LogEntry, withShuffleOrders } from '../../../app/decks/practice/gameLog';
import { moveSpanTotal, shipRangeOnTable, shipRangesOnTable } from '../../../app/decks/practice/shipRange';
import { rangeSpanModelOf } from '../../../app/decks/practice/rangeModels';
import { pileTitleOf } from '../../../lib/dilemmaBot/pile/registry';

// The span total of a move and a ship's Range on the table (#1635): the quadrant rule, and the card
// text of Mouth of the Wormhole, Deep Space 9, The Reman Mines and U.S.S. Pasteur, and of the models
// of #1648 below. The rows follow
// the card data: lowercased fields, and `originalName` as printed.
let next = 0;
const card = (originalName: string, type: string, extra: Record<string, string> = {}): CardInstance => ({
  id: `card-${++next}`,
  card: { name: originalName.toLowerCase(), originalName, type, imagefile: 'x', ...extra },
  face: 'up',
});

const mission = (name: string, quadrant: string, span = '2') => card(name, 'mission', { span, quadrant });
const ds9 = (suffix = '') => mission(`Mouth of the Wormhole Deep Space 9${suffix}`, 'a', '1');
const ship = (name: string, affiliation: string, range: string, crew?: CardInstance[]) => ({
  ...card(name, 'ship', { affiliation, range }),
  ...(crew ? { crew } : {}),
});
const personnel = (name: string, affiliation: string, extra: Record<string, string> = {}) =>
  card(name, 'personnel', { affiliation, ...extra });
const reman = () => personnel('Reman Soldier', 'romulan', { species: 'reman' });

const tableOf = (
  missions: (CardInstance | null)[],
  ships: CardInstance[] = [],
  extra: { awayTeam?: CardInstance[]; brig?: CardInstance[] } = {}
): TableState => ({
  ...initialTableState,
  brig: extra.brig ?? [],
  missions: Array.from({ length: MISSION_SLOTS }, (_, i) => ({
    mission: missions[i] ?? null,
    ships: i === 0 ? ships : [],
    awayTeam: i === 0 ? extra.awayTeam ?? [] : [],
    underMission: [],
  })),
});

const toRow = (id: string, missionIndex: number) => ({
  type: 'move' as const,
  id,
  to: { zone: 'shipRow' as const, missionIndex },
  cardText: true,
});
const lastText = (log: LogEntry[]) => logEntryText(log[log.length - 1]);

describe('the span total of a move (#1635)', () => {
  const s = ship('Relativity', 'federation', '8');

  it('adds 2 between two quadrants, and nothing within one', () => {
    const t = tableOf([mission('Alpha', 'a'), mission('Alpha Two', 'a', '3'), mission('Gamma', 'g'), mission('Delta', 'd')]);
    expect(moveSpanTotal(t.missions, 0, 1, s)).toBe(5);
    expect(moveSpanTotal(t.missions, 0, 2, s)).toBe(6);
    expect(moveSpanTotal(t.missions, 0, 3, s)).toBe(6);
    expect(moveSpanTotal(t.missions, 2, 3, s)).toBe(6);
  });

  it('adds no 2 for a move to or from an empty slot', () => {
    const t = tableOf([mission('Gamma', 'g'), null]);
    expect(moveSpanTotal(t.missions, 0, 1, s)).toBe(2);
    expect(moveSpanTotal(t.missions, 1, 0, s)).toBe(2);
  });

  it('adds no 2 between Mouth of the Wormhole, Deep Space 9 and a [GQ] mission, in either direction', () => {
    const t = tableOf([ds9(), mission('Gamma', 'g'), mission('Delta', 'd')]);
    expect(moveSpanTotal(t.missions, 0, 1, s)).toBe(3);
    expect(moveSpanTotal(t.missions, 1, 0, s)).toBe(3);
    expect(moveSpanTotal(t.missions, 0, 2, s)).toBe(5);
  });

  it.each([' (Promo)', ' (SR)', ' *VP', ' (MAH)'])('reads a version of Deep Space 9 the same (%s)', (suffix) => {
    const t = tableOf([ds9(suffix), mission('Gamma', 'g')]);
    expect(moveSpanTotal(t.missions, 0, 1, s)).toBe(3);
  });

  it('records the span total in rangeUsed, and one undo takes it back', () => {
    const relativity = ship('Relativity', 'federation', '8');
    const t = tableOf([mission('Alpha', 'a'), mission('Gamma', 'g')], [relativity]);
    expect(tableReducer(t, toRow(relativity.id, 1)).rangeUsed).toEqual({ [relativity.id]: 6 });
    const moved = gameReducer(initialGameState(t), toRow(relativity.id, 1));
    expect(lastText(moved.log)).toBe('Moved Relativity from Alpha to Gamma (used range 6, 2 left)');
    expect(gameReducer(moved, { type: 'undo' }).table.rangeUsed).toBeUndefined();
  });
});

describe('U.S.S. Pasteur, Medical Ship (#1635)', () => {
  const doctor = () => personnel('Doctor', 'federation', { skills: 'biology medical' });

  it('is Range +5 while a [Fed] Medical personnel is aboard, stopped or not, once however many', () => {
    const pasteur = ship('U.S.S. Pasteur Medical Ship', 'federation', '7', [doctor(), { ...doctor(), stopped: true }]);
    expect(shipRangeOnTable(tableOf([]), pasteur)).toBe(12);
  });

  it('reads the *A version the same', () => {
    expect(shipRangeOnTable(tableOf([]), ship('U.S.S. Pasteur Medical Ship *A', 'federation', '7', [doctor()]))).toBe(12);
  });

  it('gains nothing from a non-[Fed] Medical personnel, a [Fed] personnel with no Medical, or a doctor in the away team', () => {
    const pasteur = ship('U.S.S. Pasteur Medical Ship', 'federation', '7', [
      personnel('Healer', 'bajoran', { skills: 'medical' }),
      personnel('Officer', 'federation', { skills: 'leadership' }),
    ]);
    expect(shipRangeOnTable(tableOf([], [pasteur], { awayTeam: [doctor()] }), pasteur)).toBe(7);
  });

  it('reads the new Range in the log and on the card', () => {
    const pasteur = ship('U.S.S. Pasteur Medical Ship', 'federation', '7', [doctor()]);
    const t = tableOf([mission('Alpha', 'a'), mission('Beta', 'a', '3')], [pasteur]);
    const game = gameReducer(initialGameState(t), toRow(pasteur.id, 1));
    expect(lastText(game.log)).toBe('Moved U.S.S. Pasteur Medical Ship from Alpha to Beta (used range 5, 7 left)');
    expect(shipRangesOnTable(game.table, game.table.rangeUsed)).toEqual({ [pasteur.id]: 12 });
  });
});

describe('The Reman Mines (#1635)', () => {
  const remus = () => mission('Remus Supervise Dilithium Mine', 'a');
  const mines = () => card('The Reman Mines', 'event');
  const withMines = (on: CardInstance) => ({ ...on, placedOn: [mines()] });
  const warbird = (crew?: CardInstance[]) => ship('Warbird', 'romulan', '8', crew);

  it('is +1 for each Reman commanded, in a crew or an away team', () => {
    const w = warbird([reman()]);
    const t = tableOf([withMines(remus())], [w], { awayTeam: [reman()] });
    expect(shipRangeOnTable(t, w)).toBe(10);
  });

  it('stops at +3', () => {
    const w = warbird([reman(), reman(), reman()]);
    const t = tableOf([withMines(remus())], [w], { awayTeam: [reman(), reman()] });
    expect(shipRangeOnTable(t, w)).toBe(11);
  });

  it('does not count a Reman in the brig', () => {
    const w = warbird();
    const t = tableOf([withMines(remus())], [w], { brig: [reman()] });
    expect(shipRangeOnTable(t, w)).toBe(8);
  });

  it('gives nothing to a non-[Rom] ship, nor from another mission or the core', () => {
    const fed = ship('Relativity', 'federation', '8', [reman()]);
    expect(shipRangeOnTable(tableOf([withMines(remus())], [fed]), fed)).toBe(8);
    const w = warbird([reman()]);
    expect(shipRangeOnTable(tableOf([withMines(mission('Alpha', 'a')), remus()], [w]), w)).toBe(8);
    const inCore = { ...tableOf([remus()], [w]), core: [mines()] };
    expect(shipRangeOnTable(inCore, w)).toBe(8);
  });
});

describe('the registry of range and span models (#1635)', () => {
  it('finds a model by its title less the version suffix', () => {
    expect(rangeSpanModelOf(ds9(' (Promo)'))?.title).toBe('Mouth of the Wormhole Deep Space 9');
    expect(rangeSpanModelOf(mission('Mouth of the Wormhole Terok Nor', 'a'))).toBeUndefined();
  });

  it('keeps the dilemma titles as before', () => {
    expect(pileTitleOf('Sylvia *VP')).toBe('Sylvia');
    expect(pileTitleOf('"Rapid Progress"')).toBe('Rapid Progress');
  });
});

// The models of #1648. Each one checks its condition met and not met, and a move whose `rangeUsed`
// and the log's "left" agree.
const crewOf = (n: number, extra: Record<string, string> = {}) =>
  Array.from({ length: n }, (_, i) => personnel(`Crew ${i}`, 'federation', extra));
const moveAgrees = (t: TableState, s: CardInstance, to: number, used: number, left: number) => {
  const game = gameReducer(initialGameState(t), toRow(s.id, to));
  expect(game.table.rangeUsed).toEqual({ [s.id]: used });
  expect(lastText(game.log)).toMatch(new RegExp(`\\(used range ${used}, ${left} left\\)$`));
  expect(shipRangesOnTable(game.table, game.table.rangeUsed)[s.id] - used).toBe(left);
};

describe('the quadrant waivers of a ship (#1648)', () => {
  const quadrants = () => [mission('Alpha', 'a'), mission('Gamma', 'g'), mission('Delta', 'd')];

  it('Redemption, Medical Vessel adds no 2 for any move between quadrants', () => {
    const r = ship('Redemption Medical Vessel', 'vidiian', '9');
    const t = tableOf(quadrants(), [r]);
    expect(moveSpanTotal(t.missions, 0, 1, r)).toBe(4);
    expect(moveSpanTotal(t.missions, 1, 2, r)).toBe(4);
    expect(moveSpanTotal(t.missions, 0, 1, ship('Other', 'vidiian', '9'))).toBe(6);
    moveAgrees(t, r, 2, 4, 5);
  });

  it('Sphere 634 adds no 2 between [AQ] and [DQ] only, in either direction', () => {
    const s = ship('Sphere 634 *VP', 'borg', '9');
    const t = tableOf(quadrants(), [s]);
    expect(moveSpanTotal(t.missions, 0, 2, s)).toBe(4);
    expect(moveSpanTotal(t.missions, 2, 0, s)).toBe(4);
    expect(moveSpanTotal(t.missions, 0, 1, s)).toBe(6);
    moveAgrees(t, s, 2, 4, 5);
    moveAgrees(t, s, 1, 6, 3);
  });

  it('Aurulent adds no 2 between a non-[GQ] and a [GQ] mission only', () => {
    const s = ship('Aurulent *A', 'ferengi', '7');
    const t = tableOf(quadrants(), [s]);
    expect(moveSpanTotal(t.missions, 0, 1, s)).toBe(4);
    expect(moveSpanTotal(t.missions, 1, 2, s)).toBe(4);
    expect(moveSpanTotal(t.missions, 0, 2, s)).toBe(6);
    moveAgrees(t, s, 1, 4, 3);
    moveAgrees(t, s, 2, 6, 1);
  });
});

describe('the span models of an event in the core (#1648)', () => {
  const relativity = () => ship('Relativity', 'federation', '8');

  it('Expedient Opportunity in the core adds no 2 for any move between quadrants, but not on a mission', () => {
    const s = relativity();
    const t = { ...tableOf([mission('Alpha', 'a'), mission('Gamma', 'g')], [s]), core: [card('Expedient Opportunity', 'event')] };
    expect(moveSpanTotal(t.missions, 0, 1, s, t.core)).toBe(4);
    moveAgrees(t, s, 1, 4, 4);
    const onMission = tableOf([{ ...mission('Alpha', 'a'), placedOn: [card('Expedient Opportunity', 'event')] }, mission('Gamma', 'g')], [s]);
    moveAgrees(onMission, s, 1, 6, 2);
  });

  it('Hurried Departure subtracts 3 from a move from a mission of span 4 or more, never below 0', () => {
    const s = relativity();
    const core = [card('Hurried Departure', 'event')];
    const t = { ...tableOf([mission('Wide', 'a', '4'), mission('Near', 'a', '1'), mission('Narrow', 'a', '3')], [s]), core };
    expect(moveSpanTotal(t.missions, 0, 1, s, core)).toBe(2);
    expect(moveSpanTotal(t.missions, 2, 1, s, core)).toBe(4);
    expect(moveSpanTotal(t.missions, 1, 0, s, core)).toBe(5);
    moveAgrees(t, s, 1, 2, 6);
    const zero = tableOf([mission('Wide', 'a', '4'), mission('Zero', 'a', '0')]);
    expect(moveSpanTotal(zero.missions, 0, 1, s, [...core, card('Hurried Departure', 'event')])).toBe(0);
    expect(moveSpanTotal(t.missions, 0, 1, s)).toBe(5);
  });
});

describe('the Range of a crowded ship (#1648)', () => {
  const route = () => [mission('Alpha', 'a', '1'), mission('Beta', 'a', '1')];

  it.each([
    ['Shuttlepod One Reliable Transport', 5, 2],
    ['Shuttlepod Two Landing Craft', 5, 2],
    ['U.S.S. Ganges One of the First (BP)', 7, 3],
    ['U.S.S. Rio Grande Built to Last *A', 7, 3],
  ])('%s is Range less only with more than %i personnel aboard', (name, limit, n) => {
    const at = ship(name, 'federation', '6', crewOf(limit));
    expect(shipRangeOnTable(tableOf([]), at)).toBe(6);
    const over = ship(name, 'federation', '6', crewOf(limit + 1));
    expect(shipRangeOnTable(tableOf([]), over)).toBe(6 - n);
    moveAgrees(tableOf(route(), [over]), over, 1, 2, 4 - n);
  });

  it('U.S.S. Rio Grande is Range +1 while an Engineer is aboard', () => {
    const rg = ship('U.S.S. Rio Grande Built to Last', 'federation', '3', [personnel('Fixer', 'federation', { skills: 'engineer' })]);
    expect(shipRangeOnTable(tableOf([]), rg)).toBe(4);
    expect(shipRangeOnTable(tableOf([]), ship('U.S.S. Rio Grande Built to Last', 'federation', '3', crewOf(1)))).toBe(3);
    moveAgrees(tableOf(route(), [rg]), rg, 1, 2, 2);
  });

  it('a Range never goes below 0', () => {
    const pod = ship('Shuttlepod One Reliable Transport', 'starfleet', '1', crewOf(6));
    expect(shipRangeOnTable(tableOf([]), pod)).toBe(0);
  });
});

describe('the Range from the missions commanded (#1648)', () => {
  it.each(['Vidiian Cruiser', 'Vidiian Interceptor'])('%s is Range -1 for each completed mission', (name) => {
    const v = ship(name, 'vidiian', '10');
    const t = tableOf([mission('Alpha', 'a', '1'), mission('Beta', 'a', '1'), mission('Gamma', 'a', '1')], [v]);
    expect(shipRangeOnTable(t, v)).toBe(10);
    const done = { ...t, missions: t.missions.map((s, i) => (i === 1 || i === 2 ? { ...s, completed: true } : s)) };
    expect(shipRangeOnTable(done, v)).toBe(8);
    moveAgrees(done, v, 1, 2, 6);
  });

  it("I.K.S. Qel'Poh is Range +2 while two missions are each worth 40 points or more", () => {
    const q = ship("I.K.S. Qel'Poh Clandestine Vessel *A", 'klingon', '6');
    const worth = (name: string, points: string) => card(name, 'mission', { span: '1', quadrant: 'a', points });
    const t = tableOf([worth('Alpha', '40'), worth('Beta', '45')], [q]);
    expect(shipRangeOnTable(t, q)).toBe(8);
    moveAgrees(t, q, 1, 2, 6);
    expect(shipRangeOnTable(tableOf([worth('Alpha', '40'), worth('Beta', '35')]), q)).toBe(6);
    const bounty = ship("I.K.S. Qel'Poh H.M.S. Bounty", 'federation', '6');
    expect(shipRangeOnTable(t, bounty)).toBe(8);
  });

  it('Pi, Off Course is Range +1 for each Region: Neutral Zone mission, limit +3', () => {
    const pi = ship('Pi Off Course', 'romulan', '7');
    const nz = (name: string) => card(name, 'mission', { span: '1', quadrant: 'a', keywords: 'region: neutral zone.' });
    const two = tableOf([nz('One'), nz('Two'), mission('Alpha', 'a', '1')], [pi]);
    expect(shipRangeOnTable(two, pi)).toBe(9);
    moveAgrees(two, pi, 1, 2, 7);
    expect(shipRangeOnTable(tableOf([nz('One'), nz('Two'), nz('Three'), nz('Four')]), pi)).toBe(10);
    expect(shipRangeOnTable(tableOf([mission('Alpha', 'a')]), pi)).toBe(7);
  });
});

describe('Bird-of-Prey (#1648)', () => {
  const rom = (cost: string) => personnel('Centurion', 'romulan', { cost });

  it('is Range +1 for each [Rom] personnel of cost 4 or more aboard, limit +3', () => {
    const b = ship('Bird-of-Prey *VP', 'romulan', '7', [rom('4'), rom('3'), personnel('Officer', 'federation', { cost: '5' })]);
    expect(shipRangeOnTable(tableOf([]), b)).toBe(8);
    const full = ship('Bird-of-Prey', 'romulan', '7', [rom('4'), rom('5'), rom('6'), rom('4')]);
    expect(shipRangeOnTable(tableOf([]), full)).toBe(10);
    moveAgrees(tableOf([mission('Alpha', 'a', '1'), mission('Beta', 'a', '1')], [b]), b, 1, 2, 6);
  });
});

describe('the Range of a personnel aboard (#1648)', () => {
  const route = () => [mission('Alpha', 'a', '1'), mission('Beta', 'a', '1')];

  it('Fredericks is Range +1 on a [Pa][TNG] ship only', () => {
    const fredericks = () => personnel('Fredericks', 'federation');
    const withIcons = (s: CardInstance, icons: string) => ({ ...s, card: { ...s.card, icons } });
    const both = withIcons(ship('Enterprise', 'federation', '8', [fredericks()]), '[pa][tng]');
    expect(shipRangeOnTable(tableOf([]), both)).toBe(9);
    moveAgrees(tableOf(route(), [both]), both, 1, 2, 7);
    const pa = withIcons(ship('Phoenix', 'federation', '8', [fredericks()]), '[pa]');
    expect(shipRangeOnTable(tableOf([]), pa)).toBe(8);
  });

  it('Thomas Riker, Defiant Leader is Range +2 on a [Fed] ship, in every version', () => {
    const fed = ship('Relativity', 'federation', '8', [personnel('Thomas Riker Defiant Leader (AC)', 'federation')]);
    expect(shipRangeOnTable(tableOf([]), fed)).toBe(10);
    moveAgrees(tableOf(route(), [fed]), fed, 1, 2, 8);
    const kli = ship('Negh Var', 'klingon', '8', [personnel('Thomas Riker Defiant Leader', 'federation')]);
    expect(shipRangeOnTable(tableOf([]), kli)).toBe(8);
  });

  it('Benjamin Sisko, Shipwright is Range +1 on a [Baj] ship, not in the away team', () => {
    const baj = ship('Baraka', 'bajoran', '7', [personnel('Benjamin Sisko Shipwright *', 'bajoran')]);
    expect(shipRangeOnTable(tableOf([]), baj)).toBe(8);
    moveAgrees(tableOf(route(), [baj]), baj, 1, 2, 6);
    const fed = ship('Relativity', 'federation', '8', [personnel('Benjamin Sisko Shipwright', 'bajoran')]);
    expect(shipRangeOnTable(tableOf([]), fed)).toBe(8);
    const empty = ship('Baraka', 'bajoran', '7');
    expect(shipRangeOnTable(tableOf([], [empty], { awayTeam: [personnel('Benjamin Sisko Shipwright', 'bajoran')] }), empty)).toBe(7);
  });
});

describe('Inspiring Leader (#1648)', () => {
  const leader = () => card('Inspiring Leader *VP', 'event');
  const commander = () => personnel('Captain', 'federation', { keywords: 'commander: uss defiant.' });
  const defiant = (crew: CardInstance[]) => ({
    ...ship('U.S.S. Defiant Prototype Warship', 'federation', '7', crew),
    placedOn: [leader()],
  });

  it("is Range +2 while the ship's Commander is aboard", () => {
    const d = defiant([commander()]);
    expect(shipRangeOnTable(tableOf([]), d)).toBe(9);
    moveAgrees(tableOf([mission('Alpha', 'a', '1'), mission('Beta', 'a', '1')], [d]), d, 1, 2, 7);
  });

  it('gives nothing with no Commander aboard, nor to another ship', () => {
    expect(shipRangeOnTable(tableOf([]), defiant([personnel('Ensign', 'federation')]))).toBe(7);
    const other = { ...ship('U.S.S. Relativity', 'federation', '8', [commander()]), placedOn: [leader()] };
    expect(shipRangeOnTable(tableOf([]), other)).toBe(8);
    const bare = ship('U.S.S. Defiant Prototype Warship', 'federation', '7', [commander()]);
    expect(shipRangeOnTable(tableOf([]), bare)).toBe(7);
  });
});

describe('the (BP) version suffix (#1648)', () => {
  it('is dropped from a title', () => {
    expect(rangeSpanModelOf(ship('U.S.S. Ganges One of the First (BP)', 'federation', '3'))?.title).toBe('U.S.S. Ganges One of the First');
  });
});

// The setting "Apply card text to attributes" (#1668), off by default: off, no range or span model
// applies, and the 2 between quadrants, a rule of the game, still does. The page stamps it on each
// move (`withShuffleOrders`), so the range a move used never changes with it.
describe('the setting "Apply card text to attributes" (#1668)', () => {
  const doctor = () => personnel('Doctor', 'federation', { skills: 'biology medical' });
  const plain = (id: string, missionIndex: number) => ({ type: 'move' as const, id, to: { zone: 'shipRow' as const, missionIndex } });

  it('gives U.S.S. Pasteur its printed Range while off, and Range +5 while on', () => {
    const pasteur = ship('U.S.S. Pasteur Medical Ship', 'federation', '7', [doctor()]);
    const t = tableOf([], [pasteur]);
    expect(shipRangeOnTable(t, pasteur, false)).toBe(7);
    expect(shipRangeOnTable(t, pasteur, true)).toBe(12);
  });

  it('still adds 2 between quadrants while off, and no waiver or core reduction applies', () => {
    const r = ship('Redemption Medical Vessel', 'vidiian', '9');
    const t = tableOf([mission('Alpha', 'a'), mission('Gamma', 'g')], [r]);
    expect(moveSpanTotal(t.missions, 0, 1, r, [], false)).toBe(6);
    expect(moveSpanTotal(t.missions, 0, 1, r, [], true)).toBe(4);
    const s = ship('Relativity', 'federation', '8');
    const core = [card('Expedient Opportunity', 'event'), card('Hurried Departure', 'event')];
    const wide = tableOf([mission('Wide', 'a', '4'), mission('Gamma', 'g')], [s]);
    expect(moveSpanTotal(wide.missions, 0, 1, s, core, false)).toBe(8);
    expect(moveSpanTotal(wide.missions, 0, 1, s, core, true)).toBe(3);
    const ds = tableOf([ds9(), mission('Gamma', 'g')], [s]);
    expect(moveSpanTotal(ds.missions, 0, 1, s, [], false)).toBe(5);
  });

  it('is off for a move with no setting: the reducer applies no model', () => {
    const r = ship('Redemption Medical Vessel', 'vidiian', '9');
    const game = gameReducer(initialGameState(tableOf([mission('Alpha', 'a'), mission('Gamma', 'g')], [r])), plain(r.id, 1));
    expect(game.table.rangeUsed).toEqual({ [r.id]: 6 });
    expect(lastText(game.log)).toBe('Moved Redemption Medical Vessel from Alpha to Gamma (used range 6, 3 left)');
  });

  it('stamps the setting on each move, a move of a batch too', () => {
    const s = ship('Relativity', 'federation', '8');
    const t = tableOf([mission('Alpha', 'a'), mission('Beta', 'a')], [s]);
    expect(withShuffleOrders(t, plain(s.id, 1), [], true)).toMatchObject({ cardText: true });
    expect(withShuffleOrders(t, plain(s.id, 1), [], false)).not.toHaveProperty('cardText');
    const batch = withShuffleOrders(t, { type: 'batch', actions: [plain(s.id, 1), plain(s.id, 0)] }, [], true);
    expect(batch.type === 'batch' && batch.actions.every((a) => a.type === 'move' && a.cardText)).toBe(true);
  });

  it('keeps the range a move used on, through an undo and a redo with the setting off', () => {
    const pasteur = ship('U.S.S. Pasteur Medical Ship', 'federation', '7', [doctor()]);
    const r = ship('Redemption Medical Vessel', 'vidiian', '9');
    const start = initialGameState(tableOf([mission('Alpha', 'a'), mission('Gamma', 'g')], [pasteur, r]));
    const moved = gameReducer(start, withShuffleOrders(start.table, plain(r.id, 1), start.log, true));
    expect(moved.table.rangeUsed).toEqual({ [r.id]: 4 });
    const undone = gameReducer(moved, withShuffleOrders(moved.table, { type: 'undo' }, moved.log, false));
    expect(undone.table.rangeUsed).toBeUndefined();
    const redone = gameReducer(undone, withShuffleOrders(undone.table, { type: 'redo' }, undone.log, false));
    expect(redone.table.rangeUsed).toEqual({ [r.id]: 4 });
  });

  it('leaves rangeUsed as it was when the setting changes after a move; only the Range and later moves read it', () => {
    const pasteur = ship('U.S.S. Pasteur Medical Ship', 'federation', '7', [doctor()]);
    const start = initialGameState(tableOf([mission('Alpha', 'a'), mission('Beta', 'a', '3'), mission('Gamma', 'g')], [pasteur]));
    const moved = gameReducer(start, withShuffleOrders(start.table, plain(pasteur.id, 1), start.log, true));
    expect(moved.table.rangeUsed).toEqual({ [pasteur.id]: 5 });
    expect(lastText(moved.log)).toBe('Moved U.S.S. Pasteur Medical Ship from Alpha to Beta (used range 5, 7 left)');
    expect(shipRangesOnTable(moved.table, moved.table.rangeUsed, false)).toEqual({ [pasteur.id]: 7 });
    expect(moved.table.rangeUsed).toEqual({ [pasteur.id]: 5 });
    const again = gameReducer(moved, withShuffleOrders(moved.table, plain(pasteur.id, 2), moved.log, false));
    expect(again.table.rangeUsed).toEqual({ [pasteur.id]: 12 });
    expect(lastText(again.log)).toBe('Moved U.S.S. Pasteur Medical Ship from Beta to Gamma (used range 7, over by 5)');
  });

  it.each([true, false])('logs an A→A move with no model the same with the setting %s', (on) => {
    const s = ship('Relativity', 'federation', '8');
    const start = initialGameState(tableOf([mission('Alpha', 'a'), mission('Alpha Two', 'a')], [s]));
    const moved = gameReducer(start, withShuffleOrders(start.table, plain(s.id, 1), start.log, on));
    expect(lastText(moved.log)).toBe('Moved Relativity from Alpha to Alpha Two (used range 4, 4 left)');
  });
});
