// The registry of attribute models (#1664): the cards whose game text changes a personnel's
// Integrity, Cunning or Strength, or a ship's Weapons or Shields, one entry per title less its
// version suffix (`cardTitleOf`), as `RANGE_SPAN_REGISTRY` keys its models. The two readers give a
// card's attributes on the table as it stands. A module with no import of `tableReducer.ts` but its
// types, so `MissionRow` can read it without loading the reducer.

import type { CardInstance, MissionSlot, TableState } from './tableReducer';
import { commandedPersonnel, hasWord, isPersonnel, titleKeyOf } from './rangeModels';

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
}

const isShip = (card: CardInstance) => String(card.card?.type ?? '').toLowerCase() === 'ship';
const plus = (n: number): AttributeChange => ({ integrity: n, cunning: n, strength: n });
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
// the group models of the personnel present with it (itself among them), and its ship's crew model.
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
