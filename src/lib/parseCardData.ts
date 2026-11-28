// The parse of the card data TSV, with no `fs`, so a client component can parse the playtest
// cards with it too (#1614). `loadCards.ts` reads the public file on the server and re-exports it.
import * as d3 from 'd3';
import { cardTitleByRule } from './cardTitleRule.js';

export interface CardData {
  collectorsinfo: string;
  dilemmatype: string;
  imagefile: string;
  name: string;
  type: string;
  originalName: string;
  // The card title and the subtitle of `name` (#1971), lowercased like every column, and in their
  // printed case beside `originalName`. `data/card_titles.tsv` holds the split of the real cards.
  title: string;
  subtitle: string;
  originalTitle: string;
  originalSubtitle: string;
  missiontype: string;
  unique: string;
  [key: string]: string | number;
}

const nonFilterColumns = ['ImageFile'];

export function parseCardData(text: string): { data: CardData[]; columns: string[] } {
  const parsedData = d3.tsvParse(text);
  // A playtest set stored before #1971 has no Title column: its rows get the split by the rule,
  // with the titles of the set's rows resolved before them as the known titles.
  const hasTitles = parsedData.length > 0 && 'Title' in parsedData[0];
  const knownTitles = new Set<string>();

  const formattedData = parsedData.map((row) => {
    if (!hasTitles) {
      const { Title, Subtitle } = cardTitleByRule(row.Name ?? '', row.Type ?? '', knownTitles);
      knownTitles.add(Title);
      row.Title = Title;
      row.Subtitle = Subtitle;
    }
    const newRow: Record<string, string | number> = Object.fromEntries(
      Object.entries(row).map(([key, value]) =>
        nonFilterColumns.includes(key)
          ? [key.toLowerCase(), value as number]
          : [key.toLowerCase(), (value as string).toLowerCase()],
      ),
    );
    newRow.originalName = row.Name!;
    newRow.originalTitle = row.Title ?? '';
    newRow.originalSubtitle = row.Subtitle ?? '';
    return newRow;
  });

  const dataWithStrippedCollectorsInfo = formattedData.map((row) => {
    const paddedCollectorsInfo = row.collectorsinfo as string;
    row.collectorsinfo = paddedCollectorsInfo.replace(/(^|[^0-9])0+(\d+)/g, '$1$2');
    return row;
  });

  const dataWithDotlessCommanderKeywords = dataWithStrippedCollectorsInfo.map((row) => {
    const dottedCommanderKeywords = row.keywords as string;
    row.keywords = dottedCommanderKeywords
      .replace(/U\.S\.S./i, 'uss')
      .replace(/I\.K\.S\./i, 'iks');
    return row;
  });

  const dataWithSingleImageFile = dataWithDotlessCommanderKeywords.map((row) => {
    const imageFile = row.imagefile as string;
    // A double-sided mission names two images (#765): the front first, then the back.
    const [front, back] = imageFile.split(',');
    row.imagefile = front;
    row.backimagefile = back ?? '';
    return row;
  });

  const dataWithSeparatedTypes = dataWithSingleImageFile.map((row) => {
    const type = (row.type as string).toLowerCase();
    row.missiontype = type === 'mission' ? ((row.mission as string) ?? '') : '';
    delete (row as Record<string, unknown>).mission;
    if (type !== 'dilemma')  row.dilemmatype = '';
    return row;
  });

  const columns = parsedData.length > 0
    ? Object.keys(parsedData[0]).map((key) => key.toLowerCase())
    : [];

  return {
    data: dataWithSeparatedTypes as CardData[],
    columns
  };
}
