// The registry of attribute models (#1664): the cards whose game text changes a personnel's
// Integrity, Cunning or Strength, or a ship's Weapons or Shields, one entry per title less its
// version suffix (`cardTitleOf`), as `RANGE_SPAN_REGISTRY` keys its models. The two readers give a
// card's attributes on the table as it stands. A module with no import of `tableReducer.ts` but its
// types, so `MissionRow` can read it without loading the reducer.

import type { CardInstance, MissionSlot, TableState } from './tableReducer';
import { commandedPersonnel, completedMissionCount, hasWord, isNamed, isPersonnel, isShip, SHIP_CLAUSES, titleKeyOf } from './rangeModels';
import { shipRangeOnTable } from './shipRange';

// What the attribute models read of the table as it stands (#1667): the mission slots with their
// away teams and ships, the core, the hand, the discard pile, the score and the Range used.
export type AttributeTable = Pick<TableState, 'missions' | 'core' | 'hand' | 'discard' | 'score' | 'rangeUsed'>;

export interface PersonnelAttributes {
  integrity: number;
  cunning: number;
  strength: number;
}

export interface ShipAttributes {
  weapons: number;
  shields: number;
}

// What a model adds to the attributes of its target: a personnel's or a ship's, the parts it changes.
export type AttributeChange = Partial<PersonnelAttributes & ShipAttributes>;

export interface AttributeModel {
  // The title, less its version suffix, as the card data names it ("U.S.S. Enterprise-J").
  title: string;
  // An event's model: the change to `target` while the event `self` is placed on the mission card of
  // slot `slot`.
  eventAttributes?: (self: CardInstance, slot: MissionSlot, target: CardInstance, table: AttributeTable) => AttributeChange;
  // A mission's model: the change to `target` from the mission card `self` of slot `slot`.
  missionAttributes?: (self: CardInstance, slot: MissionSlot, target: CardInstance, table: AttributeTable) => AttributeChange;
  // An event's model in the core: the change to `target` while the event `self` is in the core.
  coreAttributes?: (self: CardInstance, target: CardInstance, table: AttributeTable) => AttributeChange;
  // A personnel's model of itself (#1667): the change to its own attributes while `self` is in
  // `group`, the away team or the crew it is in.
  selfAttributes?: (self: CardInstance, group: CardInstance[], table: AttributeTable) => AttributeChange;
  // A personnel's model of its group (#1667): the change to `target` while `self` and `target` are
  // present together in `group`, an away team or one ship's crew. `target` may be `self`: the text
  // decides whether the source counts too ("each of your other …" leaves it out).
  groupAttributes?: (self: CardInstance, target: CardInstance, group: CardInstance[], table: AttributeTable) => AttributeChange;
  // A ship's model of its crew (#1667): the change to `target` aboard the ship `self` of slot `slot`.
  crewAttributes?: (self: CardInstance, slot: MissionSlot, target: CardInstance, table: AttributeTable) => AttributeChange;
  // A ship's model of itself (#1671): the change to its own Weapons and Shields while `self` is on
  // the ship row of slot `slot`, as `shipRange` gives its Range.
  shipAttributes?: (self: CardInstance, slot: MissionSlot, table: AttributeTable) => AttributeChange;
  // A personnel's model of its ship (#1671): the change to the ship `ship` while `self` is in its
  // crew, as `aboardRange` gives its Range.
  aboardAttributes?: (self: CardInstance, ship: CardInstance, table: AttributeTable) => AttributeChange;
  // A commanded personnel's model of ships (#1671): the change to the ship `ship` on a ship row while
  // `self` is in an away team or a crew, wherever that is, as `commandedShipRange` gives its Range.
  commandedShipAttributes?: (self: CardInstance, ship: CardInstance, table: AttributeTable) => AttributeChange;
}

const plus = (n: number): AttributeChange => ({ integrity: n, cunning: n, strength: n });
// A ship's Weapons and Shields +`n`, the part of "attributes +n" that is not its Range.
const shipPlus = (n: number): AttributeChange => (n !== 0 ? { weapons: n, shields: n } : NONE);
const ATTRIBUTES_PLUS_ONE: AttributeChange = plus(1);
const NONE: AttributeChange = {};

