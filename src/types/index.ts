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
  missiontype: 'S'|'s'|'P'|'p'|'H'|'h'|'',
  unique: 'y'|'n',
}

export type DeckList = Record<string, {row: any, count: number}>

export type {
  CardDef
};
