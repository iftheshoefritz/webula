// The "when you play" models of the practice table (#1800): what the table automates of the text of a
// personnel or a ship that acts when the player plays it, "When you play this personnel, …". One model per
// title, by whole title (`cardTitleOf`), in the style of the resolve models of events
// (`src/lib/resolveModels/`). A model names its steps, each with whether it is a "may", and a condition.
// It ships one kind:
// - `'drawUpToThenDiscard'`: the player may draw up to N cards, a count the player picks from 0 to N, then
//   discards M cards from hand (Enabran Tain "Retired" Spymaster).
// - `'discardFromHand'`: the player discards N cards from hand, no "may" (#1808: Leeta Rebel Supporter, the
//   Dissident personnel and the others whose whole clause is "discard a card from hand").
// - `'examineTake'` (#1809): the player may examine the top N cards of the draw deck, take one (or as many as
//   the model allows) into hand, those that pass the model's test of the card, and place the rest on the
//   bottom of the draw deck in any order (Requisitions Drone, Lenara Kahn, Keiko O'Brien, Harry Kim, Sobi).
// - `'downloadTake'` (#1810): the player may download up to N cards of the draw deck that pass the model's test
//   into hand, then shuffles the draw deck (Opaka Kai of Bajor, Jean-Luc Picard Vintner and the plain "you may
//   download <a test>" texts).
// A personnel or a ship with no model plays as before.
//
// It imports no React and no reducer: the condition reads the facts of the cost models (`CostFacts`).

import { cardTitleOf } from '../cardTitle';
import type { CostCoreCard, CostFacts } from '../costModels/model';
import { missionRequires } from '../costModels/titles/completedMission';

/** "If each of your non-headquarters missions requires <skill>": an empty slot is no mission, and with no such mission it holds. */
export interface NonHeadquartersRequireCondition {
  kind: 'nonHeadquartersRequire';
  skill: string;
}

/** A condition the table cannot read, such as one of the opponent's: shown as not checked. */
export interface UncheckedCondition {
  kind: 'unchecked';
  /** What the check needs, "needs the opponent's score". */
  needs: string;
  text: string;
}

/** "If your non-<species> is at this mission" (#1810): another personnel at the played card's mission slot, not of the species. */
export interface OtherSpeciesHereCondition {
  kind: 'otherSpeciesHere';
  /** The species, lowercased: "cardassian". */
  species: string;
  /** The words of the species, "Cardassian". */
  name: string;
}

export type PlayCondition = NonHeadquartersRequireCondition | OtherSpeciesHereCondition | UncheckedCondition;

/** The names of the steps a model can have. */
export type PlayStepName = 'draw' | 'discard' | 'examine' | 'download';

export interface PlayStepSpec {
  step: PlayStepName;
  /** A "may": the player may skip it. A step after a "may" it depends on ("then") is skipped with it. */
  may: boolean;
}

/** "You may draw up to seven cards, then discard two cards from hand." */
export interface DrawUpToThenDiscardModel {
  kind: 'drawUpToThenDiscard';
  /** The title of the card, `cardTitleOf` of its name, the key of the registry. */
  title: string;
  /** The most cards the player may draw. */
  drawUpTo: number;
  /** The cards of the hand the player discards after the draw. */
  discard: number;
  condition?: PlayCondition;
  /** The effect's text, for the panel. */
  text: string;
}

/** "Discard a card from hand.": the whole clause, and not a "may". */
export interface DiscardFromHandModel {
  kind: 'discardFromHand';
  title: string;
  /** The cards of the hand the player discards. */
  discard: number;
  condition?: PlayCondition;
  text: string;
}

/** A card of the draw deck as the test of an examine reads it: its type, its keywords and its printed cost, as the card data has them. */
export interface ExaminedCard {
  type?: unknown;
  keywords?: unknown;
  cost?: unknown;
}

/**
 * The test of the card an examine takes (#1809): a type of `types` or a keyword of `keywords` ("an interrupt
 * or a Temporal card"), or a printed cost of `cost` or more.
 */