// Whether the personnel `p` is at the mission of `slot`: in its away team, or in the crew of a ship
// of its ship row. A stopped personnel is still there.
const isAt = (slot: MissionSlot, p: CardInstance): boolean =>
  slot.awayTeam.some((c) => c.id === p.id) || slot.ships.some((ship) => (ship.crew ?? []).some((c) => c.id === p.id));

// The ships the player commands: every ship of every ship row. In a solo game the player commands every slot.
const commandedShips = (missions: MissionSlot[]): CardInstance[] => missions.flatMap((slot) => slot.ships);

// The personnel of `group` other than `self` that pass `test`. A stopped personnel still counts (#1667).
const othersIn = (self: CardInstance, group: CardInstance[], test: (p: CardInstance) => boolean): CardInstance[] =>
  group.filter((p) => p.id !== self.id && isPersonnel(p) && test(p));

const hasIcon = (p: CardInstance, icon: string) => hasWord(p.card?.icons, icon);
const hasAffiliation = (p: CardInstance, affiliation: string) => hasWord(p.card?.affiliation, affiliation);
const points = (mission: CardInstance | null) => Number(mission?.card?.points) || 0;
const isSpaceMission = (mission: CardInstance | null) => String(mission?.card?.mission ?? '').toLowerCase() === 's';
const completedSpaceMissions = (missions: MissionSlot[]) => missions.filter((slot) => slot.completed && isSpaceMission(slot.mission)).length;
// The personnel of the discard pile with the skill `skill`, a card removed from the game there too.
const discardedWith = (discard: CardInstance[], skill: string) => discard.filter((c) => isPersonnel(c) && hasWord(c.card?.skills, skill)).length;
// The ship whose crew holds `p`, or undefined for a personnel in an away team or off the table.
const shipOf = (missions: MissionSlot[], p: CardInstance): CardInstance | undefined =>
  missions.flatMap((slot) => slot.ships).find((ship) => (ship.crew ?? []).some((c) => c.id === p.id));

