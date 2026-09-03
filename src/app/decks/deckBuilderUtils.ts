import posthog from 'posthog-js'
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
      posthog.capture('deckBuilder.handleFileLoad.unknownCard', {card: uploadCardName})
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

export type BulkImportFileInput = { name: string; content: string };
export type BulkImportPayload = { title: string; content: string };
export type BulkImportFailure = { name: string; error: string };

const stripTxtExtension = (name: string): string => name.replace(/\.txt$/i, '')

// De-duplicates titles that collide after stripping the file extension by appending a
// numeric suffix (e.g. "Deck (2)"), so the resulting Drive files and per-file result list
// stay distinguishable. Drive itself allows duplicate names across different files, so this
// is purely a within-batch concern — no check against a user's other saved decks is needed.
const deduplicateTitles = (titles: string[]): string[] => {
  const seenCounts: Record<string, number> = {}
  return titles.map((title) => {
    const count = (seenCounts[title] ?? 0) + 1
    seenCounts[title] = count
    return count === 1 ? title : `${title} (${count})`
  })
}

// Builds the /api/drive/bulk payload for a batch of locally selected LackeyCCG export files.
// Each file is parsed with deckFromTsv against the loaded card data to confirm it's a
// recognizable LackeyCCG export before being included: deckFromTsv/parsedDeck silently drop
// unrecognized lines rather than throwing, so a non-LackeyCCG file parses to an empty deck.
// An empty parse is reported as a failure and excluded from the batch, rather than silently
// uploading an empty deck.
export const buildBulkImportPayloads = (
  files: BulkImportFileInput[],
  data: Array<any>
): { payloads: BulkImportPayload[]; failures: BulkImportFailure[] } => {
  const failures: BulkImportFailure[] = []
  const recognized = files.filter((file) => {
    const isEmpty = Object.keys(deckFromTsv(file.content, data)).length === 0
    if (isEmpty) failures.push({ name: file.name, error: 'Not a recognized LackeyCCG deck file' })
    return !isEmpty
  })

  const titles = deduplicateTitles(recognized.map((file) => stripTxtExtension(file.name)))
  const payloads = recognized.map((file, index) => ({ title: titles[index], content: file.content }))

  return { payloads, failures }
}

export const shuffleArray = <T>(arr: T[]): T[] => {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
