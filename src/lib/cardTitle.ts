// The title of a card less its version suffix, shared by the per-card registries: the dilemma models
// of the pile bot (#1320) and the range and span models of the practice table (#1635). A module of
// its own, so a registry reads it without loading another registry's models.

/** The version suffixes of a deck line or a card name that one model covers, such as "*VP" or "(IDR)". */
const VERSION_SUFFIX = /\s*(\*VP|\*AP|\*A|\*|\((IDR|ID|FOW|R2|SR|AC|SS|Promo|MAH)\))\s*$/i;

/**
 * The title of the model that covers a deck line's card name: "Sylvia *VP" and "Sylvia" are one model,
 * and so are "In Development (SS)", "Timescape (Promo)" and "Stripped Down *AP" with their titles. A
 * name in quotes, as the card data names "Rapid Progress", loses them.
 */
export function cardTitleOf(name: string): string {
  let title = name.trim().replace(/^"(.*)"$/, '$1').trim();
  while (VERSION_SUFFIX.test(title)) title = title.replace(VERSION_SUFFIX, '').trim();
  return title;
}
