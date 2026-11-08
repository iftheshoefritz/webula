// The dilemma piles the bot of a practice bot game can play (#1520): the Chula pile, and the decks of
// the two public folders whose dilemmas the pile bot's registry fully covers. It imports nothing from
// the practice table: the table hands it the folder rows, the deck texts and the parsed deck.

import { DeckList } from '../../types';
import { BeginnerDeck, beginnerDeckId, beginnerDeckTitle } from '../beginnerDecks';
import { ChampionshipDeck, championshipDeckId, championshipDeckTitle } from '../championshipDecks';
import { DeckCardRow, botAffiliationsOf, botPileOf } from './pile/pile';
import { pileTitleOf } from './pile/registry';

/** The id of the Chula pile, the default bot pile. */
export const CHULA_BOT_PILE_ID = 'chula';
export const CHULA_BOT_PILE_NAME = 'Chula';

/** A choice of the bot's pile: the id of its deck (`beginner:` or `championship:`, or `chula`) and its name. */
export interface BotPileChoice {
  id: string;
  name: string;
}

/**
 * The bot's pile of a bot game, as `TableState.botPile` keeps it: the choice, and the different
 * affiliations of the personnel of its deck's `Deck:` section (`botAffiliationsOf`), for Abrasive
 * Allies and Shocking Betrayal. The Chula pile has no `Deck:` section, so it has no affiliations.
 */
export interface BotPileInfo extends BotPileChoice {
  affiliations?: string[];
  // The deck's `Deck:` section holds Unexpected Difficulties (#1563), so the bot may redraw its dilemmas
  // once a game. Absent: it does not, as in a save from before #1563.
  unexpectedDifficulties?: true;
}

/** The title of the card that lets the bot redraw its dilemmas once a game (#1563). */
export const UNEXPECTED_DIFFICULTIES = 'Unexpected Difficulties';

/**
 * Whether a deck file's `Deck:` section, its draw deck, holds `title`, matched through `pileTitleOf` as
 * `botAffiliationsOf` matches a line, so a version suffix such as `*VP` or `(Promo)` does not count.
 */
export function deckSectionHolds(deckText: string, title: string): boolean {
  let section = '';
  for (const line of deckText.split('\n')) {
    if (/^\w+:\s*$/.test(line)) {
      section = line.trim();
      continue;
    }
    const match = /^(\d+)\t(.+?)\s*$/.exec(line);
    if (match && section === 'Deck:' && Number(match[1]) > 0 && pileTitleOf(match[2]) === title) return true;
  }
  return false;
}

export const CHULA_BOT_PILE: BotPileChoice = { id: CHULA_BOT_PILE_ID, name: CHULA_BOT_PILE_NAME };

/** Whether the registry covers every dilemma of a deck file: no title of its `Dilemmas:` section is missing. */
export const botPileCovered = (deckText: string): boolean => botPileOf(deckText).missing.length === 0;

/**
 * The choices of the bot's pile, in order: Chula first, then each beginner deck in index order, then
 * each Championship deck in row order. A folder deck shows only once its text is in `texts` and the
 * registry covers it, so a deck still loading, a failed fetch and an uncovered deck all stay out. The
 * rows are the ones the caller may see already: this function does not filter them by email.
 */
export function botPileChoices(
  beginnerDecks: ReadonlyArray<BeginnerDeck>,
  championshipDecks: ReadonlyArray<ChampionshipDeck>,
  texts: ReadonlyMap<string, string>,
): BotPileChoice[] {
  const folderDecks: BotPileChoice[] = [
    ...beginnerDecks.map((deck) => ({ id: beginnerDeckId(deck), name: beginnerDeckTitle(deck) })),
    ...championshipDecks.map((deck) => ({ id: championshipDeckId(deck), name: championshipDeckTitle(deck) })),
  ];
  return [
    CHULA_BOT_PILE,
    ...folderDecks.filter((choice) => {
      const text = texts.get(choice.id);
      return text !== undefined && botPileCovered(text);
    }),
  ];
}

/**
 * The bot's dilemma pile from a deck file: the dilemma rows of `deck`, the deck file parsed by
 * `deckFromTsv`, less every row whose title the registry marks `'ignore'` (#1320), and the
 * affiliations of its `Deck:` section, and whether that section holds Unexpected Difficulties (#1563).
 * Titles match through `pileTitleOf`, as `botPileOf` keys them.
 */
export function botPileDeckOf(
  deckText: string,
  deck: DeckList,
  rows: ReadonlyArray<DeckCardRow>,
): { pile: DeckList; affiliations: string[]; unexpectedDifficulties: boolean } {
  const ignored = new Set(botPileOf(deckText).ignored);
  const pile: DeckList = {};
  for (const [key, entry] of Object.entries(deck)) {
    if (entry.row?.type !== 'dilemma' || entry.count <= 0) continue;
    if (ignored.has(pileTitleOf(String(entry.row.originalName ?? '')))) continue;
    pile[key] = entry;
  }
  return {
    pile,
    affiliations: botAffiliationsOf(deckText, rows),
    unexpectedDifficulties: deckSectionHolds(deckText, UNEXPECTED_DIFFICULTIES),
  };
}
