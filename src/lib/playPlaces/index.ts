// Where a personnel, a ship or an equipment may be played on the practice table (#1855): the away teams,
// the crews and the ship rows its play may land in. Pure: it reads a narrow shape of the table
// (`PlaceTable`, which `src/app/decks/practice/playPlaces.ts` builds from a `TableState`) and changes
// nothing. The sources, any of which makes a place eligible:
//
// - the headquarters rules (`reportsToMatches`) of each slot whose mission is a headquarters: a personnel
//   or an equipment there may join its away team and the crew of each ship on its ship row, a ship its
//   ship row. A card of `CARD_SPECIFIC_HQ_LOCATIONS` (Kira Nerys Starfleet Emissary) is read through that
//   table, so its own "at [HQ]{Bajor}" text adds nothing more;
// - a mission's own "you may play … here" (Curnab Sector) and a ship's own "you may play … aboard this
//   ship" (U.S.S. Relativity), with their conditions;
// - the played card's own text: "aboard your [X] ship", "aboard your {Ship}", "at your {Mission}",
//   "to the same mission as your {Ship}" (`parse.ts`);
// - `PLACE_MODELS`, by title, for the texts the parser does not read.
//
// A cost the text names ("at cost +2") stays with the cost registry: a text with a cost and no place adds
// no place. A clause whose condition the parser cannot read adds none either (`parse.ts`).

import { cardTitleOf } from '../cardTitle';
import { hasCardSpecificHqLocation, hqRowOf, reportsToMatches } from '../hqPlayability';
import { placeClausesOf, type CardSpec, type OwnPlace, type PlaceCardRow, type PlaceClause, type PlaceCondition } from './parse';

export type { PlaceCardRow } from './parse';

/** A ship on a ship row: its instance id, its card and the cards of its crew. */
export interface PlaceShip {
  id: string;
  card: PlaceCardRow;
  crew: PlaceCardRow[];
}

/** One mission slot as the model reads it. */
export interface PlaceSlot {
  mission: PlaceCardRow | null;
  completed: boolean;
  awayTeam: PlaceCardRow[];
  ships: PlaceShip[];
}

/** The table as the model reads it: the slots, and the cards of the core for "you command". */
export interface PlaceTable {
  slots: PlaceSlot[];
  core: PlaceCardRow[];
}

/** Where a card may be played: away teams and ship rows by slot index, crews by the ship's instance id. */
export interface PlayPlaces {
  awayTeams: Set<number>;
  crews: Set<string>;
  shipRows: Set<number>;
}

const str = (v: unknown): string => String(v ?? '').toLowerCase();
const typeOf = (card: PlaceCardRow): string => str(card.type);
const titleOf = (card: PlaceCardRow | null): string => (card ? cardTitleOf(str(card.name)) : '');

/**
 * Whether a card's title is the persona a brace reference names: `{Earth}` is "Earth Cradle of the
 * Federation", `{Enterprise}` is "Enterprise Damaged Starship" and not "U.S.S. Enterprise …", the rule of
 * `downloadTakes`.
 */
export function titleMatches(card: PlaceCardRow | null, reference: string): boolean {
  const title = titleOf(card);
  const ref = reference.toLowerCase().trim();
  return !!title && (title === ref || title.startsWith(`${ref} `));
}

/** The affiliation an affiliation icon stands for. Every other icon is read from the `icons` field. */
const AFFILIATION_ICONS: Record<string, string> = {
  '[baj]': 'bajoran',
  '[bor]': 'borg',
  '[car]': 'cardassian',
  '[dom]': 'dominion',
  '[fed]': 'federation',
  '[fer]': 'ferengi',
  '[kli]': 'klingon',
  '[klg]': 'klingon',
  '[na]': 'non-aligned',
  '[non]': 'non-aligned',
  '[rom]': 'romulan',
  '[sf]': 'starfleet',
  '[vid]': 'vidiian',
  '[xin]': 'xindi',
};

/** A mission's quadrant icon and the letter of its `quadrant` field. */
const QUADRANT_ICONS: Record<string, string> = { '[aq]': 'a', '[dq]': 'd', '[gq]': 'g', '[mq]': 'm' };

/** Whether a card carries an icon: an affiliation, a quadrant, a headquarters, or one of its `icons`. */
export function hasIcon(card: PlaceCardRow | null, icon: string): boolean {
  if (!card) return false;
  const i = icon.toLowerCase();
  if (i === '[hq]' || i === '[h]') return str(card.missiontype ?? card.mission) === 'h';
  if (QUADRANT_ICONS[i]) return str(card.quadrant) === QUADRANT_ICONS[i];
  // A mission prints its affiliation icons in the `affiliation` field: "[Fed][NA]".
  if (str(card.icons).includes(i) || str(card.affiliation).includes(i)) return true;
  const affiliation = AFFILIATION_ICONS[i];
  return !!affiliation && str(card.affiliation).includes(affiliation);
}

const isHeadquarters = (mission: PlaceCardRow | null): boolean => !!mission && str(mission.missiontype ?? mission.mission) === 'h';