export type ExamineTest =
  | { kind: 'typeOrKeyword'; types: string[]; keywords?: string[] }
  | { kind: 'costAtLeast'; cost: number };

/** How many cards an examine may take: a fixed number, or one for each different card of the core with a keyword. */
export type ExamineTakeCount = { kind: 'fixed'; count: number } | { kind: 'differentCoreKeyword'; keyword: string };

/** "You may examine the top four cards of your deck and take one into hand. Place the remaining cards on the bottom …" */
export interface ExamineTakeModel {
  kind: 'examineTake';
  title: string;
  /** The cards of the top of the draw deck it examines. */
  examine: number;
  take: ExamineTakeCount;
  /** Whether a card must be taken once the cards are examined (Requisitions Drone), or "you may" take one. */
  mustTake: boolean;
  test?: ExamineTest;
  /** The words of the test, for the panel: "an event". */
  testText?: string;
  condition?: PlayCondition;
  text: string;
}

/** A card of the draw deck as the test of a download reads it, as the card data has it, lowercased. */
export interface DownloadedCard {
  name?: unknown;
  type?: unknown;
  affiliation?: unknown;
  icons?: unknown;
  keywords?: unknown;
  species?: unknown;
  skills?: unknown;
}

/**
 * One test of the card a download takes (#1810): every field it has must hold, each by one of its values, all
 * lowercased. `titles` holds a card of that title, or, for a personnel or a ship, a version of that persona
 * ("{Kahless}" holds Kahless The Unforgettable); `affiliations` an affiliation by inclusion ("[Baj]" is
 * "bajoran"); `icons` an icon of the icons field ("[tng]").
 */
export interface DownloadTest {
  titles?: string[];
  types?: string[];
  affiliations?: string[];
  icons?: string[];
  keywords?: string[];
  species?: string[];
  skills?: string[];
}

/** "You may download a [Baj] personnel.", "… up to three [TNG] personnel." */
export interface DownloadTakeModel {
  kind: 'downloadTake';
  title: string;
  /** The most cards the player may download. */
  upTo: number;
  /** A card passes when it passes one of the tests. */
  test: DownloadTest[];
  /** The words of the test, for the panel: "a [Baj] personnel". */
  testText: string;
  condition?: PlayCondition;
  text: string;
}

export type PlayModel = DrawUpToThenDiscardModel | DiscardFromHandModel | ExamineTakeModel | DownloadTakeModel;

// A plain "When you play this …, you may download <testText>." (#1810), one card.
const download = (title: string, testText: string, ...test: DownloadTest[]): DownloadTakeModel => ({
  kind: 'downloadTake',
  title,
  upTo: 1,
  test,
  testText,
  text: `You may download ${testText}.`,
});

// The download of one card or another of these titles, "{Engage Cloak}".
const named = (...titles: string[]): DownloadTest => ({ titles: titles.map((t) => t.toLowerCase()) });

// The personnel whose whole "When you play this personnel" clause is "discard a card from hand" (#1808), and
// Niala's "When you play this ship, discard two cards from hand." A clause that does more than the discard
// (Modern Galor, Dominion Galor, Bennet) is left out.
const DISCARD_A_CARD_TITLES = [
  'Borven',
  'Damar Martyred Outlaw',
  'Elim Garak Imposing Patriot',
  'Jake Sisko Reporter Behind the Lines',
  'Kira Nerys Reformed Collaborator',
  'Leeta Rebel Supporter',
  'Marris',
  'Natima Lang Professor of Political Ethics',
  'Odo Wayward Link',
  'Quark Resistance Informant',
  'Rekelen',
  'Rom Undercover Spy',
  'Tekeny Ghemor Prominent Official',
  'Tora Ziyal Beloved Daughter',
  'Yassim Vocal Martyr',
];

