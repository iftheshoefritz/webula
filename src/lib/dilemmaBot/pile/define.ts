import { BOT_SKILLS } from '../requirements';
import { Play, sk } from './families';
import { BotSideCategory, DilemmaModel, PileAttempt } from './model';
import { Attr, ATTR_NAMES, PlayState } from './play';

// What every file of `titles/` builds its models with (#1320): the `dilemma` builder, the three kinds,
// and the helpers more than one title shares. A new pile's titles go in a new file of `titles/`, which
// `registry.ts` imports.

type Kind = DilemmaModel['kind'];
export const P: Kind = 'planet';
export const S: Kind = 'space';
export const D: Kind = 'dual';

export interface Extras {
  cost?: (a: PileAttempt) => number;
  leads?: boolean;
  goesUnder?: boolean;
  /** `'ignore'`: the bot takes the title out of its pile when the game starts (#1320). Absent: `'play'`. */
  status?: DilemmaModel['status'];
  category?: BotSideCategory;
  assumption?: string;
  gap?: string;
  discountsNext?: DilemmaModel['discountsNext'];
  extraBudget?: number;
}

/** A list of models and the builder that adds to it: `dilemma(title, kind, printedCost, family, play, extras)`. */
export function dilemmaList() {
  const models: DilemmaModel[] = [];
  const dilemma = (title: string, kind: Kind, printedCost: number, family: string, play: Play, extras: Extras = {}) => {
    models.push({ title, kind, printedCost, family, play, status: 'play', ...extras, goesUnder: extras.goesUnder ?? true });
  };
  return { models, dilemma };
}

export const lowCost = (a: PileAttempt) => a.personnel.filter((p) => p.cost <= 2).length;
/** The assumption of category 1 (#1320): the bot's core holds 6 events, none of them Decay or Paranoia events. */
export const CORE_EVENTS = 6;
/** The four skills Counterinsurgency Program and Garak Has Some Issues do not let the bot name. */
export const UNNAMEABLE = ['acquisition', 'intelligence', 'law', 'telepathy'].map(sk);
export const NAMEABLE = BOT_SKILLS.map((_, i) => i).filter((i) => !UNNAMEABLE.includes(i));

/** Category 4a: the fewest discards, up to the cap, that make the group fail `attribute>30+5×discards`. */
export const discardCap = (a: PileAttempt) => (a.table.completedMissions >= 1 ? 6 : 3);
export function discardToRaise(attr: Attr): Play {
  return (s) => {
    const total = s.totalAttr(attr);
    const cap = discardCap(s.attempt);
    let discards = 0;
    while (discards < cap && total > 30 + 5 * discards) discards++;
    if (total > 30 + 5 * discards) discards = 0; // no discard within the cap makes the group fail
    if (discards) s.label(`Discarded ${discards} card${discards === 1 ? '' : 's'}`);
    if (total <= 30 + 5 * discards) s.stopAll();
    else s.trace?.(`  ${ATTR_NAMES[attr]} ${total}>${30 + 5 * discards}: no effect`);
  };
}

/** The skill of `among` the most unstopped personnel have: what the bot names when a named skill stops its holders. */
export function mostHeldSkill(s: PlayState, among: number[]): number {
  const ks = s.unstopped();
  let best = among[0];
  let bestCount = -1;
  for (const i of among) {
    const count = ks.filter((k) => s.skill(k, i) > 0).length;
    if (count > bestCount) [best, bestCount] = [i, count];
  }
  return best;
}

export const speciesKey = (s: PlayState, k: number) => s.group[k].species.join('/');

/** The names of `ks`, for a trace line. */
export const names = (s: PlayState, ks: number[]) => ks.map((k) => s.name(k)).join(', ');