/** The cards the player commands: the away teams, the ships, their crews and the core. */
const commandedOf = (table: PlaceTable): PlaceCardRow[] => [
  ...table.slots.flatMap((s) => [...s.awayTeam, ...s.ships.flatMap((ship) => [ship.card, ...ship.crew])]),
  ...table.core,
];

/** Whether a card is one a host's list names. */
export function specMatches(spec: CardSpec, card: PlaceCardRow): boolean {
  if (spec.type !== 'any' && spec.type !== typeOf(card)) return false;
  if (!spec.icons.every((i) => hasIcon(card, i))) return false;
  if (!spec.qualifier) return true;
  const q = spec.qualifier.replace(/s$/, '');
  return ['keywords', 'species', 'skills', 'class'].some((f) => str(card[f]).includes(q));
}

/** Where a condition is read: the table, and the slot and ship of the host when it has one. */
interface ConditionScope {
  table: PlaceTable;
  slot?: PlaceSlot;
}

function conditionHolds(c: PlaceCondition, { table, slot }: ConditionScope): boolean {
  switch (c.kind) {
    case 'noHeadquarters':
      return !table.slots.some((s) => isHeadquarters(s.mission));
    case 'commandsIcons':
      return commandedOf(table).some((card) => typeOf(card) === c.type && c.icons.every((i) => hasIcon(card, i)));
    case 'commandsTitle':
      return commandedOf(table).some((card) => titleMatches(card, c.title));
    case 'shipAtIcon':
      return !!slot && hasIcon(slot.mission, c.icon);
    case 'shipAtRegion':
      return !!slot && str(slot.mission?.keywords).includes(`region: ${c.region}`);
    case 'shipAtMissionType':
      return !!slot && str(slot.mission?.missiontype ?? slot.mission?.mission) === (c.missionType === 'space' ? 's' : 'p');
    case 'missionComplete':
      return !!slot?.completed;
  }
}

type HostClause = Extract<PlaceClause, { kind: 'here' | 'aboardThisShip' }>;

/** A mission's "… here" clauses, or a ship's "… aboard this ship". */
const hostClausesOf = (card: PlaceCardRow | null, kind: HostClause['kind']): HostClause[] =>
  placeClausesOf(str(card?.gametext)).flatMap((c) => (c.kind === kind ? [c] : []));

const emptyPlaces = (): PlayPlaces => ({ awayTeams: new Set(), crews: new Set(), shipRows: new Set() });

/** The places of a slot for a card: its away team and the crews of its ships, or its ship row for a ship. */
function addSlot(places: PlayPlaces, table: PlaceTable, index: number, card: PlaceCardRow): void {
  if (typeOf(card) === 'ship') {
    places.shipRows.add(index);
    return;
  }
  places.awayTeams.add(index);
  for (const ship of table.slots[index].ships) places.crews.add(ship.id);
}

const slotsWhere = (table: PlaceTable, test: (slot: PlaceSlot) => boolean): number[] =>
  table.slots.flatMap((slot, i) => (test(slot) ? [i] : []));

function addOwnPlace(places: PlayPlaces, table: PlaceTable, card: PlaceCardRow, place: OwnPlace): void {
  switch (place.kind) {
    case 'aboardIconShip':
      if (typeOf(card) === 'ship') return;
      table.slots.forEach((slot) => {
        if (place.missionIcon && hasIcon(slot.mission, place.missionIcon.icon) === place.missionIcon.not) return;
        for (const ship of slot.ships) {
          const has = place.any.some((icons) => icons.every((i) => hasIcon(ship.card, i)));
          if (has !== place.not) places.crews.add(ship.id);
        }
      });
      return;
    case 'aboardShip':
      if (typeOf(card) === 'ship') return;
      for (const ship of table.slots.flatMap((s) => s.ships)) if (titleMatches(ship.card, place.title)) places.crews.add(ship.id);
      return;
    case 'atMission':
      for (const i of slotsWhere(
        table,
        (s) => !!s.mission && (place.title === null || titleMatches(s.mission, place.title)) && place.icons.every((ic) => hasIcon(s.mission, ic))
      ))
        addSlot(places, table, i, card);
      return;
    case 'sameMissionAsShip':
      for (const i of slotsWhere(table, (s) => s.ships.some((ship) => titleMatches(ship.card, place.title)))) addSlot(places, table, i, card);
      return;
  }
}

/** A model of the texts the parser does not read, by whole title (`cardTitleOf`, any case). */
export interface PlaceModel {
  title: string;
  /** The places the played card's own text adds. */
  places?: (card: PlaceCardRow, table: PlaceTable, add: PlaceAdder) => void;
  /** The crews a ship of this title on the table takes for `card`. */
  aboard?: (card: PlaceCardRow, table: PlaceTable, ship: PlaceShip, slotIndex: number) => boolean;
}

/** The adders a `PlaceModel` uses: a slot's away team and crews (or ship row, for a ship), or one crew. */
export interface PlaceAdder {
  slot: (index: number) => void;
  crew: (shipId: string) => void;
}

