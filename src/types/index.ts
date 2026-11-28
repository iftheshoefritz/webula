type CardDef = {
  dilemmatype: string;
  imagefile: string,
  // The back face of a double-sided mission (#765), or '' for a single-sided card.
  backimagefile: string,
  name: string,
  collectorsinfo: string,
  type: string,
  count: number,
  originalName: string,
  // The card title without subtitle or version suffix, lowercase, and in its printed case (#1971).
  // Optional: a deck row saved before #1971 has neither.
  title?: string,
  originalTitle?: string,
  originalSubtitle?: string,
  missiontype: 'S'|'s'|'P'|'p'|'H'|'h'|'',
  unique: 'y'|'n',
}

export type DeckList = Record<string, {row: any, count: number}>

export type {
  CardDef
};
