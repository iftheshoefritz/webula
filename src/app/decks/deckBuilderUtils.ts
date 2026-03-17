import { track } from '@vercel/analytics'
import { CardDef } from "../../types"

export const numericCount = (withPotentialCount?: {count?: number}): number => ( withPotentialCount?.count ?? 0 )

export const belowMaximumCount = (withPotentialCount?: {count?: number}, maxCount = 3): boolean => ( numericCount(withPotentialCount) < maxCount )

export const aboveMinimumCount = (withPotentialCount?: {count?: number}, minCount = 0): boolean => ( numericCount(withPotentialCount) > minCount )

export const findExisting = (deck, row) => (deck[row.collectorsinfo]?.row)

export const findExistingOrUseRow = (deck, row) => (
  findExisting(deck, row) ?? row
)

export const cardPileFor = (card: CardDef) => {
  switch(card.type) {
    case "mission": return "mission";
    case "dilemma": return "dilemma";
    default: return "draw";
  }
}

export const incrementedRow = (row) => (
  {...row, count: numericCount(row) + 1, pile: cardPileFor(row)}
)

export const decrementedRow = (row) => ({...row, count: numericCount(row) - 1})

export const parsedDeck = (lines: Array<string>, data: Array<any>) => {
  const deck = {}
  for (const line of lines) {
    const [qty, uploadCardName] = line.split('\t').map((x) => x.trim())
    const found = data.find((row: CardDef) =>  row.originalName === uploadCardName)
    if (found) {
      const card = { ...found, count: parseInt(qty), pile: cardPileFor(found) };
      deck[card.collectorsinfo] = {
        count: parseInt(qty),
        row: card
      }
    } else {
      track('deckBuilder.handleFileLoad.unknownCard', {card: uploadCardName})
    }
  }
  return deck
}

export const deckFromTsv = (tsv: string, data: Array<any>) => (
  parsedDeck(tsv.trim().split('\n'), data)
)

export const expandDeck = (deck: import('../../types').Deck): any[] => {
  const result: any[] = [];
  for (const entry of Object.values(deck)) {
    if (cardPileFor(entry.row) === 'draw') {
      for (let i = 0; i < entry.count; i++) {
        result.push({ ...entry.row });
      }
    }
  }
  return result;
}

export type DeckPile = 'mission' | 'dilemma' | 'draw';

export function mergeDeckPiles(current: import('../../types').Deck, incoming: import('../../types').Deck, piles: DeckPile[]): import('../../types').Deck {
  const kept = Object.fromEntries(
    Object.entries(current).filter(([, v]) => !piles.includes(cardPileFor(v.row) as DeckPile))
  );
  const added = Object.fromEntries(
    Object.entries(incoming).filter(([, v]) => piles.includes(cardPileFor(v.row) as DeckPile))
  );
  return { ...kept, ...added };
}

export const shuffleArray = <T>(arr: T[]): T[] => {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