export const PLAY_MODELS: PlayModel[] = [
  // "When you play this personnel, if each of your non-headquarters missions requires Intelligence, you may
  // draw up to seven cards, then discard two cards from hand."
  {
    kind: 'drawUpToThenDiscard',
    title: 'Enabran Tain "Retired" Spymaster',
    drawUpTo: 7,
    discard: 2,
    condition: { kind: 'nonHeadquartersRequire', skill: 'Intelligence' },
    text: 'You may draw up to seven cards, then discard two cards from hand.',
  },
  ...DISCARD_A_CARD_TITLES.map(
    (title): DiscardFromHandModel => ({ kind: 'discardFromHand', title, discard: 1, text: 'Discard a card from hand.' })
  ),
  { kind: 'discardFromHand', title: 'Niala Intelligence Asset', discard: 2, text: 'Discard two cards from hand.' },
  // "When you play this personnel, you may examine the top four cards of your deck and take one into hand. Place
  // the remaining cards on the bottom of your deck in any order."
  {
    kind: 'examineTake',
    title: 'Requisitions Drone',
    examine: 4,
    take: { kind: 'fixed', count: 1 },
    mustTake: true,
    text: 'You may examine the top four cards of your deck and take one into hand. Place the remaining cards on the bottom of your deck in any order.',
  },
  // "… you may examine the top four cards of your deck. You may reveal one event and take it into hand. …"
  {
    kind: 'examineTake',
    title: 'Lenara Kahn Wormhole Theorist',
    examine: 4,
    take: { kind: 'fixed', count: 1 },
    mustTake: false,
    test: { kind: 'typeOrKeyword', types: ['event'] },
    testText: 'an event',
    text: 'You may examine the top four cards of your deck. You may reveal one event and take it into hand. Place the remaining cards on the bottom of your deck in any order.',
  },
  // "… You may reveal a card that has a cost of 4 or more and take it into your hand. …"
  {
    kind: 'examineTake',
    title: "Keiko O'Brien Botanist",
    examine: 4,
    take: { kind: 'fixed', count: 1 },
    mustTake: false,
    test: { kind: 'costAtLeast', cost: 4 },
    testText: 'a card with a cost of 4 or more',
    text: 'You may examine the top four cards of your deck. You may reveal a card that has a cost of 4 or more and take it into your hand. Place the remaining cards on the bottom of your deck in any order.',
  },
  // "… You may reveal an interrupt or a Temporal card and take it into hand. …"
  {
    kind: 'examineTake',
    title: 'Harry Kim Remorseful Survivor',
    examine: 4,
    take: { kind: 'fixed', count: 1 },
    mustTake: false,
    test: { kind: 'typeOrKeyword', types: ['interrupt'], keywords: ['temporal'] },
    testText: 'an interrupt or a Temporal card',
    text: 'You may examine the top four cards of your deck. You may reveal an interrupt or a Temporal card and take it into hand. Place the remaining cards on the bottom of your deck in any order.',
  },
  // "… You may take one card into hand for each different Commodity in your core, then place the remaining cards …"
  {
    kind: 'examineTake',
    title: 'Sobi Felicium Dealer',
    examine: 4,
    take: { kind: 'differentCoreKeyword', keyword: 'commodity' },
    mustTake: false,
    text: 'You may examine the top four cards of your deck. You may take one card into hand for each different Commodity in your core, then place the remaining cards on the bottom of your deck in any order.',
  },
  // "When you play this personnel, if each of your non-headquarters missions requires Biology, you may download up
  // to three [TNG] personnel."
  {
    kind: 'downloadTake',
    title: 'Jean-Luc Picard Vintner',
    upTo: 3,
    test: [{ types: ['personnel'], icons: ['[tng]'] }],
    testText: 'up to three [TNG] personnel',
    condition: { kind: 'nonHeadquartersRequire', skill: 'Biology' },
    text: 'You may download up to three [TNG] personnel.',
  },
  // "When you play this personnel, if your non-Cardassian is at this mission, you may download an equipment."
  {
    ...download('Mavek Science Officer', 'an equipment', { types: ['equipment'] }),
    condition: { kind: 'otherSpeciesHere', species: 'cardassian', name: 'Cardassian' },
  },
  // "When you play this personnel (or ship), you may download <a test>."
  download('Opaka Kai of Bajor', 'a [Baj] personnel', { types: ['personnel'], affiliations: ['bajoran'] }),
  download('Founder Leader Forbidding Judge', 'a Changeling', { species: ['changeling'] }),
  download('Winn Adami Devious Manipulator', 'a Treachery Bajoran', { species: ['bajoran'], skills: ['treachery'] }),
  download('Cal Hudson Attache to the Demilitarized Zone', 'a [Maq] ship', { types: ['ship'], icons: ['[maq]'] }),
  download("O'Brien Founder Agent Provocateur", 'an Infiltration card', { keywords: ['infiltration'] }),
  download('Kargan Rash Captain', 'a Maneuver card', { keywords: ['maneuver'] }),
  download('Suran Ambitious Commander', 'a Maneuver card', { keywords: ['maneuver'] }),
  download('Madred Calculating Captor', 'a Punishment card', { keywords: ['punishment'] }),
  download('Vetar', 'a Pursuit card', { keywords: ['pursuit'] }),
  download('Kumari A Fine Ship', 'a Pursuit card', { keywords: ['pursuit'] }),
  download('Haakona', 'Engage Cloak or a Pursuit card', named('Engage Cloak'), { keywords: ['pursuit'] }),
  download('Penk Unscrupulous Promoter', 'a Tsunkatse card', { keywords: ['tsunkatse'] }),
  download('Richard Galen Legendary Archaeologist', 'an Artifact', { keywords: ['artifact'] }),
  download("Chu'lak Calculating Killer", 'a Hand Weapon', { keywords: ['hand weapon'] }),
  download('Five of Twelve Axum', 'a Dissident', { keywords: ['dissident'] }),
  download("Cousteau Captain's Yacht", 'a [TNG] Dissident', { icons: ['[tng]'], keywords: ['dissident'] }),
  download("Sojef Pacifistic Luddite", "a Dissident or a Son'a", { keywords: ['dissident'] }, { species: ["son'a"] }),
  download('Ibboko Kreetassan Chancellor', 'a Ritual event or a Kreetassan personnel', { types: ['event'], keywords: ['ritual'] }, { types: ['personnel'], species: ['kreetassan'] }),
  download('Gowron Leader of the High Council', 'an Honor Klingon', { species: ['klingon'], skills: ['honor'] }),
  download('Toral Arrogant Child', 'a Treachery Klingon', { species: ['klingon'], skills: ['treachery'] }),
  download('Vekma Impartial Appraiser', 'a Human personnel', { types: ['personnel'], species: ['human'] }),
  download('Anthony Braxton Forward-thinking Recruiter', 'a [Fed] personnel', { types: ['personnel'], affiliations: ['federation'] }),
  download('Fortune', 'a [NA] Archaeology personnel', { types: ['personnel'], affiliations: ['non-aligned'], skills: ['archaeology'] }),
  download('Benjamin Sisko Defiant Captain', 'a [DS9] ship', { types: ['ship'], icons: ['[ds9]'] }),
  download('Leyton Chief of Starfleet Operations', 'an [E] ship', { types: ['ship'], icons: ['[e]'] }),
  download('Daniel Leonard Cautious Admiral', 'a [SF] ship', { types: ['ship'], affiliations: ['starfleet'] }),
  download('Kira Nerys Ambitious Ally', 'a ship', { types: ['ship'] }),
  {
    kind: 'downloadTake',
    title: 'Harrad-Sar Slave of the Situation',
    upTo: 3,
    test: [{ types: ['personnel'], keywords: ['thief'] }],
    testText: 'up to three Thief personnel',
    text: 'You may download up to three Thief personnel.',
  },
  download('Niles', 'Retaliation', named('Retaliation')),
  download('Furel Resistance Fighter', 'Resistance Tactics', named('Resistance Tactics')),
  download('Lupaza Resistance Fighter', 'Just Like Old Times', named('Just Like Old Times')),
  download('Koroth High Cleric of Boreth', 'Kahless', named('Kahless')),
  download('Kor Dahar Master', 'Jadzia Dax, Kang, or Koloth', named('Jadzia Dax', 'Kang', 'Koloth')),
  download('Hiren Romulan Praetor', 'Prejudice and Politics', named('Prejudice and Politics')),
  download('Jean-Luc Picard Genial Captain', 'U.S.S. Enterprise-D', named('U.S.S. Enterprise-D')),
  download('Halb Daier Resistance Contact', 'No Love For the Spoon Heads', named('No Love For the Spoon Heads')),
  download('Jadzia Dax Tongo Player', 'Tongo: Confront', named('Tongo: Confront')),
  download('Anij Eupneic Explorer', 'Heightened Perception', named('Heightened Perception')),
  download('Varel', 'Escaping Detection', named('Escaping Detection')),
  download('Vance Sympathetic Pilot', 'Not Easily Taken', named('Not Easily Taken')),
  download('Ah-Kel', 'Smuggling Run', named('Smuggling Run')),
  download('Ekoor', 'Arrest Order', named('Arrest Order')),
  download('Dulmer Temporal Investigator', 'Lucsly', named('Lucsly')),
  download('Lucsly Temporal Investigator', 'Dulmer', named('Dulmer')),
  download('Kaga Melodious Epicure', 'Gagh Tek Or', named('Gagh Tek Or')),
  download('Tavana Reinvigorated Soldier', "The Warrior's Anthem", named("The Warrior's Anthem")),
  download('Qartum Delegation Transport', 'Latinum Storage', named('Latinum Storage')),
  download('Countermeasure Drone', 'Adapt, Ascertain, Neural Transceiver, or Reconfigure', named('Adapt', 'Ascertain', 'Neural Transceiver', 'Reconfigure')),
];

