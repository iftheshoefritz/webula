import { CostFacts, CostModel, CostPlay, CostTurnPlay, ModelCost, differentAffiliations } from '../model';

// The missions whose text prices the play of another card (#1752). The registry asks the mission of each
// of the player's slots, once per title (`missionCostsOf`). The facts are the table before the move, so
// "the first … each turn" reads the cards played earlier this turn (`CostFacts.plays`), whatever they
// cost, and a cancelled play is no play. A play the log recorded before #1752 has no species, skills or
// quadrant, and passes no test that reads them.

/** Whether no card played earlier this turn passes `test`. */
const firstOfTurn = (test: (play: CostTurnPlay) => boolean, facts: CostFacts): boolean => !(facts.plays ?? []).some(test);

const isEvent = (play: Pick<CostPlay, 'type'>): boolean => play.type === 'event';

const hasKeyword = (play: CostPlay, ...keywords: string[]): boolean => (play.keywords ?? []).some((k) => keywords.includes(k));

const completed = (facts: CostFacts, slot: number): boolean => facts.missions?.[slot]?.completed === true;

const minus = (play: CostPlay, amount: number, reason: string): ModelCost => ({ cost: play.printed - amount, reason });

/** "When you play a <keyword> event, if this mission is complete, that event is cost -1." */
const keywordEvent = (title: string, label: string, ...keywords: string[]): CostModel => ({
  title,
  label,
  family: 'missionRule',
  missionCostOfPlay: (play, facts, slot) =>
    completed(facts, slot) && isEvent(play) && hasKeyword(play, ...keywords)
      ? minus(play, 1, `${keywords.join(' or ')} event, mission completed`)
      : null,
});

const isPersonnel = (play: Pick<CostPlay, 'type'>): boolean => play.type === 'personnel';

const isAndroid = (play: Pick<CostPlay, 'type' | 'species'>): boolean => (play.species ?? []).includes('android');

const isDiplomacyPersonnel = (play: Pick<CostPlay, 'type' | 'skills'>): boolean =>
  isPersonnel(play) && (play.skills ?? []).includes('diplomacy');

/** The quadrant of the slot a play lands at, lowercased, or ''. */
const landingQuadrant = (play: CostPlay, facts: CostFacts): string =>
  play.missionIndex === undefined ? '' : (facts.missions?.[play.missionIndex]?.quadrant ?? '');

const isDeltaPersonnel = (play: Pick<CostTurnPlay, 'type' | 'quadrant'>): boolean => isPersonnel(play) && play.quadrant === 'd';

