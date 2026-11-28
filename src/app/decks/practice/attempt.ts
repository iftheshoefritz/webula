// The rules of the Attempt button (#1163), kept pure so the tests cover every mission type without
// a render. The table enforces nothing once an attempt starts: these only decide where the button
// shows and what the popup's two numbers start at.

import {
  Attempt,
  attemptingCards,
  CardInstance,
  findInstanceAnywhere,
  FIXTURE_DILEMMA_STACK,
  FIXTURE_SHIP_SLOT,
  MoveTarget,
  ResolveChange,
  ResolveNote,
  RevealSnapshot,
  TableAction,
  TableState,
} from './tableReducer';
import { cardDisplayName } from '../../../lib/cardCount';
import { BotTableFacts, asSphere117Dissident, isSphere117, sphere117Holds } from '../../../lib/dilemmaBot/gains';
import { Rand, partnerTraitsOf } from '../../../lib/dilemmaBot/simulator';
import { pileLabelOf } from '../../../lib/dilemmaBot/pile/label';
import { PileDestination, PileResolveWhere, PileSteps, modifiersText, pileResolveOf, pileRevealPicksOf, playModifiersOf } from '../../../lib/dilemmaBot/pile/resolve';
import type { PileModifiers } from '../../../lib/dilemmaBot/pile/model';
import { PileTableInput, pileAttemptOf } from '../../../lib/dilemmaBot/pile/tableAttempt';
import { pileTitleOf } from '../../../lib/dilemmaBot/pile/registry';
import { missionCostOf } from '../../../lib/dilemmaBot/pile/missionCost';
import { ATTRIBUTE_REGISTRY, personnelAttributesOnTable, shipAttributesOnTable } from './attributeModels';
import { shipRangeOnTable } from './shipRange';
import { AttemptMissionRules, attemptMissionRules } from './attemptMissions';
import { addedRequirements, replacedRequirementsOf, requirementTextWith } from '../../../lib/requirementRules';
import { ROADBLOCK_TITLE, roadblockReturnOf } from './selfReplicatingRoadblock';
import { modifierCardOf, tableReadOf, tableViewOf } from './tableView';
import { skillsGainedOf, timedSkillsOf } from '../../../lib/modifiers';
import type { TableView, ViewMission, ViewTableCard } from '../../../lib/tableView';

// The panel the Attempt button would sit in: a mission's away team, or a ship's crew.
export type AttemptPanel = { kind: 'awayTeam'; missionIndex: number } | { kind: 'crew'; shipId: string };

// The cards of the panel at its mission, or null when the panel cannot attempt there: a ship off
// the ship rows, a ship at a mission that is not a space mission, an away team at a mission that is
// not a planet mission. `parseCardData` lower-cases the card data, so `missiontype` is `s`, `p` or `h`.
function attemptCards(table: TableState, panel: AttemptPanel): { missionIndex: number; cards: CardInstance[] } | null {
  if (panel.kind === 'awayTeam') {
    const cards = attemptingCards(table, panel.missionIndex);
    return cards && { missionIndex: panel.missionIndex, cards };
  }
  const found = findInstanceAnywhere(table, panel.shipId);
  if (!found || typeof found.zone === 'string' || found.zone.zone !== 'shipRow') return null;
  const missionIndex = found.zone.missionIndex;
  const cards = attemptingCards(table, missionIndex, panel.shipId);
  return cards && { missionIndex, cards };
}

export { attemptingCards };

// The play of the revealed top card of the dilemma stack (#1519, #1588), or null: the group, as the
// snapshot of `snapshot` holds it when the snapshot is for the top card and as the table stands
// otherwise, with the attempt's spend; the card ids of the group; the cards revealed before the top
// card, from the attempt's record of the cards it revealed (#1556), whose cost counts as spent; and the
// rest of the stack, which the play faces after the top card, so a fetch counts the cost rule as the
// bot's search did. The bot's label and the Resolve both play it, so they never disagree.
function revealedPlayOf(table: TableState, snapshot: RevealSnapshot | undefined = table.attempt?.revealSnapshot) {
  const { attempt, dilemmaStack } = table;
  const top = dilemmaStack[0];
  if (!attempt || !top) return null;
  const cardText = !!attempt.cardText;
  const live = pileTableInputOf(table, attempt.missionIndex, attempt.shipId, cardText);
  // The snapshot's personnel, each looked up wherever the card is now, with the snapshot's stopped flag,
  // and the equipment of the row as it stands, which the snapshot does not hold.
  const input: PileTableInput =
    snapshot?.dilemmaId === top.id
      ? {
          ...live,
          cards: [
            ...snapshot.personnel.map((p) => {
              const found = findInstanceAnywhere(table, p.id)?.instance;
              return { card: found && personnelRowOnTable(table, found, found.card, cardText), stopped: p.stopped, id: p.id };
            }),
            ...live.cards.filter((c) => c.card?.type !== 'personnel'),
          ],
        }
      : live;
  const { attempt: pile, personnelIds } = pileAttemptOf(input);
  // What earlier Resolves left (#1597): as the snapshot kept them when it is for the top card, so the
  // card's own Resolve does not count again, and the attempt's otherwise.
  const kept = snapshot?.dilemmaId === top.id ? snapshot.modifiers : attempt.modifiers;
  const built = kept ? { ...pile, modifiers: playModifiersOf(kept, personnelIds) } : pile;
  // The attempted mission's change of the cost of a revealed dilemma (#1760), in a bot game only: the
  // bot chose its stack at printed costs, and the change counts from the reveal.
  const missionCost = attempt.botSpend !== undefined ? missionCostOf(table.missions[attempt.missionIndex]?.mission?.card) : undefined;
  const costed = missionCost ? { ...built, missionCost } : built;
  const revealedIds = attempt.botRevealed ?? [];
  const at = revealedIds.indexOf(top.id);
  return {
    top,
    attempt: attempt.botSpend !== undefined ? { ...costed, spend: attempt.botSpend } : costed,
    personnelIds,
    revealed: (at === -1 ? revealedIds : revealedIds.slice(0, at)).map((id) => findInstanceAnywhere(table, id)?.instance.card),
    rest: dilemmaStack.slice(1).map((c) => c.card),
  };
}

