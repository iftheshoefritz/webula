// The mission registry (#1907, part 1 of #1865): every mission title whose text the practice table models, one
// row each, by whole title (`cardTitleOf`), so every version of a title shares its row. A row is the title, the
// short label the UI and the log already use ("Saturn", "Class 9 Nebula"), and its abilities, each a trigger
// and plain data, quoting the card's sentence it models (as `OrderModel.text` does) with the braces of the card
// data dropped.
//
// The triggers and the hook that reads each one (`MISSION_TRIGGER_READERS`):
// - `onComplete`: `completionEffects.ts`, the completion panel; one `batch`, one `missionCompleted` entry.
// - `onAttemptStart`: `attemptMissions.ts`, the attempt popup's change and offers.
// - `onDilemmaReveal`: a cost change (`dilemmaBot/pile/missionCost.ts`) or a prevent-and-overcome
//   (`dilemmaPrevention.ts`) of a dilemma revealed here.
// - `spend`: `missionSpends.ts` and `earthSpendOf` in `gameLog.ts`, an action that spends counters.
// - `standingCost`: the rows stay in `costModels/titles/missionRule.ts`; this registry lists their titles.
// - `requirements`: `requirementRules.ts`, the requirements the mission adds to other missions.
// - `attributes`: the rows of the `mission` source place stay in `modifiers/titles/eventsAndMissions.ts`; this
//   registry lists their titles.
//
// It imports no React and no reducer.

import { cardTitleOf } from '../cardTitle';
import { download, draw, kill, score, scorePerPick, shuffle, type DownloadStep, type EffectStep, type KillStep, type ScoreStep, type ShuffleStep } from '../effectSteps';
import type { AttemptingQuery, PlayTest } from '../tableView';

/** A completion effect that has no effect step yet is kept as data; a download and a score are steps. */
export type MissionCompletion =
  | { kind: 'download'; steps: [DownloadStep, ShuffleStep] }
  | { kind: 'discardToHq'; cap: number }
  | { kind: 'discardOrDestroy'; min: number }
  | { kind: 'toDeckBottom'; cap: number }
  | { kind: 'flip' }
  | { kind: 'score'; minSpecies: number; steps: [ScoreStep] }
  // A kill of up to N of the player's personnel here that pass a test, then a score for each (#1909, Ba'ku Planet).
  | { kind: 'kill'; steps: [KillStep, ScoreStep] };

/** A condition of an attempt's start: the attempting personnel, or the cards beneath the mission. */
export type AttemptCondition = { kind: 'attempting'; query: AttemptingQuery } | { kind: 'noDilemmasBeneath' };

/** A change of the draw and the spend as an attempt begins; with `offer`, a toggle of the popup. */
export interface AttemptStartChange {
  draw: number;
  spend: number;
  offer?: {
    /** The key of the popup's toggle, `attempt-mission-offer-<key>`. */
    key: string;
    label: string;
    /** The cards the player draws, free, when they take it (Rigel X). */
    drawCards?: number;
    /** The title the player downloads from the draw deck when they take it (Caldos IV). */
    download?: string;
  };
}

/** A test of the dilemma revealed here, over its bot model: its title, the start of its title, or its kind. */
export interface RevealedDilemmaTest {
  title?: string;
  titleStartsWith?: string;
  kind?: string;
}

export type DilemmaReveal =
  | { kind: 'cost'; change: number; dilemma: RevealedDilemmaTest }
  // "The first dilemma your personnel face here each turn that has a cost of 1 or more and does not require a skill."
  | { kind: 'prevent'; minCost: number; requiresNoSkill: true; oncePerTurn: true };

export type MissionSpendKind = 'earth' | 'nimbus';

/** An action that spends counters: its cost, its condition, its limit and its effect steps. */
export interface MissionSpendModel {
  /** The log's `missionSpend` kind, so old saves read. */
  kind: MissionSpendKind;
  counters: number;
  condition: { kind: 'playedHereThisTurn'; play: PlayTest } | { kind: 'notCommanding'; title: string };
  oncePerTurn?: true;
  steps: EffectStep[];
}

/**
 * A change of requirements: the skills the mission adds to each of the player's other missions with requirements
 * (Crescent Nebula), or the requirements that replace its own during an attempt by personnel of an affiliation
 * (#1909, Gelyan Moon: "Your [Fed] personnel may attempt this mission, replacing its requirements during that
 * attempt with …").
 */
