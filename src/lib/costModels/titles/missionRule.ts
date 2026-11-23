import { count, firstThisTurn, missionAt, missions, personnel } from '../../tableView';
import { costFactsSource } from '../factsSource';
import { CostFacts, CostModel, CostPlay, CostTurnPlay, ModelCost, differentAffiliations } from '../model';
import { atMission, withRows } from '../rows';

// The missions whose text prices the play of another card (#1752), each one cost row of the mission (#1888). The
// registry asks the mission of each of the player's slots, once per title (`missionCostsOf`). The facts are the table before the move, so
// "the first … each turn" reads the cards played earlier this turn (`CostFacts.plays`), whatever they
// cost, and a cancelled play is no play. A play the log recorded before #1752 has no species, skills or
// quadrant, and passes no test that reads them.


const isEvent = (play: Pick<CostPlay, 'type'>): boolean => play.type === 'event';

const hasKeyword = (play: CostPlay, ...keywords: string[]): boolean => (play.keywords ?? []).some((k) => keywords.includes(k));

const completed = (facts: CostFacts, slot: number): boolean => missionAt(costFactsSource(facts), slot)?.completed === true;

const minus = (play: CostPlay, amount: number, reason: string): ModelCost => ({ cost: play.printed - amount, reason });

/** The mission rule of `title`: the cost `cost` sets on a play while the mission is in the player's slot `slot`. */
const missionModel = (title: string, label: string, cost: (play: CostPlay, facts: CostFacts, slot: number) => ModelCost | null): CostModel =>
  withRows({ title, label, family: 'missionRule' }, atMission(({ play, facts, slot }) => cost(play, facts, slot ?? 0)));

/** "When you play a <keyword> event, if this mission is complete, that event is cost -1." */
const keywordEvent = (title: string, label: string, ...keywords: string[]): CostModel =>
  missionModel(title, label, (play, facts, slot) =>
    completed(facts, slot) && isEvent(play) && hasKeyword(play, ...keywords) ? minus(play, 1, `${keywords.join(' or ')} event, mission completed`) : null
  );

const isPersonnel = (play: Pick<CostPlay, 'type'>): boolean => play.type === 'personnel';

const isAndroid = (play: Pick<CostPlay, 'type' | 'species'>): boolean => (play.species ?? []).includes('android');

const isDiplomacyPersonnel = (play: Pick<CostPlay, 'type' | 'skills'>): boolean =>
  isPersonnel(play) && (play.skills ?? []).includes('diplomacy');

/** The quadrant of the slot a play lands at, lowercased, or ''. */
const landingQuadrant = (play: CostPlay, facts: CostFacts): string => missionAt(costFactsSource(facts), play.missionIndex)?.quadrant ?? '';

const isDeltaPersonnel = (play: Pick<CostTurnPlay, 'type' | 'quadrant'>): boolean => isPersonnel(play) && play.quadrant === 'd';

const isVidiianPersonnel = (play: Pick<CostTurnPlay, 'type' | 'affiliation'>): boolean =>
  isPersonnel(play) && play.affiliation === 'vidiian';

