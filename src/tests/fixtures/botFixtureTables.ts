// The tables the page deals for the revealing bot fixtures (`BOT_REVEAL_FIXTURES`, #1589), shared by the
// tests that read them (`botResolveFixture`, `botTableInputProjection`, #1879).
import { readFileSync } from 'fs';
import { join } from 'path';
import { deckFromTsv, extractDilemmas, extractDrawDeck, extractMissions, mergeDeckPiles } from '../../app/decks/deckBuilderUtils';
import { PRACTICE_DECK_TSV } from '../../lib/practiceDeck';
import { chulaPileDeck } from '../../lib/dilemmaBot/chulaPile';
import { collectorsKey } from '../../lib/dilemmaBot/opponentPile';
import { BOT_REVEAL_FIXTURES, BotRevealFixture, fixtureBotLabelAttempt } from '../../app/decks/practice/attempt';
import { FIXTURE_SHIP_SLOT, createCardInstances, initialTableState, tableReducer, TableAction, TableState } from '../../app/decks/practice/tableReducer';
import { withShuffleOrders } from '../../app/decks/practice/gameLog';

// The rows are read by hand, normalised as `parseCardData` does: Jest does not load the real d3.
export const cardData: any[] = (() => {
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

const data = cardData;

/** Extra cards of a fixture's deal: rows that join the end of the core and of the hand (`?fixture=bot-select-again`). */
export interface BotFixtureExtras {
  core?: any[];
  hand?: any[];
}

// The bot fixture's deck (`?fixture=bot`): the fixture deck with the Chula pile in place of its dilemmas.
const botDeckOf = () => mergeDeckPiles(deckFromTsv(PRACTICE_DECK_TSV, data), chulaPileDeck(data), ['dilemmaPile']);

// `deck` dealt as `?fixture=piles` does, as a bot game, with `extras` at the end of the core and the hand.
function dealBotDeck(deck: any, extras: BotFixtureExtras): TableState {
  const cards = extractDrawDeck(deck);
  const deal: TableAction = {
    type: 'resetWithPiles',
    cards: createCardInstances([...cards, ...cards.filter((c: any) => c.type === 'personnel')]),
    missions: createCardInstances(extractMissions(deck), 'up'),
    dilemmas: createCardInstances(extractDilemmas(deck)),
    opponent: 'bot',
    ...(extras.core ? { extraCore: createCardInstances(extras.core) } : {}),
    ...(extras.hand ? { extraHand: createCardInstances(extras.hand) } : {}),
  };
  return tableReducer(initialTableState, deal);
}

/** The table of `?fixture=bot` (#1289): the piles deal as a bot game, with no attempt. */
export const dealBotFixture = (extras: BotFixtureExtras = {}): TableState => dealBotDeck(botDeckOf(), extras);

// The table the page deals for a revealing bot fixture: the fixture deck with the Chula pile and the
// fixture's dilemma, dealt as `?fixture=piles`, then the bot attempt with that dilemma revealed on top.
// `roll`: the flip goes through `withShuffleOrders`, as the page dispatches it, so it carries the roll
// of a dilemma whose selection comes before the player's choice (#1594). The attempt is at the fixture's
// `awayTeamSlot` when it has one, and its mission takes that slot's place.
export function dealRevealFixtureWithDeck(fixture: string | BotRevealFixture, roll = false, extras: BotFixtureExtras = {}) {
  const { title, collectorsInfo, next, mission, spend, awayTeamSlot } = typeof fixture === 'string' ? BOT_REVEAL_FIXTURES[fixture] : fixture;
  const botDeck = botDeckOf();
  const rowOf = (info: string) => {
    const row = data.find((r) => r.collectorsinfo === collectorsKey(info));
    expect(row).toBeDefined();
    return { [row.collectorsinfo]: { count: 1, row: { ...row, count: 1, pile: 'dilemmaPile' } } };
  };
  const withDilemmas = { ...botDeck, ...rowOf(collectorsInfo), ...(next ? rowOf(next.collectorsInfo) : {}) };
  // The fixture's mission takes the place of the attempted slot's, Bilana System, the third (#1760), as the page's deck does.
  const missionRow = mission ? data.find((r) => r.collectorsinfo === collectorsKey(mission)) : undefined;
  let slot = 0;
  const deck = missionRow
    ? Object.fromEntries(
        Object.entries(withDilemmas).map(([key, entry]: [string, any]) =>
          entry.row.type === 'mission' && slot++ === (awayTeamSlot ?? FIXTURE_SHIP_SLOT)
            ? [missionRow.collectorsinfo, { count: 1, row: { ...missionRow, count: 1, pile: 'mission' } }]
            : [key, entry],
        ),
      )
    : withDilemmas;
  let table = dealBotDeck(deck, extras);
  const attempt = fixtureBotLabelAttempt(table, title, spend, awayTeamSlot);
  if (!attempt) throw new Error('no fixture attempt');
  table = tableReducer(table, attempt.start);
  table = tableReducer(table, { type: 'setAttemptPhase', phase: 'face' });
  for (const move of attempt.stack) table = tableReducer(table, move);
  const flip: TableAction = { type: 'flip', id: attempt.revealId };
  const action = roll ? withShuffleOrders(table, flip) : flip;
  if (action.type !== 'flip') throw new Error('not a flip');
  return { table: tableReducer(table, action), deck };
}