const MODELS: AttributeModel[] = [
  {
    // "Plays on your mission. While this mission is worth 40 or more points, each of your personnel
    // at this mission is attributes +1."
    title: 'U.S.S. Enterprise-J',
    eventAttributes: (_self, slot, target) =>
      isPersonnel(target) && points(slot.mission) >= 40 && isAt(slot, target) ? ATTRIBUTES_PLUS_ONE : NONE,
  },
  {
    // "Each of your personnel here with a cost of 1 or less is attributes +1." "Here" reads as "at
    // this mission": the away team and the crews of the ships here. A personnel with no cost gets none.
    title: 'Orlitus Cluster Astronomical Survey',
    missionAttributes: (_self, slot, target) => {
      const cost = String(target.card?.cost ?? '').trim();
      return isPersonnel(target) && cost !== '' && Number(cost) <= 1 && isAt(slot, target) ? ATTRIBUTES_PLUS_ONE : NONE;
    },
  },
  {
    // "Plays in your core. Your [TN] ships are each Weapons +1 and Shields -1. Your [TN] personnel
    // are each Integrity -1 and Cunning +1."
    title: 'Dark Dissension',
    coreAttributes: (_self, target, { missions }) => {
      if (!hasWord(target.card?.icons, 'tn')) return NONE;
      if (isShip(target) && commandedShips(missions).some((s) => s.id === target.id)) return { weapons: 1, shields: -1 };
      if (isPersonnel(target) && commandedPersonnel(missions).some((p) => p.id === target.id)) return { integrity: -1, cunning: 1 };
      return NONE;
    },
  },
  {
    // "While you have completed a mission worth 40 or more points, each [AU] personnel present is
    // attributes +1." Nador, an [AU] personnel, is +1 himself.
    title: 'Nador Curious Commander',
    groupAttributes: (_self, target, _group, { missions }) =>
      isPersonnel(target) && hasIcon(target, 'au') && missions.some((slot) => slot.completed && points(slot.mission) >= 40)
        ? ATTRIBUTES_PLUS_ONE
        : NONE,
  },
  {
    // "Each of your other Borg present is Cunning +1."
    title: 'Computation Drone',
    groupAttributes: (self, target) =>
      target.id !== self.id && isPersonnel(target) && hasWord(target.card?.species, 'borg') ? { cunning: 1 } : NONE,
  },
  {
    // "While this ship is at a [Bor] mission, personnel aboard it are attributes +1."
    title: "Queen's Borg Sphere Contingency Vessel",
    crewAttributes: (_self, slot, target) =>
      isPersonnel(target) && hasWord(slot.mission?.card?.affiliation, 'bor') ? ATTRIBUTES_PLUS_ONE : NONE,
  },
  {
    // "While you command three [Car] personnel, this personnel is attributes +1 …" Doran counts the
    // other [Car] personnel: his printed affiliation is not Cardassian, so two Dorans do not satisfy
    // each other.
    title: 'Doran',
    selfAttributes: (self, _group, { missions }) =>
      othersIn(self, commandedPersonnel(missions), (p) => hasAffiliation(p, 'cardassian')).length >= 3 ? ATTRIBUTES_PLUS_ONE : NONE,
  },
  {
    // "While this personnel is present with your [Baj] personnel, each of your [Fed] personnel present
    // is attributes +1." Sisko, [Fed], is +1 himself.
    title: 'Benjamin Sisko Enlightened Supervisor',
    groupAttributes: (self, target, group) =>
      isPersonnel(target) &&
      hasAffiliation(target, 'federation') &&
      othersIn(self, group, (p) => hasAffiliation(p, 'bajoran')).length > 0
        ? ATTRIBUTES_PLUS_ONE
        : NONE,
  },
  {
    // "While you do not command a completed mission, each of your [Vid] personnel present is
    // attributes +1." Bridon, [Vid], is +1 himself.
    title: 'Bridon',
    groupAttributes: (_self, target, _group, { missions }) =>
      isPersonnel(target) && hasAffiliation(target, 'vidiian') && !missions.some((slot) => slot.mission && slot.completed)
        ? ATTRIBUTES_PLUS_ONE
        : NONE,
  },
  {
    // "This personnel is attributes -1 for each card in your hand." The readers floor each value at 0.
    title: 'Brennan Scott',
    selfAttributes: (_self, _group, { hand }) => (hand.length > 0 ? plus(-hand.length) : NONE),
  },
  {
    // "This personnel is Cunning +1 and Strength +1 for each incomplete non-headquarters mission you command."
    title: 'Drenol',
    selfAttributes: (_self, _group, { missions }) => {
      const n = missions.filter((slot) => slot.mission && !slot.completed && String(slot.mission.card?.mission ?? '').toLowerCase() !== 'h').length;
      return n > 0 ? { cunning: n, strength: n } : NONE;
    },
  },
  {
    // "While this personnel is present with three [Pa] personnel, she is attributes +1 …" A stopped
    // [Pa] personnel counts.
    title: 'Jadzia Dax Communications Staffer',
    selfAttributes: (self, group) => (othersIn(self, group, (p) => hasIcon(p, 'pa')).length >= 3 ? ATTRIBUTES_PLUS_ONE : NONE),
  },
  {
    // "Each of your [Pa] personnel at this mission is attributes +1."
    title: 'Organia Secure Strategic Base',
    missionAttributes: (_self, slot, target) => (isPersonnel(target) && hasIcon(target, 'pa') && isAt(slot, target) ? ATTRIBUTES_PLUS_ONE : NONE),
  },
  {
    // "While your [TNG] personnel who has a cost of 4 or more is present, this personnel is attributes
    // +2." Another personnel: Riker is [TNG] with a cost of 4 himself, and is not present with himself.
    title: 'William T. Riker Battleship First Officer',
    selfAttributes: (self, group) =>
      othersIn(self, group, (p) => hasIcon(p, 'tng') && (Number(p.card?.cost) || 0) >= 4).length > 0 ? plus(2) : NONE,
  },
  {
    // "Each of your other [Baj] personnel present is Integrity +1 (or +2 while facing a dilemma)." The
    // "facing a dilemma" part is not modelled.
    title: 'Bareil Antos Esteemed Vedek',
    groupAttributes: (self, target) =>
      target.id !== self.id && isPersonnel(target) && hasAffiliation(target, 'bajoran') ? { integrity: 1 } : NONE,
  },
  {
    // "Each of your other [Baj] personnel present is Strength +1 (or +2 while in combat)." Combat never
    // happens on the table.
    title: 'Shakaar Edon Resistance Leader',
    groupAttributes: (self, target) =>
      target.id !== self.id && isPersonnel(target) && hasAffiliation(target, 'bajoran') ? { strength: 1 } : NONE,
  },
  {
    // "While this personnel is aboard your {U.S.S. Enterprise-D}, each of your non-unique [TNG]
    // personnel present is attributes +1." The group is that ship's crew; in an away team she gives
    // nothing. She is unique, so she never counts herself.
    title: 'Beverly Crusher Encouraging Commander',
    groupAttributes: (self, target, _group, { missions }) => {
      const ship = shipOf(missions, self);
      return ship &&
        isNamed(ship, 'U.S.S. Enterprise-D') &&
        isPersonnel(target) &&
        String(target.card?.unique ?? '').toLowerCase() === 'n' &&
        hasIcon(target, 'tng')
        ? ATTRIBUTES_PLUS_ONE
        : NONE;
    },
  },
  {
    // "While you have no cards in your discard pile, this personnel is Cunning +4, Strength +4 …"
    title: 'Dukat Pah-Wraith Puppet',
    selfAttributes: (_self, _group, { discard }) => (discard.length === 0 ? { cunning: 4, strength: 4 } : NONE),
  },
  {
    // "While this personnel is present with a stopped [SF] Dissident personnel, he is attributes +1 …"
    // He is an [SF] Dissident himself, and is not present with himself.
    title: 'Emanuel Stevens',
    selfAttributes: (self, group) =>
      othersIn(self, group, (p) => !!p.stopped && hasAffiliation(p, 'starfleet') && hasWord(p.card?.keywords, 'dissident')).length > 0
        ? ATTRIBUTES_PLUS_ONE
        : NONE,
  },
  {
    // "While each player has 40 or more points, this personnel is attributes +1 …" In a solo game the
    // player is each player: the score counter.
    title: 'Martinez',
    selfAttributes: (_self, _group, { score }) => (score >= 40 ? ATTRIBUTES_PLUS_ONE : NONE),
  },
  {
    // "While you command fewer than two completed missions, this personnel is attributes +1."
    title: 'Motura Eminent Sculptor',
    selfAttributes: (_self, _group, { missions }) =>
      missions.filter((slot) => slot.mission && slot.completed).length < 2 ? ATTRIBUTES_PLUS_ONE : NONE,
  },
  {
    // "While you command two completed space missions, this personnel is attributes +2."
    title: 'Nadia Myers',
    selfAttributes: (_self, _group, { missions }) => (completedSpaceMissions(missions) >= 2 ? plus(2) : NONE),
  },
  {
    // "This personnel is attributes +1 for each of your completed space missions."
    title: 'Neelix Valued Guide',
    selfAttributes: (_self, _group, { missions }) => {
      const n = completedSpaceMissions(missions);
      return n > 0 ? plus(n) : NONE;
    },
  },
  {
    // "While you have six or more cards in hand, this personnel is attributes +3."
    title: 'Nog Bar Owner',
    selfAttributes: (_self, _group, { hand }) => (hand.length >= 6 ? plus(3) : NONE),
  },
  {
    // "This personnel is Cunning +1 for each Diplomacy personnel in your discard pile (limit +4). This
    // personnel is Strength +1 for each Security personnel in your discard pile (limit +4)."
    title: 'Odo Curzon Odo',
    selfAttributes: (_self, _group, { discard }) => ({
      cunning: Math.min(4, discardedWith(discard, 'diplomacy')),
      strength: Math.min(4, discardedWith(discard, 'security')),
    }),
  },
  {
    // "While this personnel is at a Region: Delphic Expanse mission, if there is a [SF] ship at this
    // mission with unused Range>5, this personnel is attributes +1 …" Unused Range is the Range on the
    // table less the Range used this turn, the Range left the ship's card shows.
    title: 'Travis Mayweather Damaged Navigator',
    selfAttributes: (self, _group, table) => {
      const { missions, rangeUsed } = table;
      const slot = missions.find((s) => isAt(s, self));
      if (!slot || !String(slot.mission?.card?.keywords ?? '').toLowerCase().includes('region: delphic expanse')) return NONE;
      return slot.ships.some(
        (ship) => hasAffiliation(ship, 'starfleet') && shipRangeOnTable(table, ship) - (rangeUsed?.[ship.id] ?? 0) > 5
      )
        ? ATTRIBUTES_PLUS_ONE
        : NONE;
    },
  },
  // The ship clauses of #1671. Each card that changes Range has its range model in `rangeModels.ts`,
  // with the same condition and amount (`SHIP_CLAUSES`).
  { title: 'Groumall Inauspicious Command', shipAttributes: (self, _slot, table) => shipPlus(SHIP_CLAUSES.groumall(self, table)) },
  { title: 'A. G. Robinson Prototype Captain', commandedShipAttributes: (self, ship) => shipPlus(SHIP_CLAUSES.robinson(self, ship)) },
  { title: 'Wesley Crusher Battleship Helmsman', aboardAttributes: (self, ship) => shipPlus(SHIP_CLAUSES.wesley(self, ship)) },
  { title: 'Erika Hernandez Comparable Captain', aboardAttributes: (self, ship) => shipPlus(SHIP_CLAUSES.erika(self, ship)) },
  { title: 'Geordi La Forge Resolute Presence', aboardAttributes: (self, ship) => shipPlus(SHIP_CLAUSES.geordi(self, ship)) },
  {
    title: 'I.K.S. Rotarran Ship of Tears',
    shipAttributes: (self) => {
      const n = SHIP_CLAUSES.rotarran(self);
      return n > 0 ? { weapons: n } : NONE;
    },
  },
  { title: 'Keldon Advanced', shipAttributes: (self) => shipPlus(SHIP_CLAUSES.keldon(self)) },
  { title: 'Sarajevo Starfleet Vessel', shipAttributes: (self) => shipPlus(SHIP_CLAUSES.sarajevo(self)) },
  { title: 'Vedek Assembly Transport', shipAttributes: (self) => shipPlus(SHIP_CLAUSES.vedekAssembly(self)) },
  {
    // "This ship is Range -1 and Weapons +1 for each completed mission you command." Its Range is
    // `vidiianRange` of the range registry (#1648).
    title: 'Vidiian Cruiser',
    shipAttributes: (_self, _slot, { missions }) => {
      const n = completedMissionCount(missions);
      return n > 0 ? { weapons: n } : NONE;
    },
  },
];

