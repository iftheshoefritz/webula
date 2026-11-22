// The parse of the "you may play" texts that say where a personnel, a ship or an equipment may be played
// (#1855): the played card's own text ("You may play this personnel aboard your [Rom] ship."), a ship's
// text for the cards played aboard it ("You may play [Fut][Fed] personnel and equipment aboard this
// ship."), and a mission's text for the cards played there ("you may play Temporal ships here"). Pure text:
// no table, no React. `index.ts` reads a table with it.
//
// A clause with a leading condition the parser cannot read ("While you command {Qo'noS} and no other [AQ]
// missions, …") is unread: it adds no place, and the coverage lists it as `unread`.

/** A card as the parse and the model read it: a card data row, its fields in any case. */
export type PlaceCardRow = Record<string, unknown>;

/** A condition of a clause, read from the table. */
export type PlaceCondition =
  | { kind: 'noHeadquarters' }
  | { kind: 'commandsIcons'; icons: string[]; type: 'personnel' | 'ship' }
  | { kind: 'commandsTitle'; title: string }
  | { kind: 'shipAtIcon'; icon: string }
  | { kind: 'shipAtRegion'; region: string }
  | { kind: 'shipAtMissionType'; missionType: 'space' | 'planet' }
  | { kind: 'missionComplete' };

/** One kind of card a host's text lets the player play: icons, a qualifier ("treachery", "breen") and a type. */
export interface CardSpec {
  icons: string[];
  qualifier: string | null;
  type: 'personnel' | 'equipment' | 'ship' | 'any';
}

/** A place the played card's own text names. */
export type OwnPlace =
  | { kind: 'aboardIconShip'; any: string[][]; not: boolean; missionIcon?: { icon: string; not: boolean } }
  | { kind: 'aboardShip'; title: string }
  | { kind: 'atMission'; title: string | null; icons: string[] }
  | { kind: 'sameMissionAsShip'; title: string };

export type PlaceClause =
  | { kind: 'own'; conditions: PlaceCondition[]; places: OwnPlace[] }
  | { kind: 'aboardThisShip'; conditions: PlaceCondition[]; cards: CardSpec[] }
  | { kind: 'here'; conditions: PlaceCondition[]; cards: CardSpec[] };

/** What one "you may play" sentence is to the model. */
export type SentenceClass =
  | { kind: 'place'; clause: PlaceClause }
  | { kind: 'costOnly' }
  | { kind: 'notAPlace' }
  | { kind: 'unread' };

/**
 * The sentences of a game text, lowercased, its `<em>` tags and quotes dropped. A full stop inside a
 * brace reference or a bracketed icon ("{U.S.S. Voyager}") ends no sentence.
 */
