import { tableReducer, initialTableState, CardInstance, MISSION_SLOTS, TableState } from '../../../app/decks/practice/tableReducer';
import { gameReducer, initialGameState, logEntryText, LogEntry } from '../../../app/decks/practice/gameLog';
import { moveSpanTotal, shipRangeOnTable, shipRangesOnTable } from '../../../app/decks/practice/shipRange';
import { rangeSpanModelOf } from '../../../app/decks/practice/rangeModels';
import { pileTitleOf } from '../../../lib/dilemmaBot/pile/registry';

// The span total of a move and a ship's Range on the table (#1635): the quadrant rule, and the card
// text of Mouth of the Wormhole, Deep Space 9, The Reman Mines and U.S.S. Pasteur. The rows follow
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

const toRow = (id: string, missionIndex: number) => ({ type: 'move' as const, id, to: { zone: 'shipRow' as const, missionIndex } });
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
    expect(shipRangeOnTable(tableOf([]).missions, pasteur)).toBe(12);
  });

  it('reads the *A version the same', () => {
    expect(shipRangeOnTable(tableOf([]).missions, ship('U.S.S. Pasteur Medical Ship *A', 'federation', '7', [doctor()]))).toBe(12);
  });

  it('gains nothing from a non-[Fed] Medical personnel, a [Fed] personnel with no Medical, or a doctor in the away team', () => {
    const pasteur = ship('U.S.S. Pasteur Medical Ship', 'federation', '7', [
      personnel('Healer', 'bajoran', { skills: 'medical' }),
      personnel('Officer', 'federation', { skills: 'leadership' }),
    ]);
    expect(shipRangeOnTable(tableOf([], [pasteur], { awayTeam: [doctor()] }).missions, pasteur)).toBe(7);
  });

  it('reads the new Range in the log and on the card', () => {
    const pasteur = ship('U.S.S. Pasteur Medical Ship', 'federation', '7', [doctor()]);
    const t = tableOf([mission('Alpha', 'a'), mission('Beta', 'a', '3')], [pasteur]);
    const game = gameReducer(initialGameState(t), toRow(pasteur.id, 1));
    expect(lastText(game.log)).toBe('Moved U.S.S. Pasteur Medical Ship from Alpha to Beta (used range 5, 7 left)');
    expect(shipRangesOnTable(game.table.missions, game.table.rangeUsed)).toEqual({ [pasteur.id]: 12 });
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
    expect(shipRangeOnTable(t.missions, w)).toBe(10);
  });

  it('stops at +3', () => {
    const w = warbird([reman(), reman(), reman()]);
    const t = tableOf([withMines(remus())], [w], { awayTeam: [reman(), reman()] });
    expect(shipRangeOnTable(t.missions, w)).toBe(11);
  });

  it('does not count a Reman in the brig', () => {
    const w = warbird();
    const t = tableOf([withMines(remus())], [w], { brig: [reman()] });
    expect(shipRangeOnTable(t.missions, w)).toBe(8);
  });

  it('gives nothing to a non-[Rom] ship, nor from another mission or the core', () => {
    const fed = ship('Relativity', 'federation', '8', [reman()]);
    expect(shipRangeOnTable(tableOf([withMines(remus())], [fed]).missions, fed)).toBe(8);
    const w = warbird([reman()]);
    expect(shipRangeOnTable(tableOf([withMines(mission('Alpha', 'a')), remus()], [w]).missions, w)).toBe(8);
    const inCore = { ...tableOf([remus()], [w]), core: [mines()] };
    expect(shipRangeOnTable(inCore.missions, w)).toBe(8);
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
