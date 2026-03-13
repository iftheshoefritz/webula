export const AFFILIATION_ABBREVIATIONS: Record<string, string> = {
  'bajoran':     '[baj]',
  'borg':        '[bor]',
  'cardassian':  '[car]',
  'dominion':    '[dom]',
  'federation':  '[fed]',
  'ferengi':     '[fer]',
  'klingon':     '[kli]',
  'non-aligned': '[na]',
  'romulan':     '[rom]',
  'starfleet':   '[sf]',
  'vidiian':     '[vid]',
};

export const CARD_TYPES: string[] = [
  'Dilemma',
  'Equipment',
  'Event',
  'Interrupt',
  'Mission',
  'Personnel',
  'Ship',
];

export const QUADRANTS: string[] = ['Alpha', 'Gamma', 'Delta'];

export const STAFF_OPTIONS: string[] = ['st', 'cmd'];

export const HOF_OPTIONS: string[] = ['y', 'n'];

export const UNIQUE_OPTIONS: string[] = ['y', 'n'];

export const MISSION_OPTIONS: string[] = ['p', 's', 'h'];

export const DILEMMA_TYPES: string[] = ['d', 's', 'p'];

export const AFFILIATION_ICONS: Record<string, string> = {
  'bajoran': '/icons/icon_affiliation_bajoran.gif',
  'borg': '/icons/icon_affiliation_borg.gif',
  'cardassian': '/icons/icon_affiliation_cardassian.gif',
  'dominion': '/icons/icon_affiliation_dominion.gif',
  'federation': '/icons/icon_affiliation_federation.gif',
  'ferengi': '/icons/icon_ferengi.gif',
  'klingon': '/icons/icon_affiliation_klingon.gif',
  'non-aligned': '/icons/icon_nonaligned.gif',
  'romulan': '/icons/icon_affiliation_romulan.gif',
  'starfleet': '/icons/icon_affiliation_starfleet.gif',
  'vidiian': '/icons/icons_affiliation_vidiian.png',
};

export const CARD_ICON_IMAGES: Record<string, string | null> = {
  'au': '/icons/icon_au.gif',
  'cmd': '/icons/icon_command.gif',
  'ds9': '/icons/icon_ds9.gif',
  'e': '/icons/icon_earth.gif',
  'fut': '/icons/icon_future.gif',
  'maq': '/icons/icon_maquis.gif',
  'pa': '/icons/icon_past.gif',
  'stf': '/icons/icon_staff.gif',
  'tn': '/icons/icon_teroknor.gif',
  'tng': '/icons/icon_tng.gif',
  'tos': '/icons/icon_tos.gif',
  'voy': '/icons/icon_voyager.gif',
};

export const DILEMMA_TYPE_ICONS: Record<string, string | null> = {
  'd': '/icons/icon_dual.gif',
  's': '/icons/icon_space.gif',
  'p': '/icons/icon_planet.gif',
};

export const MISSION_TYPE_ICONS: Record<string, string | null> = {
  'p': '/icons/icon_planet.gif',
  's': '/icons/icon_space.gif',
  'h': '/icons/icon_headquarters.gif',
};

export const SKILLS: string[] = [
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

export function missionRequirements(card: { name: string; skills: string }): Record<string, number> {
  const count: Record<string, number> = {};
  console.log("unparsed: " + card.name + " requirements is: " + card.skills);
  card.skills.split(',').forEach((token) => {
    var match = /(\d?)\s(\S+)/.exec(token);
    if (match !== null) {
      if (SKILLS.includes(match[2])) {
        count[match[2]] = (count[match[2]] || 0) + (match[1] ? parseInt(match[1]) : 1);
      }
    }
  });
  console.log("parsed: " + card.name + " requirements is: ");
  console.log(count);
  return count;
}
