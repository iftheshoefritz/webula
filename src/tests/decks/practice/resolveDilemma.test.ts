import {
  tableReducer,
  initialTableState,
  Attempt,
  CardInstance,
  TableAction,
  TableState,
  MISSION_SLOTS,
} from '../../../app/decks/practice/tableReducer';
import { toSavedGame, toSavedHistory, fromSavedGame } from '../../../app/decks/practice/savedGame';
import { gameReducer, initialGameState, isLogEntry, logEntryText } from '../../../app/decks/practice/gameLog';
import { DeckList } from '../../../types';

// The reveal snapshot and the resolveDilemma action of the facing phase (#1587).

const row = (collectorsinfo: string, type: string, name: string, extra: Record<string, string> = {}) => ({
  collectorsinfo,
  name,
  originalName: name,
  imagefile: collectorsinfo,
  type,
  ...extra,
});
const deck: DeckList = {
  mission: { count: 1, row: row('1M1', 'mission', 'Moab IV', { missiontype: 'p' }) },
  data: { count: 1, row: row('1P1', 'personnel', 'Data') },
  worf: { count: 1, row: row('1P2', 'personnel', 'Worf') },
  tricorder: { count: 1, row: row('1E1', 'equipment', 'Tricorder') },
  riker: { count: 1, row: row('1P3', 'personnel', 'Riker') },
  limbo: { count: 1, row: row('1D1', 'dilemma', 'Limited Welcome') },
  wall: { count: 1, row: row('1D2', 'dilemma', 'Wall of Fire') },
};
const inst = (id: string, key: string, face: 'up' | 'down' = 'up', extra: Partial<CardInstance> = {}): CardInstance => ({
  id,
  card: { ...deck[key].row },
  face,
  ...extra,
});

const BOT: Partial<Attempt> = { botDraw: 2, botSpend: 2, botStack: ['card-6', 'card-7'], botRevealed: [] };

const startTable = (attempt: Partial<Attempt> = BOT): TableState => ({
  ...initialTableState,
  opponent: 'bot',
  missions: Array.from({ length: MISSION_SLOTS }, (_, i) => ({
    mission: i === 0 ? inst('card-1', 'mission') : null,
    ships: [],
    awayTeam:
      i === 0
        ? [
            inst('card-2', 'data', 'down'),
            inst('card-3', 'worf', 'down', { stopped: true }),
            inst('card-4', 'tricorder', 'down'),
            inst('card-5', 'riker', 'down'),
          ]
        : [],
    underMission: [],
  })),
  dilemmaStack: [inst('card-6', 'limbo', 'down'), inst('card-7', 'wall', 'down')],
  attempt: { missionIndex: 0, personnel: 3, subtract: 0, phase: 'face', drawn: 2, ...attempt },
});

const revealed = (attempt?: Partial<Attempt>) => tableReducer(startTable(attempt), { type: 'flip', id: 'card-6' });

const resolve = (changes: Extract<TableAction, { type: 'resolveDilemma' }>['changes'], extra = {}): TableAction => ({
  type: 'resolveDilemma',
  dilemmaId: 'card-6',
  dilemma: 'Limited Welcome',
  changes,
  ...extra,
});

const awayTeamIds = (table: TableState) => table.missions[0].awayTeam.map((c) => c.id);

describe('the reveal snapshot', () => {
  it('is set by the flip of a bot stack card in face, with the personnel ids and their stopped flags', () => {
    const table = revealed();
    expect(table.attempt!.revealSnapshot).toEqual({
      dilemmaId: 'card-6',
      personnel: [
        { id: 'card-2', stopped: false },
        { id: 'card-3', stopped: true },
        { id: 'card-5', stopped: false },
      ],
    });
  });

  it('is not set in a game with no bot', () => {
    expect(revealed({}).attempt!.revealSnapshot).toBeUndefined();
  });

  it('is not set in choose', () => {
    expect(revealed({ ...BOT, phase: 'choose' }).attempt!.revealSnapshot).toBeUndefined();
  });

  it('goes with the attempt', () => {
    expect(tableReducer(revealed(), { type: 'endAttempt' }).attempt).toBeUndefined();
  });
});