// The bot's label on the revealed top card of the dilemma stack (#1519), or null. It reads the group of
// the attempt's reveal snapshot when the snapshot is for the top card (#1588), so the label and the
// Resolve read the same personnel.
// The pile attempt of the revealed top card (#1761), for `dilemmaRequiresSkill`, or null with no top card.
export function revealedPileAttemptOf(table: TableState) {
  return revealedPlayOf(table)?.attempt ?? null;
}

export function botLabelOf(table: TableState): string | null {
  const play = revealedPlayOf(table);
  const snapshot = table.attempt?.revealSnapshot;
  const picks = play && snapshot?.picks && snapshot.dilemmaId === play.top.id ? { personnelIds: play.personnelIds, revealPicks: snapshot.picks } : {};
  return play && pileLabelOf(play.top.card, play.attempt, { revealed: play.revealed, rest: play.rest, ...picks });
}

// Where a card of the reveal snapshot is now (#1588): in the attempting row, with its stopped flag, in a
// zone of the table, or nowhere.
function resolveWhereOf(table: TableState, id: string): PileResolveWhere {
  const { attempt } = table;
  const inRow = attempt && attemptingCards(table, attempt.missionIndex, attempt.shipId)?.find((c) => c.id === id);
  if (inRow) return { at: 'row', stopped: !!inRow.stopped };
  const found = findInstanceAnywhere(table, id);
  if (!found) return { at: 'gone' };
  return { at: 'zone', zone: typeof found.zone === 'string' ? found.zone : found.zone.zone, removedFromGame: !!found.instance.removedFromGame };
}

// The Resolve of the revealed top card (#1588): what the dilemma does to the personnel of `snapshot`,
// reconciled with what the player did by hand since the reveal, as the changes and the log notes of a
// `resolveDilemma`, and the preview text. Every random selection plays with the roll the snapshot kept
// (#1628), so the preview and the press are the same, and `steps` holds the selection and the checks.
// A dilemma that selects at random with no kept roll has no Resolve. No Resolve, with a reason, when the
// snapshot is not for the top card or the bot cannot apply the dilemma (`pileResolveOf`). Where the
// player chooses (#1593), `selected`, the row selection, is the choice: only the personnel of the row
// count, and until it is made the Resolve is `pending`, its preview the task, with no changes.
export type BotResolve =
  | { resolvable: false; reason: string }
  | {
      resolvable: true;
      preview: string;
      changes: ResolveChange[];
      notes: ResolveNote[];
      // The selection and the checks of a dilemma with a kept roll (#1628), as card ids.
      steps?: PileSteps;
      pending?: boolean;
      // The attempt's whole modifiers after the dilemma (#1597), when it changed them.
      modifiers?: PileModifiers;
      // The clause that names what the dilemma adds to them (#1598), for the log.
      modifiersClause?: string;
      // The move of the resolved dilemma to where it goes (#1599), for the `resolveDilemma` action.
      // Absent on a pending Resolve.
      move?: ResolveMove;
      // The card a fetch puts on top of the stack (#1600), found on the table by the fetched title.
      fetchedId?: string;
      // The cards after the dilemma when it ends the stack (#1600), in stack order, for the bottom of the pile.
      restToPile?: string[];
      // The cards after the dilemma when the mission's cost change overcomes it (#1760), in stack order,
      // for beneath the mission, and the reason, "Stakoron II raised the cost past the spend".
      restUnder?: string[];
      overcome?: string;
      // The card that prevented and overcame the dilemma (#1761), "Sigma Iotia II" or "Tristan Adams":
      // no effect, and it goes beneath the mission.
      prevented?: string;
      // The card whose name returns the dilemma to the dilemma pile (#1789), "Self-Replicating Roadblock":
      // no effect, and it goes to the bottom of the dilemma pile.
      returned?: string;
    };

// Where the resolved dilemma goes, in table terms (#1599).
export type ResolveMove = { to: MoveTarget; position?: 'top' | 'bottom' };

// The move of a destination at the attempted mission: beneath it, face up after the dilemmas already
// there, as `endAttempt` puts them; the core; placed on the mission card; or the bottom (face up) or the
// top (face down) of the dilemma pile, as a `move` there lands. Null when the mission slot has no card
// to place on.
export function resolveMoveOf(table: TableState, destination: PileDestination): ResolveMove | null {
  const attempt = table.attempt;
  if (!attempt) return null;
  switch (destination) {
    case 'under':
      return { to: { zone: 'missionPile', missionIndex: attempt.missionIndex, pile: 'underMission' } };
    case 'core':
      return { to: 'core' };
    case 'placedOn': {
      const mission = table.missions[attempt.missionIndex]?.mission;
      return mission ? { to: { zone: 'on', targetId: mission.id } } : null;
    }
    case 'pileBottom':
      return { to: 'dilemmaPile', position: 'bottom' };
    case 'pileTop':
      return { to: 'dilemmaPile', position: 'top' };
  }
}