const BY_TITLE = new Map(PLAY_MODELS.map((m) => [m.title.toLowerCase(), m]));

/** The "when you play" model of the card named `name`, by its title, or undefined. */
export const playModelOf = (name: string): PlayModel | undefined => BY_TITLE.get(cardTitleOf(name).toLowerCase());

/** The steps of a model, in order. */
export const playStepsOf = (model: PlayModel): PlayStepSpec[] => {
  switch (model.kind) {
    case 'drawUpToThenDiscard':
      return [
        { step: 'draw', may: true },
        { step: 'discard', may: false },
      ];
    case 'discardFromHand':
      return [{ step: 'discard', may: false }];
    case 'examineTake':
      return [{ step: 'examine', may: true }];
    case 'downloadTake':
      return [{ step: 'download', may: true }];
  }
};

export type PlayConditionStatus = 'met' | 'notMet' | 'unchecked';

export interface PlayConditionState {
  status: PlayConditionStatus;
  /** The condition's words, "each of your non-headquarters missions requires Intelligence". */
  text: string;
}

const conditionWords = (condition: PlayCondition): string =>
  condition.kind === 'nonHeadquartersRequire'
    ? `each of your non-headquarters missions requires ${condition.skill}`
    : condition.kind === 'otherSpeciesHere'
      ? `your non-${condition.name} is at this mission`
      : condition.text;