describe('resolveDilemma', () => {
  it.each([
    ['kill', 'discard'],
    ['remove', 'discard'],
    ['brig', 'botBrig'],
    ['holdInCore', 'core'],
    ['returnToHand', 'hand'],
  ] as const)('%s moves the card to %s', (op, zone) => {
    const table = tableReducer(revealed(), resolve([{ op, ids: ['card-2'] }]));
    expect(awayTeamIds(table)).not.toContain('card-2');
    expect(table[zone].map((c) => c.id)).toEqual(['card-2']);
    expect(table[zone][0].removedFromGame).toBe(op === 'remove' ? true : undefined);
    expect(table.attempt!.revealSnapshot!.resolved).toBe(true);
  });

  it('stop stops the card and never unstops one', () => {
    const table = tableReducer(revealed(), resolve([{ op: 'stop', ids: ['card-2', 'card-3'] }]));
    expect(table.missions[0].awayTeam.map((c) => !!c.stopped)).toEqual([true, true, false, false]);
  });

  it('marks the snapshot resolved when there is nothing to apply', () => {
    const before = revealed();
    const table = tableReducer(before, resolve([]));
    expect(table).not.toBe(before);
    expect(table.attempt!.revealSnapshot).toEqual({ ...before.attempt!.revealSnapshot, resolved: true });
  });

  it('changes nothing the second time', () => {
    const once = tableReducer(revealed(), resolve([{ op: 'kill', ids: ['card-2'] }]));
    expect(tableReducer(once, resolve([{ op: 'kill', ids: ['card-5'] }]))).toBe(once);
  });

  it('changes nothing for a card that is not the face-up top card', () => {
    const table = revealed();
    expect(tableReducer(table, { ...resolve([{ op: 'kill', ids: ['card-2'] }]), dilemmaId: 'card-7' } as TableAction)).toBe(table);
    const facedDown = tableReducer(table, { type: 'flip', id: 'card-6' });
    expect(tableReducer(facedDown, resolve([{ op: 'kill', ids: ['card-2'] }]))).toBe(facedDown);
  });

  it('skips a card that already left the row, and a card an earlier op moved', () => {
    const moved = tableReducer(revealed(), { type: 'move', id: 'card-2', to: 'core' });
    const table = tableReducer(
      moved,
      resolve([
        { op: 'kill', ids: ['card-2', 'card-5'] },
        { op: 'stop', ids: ['card-5'] },
      ])
    );
    expect(table.core.map((c) => c.id)).toEqual(['card-2']);
    expect(table.discard.map((c) => c.id)).toEqual(['card-5']);
    expect(table.discard[0].stopped).toBeFalsy();
  });
});