export const MISSION_RULE_MODELS: CostModel[] = [
  keywordEvent('Braslota System Advanced Battle Simulation', 'Braslota System', 'maneuver'),
  keywordEvent('Levinius V Advanced Combat Training', 'Levinius V', 'assault'),
  keywordEvent('Duronom Deliver Prisoners', 'Duronom', 'capture', 'punishment'),
  keywordEvent('Riese System Resolve Trade Dispute', 'Riese System', 'commodity'),
  keywordEvent('Devidia II Access Temporal Conduit', 'Devidia II', 'temporal'),
  keywordEvent("B'hava'el Prevent Systemic Annihilation", "B'hava'el", 'paranoia'),
  // "When you play an Infiltrator, if this mission is complete, that personnel is cost -1 and you may place
  // him or her on an opponent's planet mission or aboard an opponent's ship." The table has no opponent's
  // mission, so only the cost counts.
  {
    title: 'Deep Space Station K-7 Monitor Federation Commerce',
    label: 'Deep Space Station K-7',
    family: 'missionRule',
    missionCostOfPlay: (play, facts, slot) =>
      completed(facts, slot) && isPersonnel(play) && hasKeyword(play, 'infiltrator')
        ? minus(play, 1, 'Infiltrator, mission completed')
        : null,
  },
  // "While this mission is complete, the first personnel you play at a [DQ] mission each turn is cost -1."
  {
    title: 'Kelsid II Establish Settlement',
    label: 'Kelsid II',
    family: 'missionRule',
    missionCostOfPlay: (play, facts, slot) =>
      completed(facts, slot) &&
      isPersonnel(play) &&
      landingQuadrant(play, facts) === 'd' &&
      firstOfTurn(isDeltaPersonnel, facts)
        ? minus(play, 1, 'first personnel at a [DQ] mission this turn')
        : null,
  },
  // "While this mission is complete, the first Android played each turn is cost 1."
  {
    title: 'Exo III Seek Lost Scientist',
    label: 'Exo III',
    family: 'missionRule',
    missionCostOfPlay: (play, facts, slot) =>
      completed(facts, slot) && isAndroid(play) && firstOfTurn(isAndroid, facts)
        ? { cost: 1, reason: 'first Android this turn' }
        : null,
  },
  // "While there are three personnel of different affiliations on this planet, the first Diplomacy
  // personnel played each turn is cost -2." The personnel on the planet are the unstopped personnel of the
  // slot: its away team and the crews of its ship row.
  {
    title: 'Parliament Attend Diplomatic Conference',
    label: 'Parliament',
    family: 'missionRule',
    missionCostOfPlay: (play, facts, slot) => {
      const here = (facts.missions?.[slot]?.personnel ?? []).filter((p) => !p.stopped);
      return differentAffiliations(here.map((p) => p.affiliation)) >= 3 &&
        isDiplomacyPersonnel(play) &&
        firstOfTurn(isDiplomacyPersonnel, facts)
        ? minus(play, 2, 'first Diplomacy personnel this turn, 3 affiliations at Parliament')
        : null;
    },
  },
  // "When you play a {D'deridex-class ship}, it is cost -1."
  {
    title: 'Romulus Patient Stronghold',
    label: 'Romulus',
    family: 'missionRule',
    missionCostOfPlay: (play) =>
      play.type === 'ship' && play.shipClass === "d'deridex class" ? minus(play, 1, "D'deridex-class ship") : null,
  },
  // "When you play an event on a mission, if each of your missions is Region: Demilitarized Zone, it is
  // cost -1." An event placed on a mission card.
  {
    title: 'Quatal Prime Quiet Mining Colony',
    label: 'Quatal Prime',
    family: 'missionRule',
    missionCostOfPlay: (play, facts) => {
      const missions = (facts.missions ?? []).filter((m) => m.name);
      return isEvent(play) &&
        play.onMissionIndex !== undefined &&
        missions.length > 0 &&
        missions.every((m) => (m.regions ?? []).includes('demilitarized zone'))
        ? minus(play, 1, 'event on a mission, every mission in the Demilitarized Zone')
        : null;
    },
  },
  // "When you play Population 9 Billion - All Borg, if this mission is complete, it is cost 1."
  {
    title: 'Saturn Continue Invasion',
    label: 'Saturn',
    family: 'missionRule',
    missionCostOfPlay: (play, facts, slot) =>
      completed(facts, slot) && play.title === 'Population 9 Billion - All Borg' ? { cost: 1, reason: 'mission completed' } : null,
  },
  // Its back face: "You may play [Car] Dissidents, [NA] Dissidents at cost +1, and equipment at this
  // mission." A [Car] or [NA] Dissident personnel played at this mission while it is flipped is cost +1.
  {
    title: 'Cardassia Prime Bastion of Resistance',
    label: 'Cardassia Prime',
    family: 'missionRule',
    missionCostOfPlay: (play, facts, slot) =>
      facts.missions?.[slot]?.flipped &&
      play.missionIndex === slot &&
      isPersonnel(play) &&
      hasKeyword(play, 'dissident') &&
      ['cardassian', 'non-aligned'].includes(play.affiliation ?? '')
        ? { cost: play.printed + 1, reason: 'Dissident played at Cardassia Prime' }
        : null,
  },
];
