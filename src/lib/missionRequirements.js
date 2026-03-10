export const AFFILIATIONS = [
  { label: 'Bajoran', value: 'Bajoran' },
  { label: 'Borg', value: 'Borg' },
  { label: 'Cardassian', value: 'Cardassian' },
  { label: 'Dominion', value: 'Dominion' },
  { label: 'Federation', value: 'Federation' },
  { label: 'Ferengi', value: 'Ferengi' },
  { label: 'Hirogen', value: 'Hirogen' },
  { label: 'Kazon', value: 'Kazon' },
  { label: 'Klingon', value: 'Klingon' },
  { label: 'Non-Aligned', value: 'Non-Aligned' },
  { label: 'Romulan', value: 'Romulan' },
  { label: 'Starfleet', value: 'Starfleet' },
  { label: 'Vidiian', value: 'Vidiian' },
];

export const AFFILIATION_ABBREVIATIONS = {
  'bajoran':     '[baj]',
  'borg':        '[bor]',
  'cardassian':  '[car]',
  'dominion':    '[dom]',
  'federation':  '[fed]',
  'ferengi':     '[fer]',
  'hirogen':     '[hir]',
  'kazon':       '[kaz]',
  'klingon':     '[kli]',
  'non-aligned': '[na]',
  'romulan':     '[rom]',
  'starfleet':   '[sf]',
  'vidiian':     '[vid]',
};

export const CARD_TYPES = [
  'Dilemma',
  'Equipment',
  'Event',
  'Interrupt',
  'Mission',
  'Personnel',
  'Ship',
];

export const QUADRANTS = ['Alpha', 'Gamma', 'Delta'];

export const STAFF_OPTIONS = ['st', 'cmd'];

export const HOF_OPTIONS = ['y', 'n'];

export const UNIQUE_OPTIONS = ['y', 'n'];

export const MISSION_OPTIONS = ['p', 's', 'h'];

export const DILEMMA_TYPES = ['d', 's', 'p'];

export const ICONS = [
  'AU',
  'Cmd',
  'DS9',
  'E',
  'Fut',
  'Maq',
  'Pa',
  'Stf',
  'TN',
  'TNG',
  'TOS',
  'Voy',
];

export const KEYWORDS = [
  'Admiral',
  'Alpha',
  'Artifact',
  'Assassin',
  'Assault',
  'Bajoran Resistance',
  'Bluegill',
  'Cadet',
  'Capture',
  'Chancellor',
  'Chef',
  'Cloaking Device',
  'Commander',
  'Commodity',
  'Consume',
  'Crime',
  'Dabo Girl',
  'Decay',
  'Dissident',
  'Drone',
  'Founder',
  'Gatherer',
  'General',
  'Genetically Enhanced',
  'Glinn',
  'Gul',
  'Hand Weapon',
  'Harbinger',
  'High Council Member',
  'Holoprogram',
  'Host',
  'Infiltration',
  'Infiltrator',
  'Interlink',
  'Kai',
  'Legate',
  'MACO',
  'Maneuver',
  'Mirror',
  'Morph',
  'Nebula',
  'Nucleogenic',
  'Orb',
  'Pah-wraith',
  'Paranoia',
  'Persistent',
  'Praetor',
  'Prophet',
  'Prylar',
  'Punishment',
  'Pursuit',
  'Q',
  'Recall',
  'Region: Arkaria System',
  'Region: Badlands',
  'Region: Bajor System',
  'Region: Borderland',
  'Region: Briar Patch',
  'Region: Cardassia System',
  'Region: Delphic Expanse',
  'Region: Demilitarized Zone',
  'Region: Great Barrier',
  'Region: Ligos System',
  'Region: Nekrit Expanse',
  'Region: Neutral Zone',
  'Region: Omarion Nebula',
  'Region: Omicron Theta System',
  'Region: Orias System',
  "Region: Qo'noS System",
  'Region: Rakhari Sector',
  'Region: Romulus System',
  'Region: Sector 001',
  'Region: Sector 500',
  'Region: Stakoron System',
  'Region: The Void',
  'Region: Varria System',
  'Replicate',
  'Ritual',
  'Rule',
  'Senator',
  'Shape-shifter',
  'Smuggler',
  'Species 8472',
  'Temporal',
  'Thief',
  'Think Tank',
  'Tsunkatse',
  'Vedek',
  'Waiter',
];

export const SKILLS = [
  'Acquisition',
  'Anthropology',
  'Archaeology',
  'Astrometrics',
  'Biology',
  'Diplomacy',
  'Engineer',
  'Exobiology',
  'Geology',
  'Honor',
  'Intelligence',
  'Law',
  'Leadership',
  'Medical',
  'Navigation',
  'Officer',
  'Physics',
  'Programming',
  'Science',
  'Security',
  'Telepathy',
  'Transporters',
  'Treachery',
]

export function missionRequirements(card) {
  const count = {};
  console.log("unparsed: " + card.name + " requirements is: " + card.skills);
  card.skills.split(',').forEach((token) => {
    var match = /(\d?)\s(\S+)/.exec(token);
    if (match !== null) {
      if (SKILLS.includes(match[2])) {
        count[match[2]] = (count[match[2]] || 0) + (match[1] || 1);
      }
    }
  });
  console.log("parsed: " + card.name + " requirements is: ");
  console.log(count);
  return count;
}
