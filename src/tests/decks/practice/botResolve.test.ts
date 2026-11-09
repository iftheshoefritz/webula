import { tableReducer, initialTableState, CardInstance, TableState, MISSION_SLOTS } from '../../../app/decks/practice/tableReducer';
import { botLabelOf, botResolveOf } from '../../../app/decks/practice/attempt';
import { gameReducer, initialGameState, logEntryText } from '../../../app/decks/practice/gameLog';

// Issue #1588: the Resolve of the revealed dilemma on the practice table, from the reveal snapshot.

const card = (id: string, row: Record<string, unknown>, extra: Partial<CardInstance> = {}): CardInstance => ({
  id,
  card: { collectorsinfo: id, imagefile: id, ...row } as CardInstance['card'],
  face: 'up',
  ...extra,
});
const person = (id: string, name: string, skills = 'Physics') =>
  card(id, { type: 'personnel', name: name.toLowerCase(), originalName: name, skills, integrity: 5, cunning: 5, strength: 5, cost: 2 });
const dilemma = (id: string, title: string) => card(id, { type: 'dilemma', name: title.toLowerCase(), originalName: title }, { face: 'down' });

const NAMES: Record<string, string> = { 'card-2': 'Alpha', 'card-3': 'Beta', 'card-4': 'Gamma' };

function revealed(title: string, crewSkills: string[] = ['Physics', 'Physics', 'Physics']): TableState {
  const start: TableState = {
    ...initialTableState,
    opponent: 'bot',
    missions: Array.from({ length: MISSION_SLOTS }, (_, i) => ({
      mission: i === 0 ? card('card-1', { type: 'mission', name: 'moab iv', originalName: 'Moab IV', missiontype: 'p', skills: 'Physics', points: 35, span: 3 }) : null,
      ships: [],
      awayTeam: i === 0 ? Object.entries(NAMES).map(([id, name], k) => person(id, name, crewSkills[k])) : [],
      underMission: [],
    })),
    dilemmaStack: [dilemma('card-6', title), dilemma('card-7', 'Wall of Fire')],
    attempt: { missionIndex: 0, personnel: 3, subtract: 0, phase: 'face', drawn: 0, botDraw: 9, botSpend: 9, botStack: ['card-6', 'card-7'], botRevealed: [] },
  };
  return tableReducer(start, { type: 'flip', id: 'card-6' });
}

describe('botResolveOf (#1588)', () => {
  it('stops exactly the personnel the bot chooses for Well-Prepared Defenses, and the label names the same one', () => {
    const table = revealed('Well-Prepared Defenses');
    const r = botResolveOf(table);
    if (!r.resolvable) throw new Error(r.reason);
    expect(r.changes).toHaveLength(1);
    const [chosen] = r.changes[0].ids;
    expect(r.changes).toEqual([{ op: 'stop', ids: [chosen] }]);
    expect(r.preview).toBe(`Stops ${NAMES[chosen]}`);
    expect(botLabelOf(table)).toBe(`Bot's missions: more points; Chose ${NAMES[chosen]}`);
  });

  it('gives no changes once the player stopped that personnel, and the label still reads the snapshot', () => {
    const table = revealed('Well-Prepared Defenses');
    const first = botResolveOf(table);
    if (!first.resolvable) throw new Error(first.reason);
    const chosen = first.changes[0].ids[0];
    const stopped = tableReducer(table, { type: 'setStopped', ids: [chosen], stopped: true });
    const r = botResolveOf(stopped);
    if (!r.resolvable) throw new Error(r.reason);
    expect(r.changes).toEqual([]);
    expect(r.notes).toEqual([{ kind: 'alreadyDone', op: 'stop', done: 1, of: 1 }]);
    expect(r.preview).toBe(`Stops ${NAMES[chosen]}; 1 of 1 already stopped`);
    expect(botLabelOf(stopped)).toBe(botLabelOf(table));
  });

  it('rolls a random kill on the press, the hand-discarded personnel first, with the same preview', () => {
    const table = tableReducer(revealed('Environmental Contaminants'), { type: 'move', id: 'card-3', to: 'discard' });
    const preview = botResolveOf(table);
    if (!preview.resolvable) throw new Error(preview.reason);
    expect(preview.preview).toBe('Kills 2 random personnel; 1 of 2 already killed');
    const pressed = botResolveOf(table, undefined, { rand: () => 0 });
    if (!pressed.resolvable) throw new Error(pressed.reason);
    expect(pressed.preview).toBe(preview.preview);
    expect(pressed.picks).toEqual([['card-3', 'card-2']]);
    expect(pressed.changes).toEqual([{ op: 'kill', ids: ['card-2'] }]);
    expect(pressed.notes).toEqual([{ kind: 'alreadyDone', op: 'kill', done: 1, of: 2 }]);
    // The changes apply with the resolveDilemma action of #1587.
    const resolved = tableReducer(table, { type: 'resolveDilemma', dilemmaId: 'card-6', dilemma: 'Environmental Contaminants', changes: pressed.changes });
    expect(resolved.discard.map((c) => c.id)).toEqual(['card-3', 'card-2']);
  });

  it('notes a personnel moved by hand whom the dilemma does not touch as going by the table', () => {
    const table = tableReducer(revealed('Environmental Contaminants', ['Biology', '2 Diplomacy', '2 Science']), { type: 'move', id: 'card-4', to: 'hand' });
    expect(botResolveOf(table)).toEqual({
      resolvable: true,
      preview: 'No effect',
      changes: [],
      notes: [{ kind: 'byTable', text: 'Gamma' }],
    });
    // The note's text is the card's name: the log adds "goes by the table" once.
    const r = botResolveOf(table);
    if (!r.resolvable) throw new Error(r.reason);
    const game = gameReducer(initialGameState(table), { type: 'resolveDilemma', dilemmaId: 'card-6', dilemma: 'Environmental Contaminants', changes: r.changes, notes: r.notes });
    expect(logEntryText(game.log[game.log.length - 1])).toBe('Resolved Environmental Contaminants: no effect (Gamma goes by the table)');
  });

  it('reads the stopped flags of the snapshot, not of the live table', () => {
    // The group meets the check at the reveal; a stop by hand after it does not change that.
    const table = revealed('Environmental Contaminants', ['Biology', '2 Diplomacy', '2 Science']);
    const stopped = tableReducer(table, { type: 'setStopped', ids: ['card-2'], stopped: true });
    expect(botResolveOf(stopped)).toMatchObject({ resolvable: true, preview: 'No effect', changes: [] });
  });

  it('gives no Resolve without a snapshot for the top card', () => {
    const table = revealed('Well-Prepared Defenses');
    expect(botResolveOf(table, { dilemmaId: 'card-7', personnel: [] }).resolvable).toBe(false);
  });
});