/** Where the played card stands (#1810): the mission slot and its instance id, for "at this mission". */
export interface PlayedAt {
  missionIndex?: number;
  id?: string;
}

/**
 * Whether the model's condition holds on the facts of the table, or null for a model with none. An "at this
 * mission" condition reads the personnel of the slot the card stands at, not the card itself; with no slot it
 * is not met.
 */
export function playConditionOf(model: PlayModel, facts: Pick<CostFacts, 'missions'>, at: PlayedAt = {}): PlayConditionState | null {
  const condition = model.condition;
  if (!condition) return null;
  const text = conditionWords(condition);
  if (condition.kind === 'unchecked') return { status: 'unchecked', text };
  if (condition.kind === 'otherSpeciesHere') {
    const here = at.missionIndex === undefined ? [] : (facts.missions?.[at.missionIndex]?.personnel ?? []);
    const met = here.some((p) => p.id !== at.id && !p.species.includes(condition.species));
    return { status: met ? 'met' : 'notMet', text };
  }
  const met = (facts.missions ?? []).every((m) => m.type === '' || m.type === 'h' || missionRequires(m, condition.skill));
  return { status: met ? 'met' : 'notMet', text };
}

/** "Condition met: …", "Condition not met: …" or "Condition not checked: …". */
export function playConditionLine(model: PlayModel, state: PlayConditionState): string {
  if (state.status === 'met') return `Condition met: ${state.text}`;
  if (state.status === 'notMet') return `Condition not met: ${state.text}`;
  const needs = model.condition?.kind === 'unchecked' ? model.condition.needs : 'the table cannot read it';
  return `Condition not checked: ${needs}`;
}

