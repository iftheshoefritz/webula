// Issue #1847: Let's Try That Again, Shall We? in the core rolls the kept selection of a revealed planet
// dilemma again, and Dessert Disaster in the hand swaps a selected personnel with no staffing icon for a
// [Stf] one, each in one log entry that one undo takes back.
import { readFileSync } from 'fs';
import { join } from 'path';
import { cardPileFor, deckFromTsv, extractDilemmas, extractDrawDeck, extractMissions, mergeDeckPiles } from '../../../app/decks/deckBuilderUtils';
import { PRACTICE_BOT_SELECT_AGAIN_TSV, PRACTICE_DECK_TSV } from '../../../lib/practiceDeck';
import { chulaPileDeck } from '../../../lib/dilemmaBot/chulaPile';
import { collectorsKey } from '../../../lib/dilemmaBot/opponentPile';
import { BOT_REVEAL_FIXTURES, botResolveOf, fixtureBotLabelAttempt, revealPicksOf } from '../../../app/decks/practice/attempt';
import {
  REPLACE_PICK_TITLE,
  SELECT_AGAIN_TITLE,
  TableAction,
  TableState,
  createCardInstances,
  findInstanceAnywhere,
  initialTableState,
  replacePickOptionsOf,
  selectAgainEventOf,
  tableReducer,
} from '../../../app/decks/practice/tableReducer';
import { gameReducer, initialGameState, logEntryText, withShuffleOrders } from '../../../app/decks/practice/gameLog';

jest.mock('posthog-js', () => ({ capture: jest.fn() }));

// The rows are read by hand, normalised as `parseCardData` does, as `botResolveFixture.test.ts` does.
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
    if (row.type !== 'dilemma') row.dilemmatype = '';
    return row;
  });
})();

// A seeded random function, so each roll is the same on every run.
const seeded = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

// `?fixture=bot-select-again`: the bot table with Hard of Heart revealed on top at Moab IV's away team,
// Let's Try That Again at the end of the core and Dessert Disaster at the end of the hand, as the page
// deals it. `withCards: false` leaves both out.
function dealSelectAgain(withCards = true, seed = 7): TableState {
  const { title, collectorsInfo, awayTeamSlot } = BOT_REVEAL_FIXTURES['bot-select-again'];
  const botDeck = mergeDeckPiles(deckFromTsv(PRACTICE_DECK_TSV, data), chulaPileDeck(data), ['dilemmaPile']);
  const row = data.find((r) => r.collectorsinfo === collectorsKey(collectorsInfo));
  const deck = { ...botDeck, [row.collectorsinfo]: { count: 1, row: { ...row, count: 1, pile: 'dilemmaPile' } } };
  const extras = extractDrawDeck(deckFromTsv(PRACTICE_BOT_SELECT_AGAIN_TSV, data));
  expect(extras.map((c: any) => c.originalName)).toEqual([SELECT_AGAIN_TITLE, REPLACE_PICK_TITLE]);
  const cards = extractDrawDeck(deck);
  const deal: TableAction = {
    type: 'resetWithPiles',
    cards: createCardInstances([...cards, ...cards.filter((c: any) => c.type === 'personnel')]),
    missions: createCardInstances(extractMissions(deck), 'up'),
    dilemmas: createCardInstances(extractDilemmas(deck)),
    opponent: 'bot',
    ...(withCards
      ? { extraCore: createCardInstances(extras.filter((c: any) => c.type === 'event')), extraHand: createCardInstances(extras.filter((c: any) => c.type !== 'event')) }
      : {}),
  };
  let table = tableReducer(initialTableState, deal);
  const attempt = fixtureBotLabelAttempt(table, title, undefined, awayTeamSlot);
  if (!attempt) throw new Error('no fixture attempt');
  table = tableReducer(table, attempt.start);
  table = tableReducer(table, { type: 'setAttemptPhase', phase: 'face' });
  for (const move of attempt.stack) table = tableReducer(table, move);
  const flip: TableAction = { type: 'flip', id: attempt.revealId, picks: revealPicksOf(tableReducer(table, { type: 'flip', id: attempt.revealId }), seeded(seed)) };
  return tableReducer(table, flip);
}

const picksOf = (table: TableState) => table.attempt!.revealSnapshot!.picks!;
const idsOfChanges = (table: TableState) => {
  const r = botResolveOf(table);
  if (!r.resolvable) throw new Error(r.reason);
  return r.changes.flatMap((c) => c.ids);
};

