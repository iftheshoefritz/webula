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
  TableAction,
  TableState,
} from './tableReducer';
import { cardDisplayName } from '../../../lib/cardCount';
import { BotTableFacts, asSphere117Dissident, isSphere117, sphere117Holds } from '../../../lib/dilemmaBot/gains';
import { partnerTraitsOf } from '../../../lib/dilemmaBot/simulator';
import { pileLabelOf } from '../../../lib/dilemmaBot/pile/label';
import { PileTableInput, pileAttemptOf } from '../../../lib/dilemmaBot/pile/tableAttempt';

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

// The bot's label on the revealed top card of the dilemma stack (#1519), or null. The label's attempt
// has the attempt's spend and the cost of the cards revealed before the top card (#1556), from the
// attempt's record of the cards it revealed, and the play faces the rest of the stack after the top
// card, so a fetch counts the cost rule as the bot's search did.
export function botLabelOf(table: TableState): string | null {
  const { attempt, dilemmaStack } = table;
  const top = dilemmaStack[0];
  if (!attempt || !top) return null;
  const built = pileAttemptOf(pileTableInputOf(table, attempt.missionIndex, attempt.shipId)).attempt;
  const revealedIds = attempt.botRevealed ?? [];
  const at = revealedIds.indexOf(top.id);
  const revealed = (at === -1 ? revealedIds : revealedIds.slice(0, at)).map((id) => findInstanceAnywhere(table, id)?.instance.card);
  return pileLabelOf(top.card, attempt.botSpend !== undefined ? { ...built, spend: attempt.botSpend } : built, {
    revealed,
    rest: dilemmaStack.slice(1).map((c) => c.card),
  });
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
export const FIXTURE_BOT_LABEL_DILEMMA = 'Well-Prepared Defenses';

export function fixtureBotLabelAttempt(table: TableState): {
  start: Extract<TableAction, { type: 'startAttempt' }>;
  stack: Extract<TableAction, { type: 'move' }>[];
  revealId: string;
} | null {
  const start = fixtureAttempt(table);
  const labelled = table.dilemmaPile.find((c) => c.card?.originalName?.includes(FIXTURE_BOT_LABEL_DILEMMA));
  if (!start || !labelled) return null;
  const n = Math.max(0, start.personnel - start.subtract);
  const rest = table.dilemmaPile.filter((c) => c.id !== labelled.id).slice(0, FIXTURE_DILEMMA_STACK - 1);
  return {
    start: { ...start, botDraw: n, botSpend: n },
    stack: [labelled, ...rest].map((c) => ({ type: 'move', id: c.id, to: 'dilemmaStack' })),
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