describe('resolveDilemma in the log, undo and redo', () => {
  const flipped = () => gameReducer(initialGameState(startTable()), { type: 'flip', id: 'card-6' });

  it('makes one entry that names the cards it changed', () => {
    const game = gameReducer(
      flipped(),
      resolve(
        [
          { op: 'kill', ids: ['card-2'] },
          { op: 'stop', ids: ['card-3', 'card-5'] },
        ],
        { notes: [{ kind: 'alreadyDone', op: 'kill', done: 1, of: 2 }] }
      )
    );
    expect(game.log).toHaveLength(2);
    expect(logEntryText(game.log[1])).toBe('Resolved Limited Welcome: killed Data, stopped Riker (1 of 2 already killed by hand)');
    expect(isLogEntry(game.log[1])).toBe(true);
  });

  it('lists the selection and the check before the result, with the names at dispatch (#1629)', () => {
    const steps = {
      selects: [['card-2', 'card-5'], ['card-5']],
      checks: [
        { ids: ['card-2', 'card-5'], met: ['card-5'], text: 'Integrity, Cunning or Strength > 6' },
        { ids: ['card-2', 'card-5'], met: [], text: 'Honor', subject: 'the selected personnel' },
      ],
    };
    const game = gameReducer(flipped(), resolve([{ op: 'stop', ids: ['card-5'] }], { steps }));
    expect(game.log[1]).toMatchObject({ selected: [['Data', 'Riker']], checks: [{ met: ['Riker'] }, { met: [], subject: 'the selected personnel' }] });
    expect(logEntryText(game.log[1])).toBe(
      'Resolved Limited Welcome: selected Data, Riker; Riker has Integrity, Cunning or Strength > 6; the selected personnel do not have Honor; stopped Riker'
    );
    expect(isLogEntry(game.log[1])).toBe(true);
  });

  it('renders an entry from before #1629, with no steps', () => {
    const old = { turn: 1, kind: 'dilemmaResolved', dilemma: 'Becalmed', ops: [{ op: 'stop', cards: ['Worf'] }], went: 'goes under Bilana System' };
    expect(isLogEntry(old)).toBe(true);
    expect(logEntryText(old as any)).toBe('Resolved Becalmed: stopped Worf; it goes under Bilana System');
  });

  it('reads no effect when nothing changed, and keeps a note that goes by the table', () => {
    const game = gameReducer(flipped(), resolve([], { notes: [{ kind: 'byTable', text: 'Worf' }] }));
    expect(logEntryText(game.log[1])).toBe('Resolved Limited Welcome: no effect (Worf goes by the table)');
    expect(logEntryText(gameReducer(flipped(), resolve([])).log[1])).toBe('Resolved Limited Welcome: no effect');
  });

  it('is undone whole, the resolved flag too, and redone to the same table', () => {
    const before = flipped();
    const game = gameReducer(before, resolve([{ op: 'remove', ids: ['card-2'] }, { op: 'brig', ids: ['card-5'] }]));
    const undone = gameReducer(game, { type: 'undo' });
    expect(undone.table).toEqual(before.table);
    expect(undone.table.attempt!.revealSnapshot!.resolved).toBeUndefined();
    expect(gameReducer(undone, { type: 'redo' }).table).toEqual(game.table);
  });

  it('keeps the entry and the undo step through a save', () => {
    const game = gameReducer(flipped(), resolve([{ op: 'kill', ids: ['card-2'] }]));
    const json = JSON.stringify(toSavedGame(game.table, deck, 'builder', undefined, undefined, game.log));
    const restored = fromSavedGame(json, deck, toSavedHistory(game, deck))!;
    expect(restored.table).toEqual(game.table);
    expect(restored.log).toEqual(game.log);
    const undone = gameReducer({ table: restored.table, log: restored.log, undo: restored.undo, redo: restored.redo }, { type: 'undo' });
    expect(undone.table.attempt!.revealSnapshot!.resolved).toBeUndefined();
    expect(awayTeamIds(undone.table)).toContain('card-2');
  });
});

describe('the reveal snapshot in a save', () => {
  // A copy, so a change to the save leaves the table alone.
  const save = (table: TableState) => JSON.parse(JSON.stringify(toSavedGame(table, deck, 'builder')));

  it('a save with no snapshot gets one for the face-up top card', () => {
    const table = revealed();
    const saved = save(table);
    delete saved.table.attempt.revealSnapshot;
    const restored = fromSavedGame(JSON.stringify(saved), deck)!;
    expect(restored.table.attempt!.revealSnapshot).toEqual(table.attempt!.revealSnapshot);
    expect(restored.log).toEqual([]);
  });

  it('a save from before the field loads', () => {
    const saved = save(startTable());
    delete saved.table.attempt.revealSnapshot;
    const restored = fromSavedGame(JSON.stringify(saved), deck)!;
    expect(restored.table).toEqual(startTable());
  });

  it('a snapshot for another card is replaced', () => {
    const table = revealed();
    const saved = save(table);
    saved.table.attempt.revealSnapshot = { dilemmaId: 'card-7', personnel: [], resolved: true };
    const restored = fromSavedGame(JSON.stringify(saved), deck)!;
    expect(restored.table.attempt!.revealSnapshot).toEqual(table.attempt!.revealSnapshot);
  });

  it('a malformed snapshot drops alone, and the attempt stays', () => {
    const saved = save(startTable());
    saved.table.attempt.revealSnapshot = { dilemmaId: 7 };
    const restored = fromSavedGame(JSON.stringify(saved), deck)!;
    expect(restored.table.attempt).toBeDefined();
    expect(restored.table.attempt!.revealSnapshot).toBeUndefined();
  });

  it('a snapshot with no face-up top card stays as it is', () => {
    const table = tableReducer(revealed(), { type: 'flip', id: 'card-6' });
    const restored = fromSavedGame(JSON.stringify(save(table)), deck)!;
    expect(restored.table.attempt!.revealSnapshot).toEqual(table.attempt!.revealSnapshot);
  });
});
