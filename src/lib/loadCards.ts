import { readFileSync } from 'fs';
import { join } from 'path';
import { parseCardData, type CardData } from './parseCardData';

export { parseCardData } from './parseCardData';
export type { CardData } from './parseCardData';

let cachedData: { data: CardData[]; columns: string[] } | null = null;

export function loadCards(): { data: CardData[]; columns: string[] } {
  if (cachedData) {
    return cachedData;
  }

  const filePath = join(process.cwd(), 'public', 'cards_with_processed_columns.txt');
  const text = readFileSync(filePath, 'utf-8');
  cachedData = parseCardData(text);

  return cachedData;
}
