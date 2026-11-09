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
import { PileDestination, PileResolveWhere, modifiersText, pileResolveOf, pileRevealPicksOf, playModifiersOf } from '../../../lib/dilemmaBot/pile/resolve';
import type { PileModifiers } from '../../../lib/dilemmaBot/pile/model';
import { PileTableInput, pileAttemptOf } from '../../../lib/dilemmaBot/pile/tableAttempt';
import { pileTitleOf } from '../../../lib/dilemmaBot/pile/registry';

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
  const live = pileTableInputOf(table, attempt.missionIndex, attempt.shipId);
  // The snapshot's personnel, each looked up wherever the card is now, with the snapshot's stopped flag,
  // and the equipment of the row as it stands, which the snapshot does not hold.
  const input: PileTableInput =
    snapshot?.dilemmaId === top.id
      ? {
          ...live,
          cards: [
            ...snapshot.personnel.map((p) => ({ card: findInstanceAnywhere(table, p.id)?.instance.card, stopped: p.stopped, id: p.id })),
            ...live.cards.filter((c) => c.card?.type !== 'personnel'),
          ],
        }
      : live;
  const { attempt: pile, personnelIds } = pileAttemptOf(input);
  // What earlier Resolves left (#1597): as the snapshot kept them when it is for the top card, so the
  // card's own Resolve does not count again, and the attempt's otherwise.
  const kept = snapshot?.dilemmaId === top.id ? snapshot.modifiers : attempt.modifiers;
  const built = kept ? { ...pile, modifiers: playModifiersOf(kept, personnelIds) } : pile;
  const revealedIds = attempt.botRevealed ?? [];
  const at = revealedIds.indexOf(top.id);
  return {
    top,
    attempt: attempt.botSpend !== undefined ? { ...built, spend: attempt.botSpend } : built,
    personnelIds,
    revealed: (at === -1 ? revealedIds : revealedIds.slice(0, at)).map((id) => findInstanceAnywhere(table, id)?.instance.card),
    rest: dilemmaStack.slice(1).map((c) => c.card),
  };
}

// The bot's label on the revealed top card of the dilemma stack (#1519), or null. It reads the group of
// the attempt's reveal snapshot when the snapshot is for the top card (#1588), so the label and the
// Resolve read the same personnel.
export function botLabelOf(table: TableState): string | null {
  const play = revealedPlayOf(table);
  return play && pileLabelOf(play.top.card, play.attempt, { revealed: play.revealed, rest: play.rest });
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
// `resolveDilemma`, and the preview text. With no `press`, the changes are the preview's, and a random
// pick gives only a count; a press rolls the random picks with `press.rand`, or takes `press.picks`, the
// card ids an earlier press returned, and returns the picks. No Resolve, with a reason, when the
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
      picks?: string[][];
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
  press: { rand?: Rand; picks?: string[][] } = {},
  selected: ReadonlyArray<string> = [],
): BotResolve {
  const play = snapshot && revealedPlayOf(table, snapshot);
  if (!snapshot || !play || play.top.id !== snapshot.dilemmaId) return { resolvable: false, reason: 'the snapshot is not for the revealed dilemma' };
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
    ...press,
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
    ...(resolve.picks ? { picks: resolve.picks } : {}),
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
      };
    })(),
  };
}

// Whether the attempt strip points to Done (#1600): in a bot game's `'face'`, once the last revealed
// dilemma is resolved, the attempting row holds no unstopped personnel, and the stack still holds cards.
// Derived from the table, so a reload, an undo and a stop by hand agree. Done keeps its action.
export function attemptDonePrompt(table: TableState): boolean {
  const attempt = table.attempt;
  if (!attempt || attempt.botDraw === undefined || attempt.phase !== 'face') return false;
  if (!attempt.revealSnapshot?.resolved || table.dilemmaStack.length === 0) return false;
  const row = attemptingCards(table, attempt.missionIndex, attempt.shipId) ?? [];
  return !row.some((c) => c.card?.type === 'personnel' && !c.stopped);
}

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

// The roll at the reveal (#1594): for a revealed top card whose random selection is the pool of the
// player's choice, the card ids each random select of its play picks, rolled with `rand` from the group
// of the table's reveal snapshot. Undefined when the snapshot is not for the top card, or for any other
// title. The page rolls it before the `flip` that takes the snapshot (`withShuffleOrders`), and a restore
// for the fresh snapshot it takes, never at render.
export function revealPicksOf(table: TableState, rand: Rand): string[][] | undefined {
  const snapshot = table.attempt?.revealSnapshot;
  const play = snapshot && revealedPlayOf(table, snapshot);
  if (!snapshot || !play || play.top.id !== snapshot.dilemmaId) return undefined;
  return pileRevealPicksOf(play.top.card, play.attempt, { personnelIds: play.personnelIds, revealed: play.revealed, rest: play.rest, rand });
}