describe("Let's Try That Again, Shall We? (#1847)", () => {
  it('deals Hard of Heart revealed at Moab IV with a kept roll, and the event in the core', () => {
    const table = dealSelectAgain();
    const top = table.dilemmaStack[0];
    expect(top.card.originalName).toBe('Hard of Heart');
    expect(top.face).toBe('up');
    expect(table.attempt?.missionIndex).toBe(0);
    expect(picksOf(table).flat()).toHaveLength(2);
    expect(selectAgainEventOf(table)?.card.originalName).toBe(SELECT_AGAIN_TITLE);
  });

  it('replaces the picks and moves the event to the discard pile, and one undo restores both', () => {
    const table = dealSelectAgain();
    const event = selectAgainEventOf(table)!;
    // A roll that differs from the kept one.
    let picks: string[][] | undefined;
    for (let seed = 1; seed < 50 && !picks; seed++) {
      const roll = revealPicksOf(table, seeded(seed * 31));
      if (roll && JSON.stringify(roll) !== JSON.stringify(picksOf(table))) picks = roll;
    }
    expect(picks).toBeDefined();
    const game = gameReducer(initialGameState(table), { type: 'selectAgain', eventId: event.id, picks });
    expect(picksOf(game.table)).toEqual(picks);
    expect(game.table.core.some((c) => c.id === event.id)).toBe(false);
    expect(game.table.discard[game.table.discard.length - 1].id).toBe(event.id);
    expect(game.log).toHaveLength(1);
    expect(logEntryText(game.log[0])).toBe(`${SELECT_AGAIN_TITLE}: Hard of Heart selected again, and ${SELECT_AGAIN_TITLE} went to the discard pile`);
    // The Resolve reads the new roll.
    const changed = idsOfChanges(game.table);
    expect(changed.every((id) => picks!.flat().includes(id))).toBe(true);
    // No second copy: the control is gone.
    expect(selectAgainEventOf(game.table)).toBeUndefined();
    expect(gameReducer(game, { type: 'undo' }).table).toEqual(table);
  });

  it('rolls the picks in withShuffleOrders, so the reducer gets them from the page', () => {
    const table = dealSelectAgain();
    const action = withShuffleOrders(table, { type: 'selectAgain', eventId: selectAgainEventOf(table)!.id });
    expect(action.type === 'selectAgain' && action.picks?.flat()).toHaveLength(2);
  });

  it('is absent with no copy in the core, and for a dual dilemma', () => {
    expect(selectAgainEventOf(dealSelectAgain(false))).toBeUndefined();
    const table = dealSelectAgain();
    const [top, ...rest] = table.dilemmaStack;
    const dual = { ...table, dilemmaStack: [{ ...top, card: { ...top.card, dilemmatype: 'd' } }, ...rest] };
    expect(selectAgainEventOf(dual)).toBeUndefined();
    expect(tableReducer(dual, { type: 'selectAgain', eventId: selectAgainEventOf(table)!.id, picks: picksOf(table) })).toBe(dual);
  });

  it('is absent once the revealed dilemma is resolved', () => {
    const table = dealSelectAgain();
    const resolved = { ...table, attempt: { ...table.attempt!, revealSnapshot: { ...table.attempt!.revealSnapshot!, resolved: true as const } } };
    expect(selectAgainEventOf(resolved)).toBeUndefined();
  });
});

describe('Dessert Disaster (#1847)', () => {
  const hasIcon = (table: TableState, id: string, icon: RegExp) => icon.test(String(findInstanceAnywhere(table, id)?.instance.card.icons ?? ''));

  // A seed whose kept roll picks a personnel with no staffing icon while a [Stf] one stays unpicked.
  const dealWithOptions = () => {
    for (let seed = 1; seed < 200; seed++) {
      const table = dealSelectAgain(true, seed);
      if (replacePickOptionsOf(table)) return table;
    }
    throw new Error('no seed gives Dessert Disaster a swap');
  };

  it('offers the selected personnel with no staffing icon and the unselected [Stf] ones', () => {
    const table = dealWithOptions();
    const options = replacePickOptionsOf(table)!;
    const picked = picksOf(table).flat();
    expect(findInstanceAnywhere(table, options.cardId)?.zone).toBe('hand');
    for (const id of options.from) {
      expect(picked).toContain(id);
      expect(hasIcon(table, id, /\[(cmd|stf)\]/)).toBe(false);
    }
    for (const id of options.to) {
      expect(picked).not.toContain(id);
      expect(hasIcon(table, id, /\[stf\]/)).toBe(true);
    }
  });

  it('puts the [Stf] personnel in the picks, the Resolve acts on it, and one undo restores both', () => {
    const table = dealWithOptions();
    const { cardId, from: [from], to: [to] } = replacePickOptionsOf(table)!;
    const game = gameReducer(initialGameState(table), { type: 'replacePick', cardId, from, to });
    expect(picksOf(game.table).flat()).toContain(to);
    expect(picksOf(game.table).flat()).not.toContain(from);
    expect(game.table.discard[game.table.discard.length - 1].id).toBe(cardId);
    expect(game.table.hand.some((c) => c.id === cardId)).toBe(false);
    expect(logEntryText(game.log[0])).toMatch(new RegExp(`^${REPLACE_PICK_TITLE}: replaced .+ with .+ in the selection of Hard of Heart`));
    const changed = idsOfChanges(game.table);
    expect(changed).not.toContain(from);
    if (changed.length) expect(changed).toContain(to);
    expect(gameReducer(game, { type: 'undo' }).table).toEqual(table);
  });

  it('refuses a swap of a personnel the roll did not pick', () => {
    const table = dealWithOptions();
    const { cardId, to: [to] } = replacePickOptionsOf(table)!;
    expect(tableReducer(table, { type: 'replacePick', cardId, from: to, to })).toBe(table);
    expect(replacePickOptionsOf(dealSelectAgain(false))).toBeNull();
  });

  it('keeps the fixture card pile of the select-again cards apart from the piles deal', () => {
    const rows = extractDrawDeck(deckFromTsv(PRACTICE_BOT_SELECT_AGAIN_TSV, data));
    expect(rows.map((r: any) => cardPileFor(r))).toEqual(['drawDeck', 'drawDeck']);
  });
});
