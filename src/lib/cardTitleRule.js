// The split of a card's `Name` into its card title and its subtitle (#1971), in plain CommonJS so
// that `scripts/split_columns.js` runs it with `node` and the app bundles it: the build of the card
// data and the playtest upload use the same rule. `data/card_titles.tsv` holds the split of every
// real card; the rule only fills a card the file does not hold yet, and a person checks its row.

/** @typedef {{ CollectorsInfo: string, Name: string, Title: string, Subtitle: string }} CardTitleRow */
/** @typedef {{ CollectorsInfo: string, Name: string, Type: string }} CardTitleCard */

/** The version suffixes of a deck line or a card name that one model covers, such as "*VP", "*VAP" or "(IDR)". */
const VERSION_SUFFIX = /\s*(\*VAP|\*VP|\*AP|\*A|\*|\((IDR|ID|FOW|R2|SR|AC|SS|Promo|MAH|BP)\))\s*$/i;

/** A card name less its version suffixes, quotes kept: "Sylvia *VP" is "Sylvia". @param {string} name @returns {string} */
function nameLessVersion(name) {
  let title = name.trim();
  while (VERSION_SUFFIX.test(title)) title = title.replace(VERSION_SUFFIX, '').trim();
  return title;
}

/** A card name less its version suffixes and the quotes around a whole name. @param {string} name @returns {string} */
function cardTitleOf(name) {
  return nameLessVersion(name.trim().replace(/^"(.*)"$/, '$1'));
}

// The types whose card may have a subtitle. A dilemma, an event, an interrupt and an equipment never has one.
const SUBTITLED_TYPES = new Set(['personnel', 'ship', 'mission']);

/**
 * The title and subtitle of a card with no row in `data/card_titles.tsv`. A personnel, a ship or a
 * mission takes the longest of `knownTitles` that its name starts with, ending at a space or at the
 * end of the name, so the title `Odo` does not take `Odo Founder`; the rest of the name, less its
 * version suffix, is the subtitle. Every other card, and one that matches no title, takes its name
 * less its version suffix as the title, with no subtitle. `rule` says which branch made the row.
 * @param {string} name
 * @param {string} type
 * @param {Set<string>} knownTitles
 * @returns {{ Title: string, Subtitle: string, rule: string }}
 */
function cardTitleByRule(name, type, knownTitles) {
  const base = nameLessVersion(name);
  if (SUBTITLED_TYPES.has(type.trim().toLowerCase())) {
    const words = base.split(' ');
    for (let i = words.length; i > 0; i--) {
      const title = words.slice(0, i).join(' ');
      if (knownTitles.has(title)) {
        return { Title: title, Subtitle: words.slice(i).join(' ').trim(), rule: `the known title "${title}"` };
      }
    }
    return { Title: base, Subtitle: '', rule: 'no known title: the whole name' };
  }
  return { Title: base, Subtitle: '', rule: `a ${type.trim().toLowerCase() || 'card'}: no subtitle` };
}

/**
 * The key of a card in `data/card_titles.tsv`: its `CollectorsInfo` and its `Name`, as the card data writes them.
 * @param {string} collectorsInfo
 * @param {string} name
 */
const cardTitleKey = (collectorsInfo, name) => `${collectorsInfo}\t${name}`;

const CARD_TITLES_COLUMNS = ['CollectorsInfo', 'Name', 'Title', 'Subtitle'];

/** The rows of `data/card_titles.tsv`: plain tab-separated text with no quotes. @param {string} text @returns {CardTitleRow[]} */
function parseCardTitlesTsv(text) {
  return text.split(/\r?\n/).slice(1).filter((line) => line !== '').map((line) => {
    const [CollectorsInfo = '', Name = '', Title = '', Subtitle = ''] = line.split('\t');
    return { CollectorsInfo, Name, Title, Subtitle };
  });
}

/** @param {CardTitleRow[]} rows @returns {string} */
function formatCardTitlesTsv(rows) {
  return [CARD_TITLES_COLUMNS, ...rows.map((row) => CARD_TITLES_COLUMNS.map((column) => row[column]))]
    .map((fields) => fields.join('\t')).join('\n') + '\n';
}

/**
 * The rows of `data/card_titles.tsv` that cover `cards` (`{ CollectorsInfo, Name, Type }`) exactly,
 * in their order, each key once. A row of `rows` is kept unchanged; a card with no row gets one by
 * `cardTitleByRule` (`added`, with its rule); a row whose key no card has is `dropped`. The known
 * titles are every title of `rows`, and the titles the rule added earlier in the same run.
 * @param {CardTitleCard[]} cards
 * @param {CardTitleRow[]} rows
 * @returns {{ rows: CardTitleRow[], byKey: Map<string, CardTitleRow>, added: { row: CardTitleRow, rule: string }[], dropped: CardTitleRow[] }}
 */
function joinCardTitles(cards, rows) {
  const existing = new Map(rows.map((row) => [cardTitleKey(row.CollectorsInfo, row.Name), row]));
  const knownTitles = new Set(rows.map((row) => row.Title));
  /** @type {Map<string, CardTitleRow>} */
  const byKey = new Map();
  /** @type {{ row: CardTitleRow, rule: string }[]} */
  const added = [];
  for (const card of cards) {
    const key = cardTitleKey(card.CollectorsInfo, card.Name);
    if (byKey.has(key)) continue;
    let row = existing.get(key);
    if (!row) {
      const { Title, Subtitle, rule } = cardTitleByRule(card.Name, card.Type, knownTitles);
      row = { CollectorsInfo: card.CollectorsInfo, Name: card.Name, Title, Subtitle };
      knownTitles.add(Title);
      added.push({ row, rule });
    }
    byKey.set(key, row);
  }
  const dropped = rows.filter((row) => !byKey.has(cardTitleKey(row.CollectorsInfo, row.Name)));
  return { rows: [...byKey.values()], byKey, added, dropped };
}

/** @param {string} value */
const unquoted = (value) => value.trim().replace(/^"(.*)"$/, '$1').trim();

/**
 * The match of `public/hof_retired.txt` against the titles. A line with a comma, such as "Aldea, Aid
 * Legendary Civilization", is a title and a subtitle, split at the first comma; a line with no comma
 * is a title, and every subtitle of it. `isRetired` reads a card's `Title` and `Subtitle`, and
 * `unmatched` lists the lines that no card read so far matched.
 * @param {string[]} lines
 * @returns {{ isRetired: (title: string, subtitle: string) => boolean, unmatched: () => string[] }}
 */
function hofMatcher(lines) {
  const entries = lines.map((line) => line.trim()).filter((line) => line !== '').map((line) => {
    const comma = line.indexOf(',');
    return comma < 0
      ? { line, title: line, subtitle: null }
      : { line, title: line.slice(0, comma).trim(), subtitle: line.slice(comma + 1).trim() };
  });
  /** @type {Set<string>} */
  const matched = new Set();
  return {
    isRetired(title, subtitle) {
      const hits = entries.filter((entry) => entry.title === unquoted(title)
        && (entry.subtitle === null || entry.subtitle === subtitle.trim()));
      hits.forEach((entry) => matched.add(entry.line));
      return hits.length > 0;
    },
    unmatched: () => entries.filter((entry) => !matched.has(entry.line)).map((entry) => entry.line),
  };
}

module.exports = {
  cardTitleByRule,
  cardTitleKey,
  cardTitleOf,
  formatCardTitlesTsv,
  hofMatcher,
  joinCardTitles,
  nameLessVersion,
  parseCardTitlesTsv,
};
