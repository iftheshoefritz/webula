// Whether a personnel is the Commander of a ship (#1702): the one reading the range models of the
// practice table and the cost model of Captain on the Bridge share, so the two cannot drift.

/** A ship's or a lore name with no dots, as `useDataFetching` writes "U.S.S." in the keywords ("uss"). */
export const dotless = (name: string): string => name.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();

/**
 * Whether the keywords `keywords` of a personnel make it the Commander of the ship whose card title is
 * `shipTitle`: a "Commander: <name>." keyword whose name equals the ship's card title, any case, the subtitle
 * never read ("Commander: uss defiant." of U.S.S. Defiant, Prototype Warship). "When you name a card, you do so
 * by card title only, not subtitle." (Glossary › naming cards, p. 18). Every "Commander:" keyword of the card
 * data names a ship by its card title (#1986), so no name needs an exception; `commander.test.ts` checks it.
 */
export function isCommanderOf(keywords: string, shipTitle: string): boolean {
  const title = dotless(shipTitle);
  // A dotted prefix ("U.S.S.", "I.S.S.", "E.C.S.") loses its dots first, so the name does not end at them (#1724).
  // The keywords of a play come split at each dot and joined with ". " ("e. c. s. horizon"), so spaces may follow.
  const text = keywords.toLowerCase().replace(/\b[a-z](?:\.\s*[a-z]\b)+\./g, (prefix) => prefix.replace(/[^a-z]/g, ''));
  return Array.from(text.matchAll(/commander:\s*([^.;]+)/g)).some(([, name]) => {
    const lore = dotless(name);
    return lore !== '' && title === lore;
  });
}