export const ATTRIBUTE_REGISTRY: ReadonlyMap<string, AttributeModel> = (() => {
  const map = new Map<string, AttributeModel>();
  for (const m of MODELS) {
    const key = m.title.toLowerCase();
    if (map.has(key)) throw new Error(`two models of "${m.title}" in the attribute registry`);
    map.set(key, m);
  }
  return map;
})();

/** The attribute model of a card, by its title less the version suffix, or undefined for a title the registry lacks. */
export const attributeModelOf = (card: CardInstance | null | undefined): AttributeModel | undefined =>
  card ? ATTRIBUTE_REGISTRY.get(titleKeyOf(card)) : undefined;

// A card with no printed value reads 0.
const printed = (card: CardInstance, field: string): number => Number(card.card?.[field]) || 0;

// The away team or the ship's crew `target` is in, with its slot, and the ship for a crew; null for a
// card in no group: the hand, the brig, the core, the discard or a pile.
function placeOf(missions: MissionSlot[], target: CardInstance): { slot: MissionSlot; group: CardInstance[]; ship?: CardInstance } | null {
  for (const slot of missions) {
    if (slot.awayTeam.some((c) => c.id === target.id)) return { slot, group: slot.awayTeam };
    for (const ship of slot.ships) {
      const crew = ship.crew ?? [];
      if (crew.some((c) => c.id === target.id)) return { slot, group: crew, ship };
    }
  }
  return null;
}

