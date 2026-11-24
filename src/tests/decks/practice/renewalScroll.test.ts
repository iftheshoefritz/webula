import { initialTableState, CardInstance, TableState, MISSION_SLOTS } from '../../../app/decks/practice/tableReducer';
import { availableOrdersOf, gameReducer, GameAction, GameState, initialGameState, logEntryText, pendingOrderOf } from '../../../app/decks/practice/gameLog';
import { chooseSkillOptions } from '../../../app/decks/practice/orders';
import { pileTableInputOf } from '../../../app/decks/practice/attempt';
import { tableViewOf } from '../../../app/decks/practice/tableView';
import { orderModelOf } from '../../../lib/orderModels';
import { addedRequirements, cardRequirementRowOf, parsedRequirementsOf } from '../../../lib/requirementRules';

// Issue #1837: an order whose cost places a card of the discard pile on its own card, a step that records a choice,
// and a requirement change from a card in play. Renewal Scroll is the first row. The title is real; the rows hold
// only the fields the readers use, and the personnel and missions are invented.

const card = (id: string, row: Record<string, unknown>): CardInstance => ({
  id,
  card: { collectorsinfo: id, imagefile: id, unique: 'n', gametext: '', cost: '1', ...row } as CardInstance['card'],
  face: 'up',
});
const named = (id: string, name: string, type: string, extra: Record<string, unknown> = {}) =>
  card(id, { type, name: name.toLowerCase(), originalName: name, ...extra });
const person = (id: string, skills: string) => named(id, `Crewman ${id}`, 'personnel', { skills, integrity: '5', cunning: '5', strength: '5' });
const scroll = named('scroll', 'Renewal Scroll', 'event');
const planet = named('m-p', 'Moab IV', 'mission', { missiontype: 'p', quadrant: 'a', skills: 'Anthropology, Medical' });
const space = named('m-s', 'Bilana System', 'mission', { missiontype: 's', quadrant: 'a', skills: 'Astrometrics' });
const hq = named('m-h', 'Bajor Blessed of the Prophets', 'mission', { missiontype: 'h', quadrant: 'a' });

function table(discard: CardInstance[], core: CardInstance[] = [scroll]): TableState {
  const cards = [planet, space, hq];
  return {
    ...initialTableState,
    segment: 'orders',
    core,
    discard,
    missions: Array.from({ length: MISSION_SLOTS }, (_, i) => ({
      mission: cards[i] ?? null,
      ships: [],
      awayTeam: i === 0 ? [person('a1', 'Medical')] : [],
      underMission: [],
    })),
  };
}

const run = (state: GameState, ...actions: GameAction[]) => actions.reduce(gameReducer, state);
const use = (id: string): GameAction => ({ type: 'useOrder', id: 'scroll', order: 0, ids: [id] });
const choose = (skill: string): GameAction => ({ type: 'effectStep', skill });
const requirementsOf = (s: GameState) => tableViewOf(s.table).missions.map((m) => m.requirements);
const scrollOf = (s: GameState) => s.table.core.find((c) => c.id === 'scroll');

describe('Renewal Scroll (#1837)', () => {
  const diplomat = person('d1', 'Acquisition Diplomacy 2 Law Leadership');
  const start = () => initialGameState(table([diplomat, person('d2', 'Honor Telepathy')]));

  it('is an order row with a cost from the discard pile and a skill choice, and a requirement row', () => {
    expect(orderModelOf('Renewal Scroll', 0)?.cost.kind).toBe('placeFromDiscardOnThis');
    expect(orderModelOf('Renewal Scroll', 0)?.steps).toEqual([{ kind: 'chooseSkill', exclude: ['Acquisition', 'Intelligence', 'Law', 'Telepathy'] }]);
    expect(cardRequirementRowOf('Renewal Scroll')?.add).toBe('named');
    expect(availableOrdersOf(start()).map((o) => o.instance.id)).toEqual(['scroll']);
  });

  it('places the personnel on the event, offers its skills less the excluded ones, and records the choice in one entry', () => {
    const before = start();
    const used = run(before, use('d1'));
    expect(used.table.discard.map((c) => c.id)).toEqual(['d2']);
    expect(scrollOf(used)?.placedOn?.map((c) => c.id)).toEqual(['d1']);
    expect(pendingOrderOf(used)?.stage.lead.kind).toBe('chooseSkill');
    expect(chooseSkillOptions(used.table, 'scroll', { kind: 'chooseSkill', exclude: ['Acquisition', 'Intelligence', 'Law', 'Telepathy'] })).toEqual([
      'Diplomacy',
      'Leadership',
    ]);
    expect(run(used, choose('Law'))).toBe(used);
    expect(run(used, choose('Honor'))).toBe(used);
    const chosen = run(used, choose('Diplomacy'));
    expect(scrollOf(chosen)?.named).toBe('Diplomacy');
    expect(pendingOrderOf(chosen)).toBeNull();
    expect(chosen.log).toHaveLength(before.log.length + 1);
    expect(logEntryText(chosen.log.at(-1)!)).toBe("Used Renewal Scroll's order: placed Crewman d1 on it, chose Diplomacy");
    const undone = run(chosen, { type: 'undo' });
    expect(undone.table).toEqual(before.table);
  });

  it('refuses a card of the discard pile that is no personnel', () => {
    const s = initialGameState(table([named('e1', 'Some Event', 'event')]));
    expect(run(s, use('e1'))).toBe(s);
  });

  it('adds the skill to the requirements of each mission in play with requirements, for the view and the bot', () => {
    const chosen = run(start(), use('d1'), choose('Diplomacy'));
    const [p, sp, h] = requirementsOf(chosen);
    expect(p).toBe('diplomacy, (anthropology, medical)');
    expect(sp).toBe('diplomacy, (astrometrics)');
    expect(h).toBe('');
    expect(String(pileTableInputOf(chosen.table, 0).mission?.skills)).toBe('Diplomacy, (Anthropology, Medical)');
    expect(String(pileTableInputOf(start().table, 0).mission?.skills)).toBe('Anthropology, Medical');
  });

  it('replaces the skill when the order is used again, and ends when the event leaves the core', () => {
    const first = run(start(), use('d1'), choose('Diplomacy'));
    const again = run(first, { type: 'nextTurn' }, { type: 'advanceSegment' });
    expect(again.table.segment).toBe('orders');
    const leeta = person('d3', 'Leadership Security');
    const withMore = { ...again, table: { ...again.table, discard: [...again.table.discard, leeta] } };
    const second = run(withMore, use('d3'), choose('Security'));
    expect(scrollOf(second)?.named).toBe('Security');
    expect(scrollOf(second)?.placedOn?.map((c) => c.id)).toEqual(['d1', 'd3']);
    expect(requirementsOf(second)[0]).toBe('security, (anthropology, medical)');
    const gone = run(second, { type: 'move', id: 'scroll', to: 'discard' });
    expect(requirementsOf(gone)[0]).toBe('anthropology, medical');
  });

  it('leaves the deck builder, which sees no table, and a scroll with no choice unchanged', () => {
    expect(parsedRequirementsOf([planet.card]).map((p) => p.mandatory)).toEqual([{ anthropology: 1, medical: 1 }]);
    expect(addedRequirements([planet.card], [{ title: 'Renewal Scroll' }])).toEqual([[]]);
    expect(addedRequirements([planet.card], [{ title: 'Renewal Scroll', named: 'Diplomacy' }])).toEqual([['Diplomacy']]);
    expect(addedRequirements([planet.card], [{ title: 'Other Event', named: 'Diplomacy' }])).toEqual([[]]);
  });
});