/** The cards a draw of `wanted` takes from a draw deck of `deck` cards, the count clamped to `0..drawUpTo`. */
export const drawUpToCount = (model: DrawUpToThenDiscardModel, wanted: number, deck: number): number =>
  Math.max(0, Math.min(Math.floor(wanted), model.drawUpTo, deck));

/** The cards the discard step asks for: the model's number, or the whole hand when it holds fewer. */
export const discardCount = (model: PlayModel, hand: number): number => ('discard' in model ? Math.min(model.discard, hand) : 0);

/** The cards an examine looks at: the model's number, or the whole draw deck when it holds fewer. */
export const examineCount = (model: ExamineTakeModel, deck: number): number => Math.max(0, Math.min(model.examine, deck));

const words = (value: unknown): string[] =>
  String(value ?? '')
    .toLowerCase()
    .split('.')
    .map((k) => k.trim())
    .filter(Boolean);

/** Whether the examine may take `card`: every card for a model with no test. */
export function examineTakes(model: ExamineTakeModel, card: ExaminedCard | null | undefined): boolean {
  const test = model.test;
  if (!test) return true;
  if (!card) return false;
  if (test.kind === 'costAtLeast') return (Number(card.cost) || 0) >= test.cost;
  const type = String(card.type ?? '').toLowerCase();
  const keywords = words(card.keywords);
  return test.types.includes(type) || (test.keywords ?? []).some((k) => keywords.includes(k));
}

/** The most cards the examine may take: the fixed number, or one for each different title of the core with the keyword. */
export function examineTakeMax(model: ExamineTakeModel, facts: { coreCards?: CostCoreCard[] }): number {
  if (model.take.kind === 'fixed') return model.take.count;
  const keyword = model.take.keyword;
  return new Set((facts.coreCards ?? []).filter((c) => c.keywords.includes(keyword)).map((c) => c.title.toLowerCase())).size;
}

/** The fewest cards the examine takes of `examined`: one for a "take one" when a card may be taken, else none. */
export const examineTakeMin = (model: ExamineTakeModel, examined: (ExaminedCard | null | undefined)[], max: number): number =>
  model.mustTake && max > 0 && examined.some((c) => examineTakes(model, c)) ? 1 : 0;

/** Whether a download of the model may take `card`: it passes one of the model's tests. */
export function downloadTakes(model: DownloadTakeModel, card: DownloadedCard | null | undefined): boolean {
  if (!card) return false;
  const type = String(card.type ?? '').toLowerCase();
  const title = cardTitleOf(String(card.name ?? '')).toLowerCase();
  const affiliation = String(card.affiliation ?? '').toLowerCase();
  const icons: string[] = String(card.icons ?? '').toLowerCase().match(/\[[a-z0-9]+\]/g) ?? [];
  const keywords = words(card.keywords);
  const species = String(card.species ?? '')
    .toLowerCase()
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);
  // The skills as words, the counts dropped, as `skillWordsOf` reads them.
  const skills = String(card.skills ?? '').toLowerCase().split(/[^a-z]+/).filter(Boolean);
  const persona = type === 'personnel' || type === 'ship';
  const passes = (t: DownloadTest): boolean =>
    (!t.titles || t.titles.some((n) => title === n || (persona && title.startsWith(`${n} `)))) &&
    (!t.types || t.types.includes(type)) &&
    (!t.affiliations || t.affiliations.some((a) => affiliation.includes(a))) &&
    (!t.icons || t.icons.some((i) => icons.includes(i))) &&
    (!t.keywords || t.keywords.some((k) => keywords.includes(k))) &&
    (!t.species || t.species.some((sp) => species.includes(sp))) &&
    (!t.skills || t.skills.some((sk) => skills.includes(sk)));
  return model.test.some(passes);
}
