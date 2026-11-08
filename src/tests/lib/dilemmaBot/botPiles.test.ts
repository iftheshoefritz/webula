// Issue #1520: the choices of the bot's pile of a practice bot game, and the bot's dilemma pile and
// affiliations from a chosen deck.
import { readFileSync } from 'fs';
import { join } from 'path';
import { CHULA_BOT_PILE, UNEXPECTED_DIFFICULTIES, botPileChoices, botPileDeckOf, deckSectionHolds } from '../../../lib/dilemmaBot/botPiles';
import * as pileModule from '../../../lib/dilemmaBot/pile/pile';
import { botAffiliationsOf, botPileOf } from '../../../lib/dilemmaBot/pile/pile';
import { pileTitleOf } from '../../../lib/dilemmaBot/pile/registry';
import { beginnerDeckId } from '../../../lib/beginnerDecks';
import type { BeginnerDeck } from '../../../lib/beginnerDecks';
import { championshipDeckId } from '../../../lib/championshipDecks';
import type { ChampionshipDeck } from '../../../lib/championshipDecks';
import { deckFromTsv } from '../../../app/decks/deckBuilderUtils';
import { pileTableInputOf } from '../../../app/decks/practice/attempt';
import { initialTableState } from '../../../app/decks/practice/tableReducer';

jest.mock('posthog-js', () => ({ capture: jest.fn() }));
jest.mock('../../../lib/dilemmaBot/pile/pile', () => {
  const actual = jest.requireActual('../../../lib/dilemmaBot/pile/pile');
  return { ...actual, botPileOf: jest.fn(actual.botPileOf) };
});

