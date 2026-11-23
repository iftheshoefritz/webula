// The two cards that prevent and overcome a dilemma the player's personnel face (#1761), in a bot game
// only, where the table resolves dilemmas:
//
// - Sigma Iotia II, Assess Contamination: "The first dilemma your personnel face here each turn that has
//   a cost of 1 or more and does not require a skill is prevented and overcome."
// - Tristan Adams, Deranged Psychiatrist: "You may play this personnel at cost +2 to name a dilemma. Each
//   copy of that dilemma this personnel faces this turn is prevented and overcome."
//
// `preventionOf` names the card that prevents the revealed top card of the stack, or null; the page hands
// it to `botResolveOf`, whose Resolve then has no effect and moves the dilemma beneath the mission. All is
// derived from the table and the log, so a reload and an undo agree.

import { cardDisplayName } from '../../../lib/cardCount';
import { cardTitleOf } from '../../../lib/cardTitle';
import { dilemmaRequiresSkill } from '../../../lib/dilemmaBot/pile/requiresSkill';
import { missionModelsWith, type DilemmaReveal } from '../../../lib/missionModels';
import { revealedPileAttemptOf } from './attempt';
import { LogEntry, effectiveLog } from './gameLog';
import { findInstanceAnywhere, type CardInstance, type TableState } from './tableReducer';

// Sigma Iotia II is the prevent ability of its row in the mission registry (#1907); Tristan Adams, a personnel,
// stays here.
const SIGMA_IOTIA_ROW = missionModelsWith('onDilemmaReveal').find(({ ability }) => ability.reveal.kind === 'prevent')!;
const SIGMA_IOTIA_PREVENT = SIGMA_IOTIA_ROW.ability.reveal as Extract<DilemmaReveal, { kind: 'prevent' }>;
export const SIGMA_IOTIA_TITLE = SIGMA_IOTIA_ROW.model.title;
export const SIGMA_IOTIA = SIGMA_IOTIA_ROW.model.label;
export const TRISTAN_ADAMS_TITLE = 'Tristan Adams Deranged Psychiatrist';
export const TRISTAN_ADAMS = 'Tristan Adams';

/** The title a dilemma is named by and compared on: its name less any version suffix. */
export const dilemmaTitleOf = (card: CardInstance['card'] | undefined): string => (card ? cardTitleOf(cardDisplayName(card)) : '');

/** The dilemma titles Tristan Adams's choice named this turn (#1761), from the effective log, in order. */
export function namedDilemmasOf(log: LogEntry[], turn: number): string[] {
  return effectiveLog(log).flatMap((e) =>
    e.kind === 'chargeCorrected' && e.turn === turn && e.source === TRISTAN_ADAMS && typeof e.named === 'string' && e.named ? [e.named] : []
  );
}

const printedCost = (card: CardInstance['card'] | undefined): number => {
  const n = Number(card?.cost);
  return Number.isFinite(n) ? n : 0;
};

/**
 * The card that prevents and overcomes the revealed top card of a bot attempt's stack (#1761), or null:
 * - Sigma Iotia II, when it is the attempted mission, no dilemma resolved there this turn was prevented by
 *   it, and the top card is the first dilemma revealed in this attempt that costs 1 or more (printed) and
 *   does not require a skill (`dilemmaRequiresSkill`: the bot's model where one exists, the text otherwise).
 * - Tristan Adams, when a choice named the top card's title this turn and he was unstopped among the
 *   attempting personnel when it was revealed (the reveal snapshot): stopped before, he does not face it.
 * Null outside a bot game's `'face'`, with no face-up top card, or once the snapshot is resolved.
 */
export function preventionOf(table: TableState, log: LogEntry[]): string | null {
  const { attempt } = table;
  const top = table.dilemmaStack[0];
  if (!attempt || attempt.botSpend === undefined || attempt.phase !== 'face' || !top || top.face !== 'up') return null;
  const snapshot = attempt.revealSnapshot;
  if (!snapshot || snapshot.dilemmaId !== top.id || snapshot.resolved) return null;

  const mission = table.missions[attempt.missionIndex]?.mission?.card;
  const prevent = SIGMA_IOTIA_PREVENT;
  if (
    mission &&
    dilemmaTitleOf(mission) === SIGMA_IOTIA_TITLE &&
    !(prevent.oncePerTurn && sigmaUsedThisTurn(log, table.turn, cardDisplayName(mission)))
  ) {
    const pileAttempt = revealedPileAttemptOf(table);
    const first = pileAttempt
      ? (attempt.botRevealed ?? []).find((id) => {
          const card = findInstanceAnywhere(table, id)?.instance.card;
          return !!card && printedCost(card) >= prevent.minCost && !(prevent.requiresNoSkill && dilemmaRequiresSkill(card, pileAttempt));
        })
      : undefined;
    if (first === top.id) return SIGMA_IOTIA;
  }

  const named = namedDilemmasOf(log, table.turn);
  if (named.includes(dilemmaTitleOf(top.card))) {
    const faces = snapshot.personnel.some(
      (p) => !p.stopped && dilemmaTitleOf(findInstanceAnywhere(table, p.id)?.instance.card) === TRISTAN_ADAMS_TITLE
    );
    if (faces) return TRISTAN_ADAMS;
  }
  return null;
}

// Whether a Resolve this turn already used Sigma Iotia II at the mission named `mission`.
function sigmaUsedThisTurn(log: LogEntry[], turn: number, mission: string): boolean {
  return log.some((e) => e.kind === 'dilemmaResolved' && e.turn === turn && e.prevented === SIGMA_IOTIA && typeof e.went === 'string' && e.went.includes(mission));
}

/**
 * The titles a dilemma may be named from (#1761): in a bot game, the dilemmas of the bot's pile, every
 * dilemma card on the table; otherwise every dilemma title of `allDilemmas`. Sorted, each once.
 */
export function nameableDilemmaTitles(table: TableState, allDilemmas: ReadonlyArray<CardInstance['card']>): string[] {
  const cards =
    table.opponent === 'bot'
      ? [
          ...table.dilemmaPile,
          ...table.dilemmaStack,
          ...table.dilemmaHand,
          ...table.discard,
          ...table.core.flatMap((c) => [c, ...(c.placedOn ?? [])]),
          ...table.missions.flatMap((m) => [...m.underMission, ...(m.mission?.placedOn ?? [])]),
        ].map((c) => c.card)
      : allDilemmas;
  const titles = new Set(cards.filter((c) => c?.type === 'dilemma').map(dilemmaTitleOf).filter(Boolean));
  return Array.from(titles).sort((a, b) => a.localeCompare(b));
}
