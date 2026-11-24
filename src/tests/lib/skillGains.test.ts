import { initialTableState, CardInstance, TableState, MISSION_SLOTS } from '../../app/decks/practice/tableReducer';
import { pileTableInputOf } from '../../app/decks/practice/attempt';
import { modifierCardOf, tableViewOf } from '../../app/decks/practice/tableView';
import { modifierRowsOf, skillsGainedOf } from '../../lib/modifiers';

// Issue #1836: the skills a card gives to other personnel, a quantity of the modifier rows, read by the dilemma bot
// under "Apply card text to attributes". The titles are real; the rows hold only the fields the readers use, and the
// personnel are invented.

const card = (id: string, row: Record<string, unknown>): CardInstance => ({
  id,
  card: { collectorsinfo: id, imagefile: id, unique: 'n', gametext: '', cost: '1', ...row } as CardInstance['card'],
  face: 'up',
});
const named = (id: string, name: string, type: string, extra: Record<string, unknown> = {}) =>
  card(id, { type, name: name.toLowerCase(), originalName: name, ...extra });
const person = (id: string, skills: string, extra: Record<string, unknown> = {}) =>
  named(id, `Crewman ${id}`, 'personnel', { skills, integrity: '5', cunning: '5', strength: '5', ...extra });
const equipment = (id: string, name: string) => named(id, name, 'equipment');

const planet = (quadrant = 'a') => named(`m-${quadrant}`, 'Moab IV', 'mission', { missiontype: 'p', quadrant });
const space = named('m-s', 'Bilana System', 'mission', { missiontype: 's', quadrant: 'a' });

function table(awayTeam: CardInstance[], other: CardInstance[] = [], ship?: CardInstance, quadrant = 'a'): TableState {
  return {
    ...initialTableState,
    missions: Array.from({ length: MISSION_SLOTS }, (_, i) => ({
      mission: i === 0 ? planet(quadrant) : i === 1 ? planet() : i === 2 ? space : null,
      ships: i === 2 && ship ? [ship] : [],
      awayTeam: i === 0 ? awayTeam : i === 1 ? other : [],
      underMission: [],
    })),
  };
}

const gained = (t: TableState, c: CardInstance) => skillsGainedOf(tableViewOf(t), modifierCardOf(c));
const botSkills = (t: TableState, id: string, cardText = true, missionIndex = 0, shipId?: string) =>
  String(pileTableInputOf(t, missionIndex, shipId, cardText).cards.find((c) => c.id === id)?.card?.skills ?? '');

describe("Purple Data's Head (#1836)", () => {
  const head = equipment('head', "Purple Data's Head");
  const sci = person('sci', 'Science Physics');
  const uniqueSci = person('usci', 'Science', { unique: 'y' });
  const eng = person('eng', 'Engineer');
  const elsewhere = person('far', 'Science');
  const t = table([head, sci, uniqueSci, eng], [elsewhere]);

  it('is a skills row of an equipment for its group', () => {
    expect(modifierRowsOf("purple data's head").map((r) => [r.source, r.target, r.changes.skills?.gain])).toEqual([
      ['group', 'group', ['Exobiology', 'Programming', 'Transporters']],
    ]);
  });

  it('gives a non-unique Science personnel present its three skills, and no other', () => {
    expect(gained(t, sci)).toEqual(['Exobiology', 'Programming', 'Transporters']);
    expect(gained(t, uniqueSci)).toEqual([]);
    expect(gained(t, eng)).toEqual([]);
    expect(gained(t, elsewhere)).toEqual([]);
  });

  it("hands them to the bot with the card text on, and changes nothing with it off", () => {
    expect(botSkills(t, 'sci')).toBe('Science Physics Exobiology Programming Transporters');
    expect(botSkills(t, 'usci')).toBe('Science');
    expect(botSkills(t, 'sci', false)).toBe('Science Physics');
  });
});

describe('the shipped-deck skill rows (#1836)', () => {
  it('Engineering PADD, Science PADD and Universal Translator give their skill to the personnel present', () => {
    const eng = person('eng', 'Engineer');
    const sci = person('sci', 'Science');
    const off = person('off', 'Officer');
    const t = table([equipment('p1', 'Engineering PADD'), equipment('p2', 'Science PADD'), equipment('p3', 'Universal Translator'), eng, sci, off]);
    expect(gained(t, eng)).toEqual(['Astrometrics']);
    expect(gained(t, sci)).toEqual(['Archaeology']);
    expect(gained(t, off)).toEqual(['Diplomacy']);
    expect(botSkills(t, 'off')).toBe('Officer Diplomacy');
  });

  it('Hyperspanner gives its skills only at a [GQ] planet mission', () => {
    const eng = person('eng', 'Engineer');
    const spanner = equipment('hs', 'Hyperspanner');
    expect(gained(table([spanner, eng], [], undefined, 'g'), eng)).toEqual(['Anthropology', 'Geology']);
    expect(gained(table([spanner, eng], [], undefined, 'a'), eng)).toEqual([]);
  });

  it('Think Tank Ship Ivory Tower gives Telepathy to the Think Tank personnel aboard it', () => {
    const thinker = person('tt', 'Physics', { keywords: 'think tank.' });
    const other = person('o', 'Physics');
    const ship = { ...named('ivory', 'Think Tank Ship Ivory Tower', 'ship'), crew: [thinker, other] };
    const t = table([], [], ship);
    expect(gained(t, thinker)).toEqual(['Telepathy']);
    expect(gained(t, other)).toEqual([]);
    expect(botSkills(t, 'tt', true, 2, 'ivory')).toBe('Physics Telepathy');
  });
});