// The rows are read by hand, lowercased as `parseCardData` does: Jest does not load the real d3.
const data = (() => {
  const [head, ...rows] = readFileSync(join(process.cwd(), 'public', 'cards_with_processed_columns.txt'), 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\t').map((cell) => cell.replace(/^"|"$/g, '')));
  return rows.map((r) => {
    const row: any = Object.fromEntries(head.map((h, i) => [h.toLowerCase(), (r[i] ?? '').toLowerCase()]));
    row.collectorsinfo = row.collectorsinfo.replace(/(^|[^0-9])0+(\d+)/g, '$1$2');
    row.originalName = r[head.indexOf('Name')];
    return row;
  });
})();

const BEGINNER_DIR = join(process.cwd(), 'public', 'beginner-decks');
const beginnerDecks: BeginnerDeck[] = JSON.parse(readFileSync(join(BEGINNER_DIR, 'index.json'), 'utf-8'));
const beginnerText = (deck: BeginnerDeck) => readFileSync(join(BEGINNER_DIR, deck.file), 'utf-8');

const championship = (file: string): ChampionshipDeck => ({
  event: 'Worlds',
  tournamentId: 1,
  deckId: 1,
  deckName: file,
  player: 'P',
  file,
  source: '',
  authorizedUse: true,
});
const COVERED = 'Dilemmas:\n1\tChula: Echoes\n';
const UNCOVERED = 'Dilemmas:\n1\tA Dilemma No Model Has\n';

describe('botPileChoices (#1520)', () => {
  it('lists Chula first, then every beginner deck in index order: the registry covers all 14', () => {
    const texts = new Map(beginnerDecks.map((d) => [beginnerDeckId(d), beginnerText(d)]));
    const choices = botPileChoices(beginnerDecks, [], texts);
    expect(beginnerDecks).toHaveLength(14);
    expect(choices[0]).toEqual(CHULA_BOT_PILE);
    expect(choices.slice(1).map((c) => c.id)).toEqual(beginnerDecks.map(beginnerDeckId));
    expect(choices[1].name).toBe(`${beginnerDecks[0].deckName} - ${beginnerDecks[0].player}`);
  });

  it('lists only the covered Championship decks of the rows it gets, after the beginner decks', () => {
    expect(botPileOf(COVERED).missing).toEqual([]);
    const [covered, uncovered, loading] = ['a.txt', 'b.txt', 'c.txt'].map(championship);
    const beginner = beginnerDecks[0];
    const texts = new Map([
      [championshipDeckId(covered), COVERED],
      [championshipDeckId(uncovered), UNCOVERED],
      [beginnerDeckId(beginner), beginnerText(beginner)],
    ]);
    const choices = botPileChoices([beginner], [covered, uncovered, loading], texts);
    expect(choices.map((c) => c.id)).toEqual(['chula', beginnerDeckId(beginner), championshipDeckId(covered)]);
  });

  it('holds only Chula while no text has arrived', () => {
    expect(botPileChoices(beginnerDecks, [championship('a.txt')], new Map())).toEqual([CHULA_BOT_PILE]);
  });
});

describe('botPileDeckOf (#1520)', () => {
  const beginner = beginnerDecks[0];
  const text = beginnerText(beginner);
  const deck = deckFromTsv(text, data);
  const total = (d: Record<string, { count: number }>) => Object.values(d).reduce((n, e) => n + e.count, 0);

  it('takes the deck\'s dilemmas, every copy the bot plays, and the affiliations of its Deck: section', () => {
    const { pile, affiliations } = botPileDeckOf(text, deck, data);
    expect(Object.values(pile).every((e) => e.row.type === 'dilemma')).toBe(true);
    expect(total(pile)).toBe(botPileOf(text).played.length);
    expect(affiliations).toEqual(botAffiliationsOf(text, data));
    expect(affiliations.length).toBeGreaterThan(0);
  });

  it('leaves out the titles the registry ignores', () => {
    const { pile: full } = botPileDeckOf(text, deck, data);
    const dropped = pileTitleOf(String(Object.values(full)[0].row.originalName));
    const actual = botPileOf(text);
    (pileModule.botPileOf as jest.Mock).mockReturnValueOnce({
      played: actual.played.filter((t) => t !== dropped),
      ignored: actual.played.filter((t) => t === dropped),
      missing: [],
    });
    const { pile } = botPileDeckOf(text, deck, data);
    expect(Object.values(pile).some((e) => pileTitleOf(String(e.row.originalName)) === dropped)).toBe(false);
    expect(total(pile)).toBe(actual.played.filter((t) => t !== dropped).length);
  });
});

describe('Unexpected Difficulties in the bot\'s deck (#1563)', () => {
  const tos = beginnerDecks.find((d) => d.file.startsWith('TOS Beginner Deck'))!;

  it('is held by the TOS Beginner Deck, whose Deck: section lists it with a version suffix', () => {
    const text = beginnerText(tos);
    expect(deckSectionHolds(text, UNEXPECTED_DIFFICULTIES)).toBe(true);
    expect(botPileDeckOf(text, deckFromTsv(text, data), data).unexpectedDifficulties).toBe(true);
  });

  it('is not held by a deck that lacks it, or lists it only outside its Deck: section', () => {
    const lacking = beginnerDecks.find((d) => !/Unexpected Difficulties/.test(beginnerText(d)))!;
    const text = beginnerText(lacking);
    expect(botPileDeckOf(text, deckFromTsv(text, data), data).unexpectedDifficulties).toBe(false);
    expect(deckSectionHolds('Dilemmas:\n1\tUnexpected Difficulties\n', UNEXPECTED_DIFFICULTIES)).toBe(false);
    expect(deckSectionHolds('Deck:\n1\tUnexpected Difficulties (Promo)\n', UNEXPECTED_DIFFICULTIES)).toBe(true);
  });
});

describe('pileTableInputOf and the bot\'s pile (#1520)', () => {
  it('hands the bot deck\'s affiliations to the attempt, and none for the Chula pile', () => {
    const botPile = { id: 'beginner:x.txt', name: 'X', affiliations: ['klingon'] };
    expect(pileTableInputOf({ ...initialTableState, opponent: 'bot', botPile }, 0).botAffiliations).toEqual(['klingon']);
    expect(pileTableInputOf({ ...initialTableState, opponent: 'bot' }, 0).botAffiliations).toBeUndefined();
  });

  it('hands the player\'s score to the attempt (#1541)', () => {
    expect(pileTableInputOf({ ...initialTableState, opponent: 'bot', score: 5 }, 0).score).toBe(5);
    expect(pileTableInputOf({ ...initialTableState, opponent: 'bot' }, 0).score).toBe(0);
  });
});