export type RequirementChange =
  | {
      kind: 'add';
      add: string[];
      /** Missions that may be attempted by this affiliation icon get none: "non-[Fed]". */
      exceptIcon?: string;
    }
  | {
      kind: 'replace';
      /** The affiliation icon of the attempting personnel, lowercased: "[fed]". */
      icon: string;
      /** The affiliation as the card data names it, lowercased, which `icon` reads: "federation". */
      affiliation: string;
      /** The requirement text that replaces the printed one, in the form of the card data's `Skills` field. */
      skills: string;
    };

export type MissionAbility =
  | { trigger: 'onComplete'; text: string; completion: MissionCompletion }
  | { trigger: 'onAttemptStart'; text: string; condition: AttemptCondition; change: AttemptStartChange }
  | { trigger: 'onDilemmaReveal'; text: string; reveal: DilemmaReveal }
  | { trigger: 'spend'; text: string; spend: MissionSpendModel }
  | { trigger: 'standingCost'; text: string }
  | { trigger: 'requirements'; text: string; requirements: RequirementChange }
  | { trigger: 'attributes'; text: string };

export type MissionTrigger = MissionAbility['trigger'];

export interface MissionModel {
  /** The whole title, `cardTitleOf` of the name, the key of the registry. */
  title: string;
  /** The short name the UI and the log use: "Saturn". */
  label: string;
  abilities: MissionAbility[];
}

/** The hook that reads each trigger. */
export const MISSION_TRIGGER_READERS: Record<MissionTrigger, string> = {
  onComplete: 'completionEffectOf',
  onAttemptStart: 'attemptMissionRules',
  onDilemmaReveal: 'missionCostOf, preventionOf',
  spend: 'earthSpendOf, nimbusSpendOf',
  standingCost: 'missionCostsOf',
  requirements: 'addedRequirements',
  attributes: 'the modifier rows of the mission source place',
};

const standingCost = (text: string): MissionAbility => ({ trigger: 'standingCost', text });

const keywordEvent = (title: string, label: string, text: string): MissionModel => ({ title, label, abilities: [standingCost(text)] });

const POPULATION_9_BILLION = 'Population 9 Billion - All Borg';

/** Caldos IV's download: it has no card in the card data yet. */
export const HOWARD_HEIRLOOM_CANDLE = 'Howard Heirloom Candle';

