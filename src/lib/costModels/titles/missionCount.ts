import { CostChange } from '../../modifiers/model';
import { CostFacts, CostMission, CostModel } from '../model';
import { own, withRows } from '../rows';

// The cards whose cost counts the player's missions, or the dilemmas beneath them (#1696). Every mission
// on the table is the player's; an empty slot counts as nothing, and a headquarters is neither a planet
// nor a space mission.

type Test = (m: CostMission) => boolean;

const isPlanet: Test = (m) => m.type === 'p';
const isSpace: Test = (m) => m.type === 's';
const hasIcon =
  (icon: string): Test =>
  (m) =>
    m.icons.includes(icon);
const inRegion =
  (region: string): Test =>
  (m) =>
    (m.regions ?? []).includes(region);

const countOf = (facts: CostFacts, test: Test): number => (facts.missions ?? []).filter(test).length;
const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** "Cost `step` for each <mission that passes `test`>": the reason names the count, `what(n)`. */
const perMission =
  (step: number, test: Test, what: (n: number) => string): CostChange =>
  ({ play, facts }) => {
    const n = countOf(facts, test);
    return n > 0 ? { cost: play.printed + step * n, reason: what(n) } : null;
  };

/** The model of `title`, whose own cost `change` sets. */
const ownModel = (title: string, label: string | undefined, change: CostChange): CostModel =>
  withRows({ title, ...(label ? { label } : {}), family: 'ownCost' }, own(change));

// "When you play this personnel, he (she) is cost +2 for each planet mission you command."
const plusTwoPerPlanet = (title: string, label: string): CostModel =>
  ownModel(title, label, perMission(2, isPlanet, (n) => `you command ${plural(n, 'planet mission', 'planet missions')}`));

export const MISSION_COUNT_MODELS: CostModel[] = [
  // "When you play this event, it is cost -1 for each dilemma beneath your [SF] missions."
  ownModel('Accumulated Knowledge', undefined, ({ play, facts }) => {
    const n = (facts.missions ?? []).filter(hasIcon('[sf]')).reduce((sum, m) => sum + m.dilemmasUnder, 0);
    return n > 0 ? { cost: play.printed - n, reason: `${plural(n, 'dilemma', 'dilemmas')} beneath your [SF] missions` } : null;
  }),
  plusTwoPerPlanet('Mitchell', 'Mitchell'),
  plusTwoPerPlanet('Mortimer Harren Reclusive Genius', 'Mortimer Harren'),
  plusTwoPerPlanet('Tal Celes Imprecise Analyst', 'Tal Celes'),
  plusTwoPerPlanet('William Telfer Misguided Hypochondriac', 'William Telfer'),
  // "When you play this personnel, if you command three or more Region: Demilitarized Zone missions, he is
  // cost -1." (#1749)
  ownModel('Hogan', undefined, ({ play, facts }) => {
    const n = countOf(facts, inRegion('demilitarized zone'));
    return n >= 3 ? { cost: play.printed - 1, reason: `you command ${n} Demilitarized Zone missions` } : null;
  }),
  // "When you play this personnel, if you command four space missions, he is cost -3." Four or more.
  ownModel('Tom Paris Competitive Pilot', 'Tom Paris', ({ play, facts }) => {
    const n = countOf(facts, isSpace);
    return n >= 4 ? { cost: play.printed - 3, reason: `you command ${n} space missions` } : null;
  }),
  // "When you play this event, it is cost -1 for each space mission you command."
  ownModel('Thirst for Knowledge', undefined, perMission(-1, isSpace, (n) => `you command ${plural(n, 'space mission', 'space missions')}`)),
  // "When you play this personnel, you may choose a [SF] mission you command. If you do, she is cost -1
  // for each dilemma beneath that mission." The table takes the one with the most, the first on a tie.
  ownModel('Danica Erickson Well Read', 'Danica Erickson', ({ play, facts }) => {
    const best = (facts.missions ?? [])
      .filter(hasIcon('[sf]'))
      .reduce<CostMission | null>((top, m) => (!top || m.dilemmasUnder > top.dilemmasUnder ? m : top), null);
    return best && best.dilemmasUnder > 0
      ? { cost: play.printed - best.dilemmasUnder, reason: `${plural(best.dilemmasUnder, 'dilemma', 'dilemmas')} beneath ${best.name}` }
      : null;
  }),
  // "When you play this equipment, it is cost -1 for each Region: Delphic Expanse mission you command."
  ownModel(
    'Trellium-D',
    undefined,
    perMission(-1, inRegion('delphic expanse'), (n) => `you command ${plural(n, 'Delphic Expanse mission', 'Delphic Expanse missions')}`)
  ),
  // "When you play this ship, it is cost -1 for each of your [Kli] missions."
  ownModel('U.S.S. Enterprise-A Olive Branch', 'U.S.S. Enterprise-A', perMission(-1, hasIcon('[kli]'), (n) => `you command ${plural(n, '[Kli] mission', '[Kli] missions')}`)),
];