export function sentencesOf(gametext: string): string[] {
  const text = gametext
    .replace(/&lt;\/?em&gt;|<\/?em>/gi, '')
    .replace(/"/g, '')
    .toLowerCase();
  const sentences: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{' || ch === '[' || ch === '(') depth++;
    else if ((ch === '}' || ch === ']' || ch === ')') && depth > 0) depth--;
    else if (depth === 0 && /[.!?]/.test(ch) && (i + 1 === text.length || /\s/.test(text[i + 1]))) {
      sentences.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  sentences.push(text.slice(start).trim());
  return sentences.map((s) => s.replace(/^[-–—\s]+/, '').trim()).filter(Boolean);
}

const ICONS = /^((?:\[[a-z0-9]+\])+)/;
const iconsOf = (s: string): string[] => s.match(/\[[a-z0-9]+\]/g) ?? [];

const COST = /\s*\bat cost [+\-−]?\d+\b\s*/g;
const NOT_A_PLACE = /\bas if\b|\bfrom your discard pile\b|\bfrom your holoprogram\b|\b(aboard|on) an opponent'?s\b/;

/** The leading "while …" condition of a clause, or null for one the parser does not read. */
export function conditionOf(text: string): PlaceCondition | null {
  let m: RegExpMatchArray | null;
  if (/^while you do not command an? (headquarters|\[hq\]|\[h\]) mission$/.test(text)) return { kind: 'noHeadquarters' };
  if ((m = text.match(/^while you command an? ((?:\[[a-z0-9]+\])+) (personnel|ship)$/)))
    return { kind: 'commandsIcons', icons: iconsOf(m[1]), type: m[2] as 'personnel' | 'ship' };
  if ((m = text.match(/^while you command \{([^}]+)\}$/))) return { kind: 'commandsTitle', title: m[1].trim() };
  if ((m = text.match(/^while this ship is at an? (\[[a-z0-9]+\]) mission$/))) return { kind: 'shipAtIcon', icon: m[1] };
  if ((m = text.match(/^while this ship is at a region: (.+) mission$/))) return { kind: 'shipAtRegion', region: m[1].trim() };
  if ((m = text.match(/^while this ship is at a (space|planet) mission$/)))
    return { kind: 'shipAtMissionType', missionType: m[1] as 'space' | 'planet' };
  if (/^while this mission is complete$/.test(text)) return { kind: 'missionComplete' };
  return null;
}

/** One place of the played card's own text, or null for one the parser does not read. */
function ownPlaceOf(text: string): OwnPlace | null {
  let m: RegExpMatchArray | null;
  if ((m = text.match(/^aboard your (non-)?((?:\[[a-z0-9]+\])+(?: or (?:\[[a-z0-9]+\])+)*) ship(?: at an? (non-)?(\[[a-z0-9]+\]) mission)?$/))) {
    const place: OwnPlace = { kind: 'aboardIconShip', any: m[2].split(' or ').map(iconsOf), not: !!m[1] };
    if (m[4]) place.missionIcon = { icon: m[4], not: !!m[3] };
    return place;
  }
  if ((m = text.match(/^aboard your \{([^}]+)\}$/))) return { kind: 'aboardShip', title: m[1].trim() };
  if ((m = text.match(/^(?:at|to) the same mission as your \{([^}]+)\}$/))) return { kind: 'sameMissionAsShip', title: m[1].trim() };
  if ((m = text.match(/^(?:at|to) (?:your )?((?:\[[a-z0-9]+\] ?)*)\{([^}]+)\}$/)))
    return { kind: 'atMission', title: m[2].trim(), icons: iconsOf(m[1]) };
  if ((m = text.match(/^(?:at|to) (?:your )?((?:\[[a-z0-9]+\])+) mission$/))) return { kind: 'atMission', title: null, icons: iconsOf(m[1]) };
  return null;
}

const TYPE_NOUNS: Record<string, CardSpec['type']> = {
  personnel: 'personnel',
  equipment: 'equipment',
  ship: 'ship',
  ships: 'ship',
  card: 'any',
  cards: 'any',
};

/**
 * The cards of a host's list, "[Voy] personnel, [NA] personnel, and equipment" or "[Pa][TNG] or [AU][TNG]
 * personnel", or null for a list the parser does not read. An item with no type takes the type of the
 * next item that has one.
 */
export function cardSpecsOf(text: string): CardSpec[] | null {
  const items = text.split(/,? (?:and|or) |, /).map((s) => s.trim()).filter(Boolean);
  const specs: (Omit<CardSpec, 'type'> & { type: CardSpec['type'] | null })[] = [];
  for (const item of items) {
    const icons = item.match(ICONS);
    const rest = item.slice(icons?.[1].length ?? 0).trim();
    const words = rest ? rest.split(/\s+/) : [];
    const type = words.length ? TYPE_NOUNS[words[words.length - 1]] ?? null : null;
    const qualifier = (type ? words.slice(0, -1) : words).join(' ');
    if (/[{}]/.test(qualifier) || (!icons && !qualifier && !type)) return null;
    if (!type && qualifier) return null;
    specs.push({ icons: icons ? iconsOf(icons[1]) : [], qualifier: qualifier || null, type });
  }
  let next: CardSpec['type'] | null = null;
  for (let i = specs.length - 1; i >= 0; i--) {
    if (specs[i].type) next = specs[i].type;
    else if (next) specs[i].type = next;
    else return null;
  }
  return specs.length ? (specs as CardSpec[]) : null;
}

/** What one sentence with "you may play" is to the model. */
export function classifySentence(sentence: string): SentenceClass {
  const at = sentence.indexOf('you may play');
  if (at < 0) return { kind: 'unread' };
  const prefix = sentence.slice(0, at).replace(/,\s*$/, '').trim();
  let rest = sentence.slice(at + 'you may play'.length).trim();
  const hasCost = /\bat cost [+\-−]?\d+\b/.test(rest);

  const conditions: PlaceCondition[] = [];
  const readConditions = (): boolean => {
    if (!prefix) return true;
    if (!prefix.startsWith('while ')) return false;
    const condition = conditionOf(prefix);
    if (!condition) return false;
    conditions.push(condition);
    return true;
  };

  const own = rest.match(/^this (personnel|ship)\b\s*(.*)$/);
  if (own) {
    // The cost and what the cost buys ("at cost +2 … to reveal an opponent's hand") are the cost
    // registry's; a parenthesis ("(it becomes [Kli])") changes no place.
    let place = own[2].replace(/\([^)]*\)/g, ' ').replace(COST, ' ').trim();
    if (hasCost) place = place.replace(/\s*\bto (?!the same mission\b)(?![[{]).*$/, '').trim();
    if (NOT_A_PLACE.test(place)) return { kind: 'notAPlace' };
    if (!place) return hasCost ? { kind: 'costOnly' } : { kind: 'unread' };
    if (!readConditions()) return { kind: 'unread' };
    const places = place.split(/ or (?=at |to |aboard )/).map(ownPlaceOf);
    if (places.some((p) => !p)) return { kind: 'unread' };
    return { kind: 'place', clause: { kind: 'own', conditions, places: places as OwnPlace[] } };
  }

  if (NOT_A_PLACE.test(rest)) return { kind: 'notAPlace' };
  const host = rest.match(/^(.+?) (aboard this ship|here)$/);
  if (host && !hasCost) {
    const cards = cardSpecsOf(host[1]);
    if (!cards || !readConditions()) return { kind: 'unread' };
    return { kind: 'place', clause: { kind: host[2] === 'here' ? 'here' : 'aboardThisShip', conditions, cards } };
  }

  // "You may play it at cost +2 …", "you may play them at cost −1": a cost, no place.
  rest = rest.replace(COST, ' ').trim();
  if (hasCost && /^(it|him|her|him or her|them|that event)\b/.test(rest)) return { kind: 'costOnly' };
  return { kind: 'unread' };
}

/** The "you may play" sentences of a game text, each with its class. */
export function placeSentencesOf(gametext: string): { sentence: string; class: SentenceClass }[] {
  return sentencesOf(gametext)
    .filter((s) => s.includes('you may play'))
    .map((sentence) => ({ sentence, class: classifySentence(sentence) }));
}

/** The clauses of a game text the model reads. */
export const placeClausesOf = (gametext: string): PlaceClause[] =>
  placeSentencesOf(gametext).flatMap((s) => (s.class.kind === 'place' ? [s.class.clause] : []));