// "The first … each turn" (`firstThisTurn`), with the words of each reason.
const firstDeltaPersonnel = firstThisTurn(isDeltaPersonnel, 'personnel at a [DQ] mission');
const firstAndroid = firstThisTurn(isAndroid, 'Android');
const firstDiplomacyPersonnel = firstThisTurn(isDiplomacyPersonnel, 'Diplomacy personnel');
const firstVidiianPersonnel = firstThisTurn(isVidiianPersonnel, '[Vid] personnel');

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
  missionModel('Deep Space Station K-7 Monitor Federation Commerce', 'Deep Space Station K-7', (play, facts, slot) =>
    completed(facts, slot) && isPersonnel(play) && hasKeyword(play, 'infiltrator')
      ? minus(play, 1, 'Infiltrator, mission completed')
      : null),
  // "While this mission is complete, the first personnel you play at a [DQ] mission each turn is cost -1."
  missionModel('Kelsid II Establish Settlement', 'Kelsid II', (play, facts, slot) =>
    completed(facts, slot) &&
    isPersonnel(play) &&
    landingQuadrant(play, facts) === 'd' &&
    firstDeltaPersonnel.holds(costFactsSource(facts))
      ? minus(play, 1, firstDeltaPersonnel.text(costFactsSource(facts)))
      : null),
  // "While this mission is complete, the first Android played each turn is cost 1."
  missionModel('Exo III Seek Lost Scientist', 'Exo III', (play, facts, slot) =>
    completed(facts, slot) && isAndroid(play) && firstAndroid.holds(costFactsSource(facts))
      ? { cost: 1, reason: firstAndroid.text(costFactsSource(facts)) }
      : null),
  // "While there are three personnel of different affiliations on this planet, the first Diplomacy
  // personnel played each turn is cost -2." The personnel on the planet are the unstopped personnel of the
  // slot: its away team and the crews of its ship row.
  missionModel('Parliament Attend Diplomatic Conference', 'Parliament', (play, facts, slot) => {
    const here = personnel(costFactsSource(facts), { unstopped: true, at: slot });
    return differentAffiliations(here.map((p) => p.affiliation)) >= 3 &&
      isDiplomacyPersonnel(play) &&
      firstDiplomacyPersonnel.holds(costFactsSource(facts))
      ? minus(play, 2, `${firstDiplomacyPersonnel.text(costFactsSource(facts))}, 3 affiliations at Parliament`)
      : null;
  }),
  // "When you play a {D'deridex-class ship}, it is cost -1."
  missionModel('Romulus Patient Stronghold', 'Romulus', (play) =>
    play.type === 'ship' && play.shipClass === "d'deridex class" ? minus(play, 1, "D'deridex-class ship") : null),
  // "When you play an event on a mission, if each of your missions is Region: Demilitarized Zone, it is
  // cost -1." An event placed on a mission card.
  missionModel('Quatal Prime Quiet Mining Colony', 'Quatal Prime', (play, facts) => {
    const slots = missions(costFactsSource(facts));
    return isEvent(play) &&
      play.onMissionIndex !== undefined &&
      slots.length > 0 &&
      slots.every((m) => m.regions.includes('demilitarized zone'))
      ? minus(play, 1, 'event on a mission, every mission in the Demilitarized Zone')
      : null;
  }),
  // "When you play Population 9 Billion - All Borg, if this mission is complete, it is cost 1."
  missionModel('Saturn Continue Invasion', 'Saturn', (play, facts, slot) =>
    completed(facts, slot) && play.title === 'Population 9 Billion - All Borg' ? { cost: 1, reason: 'mission completed' } : null),
  // Its back face: "You may play [Car] Dissidents, [NA] Dissidents at cost +1, and equipment at this
  // mission." A [Car] or [NA] Dissident personnel played at this mission while it is flipped is cost +1.
  missionModel('Cardassia Prime Bastion of Resistance', 'Cardassia Prime', (play, facts, slot) =>
    missionAt(costFactsSource(facts), slot)?.flipped &&
    play.missionIndex === slot &&
    isPersonnel(play) &&
    hasKeyword(play, 'dissident') &&
    ['cardassian', 'non-aligned'].includes(play.affiliation ?? '')
      ? { cost: play.printed + 1, reason: 'Dissident played at Cardassia Prime' }
      : null),
  // "While you command fewer than seven personnel, the first [Vid] personnel you play each turn is cost -2."
  // (#1750) The count is the unstopped personnel of every away team and crew before the play, never the
  // brig (`CostFacts.commanded`). Its headquarters text is `hqPlayability.ts`'s.
  missionModel('Vidiia Locus of Infection', 'Vidiia', (play, facts) => {
    const source = costFactsSource(facts);
    const n = count(source, { of: 'personnel', unstopped: true });
    return isVidiianPersonnel(play) && n < 7 && firstVidiianPersonnel.holds(source)
      ? minus(play, 2, `${firstVidiianPersonnel.text(source)}, ${n} personnel commanded`)
      : null;
  }),
];
