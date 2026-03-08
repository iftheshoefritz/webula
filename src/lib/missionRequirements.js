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
