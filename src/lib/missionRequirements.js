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
  { label: '[Baj] (personnel)', value: '[Baj]' },
  { label: '[Bor] (personnel)', value: '[Bor]' },
  { label: '[Car] (personnel)', value: '[Car]' },
  { label: '[Dom] (personnel)', value: '[Dom]' },
  { label: '[Fed] (personnel)', value: '[Fed]' },
  { label: '[Fer] (personnel)', value: '[Fer]' },
  { label: '[Hir] (personnel)', value: '[Hir]' },
  { label: '[Kaz] (personnel)', value: '[Kaz]' },
  { label: '[Kli] (personnel)', value: '[Kli]' },
  { label: '[NA] (personnel)', value: '[NA]' },
  { label: '[Rom] (personnel)', value: '[Rom]' },
  { label: '[SF] (personnel)', value: '[SF]' },
  { label: '[Vid] (personnel)', value: '[Vid]' },
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
