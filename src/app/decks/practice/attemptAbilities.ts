// The attempt abilities the table offers (#1835): the rows of `src/lib/attemptAbilities` of each unstopped personnel
// of the attempting group (the away team at a planet mission, the crew of the attempting ship at a space mission),
// while the attempted mission passes the row's condition and the row's use limit allows another use this turn. Derived
// from the table and the log, never stored. The attempt strip shows one button each (`attempt-ability`).
//
// Since #1956 a row of source `core` is offered from a card of its title in the core, once per unstopped personnel of
// the attempting group, each offer with its own `targetId`; and a `facingDilemma` row only while a dilemma is faced
// (`facedDilemmaOf`).
//
// A `gainSkill` row (#1958) needs the player's pick of a skill too: `gainSkillOptionsOf` lists the skills its target
// has on the table now, which the reducer checks the pick against.

import { cardDisplayName } from '../../../lib/cardCount';
import { attemptAbilitiesOfTitle, sourceOf, windowOf, type AttemptAbility, type ModifyStep } from '../../../lib/attemptAbilities';
import { skillsGainedOf, timedSkillsOf } from '../../../lib/modifiers';
import { SKILLS } from '../../../lib/missionRequirements';
import { missions } from '../../../lib/tableView';
import { abilityUsable, type LogEntry } from './gameLog';
import { facedDilemmaOf, type CardInstance, type TableState } from './tableReducer';
import { modifierCardOf, tableReadOf, tableViewOf } from './tableView';

/** One offer: the card, its ability, and the card the ability's change goes to. */
export interface AttemptAbilityOffer {
  id: string;
  name: string;
  ability: AttemptAbility;
  /** The card the `modify` step changes: the card itself, the ship it is aboard, or the chosen personnel. */
  targetId: string;
  targetName: string;
}

/** The attempting group: the personnel of the away team, or of the attempting ship's crew, and that ship. */
export function attemptingGroupOf(table: TableState): { cards: CardInstance[]; ship?: CardInstance } | null {
  const attempt = table.attempt;
  if (!attempt) return null;
  const slot = table.missions[attempt.missionIndex];
  if (!slot) return null;
  if (attempt.shipId !== undefined) {
    const ship = slot.ships.find((s) => s.id === attempt.shipId);
    return ship ? { cards: ship.crew ?? [], ship } : null;
  }
  return { cards: slot.awayTeam };
}

const nameOf = (c: CardInstance): string => (c.card ? cardDisplayName(c.card) : c.id);

/** The step of an ability that changes numbers, if any. */
export const modifyStepOf = (a: AttemptAbility): ModifyStep | undefined => a.steps.find((s): s is ModifyStep => s.kind === 'modify');

/** Whether an ability's change goes to a personnel of the group the player chooses, one offer each. */
export const targetsChosenPersonnel = (a: AttemptAbility): boolean =>
  a.steps.some((s) => (s.kind === 'modify' || s.kind === 'gainSkill') && s.target === 'chosenPersonnel');

/**
 * The skills a `gainSkill` step may give the personnel `targetId` of the attempting group (#1958): the skills it has
 * on the table now, its printed ones, those the table gives it (`skillsGainedOf`, #1836) and those an earlier use
 * gave it (`timedSkillsOf`), each once, in `SKILLS` order. Empty for a card that is not an unstopped personnel of the
 * group: "a skill he or she already has", so a skill it lacks is never offered.
 */
export function gainSkillOptionsOf(table: TableState, targetId: string): string[] {
  const card = attemptingGroupOf(table)?.cards.find((c) => c.id === targetId);
  if (!card?.card || card.stopped || String(card.card.type ?? '').toLowerCase() !== 'personnel') return [];
  const { view } = tableReadOf(table);
  const has = [String(card.card.skills ?? ''), ...skillsGainedOf(view, modifierCardOf(card)), ...timedSkillsOf(view, card.id)].join(' ').toLowerCase();
  return SKILLS.filter((s) => new RegExp(`\\b${s.toLowerCase()}\\b`).test(has));
}

/**
 * The offers of the table (#1835): each ability of each unstopped personnel of the attempting group whose mission
 * condition holds and whose limit allows another use this turn, in the group's order, then the abilities of the
 * core's cards (#1956), one per chosen personnel. An ability that changes the ship it is aboard needs a ship: at a
 * planet mission it is not offered. A `facingDilemma` ability needs a faced dilemma.
 */
export function attemptAbilitiesOf(state: { table: TableState; log: LogEntry[] }): AttemptAbilityOffer[] {
  const { table, log } = state;
  const group = attemptingGroupOf(table);
  if (!group) return [];
  const missionIndex = table.attempt!.missionIndex;
  const facing = !!facedDilemmaOf(table);
  let view: ReturnType<typeof tableViewOf> | null = null;
  const missionPasses = (a: AttemptAbility) => !a.mission || missions((view ??= tableViewOf(table)), { ...a.mission, index: missionIndex }).length > 0;
  const open = (source: CardInstance, a: AttemptAbility) =>
    (windowOf(a) === 'attempting' || facing) &&
    missionPasses(a) &&
    abilityUsable(log, table.turn, { kind: 'attemptAbility', id: source.id, index: a.index }, a.limit);
  const personnel = group.cards.filter((c) => !c.stopped && !!c.card && String(c.card.type ?? '').toLowerCase() === 'personnel');
  const offers: AttemptAbilityOffer[] = [];
  const offer = (card: CardInstance, ability: AttemptAbility, target: CardInstance) =>
    offers.push({ id: card.id, name: nameOf(card), ability, targetId: target.id, targetName: nameOf(target) });
  for (const card of personnel) {
    for (const ability of attemptAbilitiesOfTitle(nameOf(card))) {
      if (sourceOf(ability) !== 'self') continue;
      const step = modifyStepOf(ability);
      const target = step?.target === 'itsShip' ? group.ship : card;
      if (!target || !open(card, ability)) continue;
      offer(card, ability, target);
    }
  }
  for (const card of table.core) {
    if (!card.card) continue;
    for (const ability of attemptAbilitiesOfTitle(nameOf(card))) {
      if (sourceOf(ability) !== 'core' || !open(card, ability)) continue;
      for (const target of personnel) offer(card, ability, target);
    }
  }
  return offers;
}
