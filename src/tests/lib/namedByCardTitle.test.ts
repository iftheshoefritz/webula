// Issue #1985: a card names another by its card title alone. "When you name a card, you do so by card title only,
// not subtitle." (Rulebook v4, Glossary › naming cards, p. 18). Every card here is invented.
import { MISSION_SLOTS, initialTableState, type CardInstance, type TableState } from '../../app/decks/practice/tableReducer';
import { tableViewOf } from '../../app/decks/practice/tableView';
import { rowCardTitleOf } from '../../lib/cardTitle';
import { rowIsNamed } from '../../lib/modifiers/words';
import { commandsCardTitled, missions } from '../../lib/tableView';

const remusWatchPost = { type: 'mission', name: 'remus watch post', originalName: 'Remus Watch Post', title: 'remus', originalTitle: 'Remus' };
const remusStation = { type: 'mission', name: 'remus station', originalName: 'Remus Station', title: 'remus station', originalTitle: 'Remus Station' };

describe('rowCardTitleOf', () => {
  it('reads the row title, lowercased', () => {
    expect(rowCardTitleOf({ name: 'remus watch post', title: 'Remus' })).toBe('remus');
  });

  it('falls back to the name less its version suffix for a row with no title', () => {
    expect(rowCardTitleOf({ name: 'test probe *vp', originalName: 'Test Probe *VP' })).toBe('test probe');
  });
});

describe('rowIsNamed (#1985)', () => {
  it('matches a row whose card title is the name, whatever its subtitle', () => {
    expect(rowIsNamed(remusWatchPost, 'Remus')).toBe(true);
    expect(rowIsNamed(remusWatchPost, 'REMUS')).toBe(true);
  });

  it('does not match a row whose card title only starts with the name', () => {
    expect(rowIsNamed(remusStation, 'Remus')).toBe(false);
  });

  it('falls back to the name less its version suffix for a row with no title', () => {
    expect(rowIsNamed({ name: 'remus *vp', originalName: 'Remus *VP' }, 'Remus')).toBe(true);
    expect(rowIsNamed({ name: 'remus watch post', originalName: 'Remus Watch Post' }, 'Remus')).toBe(false);
  });
});

const instance = (id: string, row: Record<string, unknown>): CardInstance => ({
  id,
  card: { collectorsinfo: id, imagefile: id, ...row } as CardInstance['card'],
  face: 'up',
});

const tableWith = (row: Record<string, unknown>): TableState => ({
  ...initialTableState,
  missions: Array.from({ length: MISSION_SLOTS }, (_, i) => ({
    mission: i === 0 ? instance('m0', row) : null,
    ships: [],
    awayTeam: [],
    underMission: [],
  })),
  core: [instance('c0', { ...row, type: 'event' })],
});

describe('missions({ titled }) and commandsCardTitled (#1985)', () => {
  const cases: [Record<string, unknown>, string, boolean][] = [
    [remusWatchPost, 'Remus', true],
    [remusWatchPost, 'remus', true],
    [remusWatchPost, 'Remus Watch Post', false],
    [remusStation, 'Remus', false],
    [remusStation, 'Remus Station', true],
  ];

  it.each(cases)('agree on %j named %s', (row, name, expected) => {
    const view = tableViewOf(tableWith(row));
    expect(missions(view, { titled: name }).length === 1).toBe(expected);
    expect(commandsCardTitled(name).holds(view)).toBe(expected);
  });
});
