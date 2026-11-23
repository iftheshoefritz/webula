// The "when you play" models of the practice table (#1800): what the table automates of the text of a
// personnel or a ship that acts when the player plays it, "When you play this personnel, …". One model per
// title, by whole title (`cardTitleOf`), in the style of the resolve models of events
// (`src/lib/resolveModels/`). A model is its text, a condition, and a list of effect steps (#1863,
// `src/lib/effectSteps.ts`), each with whether it is a "may":
// - Enabran Tain "Retired" Spymaster: `[drawUpTo(7), discardFromHand(2)]`.
// - Leeta Rebel Supporter and the others whose whole clause is "discard a card from hand" (#1808):
//   `[discardFromHand(1)]`, no "may".
// - The examines of #1809 (Requisitions Drone, Lenara Kahn, Keiko O'Brien, Harry Kim, Sobi): `[examine(4, …)]`.
// - The downloads of #1810 (Opaka Kai of Bajor, Jean-Luc Picard Vintner and the plain "you may download <a
//   test>" texts): `[download(test, to hand), shuffle]`.
// - The downloads to a place of #1811: aboard a [Dom] ship the player picks (Gelnon), played aboard the played
//   ship at cost −4 (U.S.S. Enterprise Where She Belongs), or on top of the draw deck (Reconnaissance Drone).
// - The scores of #1812 (Annexation Drone, DaiMon Solok, Opaka, Kira Taban): `[score(5)]`.
// A personnel or a ship with no model plays as before.
//
// It imports no React and no reducer: a condition is a shared condition of the table view (`src/lib/tableView.ts`,
// #1877), read over the facts of the cost models (`CostFacts`) through `costFactsSource`.

import { cardTitleOf } from '../cardTitle';
import type { CostFacts } from '../costModels/model';
import { costFactsSource } from '../costModels/factsSource';
import { DownloadTest, EffectStep, EffectStage, discardFromHand, drawUpTo, PlayedAt, score, shuffle, stagesOf } from '../effectSteps';
import { atThisMission, commands, commandsEvents, Condition, MissionQuery, missionRequires, missions, TableReader } from '../tableView';

/** A condition the table cannot read, such as one of the opponent's: shown as not checked. */
export interface UncheckedCondition {
  kind: 'unchecked';
  /** What the check needs, "needs the opponent's score". */
  needs: string;
  text: string;
}

/**
 * A condition of the table (#1812, #1877): a shared condition of the table view, which reads the view or the
 * facts and the played card's place, "you command three [Fer] personnel".
 */
export interface TableCondition extends Condition {
  kind: 'table';
}

export type PlayCondition = UncheckedCondition | TableCondition;

/** The facts a condition reads: the missions always, the rest of `CostFacts` where the page has them. */
export type PlayConditionFacts = Pick<CostFacts, 'missions'> & Partial<CostFacts>;

/** A "when you play" model: the title, the effect's text, a condition, and the steps of the effect, in order. */
export interface PlayModel {
  /** The title of the card, `cardTitleOf` of its name, the key of the registry. */
  title: string;
  /** The effect's text, for the panel. */
  text: string;
  condition?: PlayCondition;
  steps: EffectStep[];
  /** Whether the play's cost choice ignores this ability (#1811): "You may play this ship at cost -4 to ignore its next ability." */
  ignoredByCostChoice?: true;
}

// "You may download <testText>", up to `upTo` cards, into hand, then the shuffle of the draw deck (#1810).
const downloadSteps = (upTo: number, testText: string, test: DownloadTest[]): EffectStep[] => [
  { kind: 'download', of: { kind: 'test', test, testText }, upTo, to: { kind: 'hand' }, may: true },
  shuffle(),
];

// A plain "When you play this …, you may download <testText>." (#1810), one card.
const download = (title: string, testText: string, ...test: DownloadTest[]): PlayModel => ({
  title,
  steps: downloadSteps(1, testText, test),
  text: `You may download ${testText}.`,
});

// The download of one card or another of these titles, "{Engage Cloak}".
const named = (...titles: string[]): DownloadTest => ({ titles: titles.map((t) => t.toLowerCase()) });