export function botResolveOf(
  table: TableState,
  snapshot: RevealSnapshot | undefined = table.attempt?.revealSnapshot,
  selected: ReadonlyArray<string> = [],
  prevented: string | null = null,
): BotResolve {
  const play = snapshot && revealedPlayOf(table, snapshot);
  if (!snapshot || !play || play.top.id !== snapshot.dilemmaId) return { resolvable: false, reason: 'the snapshot is not for the revealed dilemma' };
  // A dilemma prevented and overcome (#1761, `preventionOf`): no effect, whatever its model, and it goes
  // beneath the mission.
  if (prevented) {
    const move = resolveMoveOf(table, 'under');
    return { resolvable: true, preview: `Prevented and overcome (${prevented})`, changes: [], notes: [], prevented, ...(move ? { move } : {}) };
  }
  // A dilemma a Self-Replicating Roadblock on the attempted mission named (#1789): no effect, whatever its
  // model, and it returns to the bottom of the dilemma pile, face up.
  const returned = roadblockReturnOf(table);
  if (returned) {
    const move = resolveMoveOf(table, 'pileBottom');
    return { resolvable: true, preview: `Named by ${returned}: no effect; returns to the dilemma pile`, changes: [], notes: [], returned, ...(move ? { move } : {}) };
  }
  const row = table.attempt ? attemptingCards(table, table.attempt.missionIndex, table.attempt.shipId) : null;
  const rowPersonnel = new Set((row ?? []).filter((c) => c.card?.type === 'personnel').map((c) => c.id));
  const resolve = pileResolveOf(play.top.card, play.attempt, {
    personnelIds: play.personnelIds,
    snapshotIds: snapshot.personnel.map((p) => p.id),
    where: (id) => resolveWhereOf(table, id),
    revealed: play.revealed,
    rest: play.rest,
    selected: selected.filter((id) => rowPersonnel.has(id)),
    ...(snapshot.picks ? { revealPicks: snapshot.picks } : {}),
  });
  if (!resolve.resolvable) return resolve;
  const notes: ResolveNote[] = [
    ...resolve.done.map((d) => ({ kind: 'alreadyDone' as const, ...d })),
    ...resolve.byTable.map((id) => {
      const card = findInstanceAnywhere(table, id)?.instance.card;
      return { kind: 'byTable' as const, text: card ? cardDisplayName(card) : 'A personnel' };
    }),
  ];
  return {
    resolvable: true,
    preview: resolve.preview,
    changes: resolve.changes,
    notes,
    ...(resolve.steps ? { steps: resolve.steps } : {}),
    ...(resolve.pending ? { pending: true } : {}),
    ...(resolve.modifiers ? { modifiers: resolve.modifiers } : {}),
    ...(resolve.modifiersClause ? { modifiersClause: resolve.modifiersClause } : {}),
    ...(() => {
      if (resolve.pending) return {};
      const move = resolve.destination ? resolveMoveOf(table, resolve.destination) : null;
      const fetchedId = resolve.fetched ? fetchedCardOf(table, resolve.fetched.title, resolve.fetched.from)?.id : undefined;
      return {
        ...(move ? { move } : {}),
        ...(fetchedId ? { fetchedId } : {}),
        ...(resolve.endsStack ? { restToPile: table.dilemmaStack.slice(1).map((c) => c.id) } : {}),
        ...(resolve.overcome ? { overcome: resolve.overcome.reason, restUnder: table.dilemmaStack.slice(1).map((c) => c.id) } : {}),
      };
    })(),
  };
}

// The prompt by Done on the attempt strip (#1600), or null: in a bot game's `'face'`, once the last
// revealed dilemma is resolved, "No one left" when the attempting row holds no unstopped personnel and the
// stack still holds cards, or "Stack overcome" when that dilemma was overcome over the spend with the rest
// of the stack (#1760). Derived from the table, so a reload, an undo and a stop by hand agree. Done keeps
// its action.
export function attemptDonePromptText(table: TableState): string | null {
  const attempt = table.attempt;
  if (!attempt || attempt.botDraw === undefined || attempt.phase !== 'face') return null;
  if (attempt.revealSnapshot?.resolved && attempt.revealSnapshot.overcome) return 'Stack overcome';
  if (!attempt.revealSnapshot?.resolved || table.dilemmaStack.length === 0) return null;
  const row = attemptingCards(table, attempt.missionIndex, attempt.shipId) ?? [];
  return row.some((c) => c.card?.type === 'personnel' && !c.stopped) ? null : 'No one left';
}

// Whether the attempt strip points to Done (`attemptDonePromptText`).
export const attemptDonePrompt = (table: TableState): boolean => attemptDonePromptText(table) !== null;

