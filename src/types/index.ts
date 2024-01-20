type CardDef = {
  dilemmatype: string;
  imagefile: string,
  name: string,
  collectorsinfo: string,
  type: string,
  count: number,
  originalName: string,
  mission: 'S'|'s'|'P'|'p',
  unique: 'y'|'n',
}

export type Deck = Record<string, {row: any, count: number}>

export type {
  CardDef
};
