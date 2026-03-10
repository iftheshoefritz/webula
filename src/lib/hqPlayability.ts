// Static mapping of HQ identifiers to predicates that determine which cards
// can be played at (report to) each headquarters mission.
//
// Card data is lowercased by useDataFetching, so all comparisons are lowercase.
// "[Baj] cards" = cards with Bajoran affiliation
// "[DS9] cards" = cards with the DS9 series icon
// "[NA] cards"  = Non-Aligned cards
// "equipment"   = cards of type Equipment

type CardRow = Record<string, any>;
type HQPredicate = (card: CardRow) => boolean;

const isNA = (card: CardRow): boolean => card.affiliation.includes('non-aligned');
const isEquipment = (card: CardRow): boolean => card.type === 'equipment';

export const HQ_PLAYABILITY: Record<string, HQPredicate> = {
  // Bajoran Headquarters (Bajor Gift of the Prophets, Bajor Blessed of the Prophets)
  // "You may play [Baj] cards, [NA] cards, and equipment at this mission."
  'bajor': (card) => card.affiliation.includes('bajoran') || isNA(card) || isEquipment(card),
  'bajoran': (card) => card.affiliation.includes('bajoran') || isNA(card) || isEquipment(card),

  // Bajoran/Federation Headquarters (Mouth of the Wormhole Deep Space 9)
  // "You may play [DS9] cards, [NA] cards, and equipment at this mission."
  'ds9': (card) => card.icons.includes('[ds9]') || isNA(card) || isEquipment(card),

  // Federation Headquarters (Earth Cradle of the Federation)
  // "You may play [TNG] cards, [E] cards, [NA] cards, and equipment at this mission."
  'earth': (card) => card.icons.includes('[tng]') || card.icons.includes('[e]') || isNA(card) || isEquipment(card),

  // Federation Headquarters (Earth Home of Starfleet Command)
  // "You may play [Fed][DS9] cards, [E] cards, [NA] cards, and equipment at this mission."
  'homeofstarfleet': (card) =>
    (card.affiliation.includes('federation') && card.icons.includes('[ds9]')) ||
    card.icons.includes('[e]') || isNA(card) || isEquipment(card),

  // Federation Headquarters (Earth Lush and Beautiful Home)
  // "You may play [TOS] cards, [NA] cards, and equipment at this mission."
  'earthtos': (card) => card.icons.includes('[tos]') || isNA(card) || isEquipment(card),

  // Cardassian Headquarters (Cardassia Prime)
  // "You may play [Car] cards, [NA] cards, and equipment at this mission."
  'cardassia': (card) => card.affiliation.includes('cardassian') || isNA(card) || isEquipment(card),
  'cardassian': (card) => card.affiliation.includes('cardassian') || isNA(card) || isEquipment(card),

  // Cardassian/Dominion Headquarters (Mouth of the Wormhole Terok Nor)
  // "You may play [TN] cards, [NA] cards, and equipment at this mission."
  'terokNor': (card) => card.icons.includes('[tn]') || isNA(card) || isEquipment(card),
  'terok_nor': (card) => card.icons.includes('[tn]') || isNA(card) || isEquipment(card),

  // Dominion Headquarters (Founders' Homeworld)
  // "You may play [Dom] cards, [NA] cards, and equipment at this mission."
  'founders': (card) => card.affiliation.includes('dominion') || isNA(card) || isEquipment(card),
  'dominion': (card) => card.affiliation.includes('dominion') || isNA(card) || isEquipment(card),

  // Ferengi Headquarters (Ferenginar)
  // "You may play [Fer] cards, [NA] cards, and equipment at this mission."
  'ferenginar': (card) => card.affiliation.includes('ferengi') || isNA(card) || isEquipment(card),
  'ferengi': (card) => card.affiliation.includes('ferengi') || isNA(card) || isEquipment(card),

  // Klingon Headquarters (Qo'noS Heart of the Empire)
  // "You may play [Kli] cards, [NA] cards, and equipment at this mission."
  'qonos': (card) => card.affiliation.includes('klingon') || isNA(card) || isEquipment(card),
  'klingon': (card) => card.affiliation.includes('klingon') || isNA(card) || isEquipment(card),

  // Romulan Headquarters (Romulus Seat of Power)
  // "You may play [Rom] cards, [NA] cards, and equipment at this mission."
  'romulus': (card) => card.affiliation.includes('romulan') || isNA(card) || isEquipment(card),
  'romulan': (card) => card.affiliation.includes('romulan') || isNA(card) || isEquipment(card),

  // Borg Headquarters (Unicomplex Root of the Hive Mind)
  // "You may play [Bor] cards and equipment at this mission." (no NA)
  'unicomplex': (card) => card.affiliation.includes('borg') || isEquipment(card),
  'borg': (card) => card.affiliation.includes('borg') || isEquipment(card),

  // Starfleet Headquarters (Earth Humanity's Home)
  // "You may play [SF] cards, [NA] cards, and equipment at this mission."
  'starfleet': (card) => card.affiliation.includes('starfleet') || isNA(card) || isEquipment(card),

  // Maquis Headquarters (Athos IV Maquis Base)
  // "You may play [Maq] cards, [NA] cards, and equipment at this mission."
  'maquis': (card) => card.icons.includes('[maq]') || isNA(card) || isEquipment(card),

  // Vidiian Headquarters (Vidiia Locus of Infection)
  // "You may play [Vid] cards, [NA] cards, and equipment at this mission."
  'vidiian': (card) => card.affiliation.includes('vidiian') || isNA(card) || isEquipment(card),
};