const isPersonnel = (card: PlaceCardRow) => typeOf(card) === 'personnel';

/** The headquarters slots a card may be played at by `reportsToMatches`. */
const headquartersSlots = (table: PlaceTable, card: PlaceCardRow): number[] => {
  const row = hqRowOf(card);
  return slotsWhere(table, (s) => isHeadquarters(s.mission) && reportsToMatches(row, titleOf(s.mission)));
};

export const PLACE_MODELS: PlaceModel[] = [
  {
    // "You may play this ship at your Region: Briar Patch mission where you command {U.S.S. Enterprise-E}."
    title: "Cousteau Captain's Yacht",
    places: (_card, table, add) =>
      table.slots.forEach((s, i) => {
        if (!str(s.mission?.keywords).includes('region: briar patch')) return;
        const here = [...s.awayTeam, ...s.ships.flatMap((ship) => [ship.card, ...ship.crew])];
        if (here.some((c) => titleMatches(c, 'u.s.s. enterprise-e'))) add.slot(i);
      }),
  },
  {
    // "You may play this personnel aboard your [TOS] ship that has a [TOS] personnel who has a cost of 4 or more aboard."
    title: 'Spock Experienced Officer',
    places: (_card, table, add) => {
      for (const ship of table.slots.flatMap((s) => s.ships))
        if (hasIcon(ship.card, '[tos]') && ship.crew.some((c) => isPersonnel(c) && hasIcon(c, '[tos]') && Number(c.cost) >= 4))
          add.crew(ship.id);
    },
  },
  {
    // "You may play this personnel aboard the same ship or on the same planet where you command The Doctor."
    title: 'Danara Pel Loving Life',
    places: (_card, table, add) =>
      table.slots.forEach((s, i) => {
        if (s.awayTeam.some((c) => titleMatches(c, 'the doctor'))) add.slot(i);
        for (const ship of s.ships) if (ship.crew.some((c) => titleMatches(c, 'the doctor'))) add.crew(ship.id);
      }),
  },
  {
    // "You may play this personnel as if she had one of the following icons: [TOS], [TNG], [DS9], or [Voy]."
    title: 'Saavik Seeking Possibilities',
    places: (card, table, add) => {
      for (const icon of ['[tos]', '[tng]', '[ds9]', '[voy]'])
        for (const i of headquartersSlots(table, { ...card, icons: `${str(card.icons)}${icon}` })) add.slot(i);
    },
  },
  {
    // "When you are about to play a Hologram at your headquarters mission, you may play him or her aboard this ship instead."
    title: 'Olarra Chariot of Light',
    aboard: (card, table) => /hologram/.test(str(card.species)) && headquartersSlots(table, card).length > 0,
  },
];

const modelOf = (title: string): PlaceModel | undefined => PLACE_MODELS.find((m) => m.title.toLowerCase() === title.toLowerCase());

/** The titles of `PLACE_MODELS`. */
export const PLACE_MODEL_TITLES: ReadonlySet<string> = new Set(PLACE_MODELS.map((m) => m.title));

/**
 * Where `card` may be played on `table`, or null for a card that is no personnel, ship or equipment. A
 * card with no eligible place gives three empty sets.
 */
export function playPlacesOfRow(card: PlaceCardRow, table: PlaceTable): PlayPlaces | null {
  const type = typeOf(card);
  if (type !== 'personnel' && type !== 'ship' && type !== 'equipment') return null;
  const places = emptyPlaces();
  const add: PlaceAdder = { slot: (i) => addSlot(places, table, i, card), crew: (id) => places.crews.add(id) };

  for (const i of headquartersSlots(table, card)) add.slot(i);

  const title = titleOf(card);
  const model = modelOf(title);
  if (model?.places) model.places(card, table, add);
  else if (!hasCardSpecificHqLocation(str(card.name))) {
    for (const clause of placeClausesOf(str(card.gametext))) {
      if (clause.kind !== 'own' || !clause.conditions.every((c) => conditionHolds(c, { table }))) continue;
      for (const place of clause.places) addOwnPlace(places, table, card, place);
    }
  }

  table.slots.forEach((slot, i) => {
    const here = hostClausesOf(slot.mission, 'here');
    if (here.some((c) => c.conditions.every((cond) => conditionHolds(cond, { table, slot })) && c.cards.some((s) => specMatches(s, card))))
      add.slot(i);
    if (type === 'ship') return;
    for (const ship of slot.ships) {
      const shipModel = modelOf(titleOf(ship.card));
      if (shipModel?.aboard) {
        if (shipModel.aboard(card, table, ship, i)) places.crews.add(ship.id);
        continue;
      }
      const aboard = hostClausesOf(ship.card, 'aboardThisShip');
      if (aboard.some((c) => c.conditions.every((cond) => conditionHolds(cond, { table, slot })) && c.cards.some((s) => specMatches(s, card))))
        places.crews.add(ship.id);
    }
  });
  return places;
}