// The conditions (#1877), each a shared condition of the table view. "You command" counts the unstopped
// personnel (`commanded`), as the cost models do (#1751). A non-headquarters mission is one with a type: the
// facts of a test may hold a slot with a name and no type, which is no mission.
const tableCondition = (c: Condition): TableCondition => ({ kind: 'table', holds: c.holds, text: c.text });

/** Each of `facts`' typed non-headquarters missions. */
const NON_HEADQUARTERS: MissionQuery = { headquarters: false, where: (m) => m.type !== '' };

/** "If each of your non-headquarters missions requires <skill>": with no such mission it holds. */
const nonHeadquartersRequire = (skill: string): TableCondition => tableCondition(missionRequires(skill, { each: true, query: NON_HEADQUARTERS }));

/** "If each of your non-headquarters missions is an [AQ] mission." */
const nonHeadquartersInAlpha: TableCondition = {
  kind: 'table',
  holds: (r: TableReader) => missions(r, NON_HEADQUARTERS).every((m) => m.quadrant === 'a'),
  text: () => 'each of your non-headquarters missions is an [AQ] mission',
};

/** "If your non-<species> is at this mission" (#1810): another personnel at the played card's slot, stopped ones too. */
const otherSpeciesHere = (species: string, name: string): TableCondition =>
  tableCondition(atThisMission({ unstopped: false, where: (p) => !(p.species ?? []).includes(species) }, `your non-${name} is`));

const threeFerengi = commands({ of: 'personnel', unstopped: true, affiliation: 'ferengi' }, 'three [Fer] personnel', {
  min: 3,
  text: 'you command three [Fer] personnel',
});

const commandsA = (species: string): Condition => commands({ of: 'personnel', unstopped: true, species }, `a ${species}`);