// The table card a fetch takes (#1600): the first card titled `title`, matched as the registry matches
// a name, in the dilemma pile (Vault of Tomorrow) or beneath any mission slot (Talosian Trial).
export function fetchedCardOf(table: TableState, title: string, from: 'botPile' | 'underMissions') {
  const cards = from === 'botPile' ? table.dilemmaPile : table.missions.flatMap((m) => m.underMission);
  return cards.find((c) => !!c.card?.originalName && pileTitleOf(c.card.originalName) === title);
}

// The line of the modifiers of a bot attempt in `'face'` (#1598), "Abilities off \u00b7 Navigation
// blocked", or '' when none is active, or for any other attempt. Names come from the cards on the table.
export function attemptModifiersText(table: TableState): string {
  const attempt = table.attempt;
  if (!attempt || attempt.botDraw === undefined || attempt.phase !== 'face') return '';
  return modifiersText(attempt.modifiers, (id) => {
    const card = findInstanceAnywhere(table, id)?.instance.card;
    return card ? cardDisplayName(card) : 'A personnel';
  });
}

// The roll at the reveal (#1594, #1628): for a revealed top card whose own play selects at random, the
// card ids each random select of its play picks, rolled with `rand` from the group of the table's reveal
// snapshot. Undefined when the snapshot is not for the top card, or for a title with no such select. The page rolls it before the `flip` that takes the snapshot (`withShuffleOrders`), and a restore
// for the fresh snapshot it takes, never at render.
export function revealPicksOf(table: TableState, rand: Rand): string[][] | undefined {
  const snapshot = table.attempt?.revealSnapshot;
  const play = snapshot && revealedPlayOf(table, snapshot);
  if (!snapshot || !play || play.top.id !== snapshot.dilemmaId) return undefined;
  return pileRevealPicksOf(play.top.card, play.attempt, { personnelIds: play.personnelIds, revealed: play.revealed, rest: play.rest, rand });
}

// A personnel's row with its Integrity, Cunning and Strength on the table (#1665), the attribute
// models of #1664 added to the printed values, when `cardText` is on; the row as it is otherwise, and
// for any card that is not a personnel. The attribute models read the `TableState` and its instance.
// The skills the cards on the table give it (#1836), `skillsGainedOf`, and the skills an ability made it gain for a
// time (#1958), `timedSkillsOf`, follow its printed skills, so the bot counts a skill it gains as one more level. They
// are not listed skills: `listedSkills` keeps the printed ones, for the pile's first skill.
function personnelRowOnTable(table: TableState, card: CardInstance | undefined, row: CardInstance['card'], cardText: boolean): CardInstance['card'] {
  if (!cardText || !card || row?.type !== 'personnel') return row;
  const { view } = tableReadOf(table);
  const gained = [...skillsGainedOf(view, modifierCardOf(card)), ...timedSkillsOf(view, card.id)];
  const printed = String(row.skills ?? '').trim();
  const skills = gained.length ? { skills: [printed, ...gained].filter(Boolean).join(' '), listedSkills: printed } : {};
  return { ...row, ...personnelAttributesOnTable(table, card, true), ...skills };
}

// A ship's row with its Range, Weapons and Shields on the table (#1665) when `cardText` is on.
function shipRowOnTable(table: TableState, ship: CardInstance | undefined, row: CardInstance['card'], cardText: boolean): CardInstance['card'] {
  if (!cardText || !ship || !row) return row;
  return {
    ...row,
    range: shipRangeOnTable(table, ship, true),
    ...shipAttributesOnTable(table, ship, true),
  };
}

// The attempted mission's row with its requirements as the cards in play change them (#1828, Crescent
// Nebula), so the bot's search, label and Resolve read them. The printed row when nothing changes them.
// `attempting` holds the affiliations of the unstopped attempting personnel: an attempt by personnel of the
// affiliation a mission names replaces its requirements first (#1909, Gelyan Moon, Rura Penthe).
function missionRowOnTable(view: TableView, missionIndex: number, attempting: readonly string[]): CardInstance['card'] | undefined {
  const card = view.missions[missionIndex]?.card?.row;
  if (!card) return card;
  const added = addedRequirements(
    view.missions.map((m) => m.card?.row),
    view.core
  )[missionIndex];
  const skills = replacedRequirementsOf(card, attempting) ?? String(card.skills ?? '');
  return added.length || skills !== String(card.skills ?? '') ? { ...card, skills: requirementTextWith(skills, added) } : card;
}

// The attempting row of the view, as `attemptingCards` reads the table: the away team at a planet
// mission with no ship, the ship's crew at a space mission, and nothing otherwise.
function attemptingViewCards(mission: ViewMission | undefined, shipId?: string): ViewTableCard[] {
  if (!mission) return [];
  if (shipId === undefined) return mission.type === 'p' ? mission.awayTeam : [];
  return mission.type === 's' ? mission.ships.find((s) => s.id === shipId)?.crew ?? [] : [];
}

// The cards of every away team and crew of the view, slot by slot, the away team first, then each ship's crew.
const commandedViewCards = (view: TableView): ViewTableCard[] =>
  view.missions.flatMap((m) => [...m.awayTeam, ...m.ships.flatMap((ship) => ship.crew)]);

// The titles the Self-Replicating Roadblocks on the mission card named (#1789), each once.
const namedAt = (mission: ViewMission | undefined): string[] =>
  Array.from(new Set((mission?.placedOn ?? []).flatMap((c) => (c.title === ROADBLOCK_TITLE && c.named ? [c.named] : []))));

