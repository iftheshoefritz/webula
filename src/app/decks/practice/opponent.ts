// Spike for #1182: a read-only view of the opponent's half of the game on a small screen.
//
// A mission is a location both players' cards can be at, so a game has 10 locations: the player's
// 5 missions and the opponent's 5. Each location has two sides, one per player. A card sits on the
// side of the player who has command of it.
//
// `TableState` (tableReducer.ts) holds the player's half and keys its away teams and ship rows by
// a slot index 0-4 of the one mission row. This spike leaves it alone and keeps the opponent's
// half beside it, as a value the page derives from a fixture: it is not in the reducer and not in
// the save. Hotseat play (#1183) would move it into the reducer, one `TableState` per player, with
// the sides keyed by `LocationKey` below.

import type { CardInstance } from './tableReducer';
import { MISSION_SLOTS } from './tableReducer';
import { deckFromTsv, extractDilemmas, extractDrawDeck, extractMissions } from '../deckBuilderUtils';
import { PRACTICE_DECK_TSV, PRACTICE_DECK_TSV_2 } from '../../../lib/practiceDeck';

export type Player = 'you' | 'opponent';

// A location is a mission named by its row (whose missions they are) and its slot in that row.
export interface LocationKey {
  row: Player;
  index: number;
}

// One player's cards at one location: their personnel there (the away team) and their ships, each
// ship with its crew.
export interface LocationSide {
  awayTeam: CardInstance[];
  ships: CardInstance[];
}

export interface OpponentHalf {
  // The opponent's 5 missions, in their own slot order (left to right from their seat).
  missions: (CardInstance | null)[];
  // The opponent's side of each of their own 5 locations.
  sidesAtTheirs: LocationSide[];
  // The opponent's side of each of the player's 5 locations.
  sidesAtYours: LocationSide[];
  // The player's side of each of the opponent's 5 locations. Read-only in this spike: the player
  // cannot move a card there until hotseat play.
  yourSidesAtTheirs: LocationSide[];
  core: CardInstance[];
  brig: CardInstance[];
  // Counts only: no card of these shows, face up or face down.
  handCount: number;
  drawDeckCount: number;
  dilemmaPileCount: number;
  score: number;
}

export const emptySide = (): LocationSide => ({ awayTeam: [], ships: [] });

// The count of personnel a side shows on a badge: the away team and every crew.
export const sidePersonnelCount = (side: LocationSide): number =>
  side.awayTeam.length + side.ships.reduce((sum, ship) => sum + (ship.crew?.length ?? 0), 0);

export const sideIsEmpty = (side: LocationSide): boolean => side.awayTeam.length === 0 && side.ships.length === 0;

// Opponent card ids never collide with the player's `card-<n>` ids, so a hold preview or a panel
// can look a card up in either half.
function instances(cards: any[], prefix: string): CardInstance[] {
  return cards.map((card, i) => ({ id: `${prefix}-${i + 1}`, card, face: 'up' as const }));
}

function withCrew(ship: CardInstance, crew: CardInstance[]): CardInstance {
  return crew.length > 0 ? { ...ship, crew } : ship;
}

// The opponent of `?opponent=1`: fixture deck B (`PRACTICE_DECK_TSV_2`), dealt the same way on
// every load. It puts the opponent's personnel and ships at the player's missions 0, 2 and 3, and
// the player's own personnel at the opponent's missions 0 and 2, so both sides of a location and
// the contested mark can be checked. With `?fixture=piles` the player's missions 0 and 2 already
// hold cards, so those two are contested.
export function fixtureOpponent(data: any[]): OpponentHalf | null {
  if (data.length === 0) return null;
  const deck = deckFromTsv(PRACTICE_DECK_TSV_2, data);
  const draw = instances(extractDrawDeck(deck), 'opp');
  const missions = instances(extractMissions(deck), 'opp-m').slice(0, MISSION_SLOTS);
  const dilemmas = extractDilemmas(deck);
  const personnel = draw.filter((c) => c.card.type === 'personnel');
  const ships = draw.filter((c) => c.card.type === 'ship');
  const events = draw.filter((c) => c.card.type === 'event');
  if (personnel.length < 22 || ships.length < 3) return null;

  const sidesAtTheirs = Array.from({ length: MISSION_SLOTS }, emptySide);
  const sidesAtYours = Array.from({ length: MISSION_SLOTS }, emptySide);
  const yourSidesAtTheirs = Array.from({ length: MISSION_SLOTS }, emptySide);

  sidesAtTheirs[0].awayTeam = personnel.slice(0, 5);
  sidesAtTheirs[2].ships = [withCrew(ships[0], personnel.slice(5, 9))];
  sidesAtTheirs[4].ships = [withCrew(ships[1], personnel.slice(9, 11))];
  sidesAtYours[0].awayTeam = personnel.slice(11, 14);
  sidesAtYours[2].ships = [withCrew(ships[2], personnel.slice(14, 17))];
  sidesAtYours[3].awayTeam = personnel.slice(17, 19);

  // The player's personnel at the opponent's missions come from the player's fixture deck, under
  // ids of their own.
  const yourDeck = deckFromTsv(PRACTICE_DECK_TSV, data);
  const yours = instances(extractDrawDeck(yourDeck), 'you-away').filter((c) => c.card.type === 'personnel');
  yourSidesAtTheirs[0].awayTeam = yours.slice(0, 3);
  yourSidesAtTheirs[2].awayTeam = yours.slice(3, 4);

  // On the table: 19 personnel, 3 ships and the 2 events of the core. The hand holds 7.
  const onTable = 19 + 3 + 2;
  return {
    missions,
    sidesAtTheirs,
    sidesAtYours,
    yourSidesAtTheirs,
    core: events.slice(0, 2),
    // The opponent's brig holds personnel of the player, captured.
    brig: yours.slice(4, 5),
    handCount: 7,
    drawDeckCount: Math.max(0, draw.length - onTable - 7),
    dilemmaPileCount: dilemmas.length,
    score: 15,
  };
}