// The changes of every model that applies to `target`: the events placed on each mission card, each
// mission card, each event in the core, then, for a card in an away team or a crew, its own model,
// the group models of the personnel present with it (itself among them), and its ship's crew model;
// for a ship on a ship row (#1671), its own model, the models of its crew and the models of every
// personnel the player commands that change ships.
function changesTo(table: AttributeTable, target: CardInstance): AttributeChange[] {
  const changes: AttributeChange[] = [];
  const add = (change: AttributeChange | undefined) => {
    if (change) changes.push(change);
  };
  for (const slot of table.missions) {
    if (!slot.mission) continue;
    for (const event of slot.mission.placedOn ?? []) add(attributeModelOf(event)?.eventAttributes?.(event, slot, target, table));
    add(attributeModelOf(slot.mission)?.missionAttributes?.(slot.mission, slot, target, table));
  }
  for (const event of table.core) add(attributeModelOf(event)?.coreAttributes?.(event, target, table));
  const place = placeOf(table.missions, target);
  if (place) {
    add(attributeModelOf(target)?.selfAttributes?.(target, place.group, table));
    for (const source of place.group) {
      if (isPersonnel(source)) add(attributeModelOf(source)?.groupAttributes?.(source, target, place.group, table));
    }
    if (place.ship) add(attributeModelOf(place.ship)?.crewAttributes?.(place.ship, place.slot, target, table));
  }
  const shipSlot = table.missions.find((slot) => slot.ships.some((s) => s.id === target.id));
  if (shipSlot) {
    add(attributeModelOf(target)?.shipAttributes?.(target, shipSlot, table));
    for (const p of target.crew ?? []) add(attributeModelOf(p)?.aboardAttributes?.(p, target, table));
    for (const p of commandedPersonnel(table.missions)) add(attributeModelOf(p)?.commandedShipAttributes?.(p, target, table));
  }
  return changes;
}