// What `pileAttemptOf` reads of the table for an attempt at `missionIndex` with `shipId` (#1508): the
// bot's stack as the attempt starts, and the label of each dilemma the player faces (#1519). With
// `cardText`, the setting "Apply card text to attributes" (#1668) as the attempt froze it, the
// attempting personnel and ship carry their attributes on the table (#1665), so the card text adds
// to the printed value before the dilemmas' modifiers; off, the printed values.
// A projection of the table view (#1879): every table fact comes from `tableViewOf`, built once.
export function pileTableInputOf(table: TableState, missionIndex: number, shipId?: string, cardText = false): PileTableInput {
  const view = tableViewOf(table);
  const mission = view.missions[missionIndex];
  const ship = mission?.ships.find((s) => s.id === shipId);
  // The instances the attribute models read, by id, only with `cardText` on.
  const instances = cardText ? attemptingCards(table, missionIndex, shipId) ?? [] : [];
  const instanceOf = (id: string) => instances.find((c) => c.id === id);
  const shipInstance = cardText && ship ? table.missions[missionIndex]?.ships.find((s) => s.id === ship.id) : undefined;
  const attempting = attemptingViewCards(mission, shipId).filter((c) => c.type === 'personnel' && !c.stopped);
  return {
    cards: attemptingViewCards(mission, shipId).map((c) => ({
      id: c.id,
      card: personnelRowOnTable(table, instanceOf(c.id), c.row, cardText),
      stopped: c.stopped,
    })),
    mission: missionRowOnTable(view, missionIndex, attempting.map((c) => String(c.row.affiliation ?? ''))),
    ship: ship && shipRowOnTable(table, shipInstance, ship.row, cardText),
    placedOn: (mission?.placedOn ?? []).map((c) => c.row),
    returnedHere: namedAt(mission),
    underMission: (mission?.underMission ?? []).map((c) => c.row),
    missions: view.missions.map((m, i) => ({
      mission: m.card?.row,
      completed: table.missions[i].completed,
      under: m.underMission.map((c) => c.row),
    })),
    hand: view.hand.map((c) => c.row),
    discard: view.discard.map((c) => c.row),
    turn: view.turn,
    score: view.score,
    facts: botTableFactsOfView(view, cardText),
    core: view.core.map((c) => c.row),
    commanded: commandedViewCards(view).map((c) => c.row),
    shipsAtMission: (mission?.ships ?? []).map((s) => ({ staffed: s.crew.some((c) => c.type === 'personnel') })),
    drawDeck: view.drawDeck.map((c) => c.row),
    // The bot's pile as it stands (#1552): in a bot game the drawn dilemmas the bot left out of the
    // stack are already at its bottom (#1299). Vault of Tomorrow names the dilemma it takes from it.
    dilemmaPile: view.dilemmaPile.map((c) => c.row),
    // The bot deck's affiliations (#1520); absent for the Chula pile.
    ...(view.botPile?.affiliations ? { botAffiliations: view.botPile.affiliations } : {}),
    // The bot deck's missions and Song cards (#1846): absent for the Chula pile and a save from before.
    ...(view.botPile?.missions ? { botMissions: view.botPile.missions } : {}),
    ...(view.botPile?.songCards ? { botSongCards: view.botPile.songCards } : {}),
  };
}

// What the dilemma bot's table conditions read of the table as a bot attempt starts (#1352): the type
// of each completed mission, the traits and the type of each discard pile card, and the number of
// events in the core, and the traits of each personnel the player commands: every away team and
// every ship's crew, at every mission, never the brig (#1360). A card with no row counts nowhere.
// While the condition of Sphere 117 holds (#1363), a Sphere 117 on any ship row and every mission of
// the table a [DQ] mission, a commanded Drone reads Dissident in place of Drone. An empty slot holds
// no mission and does not count.
// With `cardText` on (#1667), `attributeTitles` names the titles of the attribute registry, whose
// attributes the rows of `pileTableInputOf` already carry, so the bot drops their parsed attributes.
// A projection of the table view (#1879).
export function botTableFactsOf(table: TableState, cardText = false): BotTableFacts {
  return botTableFactsOfView(tableViewOf(table), cardText);
}

function botTableFactsOfView(view: TableView, cardText: boolean): BotTableFacts {
  const sphere = sphere117Holds(
    view.missions.some((m) => m.ships.some((ship) => isSphere117(ship.row))),
    view.missions.flatMap((m) => (m.card?.row ? [String(m.card.row.quadrant ?? '')] : [])),
  );
  return {
    completedMissions: view.missions.flatMap((m) => (m.completed && m.card?.row ? [String(m.card.row.missiontype)] : [])),
    discardPile: view.discard.flatMap((c) => (c.row ? [{ ...partnerTraitsOf(c.row), type: String(c.row.type) }] : [])),
    coreEvents: view.core.filter((c) => c.row?.type === 'event').length,
    commanded: commandedViewCards(view)
      .flatMap((c) => (c.row?.type === 'personnel' ? [partnerTraitsOf(c.row)] : []))
      .map((traits) => (sphere ? asSphere117Dissident(traits) : traits)),
    ...(cardText ? { attributeTitles: [...ATTRIBUTE_REGISTRY.keys()] } : {}),
  };
}