const SCORE_MODELS: PlayModel[] = [
  // "When you play this personnel, if each of your non-headquarters missions is an [AQ] mission, score 5 points."
  {
    title: 'Annexation Drone',
    steps: [score(5)],
    condition: nonHeadquartersInAlpha,
    text: 'Score 5 points.',
  },
  // "When you play this personnel, if you command three [Fer] personnel, score 5 points."
  {
    title: 'DaiMon Solok Cargo Runner',
    steps: [score(5)],
    condition: tableCondition(threeFerengi),
    text: 'Score 5 points.',
  },
  // "When you play this personnel, if you command {Bajor} and no other headquarters mission, you may score 5 points."
  {
    title: 'Opaka Collaborator',
    steps: [score(5)],
    condition: {
      kind: 'table',
      holds: (r) => missions(r, { headquarters: true }).length === 1 && missions(r, { headquarters: true, titled: 'Bajor' }).length === 1,
      text: () => 'you command Bajor and no other headquarters mission',
    },
    text: 'You may score 5 points.',
  },
  // "When you play this personnel, if you have a lower score than each of your opponents, score 5 points."
  {
    title: 'Kira Taban Husband and Father',
    steps: [score(5)],
    condition: { kind: 'unchecked', needs: "needs the opponent's score", text: 'you have a lower score than each of your opponents' },
    text: 'Score 5 points.',
  },
  // "When you play this personnel, if you command a Founder and a Vorta, you may score 5 points."
  {
    title: 'Eris Harbinger of the Dominion',
    steps: [score(5)],
    condition: {
      kind: 'table',
      holds: (r) => commandsA('founder').holds(r) && commandsA('vorta').holds(r),
      text: () => 'you command a Founder and a Vorta',
    },
    text: 'You may score 5 points.',
  },
  // "When you play this personnel, if you command a Maneuver event, score 5 points."
  {
    title: 'Klaa Dauntless Hunter',
    steps: [score(5)],
    condition: tableCondition(commandsEvents({ keyword: 'maneuver', text: 'you command a Maneuver event' })),
    text: 'Score 5 points.',
  },
  // "When you play this personnel, if you command a mission worth 40 or more points and three [Fer] personnel,
  // score 5 points." His cost clause is a cost model (`completedMission.ts`).
  {
    title: 'Brunt Acting Grand Nagus',
    steps: [score(5)],
    condition: {
      kind: 'table',
      holds: (r) => missions(r, { where: (m) => m.type !== '' && m.points >= 40 }).length > 0 && threeFerengi.holds(r),
      text: () => 'you command a mission worth 40 or more points and three [Fer] personnel',
    },
    text: 'Score 5 points.',
  },
];

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
    title: 'Enabran Tain "Retired" Spymaster',
    steps: [drawUpTo(7), discardFromHand(2)],
    condition: nonHeadquartersRequire('Intelligence'),
    text: 'You may draw up to seven cards, then discard two cards from hand.',
  },
  ...DISCARD_A_CARD_TITLES.map(
    (title): PlayModel => ({ title, steps: [discardFromHand(1)], text: 'Discard a card from hand.' })
  ),
  { title: 'Niala Intelligence Asset', steps: [discardFromHand(2)], text: 'Discard two cards from hand.' },
  // "When you play this personnel, you may examine the top four cards of your deck and take one into hand. Place
  // the remaining cards on the bottom of your deck in any order."
  {
    title: 'Requisitions Drone',
    steps: [{ kind: 'examine', count: 4, take: { kind: 'fixed', count: 1 }, mustTake: true, rest: 'bottomOrdered', may: true }],
    text: 'You may examine the top four cards of your deck and take one into hand. Place the remaining cards on the bottom of your deck in any order.',
  },
  // "… you may examine the top four cards of your deck. You may reveal one event and take it into hand. …"
  {
    title: 'Lenara Kahn Wormhole Theorist',
    steps: [{ kind: 'examine', count: 4, take: { kind: 'fixed', count: 1 }, mustTake: false, test: { kind: 'typeOrKeyword', types: ['event'] }, testText: 'an event', rest: 'bottomOrdered', may: true }],
    text: 'You may examine the top four cards of your deck. You may reveal one event and take it into hand. Place the remaining cards on the bottom of your deck in any order.',
  },
  // "… You may reveal a card that has a cost of 4 or more and take it into your hand. …"
  {
    title: "Keiko O'Brien Botanist",
    steps: [{ kind: 'examine', count: 4, take: { kind: 'fixed', count: 1 }, mustTake: false, test: { kind: 'costAtLeast', cost: 4 }, testText: 'a card with a cost of 4 or more', rest: 'bottomOrdered', may: true }],
    text: 'You may examine the top four cards of your deck. You may reveal a card that has a cost of 4 or more and take it into your hand. Place the remaining cards on the bottom of your deck in any order.',
  },
  // "… You may reveal an interrupt or a Temporal card and take it into hand. …"
  {
    title: 'Harry Kim Remorseful Survivor',
    steps: [{ kind: 'examine', count: 4, take: { kind: 'fixed', count: 1 }, mustTake: false, test: { kind: 'typeOrKeyword', types: ['interrupt'], keywords: ['temporal'] }, testText: 'an interrupt or a Temporal card', rest: 'bottomOrdered', may: true }],
    text: 'You may examine the top four cards of your deck. You may reveal an interrupt or a Temporal card and take it into hand. Place the remaining cards on the bottom of your deck in any order.',
  },
  // "… You may take one card into hand for each different Commodity in your core, then place the remaining cards …"
  {
    title: 'Sobi Felicium Dealer',
    steps: [{ kind: 'examine', count: 4, take: { kind: 'differentCoreKeyword', keyword: 'commodity' }, mustTake: false, rest: 'bottomOrdered', may: true }],
    text: 'You may examine the top four cards of your deck. You may take one card into hand for each different Commodity in your core, then place the remaining cards on the bottom of your deck in any order.',
  },
  // "When you play this personnel, if each of your non-headquarters missions requires Biology, you may download up
  // to three [TNG] personnel."
  {
    title: 'Jean-Luc Picard Vintner',
    steps: downloadSteps(3, 'up to three [TNG] personnel', [{ types: ['personnel'], icons: ['[tng]'] }]),
    condition: nonHeadquartersRequire('Biology'),
    text: 'You may download up to three [TNG] personnel.',
  },
  // "When you play this personnel, if your non-Cardassian is at this mission, you may download an equipment."
  {
    ...download('Mavek Science Officer', 'an equipment', { types: ['equipment'] }),
    condition: otherSpeciesHere('cardassian', 'Cardassian'),
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
    title: 'Harrad-Sar Slave of the Situation',
    steps: downloadSteps(3, 'up to three Thief personnel', [{ types: ['personnel'], keywords: ['thief'] }]),
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
  // "When you play this personnel, if each of your non-headquarters missions is an [AQ] mission, you may download a
  // Jem'Hadar and place it aboard your [Dom] ship."
  {
    title: 'Gelnon Aloof Tactician',
    steps: [{ kind: 'download', of: { kind: 'test', test: [{ species: ["jem'hadar"] }], testText: "a Jem'Hadar" }, upTo: 1, to: { kind: 'aboardShip', affiliation: 'dominion', text: 'your [Dom] ship' }, may: true }, shuffle()],
    condition: nonHeadquartersInAlpha,
    text: "You may download a Jem'Hadar and place it aboard your [Dom] ship.",
  },
  // "When you play this ship, you may download a [TOS] personnel who has a cost of 4 or more and play him or her at
  // cost -4 aboard this ship." Its "may play at cost -4 to ignore its next ability" is a cost model (`mayCost.ts`):
  // once the player takes that choice, the download is no longer pending.
  {
    title: 'U.S.S. Enterprise Where She Belongs',
    steps: [{ kind: 'download', of: { kind: 'test', test: [{ types: ['personnel'], icons: ['[tos]'], costAtLeast: 4 }], testText: 'a [TOS] personnel who has a cost of 4 or more' }, upTo: 1, to: { kind: 'playAboardThis', discount: 4 }, may: true }, shuffle()],
    ignoredByCostChoice: true,
    text: 'You may download a [TOS] personnel who has a cost of 4 or more and play him or her at cost -4 aboard this ship.',
  },
  // "When you play this personnel, you may download a non-Drone personnel, then place that personnel on top of your deck."
  {
    title: 'Reconnaissance Drone',
    steps: [{ kind: 'download', of: { kind: 'test', test: [{ types: ['personnel'], notKeywords: ['drone'] }], testText: 'a non-Drone personnel' }, upTo: 1, to: { kind: 'drawDeckTop' }, may: true }, shuffle()],
    text: 'You may download a non-Drone personnel, then place that personnel on top of your deck.',
  },
  ...SCORE_MODELS,
];