export const MISSION_MODELS: MissionModel[] = [
  {
    title: 'Saturn Continue Invasion',
    label: 'Saturn',
    abilities: [
      {
        trigger: 'onComplete',
        text: `When you complete this mission, you may download ${POPULATION_9_BILLION}.`,
        completion: { kind: 'download', steps: [download(1, POPULATION_9_BILLION, [{ titles: [POPULATION_9_BILLION] }]), shuffle()] },
      },
      standingCost(`When you play ${POPULATION_9_BILLION}, if this mission is complete, it is cost 1.`),
    ],
  },
  {
    title: 'Starbase 718 Investigate Cryosatellite',
    label: 'Starbase 718',
    abilities: [
      {
        trigger: 'onComplete',
        text: 'When your personnel complete this mission, you may place any number of unique personnel with a total cost of 6 or less from your discard pile at your headquarters mission where they could be played.',
        completion: { kind: 'discardToHq', cap: 6 },
      },
    ],
  },
  {
    title: 'Bassen Rift Interdict Genocidal Praetor',
    label: 'Bassen Rift',
    abilities: [
      {
        trigger: 'onComplete',
        text: "When you complete this mission, each ship here is destroyed unless you place a personnel involved who costs 4 or more in their owner's discard pile.",
        completion: { kind: 'discardOrDestroy', min: 4 },
      },
    ],
  },
  {
    title: 'Aldea Aid Legendary Civilization',
    label: 'Aldea',
    abilities: [
      {
        // The opponents' half of the text is not checked: a solo table has no opponent's personnel.
        trigger: 'onComplete',
        text: "When you complete this mission, place up to 12 total cost of your personnel involved beneath their owners' decks.",
        completion: { kind: 'toDeckBottom', cap: 12 },
      },
    ],
  },
  {
    title: 'Cheron Aid Planetary Recovery',
    label: 'Cheron',
    abilities: [
      {
        trigger: 'onComplete',
        text: 'When you complete this mission, if four or more different species were involved, score 5 points.',
        completion: { kind: 'score', minSpecies: 4, steps: [score(5)] },
      },
    ],
  },
  {
    title: 'Gateway Flee in Terror',
    label: 'Gateway',
    abilities: [{ trigger: 'onComplete', text: 'When you complete this mission, flip it over.', completion: { kind: 'flip' } }],
  },
  {
    title: 'Class 9 Nebula Bypass Disputed Region',
    label: 'Class 9 Nebula',
    abilities: [
      {
        trigger: 'onAttemptStart',
        text: 'When you begin a mission attempt here, if all of your personnel involved are of the same affiliation, subtract one from the number of dilemmas your opponent may draw and one from the total cost they may spend on dilemmas.',
        condition: { kind: 'attempting', query: { oneAffiliation: true } },
        change: { draw: -1, spend: -1 },
      },
    ],
  },
  {
    // The bare "Mouth of the Wormhole" of the two headquarters is another title, and gets nothing.
    title: 'Mouth of the Wormhole Form Labor Union',
    label: 'Mouth of the Wormhole',
    abilities: [
      {
        trigger: 'onAttemptStart',
        text: 'When you begin a mission attempt here involving six or more Dabo Girl and/or Waiter personnel, you may subtract one from the total cost your opponent may spend on dilemmas.',
        condition: { kind: 'attempting', query: { min: 6, keywords: ['dabo girl', 'waiter'] } },
        change: { draw: 0, spend: -1, offer: { key: 'mouth-of-the-wormhole', label: 'Spend −1' } },
      },
    ],
  },
  {
    title: 'Rigel X Locate Mysterious Contact',
    label: 'Rigel X',
    abilities: [
      {
        trigger: 'onAttemptStart',
        text: 'When six or more personnel begin a mission attempt here, you may draw two cards. If you do, your opponent may draw one extra dilemma and spend one extra in total cost on dilemmas.',
        condition: { kind: 'attempting', query: { min: 6 } },
        change: { draw: 1, spend: 1, offer: { key: 'rigel-x', label: 'Draw 2 cards', drawCards: 2 } },
      },
    ],
  },
  {
    title: 'Caldos IV Upgrade Colony',
    label: 'Caldos IV',
    abilities: [
      {
        // The top-most copy of the draw deck.
        trigger: 'onAttemptStart',
        text: `When you begin a mission attempt here, if no dilemmas are beneath this mission, you may download ${HOWARD_HEIRLOOM_CANDLE}.`,
        condition: { kind: 'noDilemmasBeneath' },
        change: { draw: 0, spend: 0, offer: { key: 'caldos-iv', label: `Download ${HOWARD_HEIRLOOM_CANDLE}`, download: HOWARD_HEIRLOOM_CANDLE } },
      },
    ],
  },
  {
    title: 'Terlina III Follow Homing Beacon',
    label: 'Terlina III',
    abilities: [
      {
        trigger: 'onDilemmaReveal',
        text: 'When Unscientific Method is revealed here, it is cost -2.',
        reveal: { kind: 'cost', change: -2, dilemma: { title: 'Unscientific Method' } },
      },
    ],
  },
  {
    title: 'Stakoron II Mine Miszinite',
    label: 'Stakoron II',
    abilities: [
      {
        trigger: 'onDilemmaReveal',
        text: 'When a dual dilemma is revealed here, it is cost +1.',
        reveal: { kind: 'cost', change: 1, dilemma: { kind: 'dual' } },
      },
    ],
  },
  {
    title: 'Stakoron Strait Patrol Shipping Lane',
    label: 'Stakoron Strait',
    abilities: [
      {
        trigger: 'onDilemmaReveal',
        text: 'When a dual dilemma is revealed here, it is cost +1.',
        reveal: { kind: 'cost', change: 1, dilemma: { kind: 'dual' } },
      },
    ],
  },
  {
    title: 'Wadi Homeworld Dominate Gaming Championship',
    label: 'Wadi Homeworld',
    abilities: [
      {
        trigger: 'onDilemmaReveal',
        text: 'Each dilemma whose title begins with "Chula" revealed here is cost -1.',
        reveal: { kind: 'cost', change: -1, dilemma: { titleStartsWith: 'Chula' } },
      },
    ],
  },
  {
    title: 'Sigma Iotia II Assess Contamination',
    label: 'Sigma Iotia II',
    abilities: [
      {
        trigger: 'onDilemmaReveal',
        text: 'The first dilemma your personnel face here each turn that has a cost of 1 or more and does not require a skill is prevented and overcome.',
        reveal: { kind: 'prevent', minCost: 1, requiresNoSkill: true, oncePerTurn: true },
      },
    ],
  },
  {
    // Offered after a play of a [TOS] card into Earth's away team or onto Earth's mission card, never into a
    // crew at Earth.
    title: 'Earth Lush and Beautiful Home',
    label: 'Earth',
    abilities: [
      {
        trigger: 'spend',
        text: 'When you play a [TOS] card here, you may spend a counter to draw two cards. You may do this only once each turn.',
        spend: { kind: 'earth', counters: 1, condition: { kind: 'playedHereThisTurn', play: { icon: '[tos]' } }, oncePerTurn: true, steps: [draw(2)] },
      },
    ],
  },
  {
    // The table looks for Unicomplex in the player's five mission slots only.
    title: 'Nimbus III Staff Backwater Embassy',
    label: 'Nimbus III',
    abilities: [
      {
        trigger: 'spend',
        text: 'While you do not command Unicomplex, you may spend three counters to download Caithlin Dar, Korrd, or St. John Talbot and place him or her on this planet.',
        spend: {
          kind: 'nimbus',
          counters: 3,
          condition: { kind: 'notCommanding', title: 'Unicomplex' },
          steps: [
            {
              kind: 'download',
              of: { kind: 'test', test: [{ types: ['personnel'], titles: ['Caithlin Dar', 'Korrd', 'St. John Talbot'] }], testText: 'Caithlin Dar, Korrd, or St. John Talbot' },
              upTo: 1,
              to: { kind: 'thisAwayTeam' },
              may: true,
            },
            shuffle(),
          ],
        },
      },
    ],
  },
  {
    title: 'Crescent Nebula Take Out the Trash',
    label: 'Crescent Nebula',
    abilities: [
      {
        trigger: 'requirements',
        text: 'Add Intelligence to the requirements of each of your other non-[Fed] missions.',
        requirements: { kind: 'add', add: ['Intelligence'], exceptIcon: '[fed]' },
      },
    ],
  },
  {
    title: 'Gelyan Moon Harness Omega Particle',
    label: 'Gelyan Moon',
    abilities: [
      {
        trigger: 'requirements',
        text: 'Your [Fed] personnel may attempt this mission, replacing its requirements during that attempt with Engineer, Medical, Officer, Physics, Science, Security, Transporters, and Cunning>48.',
        requirements: {
          kind: 'replace',
          icon: '[fed]',
          affiliation: 'federation',
          skills: 'Engineer, Medical, Officer, Physics, Science, Security, Transporters, and Cunning>48',
        },
      },
    ],
  },
  {
    title: 'Rura Penthe Escape Gulag',
    label: 'Rura Penthe',
    abilities: [
      {
        trigger: 'requirements',
        text: 'Your [Kli] personnel may attempt this mission, replacing its requirements during that attempt with Geology, Officer, Security, and Strength>28.',
        requirements: { kind: 'replace', icon: '[kli]', affiliation: 'klingon', skills: 'Geology, Officer, Security, and Strength>28' },
      },
    ],
  },
  {
    // A personnel at this mission: an away team here or a crew of a ship here, stopped or not.
    title: "Ba'ku Planet Collect Metaphasic Particles",
    label: "Ba'ku Planet",
    abilities: [
      {
        trigger: 'onComplete',
        text: 'When you complete this mission, you may kill up to three of your [NA] Honor personnel at this mission. Score 5 points for each.',
        completion: { kind: 'kill', steps: [kill(3, '[NA] Honor personnel', [{ types: ['personnel'], affiliations: ['non-aligned'], skills: ['honor'] }]), scorePerPick(5)] },
      },
    ],
  },
  {
    title: 'Orlitus Cluster Astronomical Survey',
    label: 'Orlitus Cluster',
    abilities: [{ trigger: 'attributes', text: 'Each of your personnel here with a cost of 1 or less is attributes +1.' }],
  },
  {
    title: 'Organia Secure Strategic Base',
    label: 'Organia',
    abilities: [{ trigger: 'attributes', text: 'Each of your [Pa] personnel at this mission is attributes +1.' }],
  },
  keywordEvent('Braslota System Advanced Battle Simulation', 'Braslota System', 'When you play a Maneuver event, if this mission is complete, that event is cost -1'),
  keywordEvent('Levinius V Advanced Combat Training', 'Levinius V', 'When you play an Assault event, if this mission is complete, that event is cost -1.'),
  keywordEvent('Duronom Deliver Prisoners', 'Duronom', 'When you play a Capture or Punishment event, if this mission is complete, that event is cost -1.'),
  keywordEvent('Riese System Resolve Trade Dispute', 'Riese System', 'When you play a Commodity event, if this mission is complete, that event is cost -1.'),
  keywordEvent('Devidia II Access Temporal Conduit', 'Devidia II', 'When you play a Temporal event, if you have completed this mission, that event is cost -1.'),
  keywordEvent("B'hava'el Prevent Systemic Annihilation", "B'hava'el", 'When you play a Paranoia event, if this mission is complete, that event is cost -1.'),
  {
    // The placement on an opponent's mission or ship is not checked: the table has none.
    title: 'Deep Space Station K-7 Monitor Federation Commerce',
    label: 'Deep Space Station K-7',
    abilities: [
      standingCost(
        "When you play an Infiltrator, if this mission is complete, that personnel is cost -1 and you may place him or her on an opponent's planet mission or aboard an opponent's ship."
      ),
    ],
  },
  {
    title: 'Kelsid II Establish Settlement',
    label: 'Kelsid II',
    abilities: [standingCost('While this mission is complete, the first personnel you play at a [DQ] mission each turn is cost -1.')],
  },
  {
    title: 'Exo III Seek Lost Scientist',
    label: 'Exo III',
    abilities: [standingCost('While this mission is complete, the first Android played each turn is cost 1.')],
  },
  {
    title: 'Parliament Attend Diplomatic Conference',
    label: 'Parliament',
    abilities: [
      standingCost('While there are three personnel of different affiliations on this planet, the first Diplomacy personnel played each turn is cost -2.'),
    ],
  },
  {
    title: 'Romulus Patient Stronghold',
    label: 'Romulus',
    abilities: [standingCost("When you play a D'deridex-class ship, it is cost -1.")],
  },
  {
    title: 'Quatal Prime Quiet Mining Colony',
    label: 'Quatal Prime',
    abilities: [standingCost('When you play an event on a mission, if each of your missions is Region: Demilitarized Zone, it is cost -1.')],
  },
  {
    title: 'Cardassia Prime Bastion of Resistance',
    label: 'Cardassia Prime',
    abilities: [standingCost('You may play [Car] Dissidents, [NA] Dissidents at cost +1, and equipment at this mission.')],
  },
  {
    title: 'Vidiia Locus of Infection',
    label: 'Vidiia',
    abilities: [standingCost('While you command fewer than seven personnel, the first [Vid] personnel you play each turn is cost -2.')],
  },
];