// A destination of the attempt row's Move to… list (#1341): the `move` a tap dispatches for each
// selected card, the label, and a key for the entry's `data-testid`.
export interface AttemptMoveDestination {
  key: string;
  label: string;
  to: MoveTarget;
  position?: 'top' | 'bottom';
}

// The destinations of Move to… in the facing phase (#1341, #1370), in order: the six places of the
// bottom row, then the away team of each other mission slot whose mission is a planet mission or a
// headquarters (a space mission has no away team), then the crew of every ship of the player, in
// mission order and then ship-row order, the ships at the attempted mission too. Never the
// attempting ship, the row the cards are in, never the attempted mission's away team, and nothing
// under a mission. Empty with no attempt or outside `'face'`.
export function attemptMoveDestinations(table: TableState): AttemptMoveDestination[] {
  const { attempt } = table;
  if (!attempt || attempt.phase !== 'face') return [];
  const destinations: AttemptMoveDestination[] = [
    { key: 'hand', label: 'Hand', to: 'hand' },
    { key: 'drawDeck-top', label: 'Top of the draw deck', to: 'drawDeck', position: 'top' },
    { key: 'drawDeck-bottom', label: 'Bottom of the draw deck', to: 'drawDeck', position: 'bottom' },
    { key: 'discard', label: 'Discard', to: 'discard' },
    { key: 'core', label: 'Core', to: 'core' },
    { key: 'brig', label: 'Brig', to: 'brig' },
  ];
  table.missions.forEach((slot, missionIndex) => {
    const type = slot.mission?.card?.missiontype;
    if (missionIndex === attempt.missionIndex || !slot.mission || (type !== 'p' && type !== 'h')) return;
    destinations.push({
      key: `awayTeam-${missionIndex}`,
      label: `Away team at ${cardDisplayName(slot.mission.card)}`,
      to: { zone: 'missionPile', missionIndex, pile: 'awayTeam' },
    });
  });
  table.missions.forEach((slot) => {
    if (!slot.mission) return;
    const mission = cardDisplayName(slot.mission.card);
    for (const ship of slot.ships) {
      if (ship.id === attempt.shipId) continue;
      destinations.push({
        key: `crew-${ship.id}`,
        label: `Crew of ${cardDisplayName(ship.card)} at ${mission}`,
        to: { zone: 'crew', shipId: ship.id },
      });
    }
  });
  return destinations;
}

const unstoppedPersonnel = (cards: CardInstance[]): number =>
  cards.filter((c) => c.card?.type === 'personnel' && !c.stopped).length;

// Whether the panel shows the Attempt button: no attempt in progress, a mission card of the right
// type that is not completed, and at least one unstopped personnel in the panel.
export function canAttempt(table: TableState, panel: AttemptPanel): boolean {
  if (table.attempt) return false;
  const found = attemptCards(table, panel);
  if (!found || table.missions[found.missionIndex].completed) return false;
  return unstoppedPersonnel(found.cards) > 0;
}

// The popup's two numbers, as they start: the unstopped personnel of the panel (equipment and
// stopped personnel left out), and the dilemmas under the mission. Null when the panel cannot attempt.
export function attemptDefaults(
  table: TableState,
  panel: AttemptPanel
): { missionIndex: number; shipId?: string; personnel: number; subtract: number } | null {
  const found = attemptCards(table, panel);
  if (!found) return null;
  return {
    missionIndex: found.missionIndex,
    ...(panel.kind === 'crew' ? { shipId: panel.shipId } : {}),
    personnel: unstoppedPersonnel(found.cards),
    subtract: table.missions[found.missionIndex].underMission.length,
  };
}

// The changes of the attempted mission to the draw and the spend (#1759), read from the cards the
// panel involves: only its unstopped personnel count.
export function attemptMissionRulesOf(table: TableState, panel: AttemptPanel): AttemptMissionRules {
  const found = attemptCards(table, panel);
  if (!found) return { offers: [] };
  const slot = table.missions[found.missionIndex];
  return attemptMissionRules(slot.mission?.card, found.cards, {
    underMission: slot.underMission,
    drawDeck: table.drawDeck,
    missions: table.missions.map((s) => s.mission?.card),
  });
}

// The attempt of `/decks/practice?fixture=attempt` (#1169): the `startAttempt` that Start in the
// popup would dispatch, with its default numbers, for the crew of the ship the piles deal puts at
// Bilana System. `table` is the table `resetWithPiles` dealt. Null when that deal has no ship there.
export function fixtureAttempt(table: TableState, awayTeamSlot?: number): Extract<TableAction, { type: 'startAttempt' }> | null {
  if (awayTeamSlot !== undefined) {
    const defaults = attemptDefaults(table, { kind: 'awayTeam', missionIndex: awayTeamSlot });
    return defaults ? { type: 'startAttempt', ...defaults } : null;
  }
  const ship = table.missions[FIXTURE_SHIP_SLOT]?.ships[0];
  if (!ship) return null;
  const defaults = attemptDefaults(table, { kind: 'crew', shipId: ship.id });
  return defaults ? { type: 'startAttempt', ...defaults } : null;
}

