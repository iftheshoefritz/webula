// Issue #1589: `?fixture=bot-resolve-noeffect` reveals a dilemma whose `unless` check the Bilana
// System crew of the fixture meets, so its Resolve reads "No effect" and changes no zone.
import { readFileSync } from 'fs';
import { join } from 'path';
import { deckFromTsv, extractDilemmas, extractDrawDeck, extractMissions, mergeDeckPiles } from '../../../app/decks/deckBuilderUtils';
import { PRACTICE_DECK_TSV } from '../../../lib/practiceDeck';
import { chulaPileDeck } from '../../../lib/dilemmaBot/chulaPile';
import { collectorsKey } from '../../../lib/dilemmaBot/opponentPile';
import { BOT_REVEAL_FIXTURES, botLabelOf, botResolveOf, fixtureBotLabelAttempt } from '../../../app/decks/practice/attempt';
import { createCardInstances, initialTableState, tableReducer, TableAction, TableState } from '../../../app/decks/practice/tableReducer';
import { gameReducer, initialGameState, logEntryText } from '../../../app/decks/practice/gameLog';

jest.mock('posthog-js', () => ({ capture: jest.fn() }));

// The rows are read by hand, normalised as `parseCardData` does: Jest does not load the real d3.
const data = (() => {
  const [head, ...rows] = readFileSync(join(process.cwd(), 'public', 'cards_with_processed_columns.txt'), 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\t').map((cell) => cell.replace(/^"|"$/g, '')));
  return rows.map((r) => {
    const row: any = Object.fromEntries(head.map((h, i) => [h.toLowerCase(), (r[i] ?? '').toLowerCase()]));
    row.collectorsinfo = row.collectorsinfo.replace(/(^|[^0-9])0+(\d+)/g, '$1$2');
    row.originalName = r[head.indexOf('Name')];
    row.missiontype = row.type === 'mission' ? row.mission : '';
    return row;
  });
})();

// The table the page deals for a revealing bot fixture: the fixture deck with the Chula pile and the
// fixture's dilemma, dealt as `?fixture=piles`, then the bot attempt with that dilemma revealed on top.
function dealRevealFixture(fixture: string): TableState {
  const { title, collectorsInfo } = BOT_REVEAL_FIXTURES[fixture];
  const botDeck = mergeDeckPiles(deckFromTsv(PRACTICE_DECK_TSV, data), chulaPileDeck(data), ['dilemmaPile']);
  const labelled = data.find((row) => row.collectorsinfo === collectorsKey(collectorsInfo));
  expect(labelled).toBeDefined();
  const deck = { ...botDeck, [labelled.collectorsinfo]: { count: 1, row: { ...labelled, count: 1, pile: 'dilemmaPile' } } };
  const cards = extractDrawDeck(deck);
  const deal: TableAction = {
    type: 'resetWithPiles',
    cards: createCardInstances([...cards, ...cards.filter((c: any) => c.type === 'personnel')]),
    missions: createCardInstances(extractMissions(deck), 'up'),
    dilemmas: createCardInstances(extractDilemmas(deck)),
    opponent: 'bot',
  };
  let table = tableReducer(initialTableState, deal);
  const attempt = fixtureBotLabelAttempt(table, title);
  if (!attempt) throw new Error('no fixture attempt');
  table = tableReducer(table, attempt.start);
  table = tableReducer(table, { type: 'setAttemptPhase', phase: 'face' });
  for (const move of attempt.stack) table = tableReducer(table, move);
  return tableReducer(table, { type: 'flip', id: attempt.revealId });
}

describe('?fixture=bot-resolve-noeffect (#1589)', () => {
  it('reveals Conflict of Interests, whose Resolve is "No effect", and a press changes no zone', () => {
    const table = dealRevealFixture('bot-resolve-noeffect');
    const top = table.dilemmaStack[0];
    expect(top.face).toBe('up');
    expect(top.card.originalName).toContain('Conflict of Interests');
    expect(table.attempt?.revealSnapshot?.dilemmaId).toBe(top.id);

    const r = botResolveOf(table, undefined, { rand: Math.random });
    expect(r).toMatchObject({ resolvable: true, preview: 'No effect', changes: [] });
    if (!r.resolvable) return;

    const game = gameReducer(initialGameState(table), {
      type: 'resolveDilemma',
      dilemmaId: top.id,
      dilemma: 'Conflict of Interests',
      changes: r.changes,
      notes: r.notes,
    });
    const { attempt: before, ...zonesBefore } = table;
    const { attempt: after, ...zonesAfter } = game.table;
    expect(zonesAfter).toEqual(zonesBefore);
    expect(after?.revealSnapshot).toEqual({ ...before?.revealSnapshot, resolved: true });
    expect(logEntryText(game.log[game.log.length - 1])).toBe('Resolved Conflict of Interests: no effect');
  });

  it('keeps the ?fixture=bot-label reveal of Well-Prepared Defenses, whose Resolve stops the personnel the label names', () => {
    const table = dealRevealFixture('bot-label');
    expect(table.dilemmaStack[0].card.originalName).toContain('Well-Prepared Defenses');
    const r = botResolveOf(table);
    if (!r.resolvable) throw new Error(r.reason);
    expect(r.changes).toHaveLength(1);
    const name = r.preview.replace(/^Stops /, '');
    expect(botLabelOf(table)).toContain(`Chose ${name}`);
  });
});

describe('?fixture=bot-resolve-choice (#1593)', () => {
  const candidatesOf = (table: TableState) => {
    const r = botResolveOf(table);
    if (!r.resolvable) throw new Error(r.reason);
    return r;
  };

  it('reveals Covert Extraction: pending with no selection, and a press with one candidate selected stops exactly it, undone in one step', () => {
    const table = dealRevealFixture('bot-resolve-choice');
    const top = table.dilemmaStack[0];
    expect(top.card.originalName).toContain('Covert Extraction');
    const pending = candidatesOf(table);
    expect(pending).toMatchObject({ preview: 'Choose 1 personnel to be stopped', changes: [], pending: true });

    const crew = table.missions[2].ships[0].crew ?? [];
    const name = (id: string) => crew.find((c) => c.id === id)!.card.originalName as string;
    // A selected personnel the dilemma does not allow keeps the Resolve pending.
    const press = (selected: string[]) => botResolveOf(table, undefined, { rand: Math.random }, selected);
    const allowed = crew.filter((c) => c.card.type === 'personnel').map((c) => c.id).filter((id) => {
      const r = press([id]);
      return r.resolvable && !r.pending;
    });
    expect(allowed.length).toBeGreaterThan(0);
    expect(allowed.length).toBeLessThan(crew.filter((c) => c.card.type === 'personnel').length);
    const notAllowed = crew.find((c) => c.card.type === 'personnel' && !allowed.includes(c.id))!.id;
    expect(press([notAllowed])).toMatchObject({ pending: true, changes: [] });
    // The task names nobody.
    for (const c of crew) expect(pending.preview).not.toContain(c.card.originalName);

    const chosen = allowed[allowed.length - 1];
    const r = press([chosen]);
    if (!r.resolvable) throw new Error(r.reason);
    expect(r.changes).toEqual([{ op: 'stop', ids: [chosen] }]);
    const start = initialGameState(table);
    const game = gameReducer(start, { type: 'resolveDilemma', dilemmaId: top.id, dilemma: 'Covert Extraction', changes: r.changes, notes: r.notes });
    expect(game.log).toHaveLength(start.log.length + 1);
    expect(logEntryText(game.log[game.log.length - 1])).toContain(name(chosen));
    expect(game.table.missions[2].ships[0].crew?.find((c) => c.id === chosen)?.stopped).toBe(true);
    const undone = gameReducer(game, { type: 'undo' });
    expect(undone.table).toEqual(table);
  });

  it('takes an allowed personnel stopped by hand as the choice: nothing more is stopped', () => {
    const table = dealRevealFixture('bot-resolve-choice');
    const crew = table.missions[2].ships[0].crew ?? [];
    const allowed = crew.find((c) => {
      const r = botResolveOf(table, undefined, {}, [c.id]);
      return c.card.type === 'personnel' && r.resolvable && !r.pending;
    })!;
    const stopped = tableReducer(table, { type: 'setStopped', ids: [allowed.id], stopped: true });
    const r = botResolveOf(stopped, undefined, { rand: Math.random });
    if (!r.resolvable) throw new Error(r.reason);
    expect(r.pending).toBeUndefined();
    expect(r.changes).toEqual([]);
    expect(r.notes).toContainEqual({ kind: 'alreadyDone', op: 'stop', done: 1, of: 1 });
  });
});