// What `pileAttemptOf` reads of the table for an attempt at `missionIndex` with `shipId` (#1508): the
// bot's stack as the attempt starts, and the label of each dilemma the player faces (#1519).
export function pileTableInputOf(table: TableState, missionIndex: number, shipId?: string): PileTableInput {
  const slot = table.missions[missionIndex];
  return {
    cards: attemptingCards(table, missionIndex, shipId) ?? [],
    mission: slot?.mission?.card,
    ship: slot?.ships.find((s) => s.id === shipId)?.card,
    placedOn: (slot?.mission?.placedOn ?? []).map((c) => c.card),
    underMission: (slot?.underMission ?? []).map((c) => c.card),
    missions: table.missions.map((s) => ({ mission: s.mission?.card, completed: s.completed, under: s.underMission.map((c) => c.card) })),
    hand: table.hand.map((c) => c.card),
    discard: table.discard.map((c) => c.card),
    turn: table.turn,
    score: table.score,
    facts: botTableFactsOf(table),
    core: table.core.map((c) => c.card),
    commanded: table.missions.flatMap((s) => [...s.awayTeam, ...s.ships.flatMap((ship) => ship.crew ?? [])]).map((c) => c.card),
    shipsAtMission: (slot?.ships ?? []).map((ship) => ({ staffed: (ship.crew ?? []).some((c) => c.card?.type === 'personnel') })),
    drawDeck: table.drawDeck.map((c) => c.card),
    // The bot's pile as it stands (#1552): in a bot game the drawn dilemmas the bot left out of the
    // stack are already at its bottom (#1299). Vault of Tomorrow names the dilemma it takes from it.
    dilemmaPile: table.dilemmaPile.map((c) => c.card),
    // The bot deck's affiliations (#1520); absent for the Chula pile.
    ...(table.botPile?.affiliations ? { botAffiliations: table.botPile.affiliations } : {}),
  };
}

// What the dilemma bot's table conditions read of the table as a bot attempt starts (#1352): the type
// of each completed mission, the traits and the type of each discard pile card, and the number of
// events in the core, and the traits of each personnel the player commands: every away team and
// every ship's crew, at every mission, never the brig (#1360). A card with no row counts nowhere.
// While the condition of Sphere 117 holds (#1363), a Sphere 117 on any ship row and every mission of
// the table a [DQ] mission, a commanded Drone reads Dissident in place of Drone. An empty slot holds
// no mission and does not count.
export function botTableFactsOf(table: TableState): BotTableFacts {
  const sphere = sphere117Holds(
    table.missions.some((s) => s.ships.some((ship) => isSphere117(ship.card))),
    table.missions.flatMap((s) => (s.mission?.card ? [String(s.mission.card.quadrant ?? '')] : [])),
  );
  return {
    completedMissions: table.missions.flatMap((s) => (s.completed && s.mission?.card ? [String(s.mission.card.missiontype)] : [])),
    discardPile: table.discard.flatMap((c) => (c.card ? [{ ...partnerTraitsOf(c.card), type: String(c.card.type) }] : [])),
    coreEvents: table.core.filter((c) => c.card?.type === 'event').length,
    commanded: table.missions
      .flatMap((s) => [...s.awayTeam, ...s.ships.flatMap((ship) => ship.crew ?? [])])
      .flatMap((c) => (c.card?.type === 'personnel' ? [partnerTraitsOf(c.card)] : []))
      .map((traits) => (sphere ? asSphere117Dissident(traits) : traits)),
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

// The attempt of `/decks/practice?fixture=attempt` (#1169): the `startAttempt` that Start in the
// popup would dispatch, with its default numbers, for the crew of the ship the piles deal puts at
// Bilana System. `table` is the table `resetWithPiles` dealt. Null when that deal has no ship there.
export function fixtureAttempt(table: TableState): Extract<TableAction, { type: 'startAttempt' }> | null {
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
// `?fixture=bot-resolve-modifier` (#1598) reveals Accelerated Aging, with a Dead Weight right under it.
export const FIXTURE_BOT_LABEL_DILEMMA = 'Well-Prepared Defenses';

// The dilemma each revealing bot fixture adds to the bot's pile and reveals, by title and collector's info.
// `next`: a second dilemma it adds, face down right under the revealed one (#1598).
export interface BotRevealFixture {
  title: string;
  collectorsInfo: string;
  next?: { title: string; collectorsInfo: string };
}

export const BOT_REVEAL_FIXTURES: Record<string, BotRevealFixture> = {
  'bot-label': { title: FIXTURE_BOT_LABEL_DILEMMA, collectorsInfo: '17V017' },
  'bot-resolve-noeffect': { title: 'Conflict of Interests', collectorsInfo: '26V002' },
  'bot-resolve-choice': { title: 'Covert Extraction', collectorsInfo: '38V002' },
  'bot-resolve-pattern': { title: 'A Pattern of Lies', collectorsInfo: '10C001' },
  // Accelerated Aging, which takes away the first-listed skills, over a Dead Weight whose check the crew
  // passes only with them (#1598).
  'bot-resolve-modifier': {
    title: 'Accelerated Aging',
    collectorsInfo: '11P001',
    next: { title: 'Dead Weight', collectorsInfo: '36V005' },
  },
};

export function fixtureBotLabelAttempt(table: TableState, title: string = FIXTURE_BOT_LABEL_DILEMMA): {
  start: Extract<TableAction, { type: 'startAttempt' }>;
  stack: Extract<TableAction, { type: 'move' }>[];
  revealId: string;
} | null {
  const start = fixtureAttempt(table);
  const labelled = table.dilemmaPile.find((c) => c.card?.originalName?.includes(title));
  if (!start || !labelled) return null;
  const n = Math.max(0, start.personnel - start.subtract);
  // The fixture's second dilemma, if it has one, goes right under the revealed one (#1598).
  const nextTitle = Object.values(BOT_REVEAL_FIXTURES).find((f) => f.title === title)?.next?.title;
  const next = nextTitle ? table.dilemmaPile.find((c) => c.id !== labelled.id && c.card?.originalName?.includes(nextTitle)) : undefined;
  const rest = table.dilemmaPile.filter((c) => c.id !== labelled.id && c.id !== next?.id);
  const under = [...(next ? [next] : []), ...rest].slice(0, FIXTURE_DILEMMA_STACK - 1);
  return {
    start: { ...start, botDraw: n, botSpend: n },
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