// The dilemma stack of `/decks/practice?fixture=attempt` (#1170): the moves of the top
// `FIXTURE_DILEMMA_STACK` dilemmas of the pile into the stack, in pile order. They land face down,
// as the stack takes them. `resetWithPiles` deals no stack, since the stack holds cards only during
// an attempt, so the attempt fixture fills it once the attempt has started.
export function fixtureAttemptStack(table: TableState): Extract<TableAction, { type: 'move' }>[] {
  return table.dilemmaPile
    .slice(0, FIXTURE_DILEMMA_STACK)
    .map((c) => ({ type: 'move', id: c.id, to: 'dilemmaStack' }));
}

// The bot attempt of `/decks/practice?fixture=bot-label` (#1519), on the `?fixture=bot` table with a
// Well-Prepared Defenses in the dilemma pile: the attempt at Bilana System with the bot's numbers, in
// the facing phase, with no search, and a stack of that dilemma, revealed, on top of the next
// `FIXTURE_DILEMMA_STACK - 1` dilemmas of the pile, face down. So the page opens on the bot's label.
// `?fixture=bot-resolve-noeffect` (#1589) deals the same with a Conflict of Interests, whose `unless`
// check the crew meets, so its Resolve reads "No effect". `?fixture=bot-resolve-choice` (#1593) deals the
// same with a Covert Extraction, where the player chooses the personnel to stop from the row selection,
// and `?fixture=bot-resolve-pattern` (#1594) with A Pattern of Lies, whose roll the reveal keeps.
// `?fixture=bot-resolve-becalmed` (#1628) reveals Becalmed, whose roll and check the preview names.
// `?fixture=bot-resolve-modifier` (#1598) reveals Accelerated Aging, with a Dead Weight right under it.
// `?fixture=bot-resolve-overcome` (#1760) attempts Stakoron Strait in place of Bilana System, with a spend
// of 4, and reveals Conflict of Interests, a dual dilemma of cost 4 that the mission raises past it.
// `?fixture=bot-resolve-prevent` (#1761) attempts Sigma Iotia II in place of Bilana System and reveals
// Well-Prepared Defenses, which the mission prevents and overcomes.
// `?fixture=bot-resolve-60s` (#1845) reveals Urgent Search, a dual dilemma of 60S whose label names an attribute.
// `?fixture=bot-resolve-jailbreak` (#1846) reveals Jailbreak, whose Resolve puts personnel on top of the draw deck.
export const FIXTURE_BOT_LABEL_DILEMMA = 'Well-Prepared Defenses';

// The dilemma each revealing bot fixture adds to the bot's pile and reveals, by title and collector's info.
// `next`: a second dilemma it adds, face down right under the revealed one (#1598). `mission`: the
// collector's info of the mission that takes the attempted slot's place (#1760). `spend`: the bot's spend
// in place of N.
export interface BotRevealFixture {
  title: string;
  collectorsInfo: string;
  next?: { title: string; collectorsInfo: string };
  mission?: string;
  spend?: number;
  /** The slot attempted with its away team in place of Bilana System's crewed ship (#1761). */
  awayTeamSlot?: number;
  /** The attempt applies card text to attributes (#1668), whatever the setting, so the bot reads an ability's gain (#1959). */
  cardText?: true;
}

// Each is a `?fixture=<key>` of the page, on the `?fixture=bot` table, in `'face'` with no search: the stack
// holds the revealed dilemma on top, face up, and the next 3 of the pile face down.
export const BOT_REVEAL_FIXTURES: Record<string, BotRevealFixture> = {
  // Well-Prepared Defenses, so the page opens on the bot's label (#1519).
  'bot-label': { title: FIXTURE_BOT_LABEL_DILEMMA, collectorsInfo: '17V017' },
  // Conflict of Interests, whose `unless` check the Bilana System crew meets: the preview reads "No effect"
  // and Resolve changes no zone (#1589).
  'bot-resolve-noeffect': { title: 'Conflict of Interests', collectorsInfo: '26V002' },
  // Covert Extraction: the preview reads "Choose 1 personnel to be stopped", and Resolve is disabled until one
  // personnel with Intelligence or Transporters is selected in the row (#1593).
  'bot-resolve-choice': { title: 'Covert Extraction', collectorsInfo: '38V002' },
  // A Pattern of Lies: the reveal rolls three personnel and keeps them, so the preview reads "Choose 1 of the
  // selected to be stopped" (or "Stops 3" when the three share a species), the same after a reload (#1594).
  'bot-resolve-pattern': { title: 'A Pattern of Lies', collectorsInfo: '10C001' },
  // Becalmed: the kept roll of three, so the preview reads "1 of 3 has Integrity, Cunning or Strength > 6:
  // stops 1" (or "None of 3 has …: no effect"), and Resolve stops exactly the personnel its check marks (#1628).
  'bot-resolve-becalmed': { title: 'Becalmed', collectorsInfo: '36V002' },
  // Accelerated Aging, which takes away the first-listed skills, over a Dead Weight whose check the crew
  // passes only with them (#1598). The preview reads "First skill off for the rest of the attempt"; after
  // Resolve, a flip of Dead Weight previews "No effect".
  'bot-resolve-modifier': {
    title: 'Accelerated Aging',
    collectorsInfo: '11P001',
    next: { title: 'Dead Weight', collectorsInfo: '36V005' },
  },
  // Conflict of Interests, a dual dilemma of cost 4, at Stakoron Strait, which raises it to 5, past a
  // spend of 4 (#1760): the preview reads "Overcome with the 3 after it: Stakoron Strait raised the cost past
  // the spend".
  'bot-resolve-overcome': { title: 'Conflict of Interests', collectorsInfo: '26V002', mission: '33V030', spend: 4 },
  // Well-Prepared Defenses, cost 2 and no skill, at Sigma Iotia II in slot 0 with its away team of 20, which
  // prevents and overcomes it (#1761): the preview reads "Prevented and overcome (Sigma Iotia II)", no label.
  'bot-resolve-prevent': { title: FIXTURE_BOT_LABEL_DILEMMA, collectorsInfo: '17V017', mission: '23V027', awayTeamSlot: 0 },
  // Urgent Search, a dual dilemma of 60S, whose label names the attribute the most of the crew share ("Named
  // Integrity"), and whose preview names the others it stops besides its kept roll of one (#1845).
  'bot-resolve-60s': { title: 'Urgent Search', collectorsInfo: '67V020' },
  // Jailbreak, a dual dilemma of 60S, whose kept roll of 2, when neither has Physics or Cunning>13, previews
  // "… places 2 on top of the draw deck" and goes there, logged "put on top of the draw deck …" (#1846).
  'bot-resolve-jailbreak': { title: 'Jailbreak', collectorsInfo: '67V009' },
  // Hard of Heart, a planet dilemma that selects 2 at random, at Moab IV's away team, with Let's Try That
  // Again in the core and Dessert Disaster in the hand (#1847, `PRACTICE_BOT_SELECT_AGAIN_TSV`), so the preview
  // shows the controls of the kept roll.
  'bot-select-again': { title: 'Hard of Heart', collectorsInfo: '38V004', awayTeamSlot: 0 },
  // Bynars' Password, "Unless you have a personnel who has 2 Engineer or a personnel who has 2 Programming, …", at
  // Bilana System's crew, with Security Drills at the end of the core (#1959, `PRACTICE_BOT_DRILLS_TSV`) and the two
  // [Fed] U.S.S. Relativity in the hand. The preview reads "Stops Data Lucasian Chair *VP"; after Security Drills makes
  // a personnel with Engineer or Programming gain it, "No effect". The attempt applies card text, so the bot reads it.
  'bot-drills': { title: "Bynars' Password", collectorsInfo: '1C012', cardText: true },
};

