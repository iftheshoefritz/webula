// What the cost models read of the practice table (#1654), as a plain `CostFacts`: the printed
// traits and the uniqueness of every unstopped personnel the player commands (every away team and every ship's crew,
// at every mission, never the brig; a stopped personnel meets no "you command" condition, #1751), the titles of the core, the hand by title and type, and each mission slot
// (#1694) with its personnel and ships (#1702), the discard pile, the ships of the ship rows and the
// score (#1700), and the cards placed on each core card (#1703). The plays of the turn (#1703) and the pending
// discounts of the turn come from the log (`pendingDiscountsOf` in `gameLog.ts`). `costFactsOf` is a projection
// of the table view (#1876, `tableViewOf`): it reads nothing of `TableState` beside it.

import { DECK_TOP_FACTS } from '../../../lib/costModels/model';
import type { CommandedTraits, CostFacts, CostMission, CostTurnPlay, PendingDiscount } from '../../../lib/costModels/model';
import { partnerTraitsOf } from '../../../lib/dilemmaBot/simulator';
import { skillWordsOf } from '../../../lib/playCost';
import { personnel, ships, viewCardTitleOf } from '../../../lib/tableView';
import type { TableView, ViewCard, ViewMission, ViewPileCard, ViewRow, ViewTableCard } from '../../../lib/tableView';
import type { CardInstance, TableState } from './tableReducer';
import { tableViewOf } from './tableView';

export { iconsOf, keywordsOf, printedCostOf, regionsOf } from './tableView';

const text = (v: unknown): string => String(v ?? '').toLowerCase();

const speciesOf = (card: ViewRow): string[] =>
  text(card?.species)
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * The traits of a played card that a standing rule (#1703) or a mission (#1752) tests: its species, its
 * skills, and `quadrant`, that of the mission slot it landed at, absent for a play to no slot.
 */
export const turnPlayOf = (card: CardInstance['card'] | null | undefined, quadrant?: string): CostTurnPlay => ({
  type: text(card?.type),
  unique: text(card?.unique) === 'y',
  icons: text(card?.icons).match(/\[[a-z0-9]+\]/g) ?? [],
  species: speciesOf(card),
  skills: skillWordsOf(card?.skills),
  ...(text(card?.affiliation) ? { affiliation: text(card?.affiliation) } : {}),
  ...(quadrant ? { quadrant } : {}),
});

/** The quadrant of the mission at slot `missionIndex`, lowercased, or undefined. */
export const slotQuadrantOf = (table: TableState, missionIndex: number | undefined): string | undefined =>
  missionIndex === undefined ? undefined : text(table.missions[missionIndex]?.mission?.card?.quadrant) || undefined;

const traitsOf = (p: ViewTableCard): CommandedTraits => ({ ...partnerTraitsOf(p.row), unique: p.unique, cardTitle: viewCardTitleOf(p) });

const pileCardOf = (c: ViewPileCard) => ({ id: c.id, title: c.title, type: c.type });

/** The personnel and the equipment of a slot: its away team, then each crew of its ship row. */
const slotCards = (m: ViewMission): ViewTableCard[] => [...m.awayTeam, ...m.ships.flatMap((s) => s.crew)];

function costMissionOf(view: TableView, m: ViewMission): CostMission {
  return {
    completed: m.completed,
    name: m.name,
    ...(m.card ? { cardTitle: viewCardTitleOf(m.card) } : {}),
    requirements: m.requirements,
    points: m.points,
    type: m.type,
    icons: m.icons,
    quadrant: m.quadrant,
    dilemmasUnder: m.underMission.filter((c) => c.type === 'dilemma').length,
    regions: m.regions,
    // Each with its id, its title and its stopped state (#1713).
    personnel: personnel(view, { unstopped: false, at: m.index }).map((p) => ({ ...traitsOf(p), id: p.id, title: p.title, stopped: p.stopped })),
    ships: m.ships.map((s) => ({ id: s.id, title: s.title, affiliation: text(s.row.affiliation), icons: text(s.row.icons).match(/\[[a-z0-9]+\]/g) ?? [] })),
    ...(m.flipped ? { flipped: true } : {}),
  };
}

/** A card of the core with a row; a core card with no row is left out of `CostFacts`. */
const hasRow = (c: ViewCard): boolean => !!c.row;

/**
 * The printed costs of the cards the player commands (#1768): the unstopped personnel and the equipment of
 * every away team and crew (a stopped personnel meets no "while you command" condition, #1751), every ship of
 * every ship row, and the events the player commands. Never the brig.
 */
const commandedCostsOf = (view: TableView): number[] =>
  [
    ...view.missions.flatMap(slotCards).filter((c) => (c.type === 'personnel' && !c.stopped) || c.type === 'equipment'),
    ...ships(view),
    ...view.events,
  ].map((c) => c.cost);

/** `CostFacts` projected from the table view. */
export function costFactsOfView(view: TableView): CostFacts {
  const core = view.core.filter(hasRow);
  return {
    // A stopped personnel is still commanded, but meets no "if/while/for each … you command" condition (#1751).
    commanded: personnel(view, { unstopped: true }).map(traitsOf),
    core: core.map((c) => c.title),
    coreCards: core.map((c) => ({
      id: c.id,
      title: c.title,
      type: c.type,
      keywords: text(c.row.keywords)
        .split('.')
        .map((k) => k.trim())
        .filter(Boolean),
      cost: c.cost,
    })),
    corePlaced: core.map((c) => c.placedOn.length),
    hand: view.hand.map(pileCardOf),
    discard: view.discard.filter((c) => !c.removedFromGame).map(pileCardOf),
    ships: ships(view).map((s) => s.title),
    score: view.score,
    missions: view.missions.map((m) => costMissionOf(view, m)),
    pending: view.pending,
    plays: view.plays,
    events: view.events.map((e) => ({ title: e.title, keywords: e.keywords })),
    commandedCosts: commandedCostsOf(view),
    drawDeckTop: view.drawDeck.slice(0, DECK_TOP_FACTS).map((c) => ({ id: c.id, type: c.type, species: speciesOf(c.row) })),
    // The bot's dilemma pile is the opponent's (#1738); in a game with no bot the pile is the player's own.
    ...(view.dilemmaPileIsBot
      ? { opponentDilemmaPile: view.dilemmaPile.map((c) => ({ id: c.id, dilemmaType: text(c.row?.dilemmatype) })) }
      : {}),
  };
}

// `plays` are the cards played earlier this turn (#1703), from the log.
export function costFactsOf(table: TableState, pending: PendingDiscount[] = [], plays: CostTurnPlay[] = []): CostFacts {
  return costFactsOfView(tableViewOf(table, pending, plays));
}
