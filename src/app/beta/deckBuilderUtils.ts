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
    const card = data.find((row: CardDef) =>  row.originalName === uploadCardName)
    if (card) {
      card.count = parseInt(qty);
      card.pile = cardPileFor(card);
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
