// Whether a personnel is the Commander of a ship (#1702): the one reading the range models of the
// practice table and the cost model of Captain on the Bridge share, so the two cannot drift.

/** A ship's or a lore name with no dots, as `useDataFetching` writes "U.S.S." in the keywords ("uss"). */
export const dotless = (name: string): string => name.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();

/**
 * Whether the keywords `keywords` of a personnel make it the Commander of the ship titled `shipTitle`: a
 * "Commander: <name>." keyword whose name is the ship's title, or its title less the subtitle
 * ("Commander: uss defiant." of "U.S.S. Defiant Prototype Warship").
 */
export function isCommanderOf(keywords: string, shipTitle: string): boolean {
  const title = dotless(shipTitle);
  const text = keywords.toLowerCase().replace(/u\.s\.s\./g, 'uss').replace(/i\.k\.s\./g, 'iks');
  return Array.from(text.matchAll(/commander:\s*([^.;]+)/g)).some(([, name]) => {
    const lore = dotless(name);
    return lore !== '' && (title === lore || title.startsWith(`${lore} `));
  });
}
