// The bot's dilemma pile of a bot game (#1520): the Chula pile, a Beginner Deck's or a Championship
// deck's. It imports nothing from the practice table: the table fetches the deck texts, parses them,
// and merges the pile this file gives into the player's deck, as it merges `chulaPileDeck`.

import { DeckList } from '../../types';
import { BotPile, DeckCardRow, botAffiliationsOf, botPileOf } from './pile/pile';
import { pileTitleOf } from './pile/registry';

/** The bot pile of a game: `'chula'`, or the id of the deck (`beginner:…`, `championship:…`) whose dilemmas the bot plays. */
export interface BotPileChoice {
  id: string;
  /** The name the chooser and the game menu show. */
  name: string;
}

export const CHULA_PILE_ID = 'chula';
export const CHULA_PILE_CHOICE: BotPileChoice = { id: CHULA_PILE_ID, name: 'Chula' };

/** Whether the registry models every dilemma of a deck: `botPileOf(...).missing` is empty. */
export const botPileCovered = (deckText: string): boolean => botPileOf(deckText).missing.length === 0;

/**
 * The bot piles a player may choose, in order: Chula first, then each Beginner Deck, then each
 * Championship deck, each only when its text has arrived and the registry covers it. The callers
 * pass only the decks the player may see, so this filters by coverage alone. A deck with no text,
 * because its fetch failed or has not ended, is left out.
 */
export function botPileChoices(
  beginner: ReadonlyArray<BotPileChoice>,
  championship: ReadonlyArray<BotPileChoice>,
  texts: ReadonlyMap<string, string>,
): BotPileChoice[] {
  const covered = (deck: BotPileChoice) => {
    const text = texts.get(deck.id);
    return text !== undefined && botPileCovered(text);
  };
  return [CHULA_PILE_CHOICE, ...beginner.filter(covered), ...championship.filter(covered)];
}

/**
 * The bot's side of a deck: its dilemma pile, as the dilemma entries of `parsed` (the deck as
 * `deckFromTsv` reads `deckText`) less every entry whose title `pile` ignores or lacks, so the ignored
 * titles of #1320 leave the pile when the game starts; and the affiliations of the personnel of its
 * `Deck:` section (Abrasive Allies, Shocking Betrayal). `pile` defaults to `botPileOf(deckText)`.
 */
export function botPileDeckOf(
  deckText: string,
  parsed: DeckList,
  rows: ReadonlyArray<DeckCardRow>,
  pile: BotPile = botPileOf(deckText),
): { pile: DeckList; affiliations: string[] } {
  const dropped = new Set([...pile.ignored, ...pile.missing]);
  const out: DeckList = {};
  for (const [key, entry] of Object.entries(parsed)) {
    if (entry?.row?.type !== 'dilemma') continue;
    if (dropped.has(pileTitleOf(String(entry.row.originalName ?? '')))) continue;
    out[key] = { ...entry, row: { ...entry.row, pile: 'dilemmaPile' } };
  }
  return { pile: out, affiliations: botAffiliationsOf(deckText, rows) };
}
