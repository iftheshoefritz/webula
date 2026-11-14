// The registry of attribute models (#1664): the cards whose game text changes a personnel's
// Integrity, Cunning or Strength, or a ship's Weapons or Shields, one entry per title less its
// version suffix (`cardTitleOf`), as `RANGE_SPAN_REGISTRY` keys its models. The two readers give a
// card's attributes on the table as it stands. A module with no import of `tableReducer.ts` but its
// types, so `MissionRow` can read it without loading the reducer.

import type { CardInstance, MissionSlot } from './tableReducer';
import { commandedPersonnel, hasWord, isPersonnel, titleKeyOf } from './rangeModels';

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
  eventAttributes?: (self: CardInstance, slot: MissionSlot, target: CardInstance, missions: MissionSlot[]) => AttributeChange;
  // A mission's model: the change to `target` from the mission card `self` of slot `slot`.
  missionAttributes?: (self: CardInstance, slot: MissionSlot, target: CardInstance, missions: MissionSlot[]) => AttributeChange;
  // An event's model in the core: the change to `target` while the event `self` is in the core.
  coreAttributes?: (self: CardInstance, target: CardInstance, missions: MissionSlot[]) => AttributeChange;
}

const isShip = (card: CardInstance) => String(card.card?.type ?? '').toLowerCase() === 'ship';
const ATTRIBUTES_PLUS_ONE: AttributeChange = { integrity: 1, cunning: 1, strength: 1 };
const NONE: AttributeChange = {};

// Whether the personnel `p` is at the mission of `slot`: in its away team, or in the crew of a ship
// of its ship row. A stopped personnel is still there.
const isAt = (slot: MissionSlot, p: CardInstance): boolean =>
  slot.awayTeam.some((c) => c.id === p.id) || slot.ships.some((ship) => (ship.crew ?? []).some((c) => c.id === p.id));

// The ships the player commands: every ship of every ship row. In a solo game the player commands every slot.
const commandedShips = (missions: MissionSlot[]): CardInstance[] => missions.flatMap((slot) => slot.ships);

const MODELS: AttributeModel[] = [
  {
    // "Plays on your mission. While this mission is worth 40 or more points, each of your personnel
    // at this mission is attributes +1."
    title: 'U.S.S. Enterprise-J',
    eventAttributes: (_self, slot, target) =>
      isPersonnel(target) && (Number(slot.mission?.card?.points) || 0) >= 40 && isAt(slot, target) ? ATTRIBUTES_PLUS_ONE : NONE,
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
    coreAttributes: (_self, target, missions) => {
      if (!hasWord(target.card?.icons, 'tn')) return NONE;
      if (isShip(target) && commandedShips(missions).some((s) => s.id === target.id)) return { weapons: 1, shields: -1 };
      if (isPersonnel(target) && commandedPersonnel(missions).some((p) => p.id === target.id)) return { integrity: -1, cunning: 1 };
      return NONE;
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

// The sum of the changes of every model that applies to `target`: the events placed on each mission
// card, each mission card, then each event in the core.
function changesTo(missions: MissionSlot[], core: CardInstance[], target: CardInstance): AttributeChange[] {
  const changes: AttributeChange[] = [];
  for (const slot of missions) {
    if (!slot.mission) continue;
    for (const event of slot.mission.placedOn ?? []) {
      const change = attributeModelOf(event)?.eventAttributes?.(event, slot, target, missions);
      if (change) changes.push(change);
    }
    const change = attributeModelOf(slot.mission)?.missionAttributes?.(slot.mission, slot, target, missions);
    if (change) changes.push(change);
  }
  for (const event of core) {
    const change = attributeModelOf(event)?.coreAttributes?.(event, target, missions);
    if (change) changes.push(change);
  }
  return changes;
}

const total = (base: number, changes: AttributeChange[], key: keyof AttributeChange): number =>
  Math.max(0, changes.reduce((sum, c) => sum + (c[key] ?? 0), base));

// A personnel's Integrity, Cunning and Strength on the table as it stands (#1664): the printed values
// plus every attribute model that applies, each never below 0. With `cardText` false, the setting
// "Apply card text to attributes" off (#1668), the printed values.
export function personnelAttributesOnTable(
  missions: MissionSlot[],
  core: CardInstance[],
  p: CardInstance,
  cardText = true
): PersonnelAttributes {
  const changes = cardText ? changesTo(missions, core, p) : [];
  return {
    integrity: total(printed(p, 'integrity'), changes, 'integrity'),
    cunning: total(printed(p, 'cunning'), changes, 'cunning'),
    strength: total(printed(p, 'strength'), changes, 'strength'),
  };
}

// A ship's Weapons and Shields on the table as it stands (#1664): the printed values plus every
// attribute model that applies, each never below 0. With `cardText` false (#1668), the printed values.
export function shipAttributesOnTable(
  missions: MissionSlot[],
  core: CardInstance[],
  ship: CardInstance,
  cardText = true
): ShipAttributes {
  const changes = cardText ? changesTo(missions, core, ship) : [];
  return {
    weapons: total(printed(ship, 'weapons'), changes, 'weapons'),
    shields: total(printed(ship, 'shields'), changes, 'shields'),
  };
}