export function fixtureBotLabelAttempt(table: TableState, title: string = FIXTURE_BOT_LABEL_DILEMMA, spend?: number, awayTeamSlot?: number): {
  start: Extract<TableAction, { type: 'startAttempt' }>;
  stack: Extract<TableAction, { type: 'move' }>[];
  revealId: string;
} | null {
  const start = fixtureAttempt(table, awayTeamSlot);
  const labelled = table.dilemmaPile.find((c) => c.card?.originalName?.includes(title));
  if (!start || !labelled) return null;
  const n = Math.max(0, start.personnel - start.subtract);
  // The fixture's second dilemma, if it has one, goes right under the revealed one (#1598).
  const fixture = Object.values(BOT_REVEAL_FIXTURES).find((f) => f.title === title);
  const nextTitle = fixture?.next?.title;
  const next = nextTitle ? table.dilemmaPile.find((c) => c.id !== labelled.id && c.card?.originalName?.includes(nextTitle)) : undefined;
  const rest = table.dilemmaPile.filter((c) => c.id !== labelled.id && c.id !== next?.id);
  const under = [...(next ? [next] : []), ...rest].slice(0, FIXTURE_DILEMMA_STACK - 1);
  return {
    start: { ...start, botDraw: n, botSpend: spend ?? n, ...(fixture?.cardText ? { cardText: true as const } : {}) },
    stack: [labelled, ...under].map((c) => ({ type: 'move', id: c.id, to: 'dilemmaStack' })),
    revealId: labelled.id,
  };
}

// The cards `?fixture=attempt` and `?fixture=attempt-choose` place on Bilana System (#1180), so the
// attempt layout shows its column of the placed cards with no setup drags: the
// `FIXTURE_ATTEMPT_PLACED` dilemmas of the pile below the ones `fixtureAttemptStack` takes, then the
// first `FIXTURE_ATTEMPT_PLACED` events of the draw deck, and of the core when the draw deck has too
// few, as the fixture deck's has none. The hand keeps its cards and ids.
export const FIXTURE_ATTEMPT_PLACED = 2;

export function fixtureAttemptPlacedOn(table: TableState): Extract<TableAction, { type: 'move' }>[] {
  const mission = table.missions[FIXTURE_SHIP_SLOT]?.mission;
  if (!mission) return [];
  const to = { zone: 'on' as const, targetId: mission.id };
  const dilemmas = table.dilemmaPile.slice(FIXTURE_DILEMMA_STACK, FIXTURE_DILEMMA_STACK + FIXTURE_ATTEMPT_PLACED);
  const events = [...table.drawDeck, ...table.core]
    .filter((c) => c.card.type === 'event')
    .slice(0, FIXTURE_ATTEMPT_PLACED);
  return [...dilemmas, ...events].map((c) => ({ type: 'move', id: c.id, to }));
}

// The key of the view of an attempt (#1164, #1189): its identity, the mission and the ship, and not
// its phase or its count, so a change of either keeps the full table the player chose. Null with no
// attempt in progress.
export function attemptViewKey(attempt: Attempt | undefined): string | null {
  return attempt ? JSON.stringify([attempt.missionIndex, attempt.shipId ?? null]) : null;
}