const key = (title: string): string => cardTitleOf(title).toLowerCase();

const BY_TITLE: ReadonlyMap<string, MissionModel> = new Map(MISSION_MODELS.map((m) => [key(m.title), m]));

/** The row of the mission whose name is `name`, any version of its title, or undefined. */
export const missionModelOf = (name: string | null | undefined): MissionModel | undefined =>
  typeof name === 'string' ? BY_TITLE.get(key(name)) : undefined;

/** The row of a mission card of the card data, `originalName` first, or undefined. */
export const missionModelOfCard = (card: { name?: string; originalName?: string } | null | undefined): MissionModel | undefined =>
  missionModelOf(card?.originalName ?? card?.name);

type AbilityOf<T extends MissionTrigger> = Extract<MissionAbility, { trigger: T }>;

/** The first ability of `model` of trigger `trigger`, or undefined. */
export function abilityOf<T extends MissionTrigger>(model: MissionModel | undefined, trigger: T): AbilityOf<T> | undefined {
  return model?.abilities.find((a): a is AbilityOf<T> => a.trigger === trigger);
}

/** Every row with an ability of `trigger`, with that ability. */
export function missionModelsWith<T extends MissionTrigger>(trigger: T): { model: MissionModel; ability: AbilityOf<T> }[] {
  return MISSION_MODELS.flatMap((model) => {
    const ability = abilityOf(model, trigger);
    return ability ? [{ model, ability }] : [];
  });
}

/** The titles of every row, the model backlog's `mission` concern reads them. */
export const MISSION_MODEL_TITLES: readonly string[] = MISSION_MODELS.map((m) => m.title);