const BY_TITLE = new Map(PLAY_MODELS.map((m) => [m.title.toLowerCase(), m]));

/** The "when you play" model of the card named `name`, by its title, or undefined. */
export const playModelOf = (name: string): PlayModel | undefined => BY_TITLE.get(cardTitleOf(name).toLowerCase());

/** The stages of a model, in order (#1863): each the step the player acts on and the automatic steps after it. */
export const playStagesOf = (model: PlayModel): EffectStage[] => stagesOf(model.steps);

export type PlayConditionStatus = 'met' | 'notMet' | 'unchecked';

export interface PlayConditionState {
  status: PlayConditionStatus;
  /** The condition's words, "each of your non-headquarters missions requires Intelligence". */
  text: string;
}

/**
 * Whether the model's condition holds on the facts of the table, or null for a model with none. An "at this
 * mission" condition reads the personnel of the slot the card stands at, not the card itself; with no slot it
 * is not met.
 */
export function playConditionOf(model: PlayModel, facts: PlayConditionFacts, at: PlayedAt = {}): PlayConditionState | null {
  const condition = model.condition;
  if (!condition) return null;
  if (condition.kind === 'unchecked') return { status: 'unchecked', text: condition.text };
  // The facts of a test may leave out the lists a source reads as present: none commanded, an empty core.
  const source = costFactsSource({ commanded: [], core: [], hand: [], ...facts });
  return { status: condition.holds(source, at) ? 'met' : 'notMet', text: condition.text(source, at) };
}

/** "Condition met: …", "Condition not met: …" or "Condition not checked: …". */
export function playConditionLine(model: PlayModel, state: PlayConditionState): string {
  if (state.status === 'met') return `Condition met: ${state.text}`;
  if (state.status === 'notMet') return `Condition not met: ${state.text}`;
  const needs = model.condition?.kind === 'unchecked' ? model.condition.needs : 'the table cannot read it';
  return `Condition not checked: ${needs}`;
}

export type { PlayedAt } from '../effectSteps';
export { downloadTakes, examineTakes, examineTakeMax, examineTakeMin, examineCount } from '../effectSteps';