const total = (base: number, changes: AttributeChange[], key: keyof AttributeChange): number =>
  Math.max(0, changes.reduce((sum, c) => sum + (c[key] ?? 0), base));

// A personnel's Integrity, Cunning and Strength on the table as it stands (#1664): the printed values
// plus every attribute model that applies, each never below 0. With `cardText` false, the setting
// "Apply card text to attributes" off (#1668), the printed values.
export function personnelAttributesOnTable(
  table: AttributeTable,
  p: CardInstance,
  cardText = true
): PersonnelAttributes {
  const changes = cardText ? changesTo(table, p) : [];
  return {
    integrity: total(printed(p, 'integrity'), changes, 'integrity'),
    cunning: total(printed(p, 'cunning'), changes, 'cunning'),
    strength: total(printed(p, 'strength'), changes, 'strength'),
  };
}

// A ship's Weapons and Shields on the table as it stands (#1664): the printed values plus every
// attribute model that applies, each never below 0. With `cardText` false (#1668), the printed values.
export function shipAttributesOnTable(
  table: AttributeTable,
  ship: CardInstance,
  cardText = true
): ShipAttributes {
  const changes = cardText ? changesTo(table, ship) : [];
  return {
    weapons: total(printed(ship, 'weapons'), changes, 'weapons'),
    shields: total(printed(ship, 'shields'), changes, 'shields'),
  };
}
