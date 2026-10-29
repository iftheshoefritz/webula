import { readFileSync } from 'fs';
import { join } from 'path';
import { PersonnelGain, parseGains, personnelGainsOf } from '../../../lib/dilemmaBot/gains';
import { BOT_SKILLS, parseRequirementBranches } from '../../../lib/dilemmaBot/requirements';
import { BotAttempt, botPersonnelOf, playStack, requirementProfileOf, seededRandom } from '../../../lib/dilemmaBot/simulator';

// The rows are read by hand and lowercased as `parseCardData` does: Jest does not load the real d3.
const data = (() => {
  const [head, ...rows] = readFileSync(join(process.cwd(), 'public', 'cards_with_processed_columns.txt'), 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\t').map((cell) => cell.replace(/^"|"$/g, '').replace(/""/g, '"')));
  return rows.map((r) => {
    const row = Object.fromEntries(head.map((h, i) => [h.toLowerCase(), (r[i] ?? '').toLowerCase()])) as Record<
      string,
      string
    > & { name: string };
    row.originalName = r[head.indexOf('Name')];
    return row;
  });
})();

const ATTRIBUTE_NAMES = ['integrity', 'cunning', 'strength'];

/** A gain in a form to read in review: "facing: attributes +1; diplomacy, 2 leadership". */
function gainText(gain: PersonnelGain): string {
  const [i, c, s] = gain.attrs;
  const attrs =
    i && i === c && c === s
      ? [`attributes +${i}`]
      : gain.attrs.flatMap((d, k) => (d ? [`${ATTRIBUTE_NAMES[k]} +${d}`] : []));
  const skills = gain.skills.flatMap((n, k) => (n ? [n > 1 ? `${n} ${BOT_SKILLS[k]}` : BOT_SKILLS[k]] : []));
  return `${gain.condition}: ${[attrs.join(', '), skills.join(', ')].filter(Boolean).join('; ')}`;
}

const gainsOf = (gametext: string) => parseGains(gametext).map(gainText);

const row = (gametext: string, skills = '', attrs: [number, number, number] = [5, 5, 5]) => ({
  name: 'test personnel',
  cost: '2',
  integrity: String(attrs[0]),
  cunning: String(attrs[1]),
  strength: String(attrs[2]),
  skills,
  gametext,
});

const skillOf = (skills: number[], name: string) => skills[BOT_SKILLS.indexOf(name)];

describe('parseGains', () => {
  it('reads an attribute change and a skill list with a level', () => {
    expect(
      gainsOf('while this personnel is facing a dilemma, he is attributes +1 and gains diplomacy, 2 leadership, officer and physics.'),
    ).toEqual(['facing: attributes +1; diplomacy, 2 leadership, officer, physics']);
  });

  it('reads one attribute, and the form without "this personnel is"', () => {
    expect(gainsOf('while this personnel is facing a dilemma, she is strength +2 and gains security.')).toEqual([
      'facing: strength +2; security',
    ]);
    expect(gainsOf('while facing a dilemma, this personnel gains intelligence and treachery.')).toEqual([
      'facing: intelligence, treachery',
    ]);
  });

  it('keeps the self part of a sentence and drops the gain of "each … present"', () => {
    expect(
      gainsOf('while this personnel is facing a dilemma, he gains diplomacy and officer and each cadet present is attributes +1.'),
    ).toEqual(['facing: diplomacy, officer']);
  });

  it('gives no gain for a choice, a count, a loss, a condition or a qualified clause', () => {
    for (const text of [
      'while this personnel is facing a dilemma, you may discard a card from hand to make him attributes +2.',
      'while this personnel is facing a dilemma, he may gain security and a skill from a changeling present.',
      'while this personnel is facing a dilemma, he is cunning +1 for each equipment he is equipped with (limit +3).',
      'while this personnel is facing a dilemma, he is cunning -2 and loses astrometrics and navigation.',
      'while this personnel is facing a dilemma, if another gatherer is present, this personnel is attributes +1.',
      'while this personnel is facing a dilemma at a [dq] mission, she is attributes +4.',
      'while this personnel is facing a dilemma that requires officer or security at a [dq] mission, he is attributes +2 and gains security.',
      'while this personnel is facing a dilemma and you have a [maq] personnel present, this personnel is attributes +1 and gains intelligence.',
      'while this personnel is facing a dilemma, each of your security personnel present is strength +1.',
      'each of your other [baj] personnel present is integrity +1 (or +2 while facing a dilemma).',
      'while this personnel is facing a dilemma, he gains flying.',
    ]) {
      expect(gainsOf(text)).toEqual([]);
    }
  });
});

describe('the gains of the card data', () => {
  const byName = (name: string) => data.find((c) => c.originalName === name)!;

  it('reads the named cards', () => {
    expect(personnelGainsOf(byName('Tim Watters Valiant Captain')).map(gainText)).toEqual([
      'facing: attributes +1; diplomacy, 2 leadership, officer, physics',
    ]);
    expect(personnelGainsOf(byName('Seven of Nine Representative of the Hive')).map(gainText)).toEqual([
      'facing: strength +2; security',
    ]);
    expect(personnelGainsOf(byName('Kira Nerys Starfleet Emissary'))).toEqual([]);
    expect(personnelGainsOf(byName('Kathryn Janeway Forceful Captain'))).toEqual([]);
  });

  // Every personnel the parser or the override table gives a gain, so a wrong parse shows in review.
  it('lists every personnel with a gain', () => {
    const lines = new Set<string>();
    for (const c of data) {
      if (c.type !== 'personnel') continue;
      const gains = personnelGainsOf(c);
      if (gains.length) lines.add(`${c.originalName} | ${gains.map(gainText).join(' | ')}`);
    }
    expect(Array.from(lines).sort()).toEqual([
      'Charles Tucker III "Trip" (Promo) | facing: leadership, security',
      'Charles Tucker III "Trip" | facing: leadership, security',
      'Data Aspirer (Promo) | facing: integrity +2; honor',
      'Data Aspirer | facing: integrity +2; honor',
      'Donatra Compassionate Patriot | facing: honor, security',
      'Dorian Collins Acting Chief Petty Officer | facing: attributes +1; anthropology, engineer, geology, honor, transporters',
      'Gilora Rejal Subspace Researcher | facing: physics, science',
      'Jadzia Dax Science Officer (SS) | facing: geology, physics',
      'Jadzia Dax Science Officer *VP | facing: geology, physics',
      'Jadzia Dax Science Officer | facing: geology, physics',
      'Jean Hajar Nova Squadron Navigator *VP | facing: attributes +1; astrometrics, navigation, physics, security, transporters',
      'Jean Hajar Nova Squadron Navigator | facing: attributes +1; astrometrics, navigation, physics, security, transporters',
      'Karen Farris Rigorous Leader | facing: attributes +1; astrometrics, engineer, leadership, officer, security',
      'Nicholas Locarno Nova Squadron Leader | facing: diplomacy, leadership, navigation, officer, treachery',
      'Riley Shepard Confident Cadet | facing: attributes +1; biology, 2 navigation, programming, security',
      'Rom Diagnostic and Repair Technician | facing: attributes +1; astrometrics, honor, physics',
      'Seth Matthews Red Squad Cadet | facing: exobiology, science',
      'Seven of Nine Representative of the Hive (FOW) | facing: strength +2; security',
      'Seven of Nine Representative of the Hive (Promo) | facing: strength +2; security',
      'Seven of Nine Representative of the Hive | facing: strength +2; security',
      'Sito Jaxa Nova Squadron Pilot | facing: attributes +1; engineer, navigation, programming, science, transporters',
      'Tim Watters Valiant Captain | facing: attributes +1; diplomacy, 2 leadership, officer, physics',
      'Wesley Crusher Prodigy | facing: engineer, exobiology, navigation, science',
      'William Ross "Temporary" Ally *VP | facing: intelligence, treachery',
      'William Ross "Temporary" Ally | facing: intelligence, treachery',
      'William T. Riker Number One *VP | facing: anthropology, security',
      'William T. Riker Number One | facing: anthropology, security',
    ]);
  });
});

describe('the two profiles in a play', () => {
  const MEDICAL = 'while this personnel is facing a dilemma, this personnel gains medical.';

  it('builds the dilemma profile with the gain and the requirements profile without it', () => {
    const p = botPersonnelOf(row('while this personnel is facing a dilemma, she is strength +2 and gains medical.', 'medical'));
    expect(p.attrs).toEqual([5, 5, 7]);
    expect(skillOf(p.skills, 'medical')).toBe(2);
    expect(requirementProfileOf(p).attrs).toEqual([5, 5, 5]);
    expect(skillOf(requirementProfileOf(p).skills, 'medical')).toBe(1);
  });

  it('raises the level of a skill the personnel has, not the count of different skills', () => {
    const p = botPersonnelOf(row(MEDICAL, 'medical'));
    expect(skillOf(p.skills, 'medical')).toBe(2);
    expect(p.skills.filter((n) => n > 0)).toHaveLength(1);
  });

  it('counts a gained skill in a dilemma check and not in the requirements check', () => {
    // Trickery stops all three unless they have 2 Officer: two of them gain Officer while facing it.
    const officer = 'while this personnel is facing a dilemma, he gains officer.';
    const group = [botPersonnelOf(row(officer)), botPersonnelOf(row(officer)), botPersonnelOf(row(MEDICAL))];
    const attempt: BotAttempt = {
      personnel: group,
      requirements: parseRequirementBranches('2 Officer, Medical')!,
      gameOnMission: 0,
      choice: 'best',
    };
    const result = playStack(attempt, ['trickery'], seededRandom(1));
    expect(result.stopped).toBe(0);
    // The group meets 2 Officer and Medical only with the gains, which the requirements check leaves out.
    expect(result.fail).toBe(true);

    const plain = { ...attempt, personnel: [row(''), row(''), row('')].map(botPersonnelOf) };
    expect(playStack(plain, ['trickery'], seededRandom(1)).stopped).toBe(3);
  });

  it('changes a dilemma attribute check and not the requirements check', () => {
    // Move Along Home stops all three when the highest Strength is even: 7 + 2 = 9 is odd.
    const strength = 'while this personnel is facing a dilemma, he is strength +2.';
    const group = [row(strength, '', [5, 5, 7]), row(strength, '', [5, 5, 7]), row(strength, '', [5, 5, 7])].map(botPersonnelOf);
    const attempt: BotAttempt = {
      personnel: group,
      requirements: parseRequirementBranches('Strength>21')!,
      gameOnMission: 0,
      choice: 'best',
    };
    const result = playStack(attempt, ['moveAlongHome'], seededRandom(1));
    expect(result.stopped).toBe(0);
    // 3 × 7 = 21 is not above 21; the gained 3 × 9 = 27 would be.
    expect(result.fail).toBe(true);

    const even = { ...attempt, personnel: [row('', '', [5, 5, 8]), row('', '', [5, 5, 8]), row('', '', [5, 5, 8])].map(botPersonnelOf) };
    expect(playStack(even, ['moveAlongHome'], seededRandom(1)).stopped).toBe(3);
  });
});
