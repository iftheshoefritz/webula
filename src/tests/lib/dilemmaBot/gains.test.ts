import { readFileSync } from 'fs';
import { join } from 'path';
import {
  PARTNER_TRAIT_WORDS,
  BotTableFacts,
  PartnerRequirement,
  PartnerTest,
  PersonnelGain,
  SkillLoss,
  TableCondition,
  asSphere117Dissident,
  attemptedMissionOf,
  parseGains,
  personnelGainsOf,
  personnelLossOf,
} from '../../../lib/dilemmaBot/gains';
import { AFFILIATION_ABBREVIATIONS } from '../../../lib/deckPlayability';
import { BOT_SKILLS, RequirementBranch, parseRequirementBranches } from '../../../lib/dilemmaBot/requirements';
import { chooseStack, scoreStack } from '../../../lib/dilemmaBot/search';
import { DilemmaId } from '../../../lib/dilemmaBot/opponentPile';
import { BotCardRow, botAttemptOf } from '../../../lib/dilemmaBot/botAttempt';
import { botTableFactsOf } from '../../../app/decks/practice/attempt';
import { CardInstance, initialTableState, MissionSlot, TableState } from '../../../app/decks/practice/tableReducer';
import {
  BotAttempt,
  botPersonnelOf,
  partnerGainEntriesOf,
  partnerGroupOf,
  partnerTraitsOf,
  playStack,
  requirementProfileOf,
  seededRandom,
  withPartnerGains,
} from '../../../lib/dilemmaBot/simulator';

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

const affiliationToken = (affiliation: string) =>
  Object.keys(AFFILIATION_ABBREVIATIONS).find((token) => AFFILIATION_ABBREVIATIONS[token] === affiliation);

/** One partner test in a form to read in review: "[rom] dissident", "[baj] leadership personnel". */
const testText = (t: PartnerTest) =>
  [
    t.affiliation ? affiliationToken(t.affiliation) : '',
    t.notAffiliation ? `non-${affiliationToken(t.notAffiliation)}` : '',
    ...(t.icons ?? []),
    ...(t.skills ?? []).map((i) => BOT_SKILLS[i]),
    ...(t.traits ?? []),
    ...(t.notTraits ?? []).map((w) => `non-${w}`),
    t.title ? `{${t.title}}` : '',
    t.personnel ? 'personnel' : '',
  ]
    .filter(Boolean)
    .join(' ');

/** A partner in a form to read in review: "[rom] dissident", "3 [pa]", "dissident or [fed] [cmd]". */
function partnerText({ anyOf, count }: PartnerRequirement): string {
  return `${count > 1 ? `${count} ` : ''}${anyOf.map(testText).join(' or ')}`;
}

/**
 * A table condition in a form to read in review: "no completed missions", "2+ completed space
 * missions", "1- completed missions", "1+ navigation personnel in discard", "10+ cards in discard",
 * "1+ events in core".
 */
function tableText(t: TableCondition): string {
  const range = t.max === 0 ? 'no' : t.min !== undefined ? `${t.min}+` : `${t.max}-`;
  if (t.count === 'completedMissions') {
    return `${range} completed ${t.missiontype === 's' ? 'space ' : t.missiontype === 'p' ? 'planet ' : ''}missions`;
  }
  if (t.count === 'coreEvents') return `${range} events in core`;
  if (t.count === 'commanded') return `${range} ${t.anyOf!.map(testText).join(' or ')} commanded`;
  return `${range} ${t.anyOf!.map(testText).join(' or ') || 'cards'} in discard`;
}

/**
 * A gain in a form to read in review: "facing: attributes +1; diplomacy, 2 leadership", or with its
 * mission condition, "attempting space: attributes +1; diplomacy, law", "facing [dq]: attributes +4".
 * A partner gain reads "present with [rom] dissident: …", or "facing with [maq]: …" for the facing form.
 * A table gain, always `'attempting'`, reads "while no completed missions: …" (#1352). A gain of the
 * next ability of a skill loss ends in " (next ability)" (#1360).
 */
function gainText(gain: PersonnelGain): string {
  const [i, c, s] = gain.attrs;
  const attrs =
    i && i === c && c === s
      ? [`attributes +${i}`]
      : gain.attrs.flatMap((d, k) => (d ? [`${ATTRIBUTE_NAMES[k]} +${d}`] : []));
  const skills = gain.skills.flatMap((n, k) => (n ? [n > 1 ? `${n} ${BOT_SKILLS[k]}` : BOT_SKILLS[k]] : []));
  const m = gain.mission;
  const mission = m
    ? [
        m.missiontype === 's' ? 'space' : m.missiontype === 'p' ? 'planet' : '',
        m.quadrant ? `[${m.quadrant}q]` : '',
        m.minPoints !== undefined ? `${m.minPoints}+ points` : '',
        m.maxPoints !== undefined ? `${m.maxPoints}- points` : '',
      ].filter(Boolean)
    : [];
  const head = gain.partner
    ? `${gain.condition === 'facing' ? 'facing with' : 'present with'} ${partnerText(gain.partner)}`
    : gain.table
      ? `while ${tableText(gain.table)}`
      : [gain.condition, ...mission].join(' ');
  return `${head}: ${[attrs.join(', '), skills.join(', ')].filter(Boolean).join('; ')}${gain.nextAbility ? ' (next ability)' : ''}`;
}

/** A skill loss in a form to read in review: "loses skills while 1+ [bor] non-dissident commanded, and next ability". */
const lossText = (loss: SkillLoss) => `loses skills while ${tableText(loss.table)}${loss.nextAbility ? ', and next ability' : ''}`;

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
      'while this personnel is facing a dilemma that requires officer or security at a [dq] mission, he is attributes +2 and gains security.',
      'while this personnel is facing a dilemma, each of your security personnel present is strength +1.',
      'each of your other [baj] personnel present is integrity +1 (or +2 while facing a dilemma).',
      'while this personnel is facing a dilemma, he gains flying.',
    ]) {
      expect(gainsOf(text)).toEqual([]);
    }
  });

  it('reads an attempting clause at every mission, at a space or planet mission, and in a quadrant', () => {
    expect(gainsOf('while this personnel is attempting a mission, he gains navigation.')).toEqual(['attempting: navigation']);
    expect(gainsOf('while this personnel is attempting a space mission, he is attributes +1 and gains diplomacy and law.')).toEqual([
      'attempting space: attributes +1; diplomacy, law',
    ]);
    expect(gainsOf('while this personnel is attempting a planet mission, she gains programming.')).toEqual([
      'attempting planet: programming',
    ]);
    expect(gainsOf('while this personnel is attempting an [aq] mission, he is attributes +1.')).toEqual([
      'attempting [aq]: attributes +1',
    ]);
    expect(gainsOf('while attempting a mission, this personnel gains honor.')).toEqual(['attempting: honor']);
  });

  it('reads the points of the attempted mission', () => {
    expect(gainsOf('while this personnel is attempting a mission worth 50 or more points, he is cunning +1 and gains 2 leadership.')).toEqual([
      'attempting 50+ points: cunning +1; 2 leadership',
    ]);
    expect(gainsOf('while this personnel is attempting a mission worth 30 or fewer points, he is attributes +1.')).toEqual([
      'attempting 30- points: attributes +1',
    ]);
  });

  it('reads a facing clause at a quadrant mission, with a comma and without one', () => {
    expect(gainsOf('while this personnel is facing a dilemma at a [dq] mission, she is attributes +4.')).toEqual([
      'facing [dq]: attributes +4',
    ]);
    expect(gainsOf('while this personnel is facing a dilemma at a [dq] mission he gains security, transporters, and treachery.')).toEqual([
      'facing [dq]: security, transporters, treachery',
    ]);
  });

  it('gives no gain for an attempting clause with a choice, a count or another qualifier', () => {
    for (const text of [
      'while this personnel is attempting a mission, you may make him attributes +2 until the end of this mission attempt.',
      'while this personnel is attempting a mission, he is attributes +1 for each non-ferengi personnel present (limit +3).',
      'while this personnel is attempting a mission with an event on it, he is attributes +2.',
      'while this personnel is attempting a region: briar patch mission, he is attributes +1.',
      'while this personnel is attempting a planet mission and the first mission you completed this game was a space mission, she gains exobiology and geology.',
      'while this personnel is attempting a mission, if there are three or less dilemmas beneath that mission, he is attributes +1.',
      'while this personnel is attempting a mission, your [sf] human personnel present are integrity +1.',
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
    expect(personnelGainsOf(byName('Kathryn Janeway Forceful Captain')).map(gainText)).toEqual(['facing [dq]: attributes +4']);
    expect(personnelGainsOf(byName('William T. Riker Wistful Admiral')).map(gainText)).toEqual([
      'attempting space: attributes +1; diplomacy, law',
    ]);
    expect(personnelGainsOf(byName('Selar Frontier Physician')).map(gainText)).toEqual(['attempting planet: programming']);
  });

  // Every personnel the parser or the override table gives a gain or a skill loss (#1360), so a wrong
  // parse shows in review.
  it('lists every personnel with a gain', () => {
    const lines = new Set<string>();
    for (const c of data) {
      if (c.type !== 'personnel') continue;
      const loss = personnelLossOf(c);
      const parts = [...(loss ? [lossText(loss)] : []), ...personnelGainsOf(c).map(gainText)];
      if (parts.length) lines.add(`${c.originalName} | ${parts.join(' | ')}`);
    }
    expect(Array.from(lines).sort()).toEqual([
      'Akorem Laan Revered Poet | while 2+ [baj] personnel in discard: attributes +2',
      'Anneli | while 1+ events in core: attributes +1',
      "B'Elanna Torres Mostly Assimilated | loses skills while 1+ [bor] non-dissident commanded, and next ability",
      'Beverly Crusher Captain Picard *VP | attempting 40+ points: attributes +1; medical',
      'Beverly Crusher Captain Picard | attempting 40+ points: attributes +1; medical',
      'Bevvox Ancient Intellect | attempting 50+ points: cunning +1; 2 anthropology',
      'Bronok | attempting 30- points: attributes +1',
      'Bruce Maddox Chair of Robotics | present with android: attributes +1; exobiology, science',
      'Charles Tucker III "Trip" (Promo) | facing: leadership, security',
      'Charles Tucker III "Trip" | facing: leadership, security',
      'Cyber Drone | attempting [dq]: attributes +2',
      'Data Aspirer (Promo) | facing: integrity +2; honor',
      'Data Aspirer | facing: integrity +2; honor',
      'Deanna Troi Major Rakal (Promo) | present with [rom] dissident: attributes +1; intelligence, leadership, security',
      'Deanna Troi Major Rakal *VP | present with [rom] dissident: attributes +1; intelligence, leadership, security',
      'Deanna Troi Major Rakal | present with [rom] dissident: attributes +1; intelligence, leadership, security',
      'Donatra Compassionate Patriot | facing: honor, security',
      'Dorian Collins Acting Chief Petty Officer | facing: attributes +1; anthropology, engineer, geology, honor, transporters',
      'Dr. Leah Brahms Holographic Representation | attempting space: attributes +1; engineer',
      'Eight of Eleven Laura | loses skills while 1+ [bor] non-dissident commanded, and next ability',
      'Five of Twelve Axum | loses skills while 1+ [bor] non-dissident commanded, and next ability',
      'Gilora Rejal Subspace Researcher | facing: physics, science',
      'Hideaki Chang Conscientious Corporal | present with 3 maco: attributes +1',
      'Isotope Drone | attempting 50+ points: attributes +2',
      'Jadzia Dax Communications Staffer | present with 3 [pa]: attributes +1; anthropology',
      'Jadzia Dax Science Officer (SS) | facing: geology, physics',
      'Jadzia Dax Science Officer *VP | facing: geology, physics',
      'Jadzia Dax Science Officer | facing: geology, physics',
      'Jadzia Dax Sworn Ally *VP | present with honor klingon: attributes +1; honor',
      'Jadzia Dax Sworn Ally | present with honor klingon: attributes +1; honor',
      'Jean Hajar Nova Squadron Navigator *VP | facing: attributes +1; astrometrics, navigation, physics, security, transporters',
      'Jean Hajar Nova Squadron Navigator | facing: attributes +1; astrometrics, navigation, physics, security, transporters',
      'Julian Bashir Visiting Colleague | present with android: engineer, programming',
      'Jural | present with gul: physics',
      'Karen Farris Rigorous Leader | facing: attributes +1; astrometrics, engineer, leadership, officer, security',
      'Kathryn Janeway Forceful Captain (FOW) | facing [dq]: attributes +4',
      'Kathryn Janeway Forceful Captain *A | facing [dq]: attributes +4',
      'Kathryn Janeway Forceful Captain | facing [dq]: attributes +4',
      'Kathryn Janeway Mostly Assimilated | loses skills while 1+ [bor] non-dissident commanded, and next ability',
      'Kira Nerys Bit of a Fighter | while 10+ cards in discard: cunning +1; diplomacy, leadership, officer',
      'Kulan Militia Soldier | while 1+ navigation personnel in discard: navigation',
      'Kurros Brilliant Tactician | attempting 50+ points: cunning +1; 2 leadership',
      'Latara | attempting [gq]: honor, security',
      'Locutus Almost Human | loses skills while 1+ [bor] non-dissident commanded, and next ability',
      'Morak Pilgrim Cynic | facing [dq]: security, transporters, treachery',
      'Motura Eminent Sculptor | while 1- completed missions: attributes +1',
      'Nadia Myers | while 1+ completed space missions: navigation | while 2+ completed space missions: attributes +2',
      'Neelix Morale Officer (FOW) | facing [dq]: acquisition, honor',
      'Neelix Morale Officer | facing [dq]: acquisition, honor',
      'Nicholas Locarno Nova Squadron Leader | facing: diplomacy, leadership, navigation, officer, treachery',
      'One Peerless | loses skills while 1+ [bor] non-dissident commanded',
      'Quark Little Green Man *VP | present with [pa]: attributes +1; acquisition, diplomacy, treachery',
      'Quark Little Green Man | present with [pa]: attributes +1; acquisition, diplomacy, treachery',
      'Riley Shepard Confident Cadet | facing: attributes +1; biology, 2 navigation, programming, security',
      'Riley Shepard Smug Saboteur | present with treachery admiral: intelligence, treachery',
      'Rom Diagnostic and Repair Technician | facing: attributes +1; astrometrics, honor, physics',
      'Rom Undercover Spy (SS) | present with dissident: astrometrics, engineer, programming',
      'Rom Undercover Spy | present with dissident: astrometrics, engineer, programming',
      "S'rrel *VP | present with honor: integrity +2 | present with treachery: strength +2",
      "S'rrel | present with honor: integrity +2 | present with treachery: strength +2",
      'Scout Drone | attempting [aq]: attributes +1',
      'Selar Frontier Physician | attempting planet: programming',
      'Seth Matthews Red Squad Cadet | facing: exobiology, science',
      'Seven of Nine Annika *VP | loses skills while 1+ [bor] non-dissident commanded, and next ability | attempting [dq]: attributes +1 (next ability)',
      'Seven of Nine Annika | loses skills while 1+ [bor] non-dissident commanded, and next ability | attempting [dq]: attributes +1 (next ability)',
      'Seven of Nine Ideal Candidate | attempting 50+ points: cunning +2; exobiology',
      'Seven of Nine Representative of the Hive (FOW) | facing: strength +2; security',
      'Seven of Nine Representative of the Hive (Promo) | facing: strength +2; security',
      'Seven of Nine Representative of the Hive | facing: strength +2; security',
      'Sito Jaxa Nova Squadron Pilot | facing: attributes +1; engineer, navigation, programming, science, transporters',
      'Six of Ten Korok | loses skills while 1+ [bor] non-dissident commanded, and next ability',
      'Stefan DeSeve Disillusioned Expatriate *VP | present with dissident or [fed] [cmd]: attributes +1',
      'Stefan DeSeve Disillusioned Expatriate | present with dissident or [fed] [cmd]: attributes +1',
      'Sullin Gifted Researcher | attempting 50+ points: cunning +1; 2 transporters',
      "T'Pol Subcommander | present with human: diplomacy, exobiology",
      'The Doctor Shmullus | while no completed missions: medical, programming',
      'Third of Five Altruistic Individual | loses skills while 1+ [bor] non-dissident commanded, and next ability',
      'Tim Watters Valiant Captain | facing: attributes +1; diplomacy, 2 leadership, officer, physics',
      'Treyam Militia Soldier | while 1+ medical personnel in discard: medical',
      'Tuvok Mostly Assimilated | loses skills while 1+ [bor] non-dissident commanded, and next ability | facing [dq]: law, leadership, officer, security (next ability)',
      'Tuvok Undercover *VP | facing with [maq]: attributes +1; intelligence',
      'Tuvok Undercover | facing with [maq]: attributes +1; intelligence',
      'Varis Sul Tetrarch of the Paqu | while 1+ [baj] leadership personnel in discard: diplomacy, leadership',
      'Wesley Crusher Prodigy | facing: engineer, exobiology, navigation, science',
      'Weyoun Faithful Servant | present with {odo}: attributes +2; honor',
      'Weyoun Instrument of the Founders | present with founder: attributes +2; security',
      'William Ross "Temporary" Ally *VP | facing: intelligence, treachery',
      'William Ross "Temporary" Ally | facing: intelligence, treachery',
      'William T. Riker Number One *VP | facing: anthropology, security',
      'William T. Riker Number One | facing: anthropology, security',
      'William T. Riker Wistful Admiral | attempting space: attributes +1; diplomacy, law',
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

    const plain = { ...attempt, personnel: [row(''), row(''), row('')].map((c) => botPersonnelOf(c)) };
    expect(playStack(plain, ['trickery'], seededRandom(1)).stopped).toBe(3);
  });

  it('changes a dilemma attribute check and not the requirements check', () => {
    // Move Along Home stops all three when the highest Strength is even: 7 + 2 = 9 is odd.
    const strength = 'while this personnel is facing a dilemma, he is strength +2.';
    const group = [row(strength, '', [5, 5, 7]), row(strength, '', [5, 5, 7]), row(strength, '', [5, 5, 7])].map((c) => botPersonnelOf(c));
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

    const even = { ...attempt, personnel: [row('', '', [5, 5, 8]), row('', '', [5, 5, 8]), row('', '', [5, 5, 8])].map((c) => botPersonnelOf(c)) };
    expect(playStack(even, ['moveAlongHome'], seededRandom(1)).stopped).toBe(3);
  });
});

describe('the gains while attempting a mission (#1350)', () => {
  const NAVIGATION = 'while this personnel is attempting a space mission, he gains navigation.';
  const SPACE = { missiontype: 's', quadrant: 'a', points: '35' };
  const PLANET = { missiontype: 'p', quadrant: 'a', points: '35' };

  it('counts an attempting gain in both profiles, and only at a mission of its type', () => {
    const atSpace = botPersonnelOf(row(NAVIGATION), SPACE);
    expect(skillOf(atSpace.skills, 'navigation')).toBe(1);
    expect(skillOf(requirementProfileOf(atSpace).skills, 'navigation')).toBe(1);

    for (const p of [botPersonnelOf(row(NAVIGATION), PLANET), botPersonnelOf(row(NAVIGATION))]) {
      expect(skillOf(p.skills, 'navigation')).toBe(0);
      expect(skillOf(requirementProfileOf(p).skills, 'navigation')).toBe(0);
    }
  });

  it('counts a facing gain at a [dq] mission in the dilemma profile only, and only in that quadrant', () => {
    const janeway = 'while this personnel is facing a dilemma at a [dq] mission, she is attributes +4.';
    const atDelta = botPersonnelOf(row(janeway), { ...SPACE, quadrant: 'd' });
    expect(atDelta.attrs).toEqual([9, 9, 9]);
    expect(requirementProfileOf(atDelta).attrs).toEqual([5, 5, 5]);
    expect(botPersonnelOf(row(janeway), SPACE).attrs).toEqual([5, 5, 5]);
  });

  it('reads the points of the mission', () => {
    const fifty = 'while this personnel is attempting a mission worth 50 or more points, he is attributes +2.';
    expect(botPersonnelOf(row(fifty), { ...SPACE, points: '50' }).attrs).toEqual([7, 7, 7]);
    expect(botPersonnelOf(row(fifty), { ...SPACE, points: 40 }).attrs).toEqual([5, 5, 5]);
  });

  it('changes a dilemma check and the requirements check at a space mission, and neither at a planet mission', () => {
    // Move Along Home stops all three when the highest Strength is even: 8 + 1 = 9 is odd.
    const strength = 'while this personnel is attempting a space mission, he is strength +1 and gains navigation.';
    const group = (mission: typeof SPACE) =>
      [row(strength, '', [5, 5, 8]), row(strength, '', [5, 5, 8]), row(strength, '', [5, 5, 8])].map((c) =>
        botPersonnelOf(c, mission),
      );
    const attempt = (mission: typeof SPACE): BotAttempt => ({
      personnel: group(mission),
      // 3 × 8 = 24 is not above 24, and the base crew has no Navigation.
      requirements: parseRequirementBranches('Navigation, Strength>24')!,
      gameOnMission: 0,
      choice: 'best',
    });

    const space = playStack(attempt(SPACE), ['moveAlongHome'], seededRandom(1));
    expect(space).toMatchObject({ stopped: 0, fail: false });

    const planet = playStack(attempt(PLANET), ['moveAlongHome'], seededRandom(1));
    expect(planet.stopped).toBe(3);
    expect(planet.fail).toBe(true);
    expect(playStack(attempt(PLANET), [], seededRandom(1)).fail).toBe(true);
  });

  it('gives the table and the lab the same profiles for the same crew at the same mission', () => {
    const byName = (name: string) => data.find((c) => c.originalName === name)!;
    const riker = { ...byName('William T. Riker Wistful Admiral'), type: 'personnel' } as unknown as BotCardRow;
    const mission = { ...data.find((c) => c.type === 'mission' && c.mission === 's' && c.skills)!, missiontype: 's' };
    const table = botAttemptOf([{ card: riker }], mission, []) as BotAttempt;
    expect(table.personnel).toEqual([botPersonnelOf(riker, attemptedMissionOf(mission))]);
    expect(requirementProfileOf(table.personnel[0]).skills).not.toEqual(requirementProfileOf(botPersonnelOf(riker)).skills);

    const planet = { ...mission, missiontype: 'p' };
    const atPlanet = botAttemptOf([{ card: riker }], planet, []) as BotAttempt;
    expect(atPlanet.personnel).toEqual([botPersonnelOf(riker)]);
  });
});

describe('the gains while present with a partner (#1356)', () => {
  it('reads a single partner: an affiliation and a keyword, a species, a skill, an icon and a title', () => {
    expect(gainsOf('while this personnel is present with a [rom] dissident, she is attributes +1 and gains intelligence.')).toEqual([
      'present with [rom] dissident: attributes +1; intelligence',
    ]);
    expect(gainsOf('while this personnel is present with an android, he gains engineer and programming.')).toEqual([
      'present with android: engineer, programming',
    ]);
    expect(gainsOf('while this personnel is present with your honor personnel, he is integrity +2.')).toEqual([
      'present with honor: integrity +2',
    ]);
    expect(gainsOf('while this personnel is present with a [pa] personnel, he is attributes +1.')).toEqual([
      'present with [pa]: attributes +1',
    ]);
    expect(gainsOf('while this personnel is present with {odo}, he is attributes +2 and gains honor.')).toEqual([
      'present with {odo}: attributes +2; honor',
    ]);
    expect(gainsOf('while present with a non-[na] personnel, this personnel gains transporters.')).toEqual([
      'present with non-[na]: transporters',
    ]);
  });

  it('reads a count, and alternatives', () => {
    expect(gainsOf('while this personnel is present with three [pa] personnel, she is attributes +1 and gains anthropology.')).toEqual([
      'present with 3 [pa]: attributes +1; anthropology',
    ]);
    expect(gainsOf('while this personnel is present with two macos, he gains security.')).toEqual(['present with 2 maco: security']);
    expect(gainsOf('while this personnel is present with a {dissident} or a [fed][cmd] personnel, he is attributes +1.')).toEqual([
      'present with dissident or [fed] [cmd]: attributes +1',
    ]);
  });

  it('reads the self part of "he and each … present", and the facing form', () => {
    expect(gainsOf('while this personnel is present with a treachery admiral, he and each cadet present gains intelligence and treachery.')).toEqual([
      'present with treachery admiral: intelligence, treachery',
    ]);
    expect(gainsOf('while this personnel is present with three macos, he and each [sf] personnel present are attributes +1.')).toEqual([
      'present with 3 maco: attributes +1',
    ]);
    expect(gainsOf('while this personnel is attempting a [dq] mission, she and each dissident personnel present are attributes +1.')).toEqual([
      'attempting [dq]: attributes +1',
    ]);
    expect(
      gainsOf('while this personnel is facing a dilemma and you have a [maq] personnel present, this personnel is attributes +1 and gains intelligence.'),
    ).toEqual(['facing with [maq]: attributes +1; intelligence']);
  });

  it('gives no gain for a loss, a count, a stopped partner, an opponent\'s partner or an unknown word', () => {
    for (const text of [
      'while this personnel is present with your cadet, he loses honor and gains navigation and treachery.',
      'while this personnel is present with a thief, this personnel is cunning +1 for each non-artifact equipment present (limit +4).',
      'while this personnel is present with a stopped [sf] dissident personnel, he is attributes +1 and gains geology.',
      "while present with an opponent's personnel, this personnel is attributes +1.",
      'while this personnel is present with a hologram, he gains engineer.',
      'while this personnel is present with your [fed] personnel, each of your other [baj] personnel present is attributes +1.',
      'while this personnel is not present with your personnel, he gains honor.',
      'while this personnel is facing a dilemma and you have a stopped [maq] personnel present, he gains intelligence.',
      'while this personnel is facing a dilemma, she and each [car] intelligence personnel present adds his or her cunning to his or her integrity.',
    ]) {
      expect(gainsOf(text)).toEqual([]);
    }
  });

  it('gives no gain for the cards with two or three different partners', () => {
    const byName = (name: string) => data.find((c) => c.originalName === name)!;
    for (const name of ['Amanda Cole', 'Sfreett Deadly Flower', "Talak'talan Keen Third"]) {
      expect(personnelGainsOf(byName(name))).toEqual([]);
    }
  });

  it('reads each bare trait word as a keyword or a species of the card data', () => {
    const words = new Set(
      data.flatMap((c) => [...c.keywords.split('.'), ...c.species.split('/')].map((w) => w.trim()).filter(Boolean)),
    );
    for (const word of Array.from(PARTNER_TRAIT_WORDS)) expect(words.has(word)).toBe(true);
  });
});

describe('the partner gains of a group (#1356)', () => {
  const byName = (name: string) => ({ ...data.find((c) => c.originalName === name)!, type: 'personnel' }) as unknown as BotCardRow;
  const troi = byName('Deanna Troi Major Rakal');
  const dissident = byName('N\'Vek Soldier of the Underground'); // [Rom], Dissident
  const tuvok = byName('Tuvok Undercover');
  const maquis = byName('Cal Hudson Convincing Recruiter'); // [Maq]
  const plain = byName('Jural'); // neither a Dissident nor [Maq]

  it('counts Troi\'s gain in both profiles with a Romulan Dissident, and in neither without one', () => {
    const [withPartner] = withPartnerGains([botPersonnelOf(troi), botPersonnelOf(dissident)]);
    const base = botPersonnelOf(troi);
    expect(withPartner.attrs).toEqual(base.attrs.map((a) => a + 1));
    expect(requirementProfileOf(withPartner).attrs).toEqual(base.attrs.map((a) => a + 1));
    for (const skill of ['intelligence', 'leadership', 'security']) {
      expect(skillOf(withPartner.skills, skill)).toBe(1);
      expect(skillOf(requirementProfileOf(withPartner).skills, skill)).toBe(1);
    }

    const [alone] = withPartnerGains([botPersonnelOf(troi), botPersonnelOf(plain)]);
    expect(alone.attrs).toEqual(base.attrs);
    expect(skillOf(alone.skills, 'intelligence')).toBe(0);
    expect(skillOf(requirementProfileOf(alone).skills, 'intelligence')).toBe(0);
  });

  it('counts Tuvok\'s gain in the dilemma profile only, with another [Maq] personnel', () => {
    const base = botPersonnelOf(tuvok);
    const [withPartner] = withPartnerGains([botPersonnelOf(tuvok), botPersonnelOf(maquis)]);
    expect(withPartner.attrs).toEqual(base.attrs.map((a) => a + 1));
    expect(skillOf(withPartner.skills, 'intelligence')).toBe(1);
    expect(requirementProfileOf(withPartner)).toEqual(requirementProfileOf(base));

    // He is [Maq] himself, and no personnel is its own partner.
    const [alone] = withPartnerGains([botPersonnelOf(tuvok), botPersonnelOf(plain)]);
    expect(alone.attrs).toEqual(base.attrs);
    expect(skillOf(alone.skills, 'intelligence')).toBe(0);
  });

  it('never makes a personnel its own partner', () => {
    const self = {
      ...row('while this personnel is present with a [rom] dissident, he gains medical.'),
      affiliation: 'romulan',
      keywords: 'dissident.',
    };
    const entries = partnerGainEntriesOf([botPersonnelOf(self)]);
    expect(entries).toEqual([expect.objectContaining({ personnel: 0, partners: [], count: 1 })]);
    expect(skillOf(withPartnerGains([botPersonnelOf(self)])[0].skills, 'medical')).toBe(0);

    const two = partnerGainEntriesOf([botPersonnelOf(self), botPersonnelOf(self)]);
    expect(two.map((e) => e.partners)).toEqual([[1], [0]]);
  });

  it('counts no partner gain for one personnel built alone', () => {
    const p = botPersonnelOf(troi);
    expect(p.partnerGains).toHaveLength(1);
    expect(skillOf(p.skills, 'intelligence')).toBe(0);
    expect(skillOf(requirementProfileOf(p).skills, 'intelligence')).toBe(0);
  });

  it('needs the count of different partners', () => {
    const jadzia = byName('Jadzia Dax Communications Staffer');
    const pa = byName('Quark Little Green Man'); // not [Pa]
    const paPersonnel = data
      .filter((c) => c.type === 'personnel' && c.icons.includes('[pa]'))
      .slice(0, 3) as unknown as BotCardRow[];
    const two = withPartnerGains([jadzia, ...paPersonnel.slice(0, 2), pa].map((c) => botPersonnelOf(c)));
    expect(skillOf(two[0].skills, 'anthropology')).toBe(0);
    const three = withPartnerGains([jadzia, ...paPersonnel].map((c) => botPersonnelOf(c)));
    expect(skillOf(three[0].skills, 'anthropology')).toBe(1);
  });

  it('gives the table and the lab the same profiles for the same crew', () => {
    const found = data.find((c) => c.type === 'mission' && c.skills)!;
    const mission = { ...found, missiontype: found.mission };
    const table = botAttemptOf([{ card: troi }, { card: dissident }, { card: plain }], mission, []) as BotAttempt;
    const lab = withPartnerGains([troi, dissident, plain].map((c) => botPersonnelOf(c, attemptedMissionOf(mission))));
    expect(table.personnel).toEqual(lab);
    expect(skillOf(requirementProfileOf(table.personnel[0]).skills, 'leadership')).toBe(1);

    // A stopped Dissident is left out of the group, so Troi has no partner.
    const stopped = botAttemptOf([{ card: troi }, { card: dissident, stopped: true }], mission, []) as BotAttempt;
    expect(skillOf(requirementProfileOf(stopped.personnel[0]).skills, 'leadership')).toBe(0);
  });
});

describe('the partner gains in a play (#1357)', () => {
  const byName = (name: string) => ({ ...data.find((c) => c.originalName === name)!, type: 'personnel' }) as unknown as BotCardRow;
  const troi = byName('Deanna Troi Major Rakal'); // 6/5/4; with a Dissident 7/6/5 and Intelligence, Leadership, Security
  const dissident = byName('N\'Vek Soldier of the Underground'); // [Rom], Dissident, 4/5/6
  const jural = byName('Jural'); // 4/6/5, no Security
  const tuvok = byName('Tuvok Undercover'); // 6/7/7; facing with a [Maq] 7/8/8 and Intelligence
  const maquis = byName('Cal Hudson Convincing Recruiter'); // [Maq], 4/6/6
  // A personnel with no partner text, Integrity 4 and Cunning 4.
  const low = data.find(
    (c) => c.type === 'personnel' && c.integrity === '4' && c.cunning === '4' && !c.gametext.includes('present'),
  )! as unknown as BotCardRow;

  /** `rand` that returns `values` in turn, then 0. */
  const scripted = (...values: number[]) => () => values.shift() ?? 0;
  const branch = (skill: string): RequirementBranch[] => [
    { skills: BOT_SKILLS.map((s) => (s === skill ? 1 : 0)), attrs: [-1, -1, -1] },
  ];
  const attemptOf = (cards: BotCardRow[], requirements: RequirementBranch[] = [], gameOnMission = 0): BotAttempt => ({
    ...partnerGroupOf(cards.map((c) => botPersonnelOf(c))),
    requirements,
    gameOnMission,
    choice: 'best',
  });
  const traceOf = (attempt: BotAttempt, stack: DilemmaId[], rand: () => number) => {
    const lines: string[] = [];
    const result = playStack(attempt, stack, rand, (line) => lines.push(line));
    return { ...result, lines };
  };

  it('keeps live data only for the personnel with a gain some partners can meet', () => {
    const { livePartners } = attemptOf([troi, dissident, jural]);
    expect(livePartners).toEqual([expect.objectContaining({ personnel: 0, gains: [expect.objectContaining({ partners: [1], count: 1, attempting: true })] })]);
    expect(livePartners![0].base.attrs).toEqual([6, 5, 4]);
    // Jural needs a Gul, and nobody is one.
    expect(attemptOf([troi, jural]).livePartners).toBeUndefined();
  });

  it('counts Troi\'s gain at the first dilemma, with the Dissident unstopped', () => {
    const { lines } = traceOf(attemptOf([troi, dissident, jural]), ['unfortunateRoll'], scripted());
    expect(lines.some((l) => l.includes('total Integrity 15: stops Deanna Troi'))).toBe(true);
  });

  it('checks the dilemma that stops the Dissident with the gain', () => {
    const attempt = attemptOf([troi, dissident, low]);
    const { lines } = traceOf(attempt, ['echoes'], scripted());
    expect(lines.some((l) => l.includes('highest Cunning 6') && l.includes('stops'))).toBe(true);
  });

  it('drops the gain from the next dilemma on, after Echoes stops the Dissident', () => {
    const attempt = attemptOf([troi, dissident, jural, maquis]);
    // Echoes selects the Dissident, Jural and Cal Hudson: highest Cunning 6, even, so it stops them.
    const { lines } = traceOf(attempt, ['echoes', 'unfortunateRoll'], scripted(0.3, 0.4, 0.6));
    expect(lines.some((l) => l.includes('highest Cunning 6') && l.includes('stops') && !l.includes('Troi'))).toBe(true);
    expect(lines.some((l) => l.includes('total Integrity 6: even, no effect'))).toBe(true);
  });

  it('drops the gain at the dilemma after Chula: The Game stops the Dissident', () => {
    // The copy on the mission stops pool[1], the Dissident, before the first dilemma.
    const { lines } = traceOf(attemptOf([troi, dissident, jural], [], 1), ['unfortunateRoll'], scripted(0.4));
    expect(lines.some((l) => l.includes('Chula: The Game on the mission stops N\'Vek'))).toBe(true);
    expect(lines.some((l) => l.includes('total Integrity 10: even, no effect'))).toBe(true);
  });

  it('meets a requirement only Troi\'s gain gives while the Dissident is unstopped after the last dilemma', () => {
    const security = branch('security');
    expect(playStack(attemptOf([troi, dissident, jural], security), [], scripted()).fail).toBe(false);
    // The copy of Chula: The Game stops pool[1], the Dissident, then pool[2] of the rest, Jural.
    expect(playStack(attemptOf([troi, dissident, jural], security, 1), ['game'], scripted(0.4)).fail).toBe(true);
    expect(playStack(attemptOf([troi, dissident, jural], security, 1), ['game'], scripted(0.9)).fail).toBe(false);
  });

  it('predicts the requirements check in Pick One to Save Two with the gains of the set it tests', () => {
    // The selection is Troi, the Dissident and Jural, in that order. Returning the Dissident ends the gain.
    const { fail, lines } = traceOf(attemptOf([troi, dissident, jural], branch('security')), ['pickOne'], scripted());
    expect(lines.some((l) => l.endsWith('the player returns Jural to the hand'))).toBe(true);
    expect(fail).toBe(false);
  });

  it('drops the gain from the next dilemma on, after Pick One returns the Dissident', () => {
    const attempt = { ...attemptOf([troi, dissident, jural]), choice: 'random' as const };
    const { lines } = traceOf(attempt, ['pickOne', 'unfortunateRoll'], scripted(0, 0, 0, 0.5));
    expect(lines.some((l) => l.includes('the player returns N\'Vek'))).toBe(true);
    expect(lines.some((l) => l.includes('total Integrity 10: even, no effect'))).toBe(true);
  });

  it('drops Tuvok\'s gain in the dilemma checks when his [Maq] partner is stopped, and never counts it in the requirements', () => {
    const lowIntegrity = botPersonnelOf(low).attrs[0];
    const attempt = attemptOf([tuvok, maquis, low], branch('intelligence'), 1);
    const { fail, lines } = traceOf(attempt, ['unfortunateRoll'], scripted(0.4));
    expect(lines.some((l) => l.includes('Chula: The Game on the mission stops Cal Hudson'))).toBe(true);
    expect(lines.some((l) => l.includes(`total Integrity ${6 + lowIntegrity}`))).toBe(true);
    expect(fail).toBe(true);
    expect(playStack(attemptOf([tuvok, maquis, low], branch('intelligence')), [], scripted()).fail).toBe(true);
  });

  describe('a crew with no "present with" text', () => {
    const crew = data
      .filter((c) => c.type === 'personnel' && !c.gametext.includes('present'))
      .slice(0, 12) as unknown as BotCardRow[];
    const found = data.find((c) => c.type === 'mission' && c.skills && parseRequirementBranches(c.skills))!;
    const mission = { ...found, missiontype: found.mission };
    const drawn: DilemmaId[] = ['echoes', 'dice', 'pickOne', 'chandra', 'trickery', 'unfortunateRoll', 'precipice', 'game', 'moveAlongHome', 'echoes', 'dice', 'pickOne'];

    it('carries no partner data, and plays as a hand-built attempt of the same personnel', () => {
      const table = botAttemptOf(crew.map((card) => ({ card })), mission, []) as BotAttempt;
      expect(table.livePartners).toBeUndefined();
      const hand: BotAttempt = {
        personnel: crew.map((c) => botPersonnelOf(c, attemptedMissionOf(mission))),
        requirements: table.requirements,
        gameOnMission: 0,
        choice: 'best',
      };
      expect(scoreStack(table, drawn.slice(0, 6), 200, 3)).toEqual(scoreStack(hand, drawn.slice(0, 6), 200, 3));
    });

    it('chooses a stack for 12 personnel within a generous time bound', () => {
      const table = botAttemptOf(crew.map((card) => ({ card })), mission, []) as BotAttempt;
      const start = Date.now();
      chooseStack(table, drawn, 12, 1);
      expect(Date.now() - start).toBeLessThan(20000);
    });
  });
});

describe('the gains on the player table (#1352)', () => {
  const byName = (name: string) => data.find((c) => c.originalName === name)! as unknown as BotCardRow;
  const traitsOf = (name: string, type = 'personnel') => ({ ...partnerTraitsOf(byName(name)), type });
  const facts = (overrides: Partial<BotTableFacts> = {}): BotTableFacts => ({
    completedMissions: [],
    discardPile: [],
    coreEvents: 0,
    commanded: [],
    ...overrides,
  });
  const both = (p: ReturnType<typeof botPersonnelOf>, skill: string) => [skillOf(p.skills, skill), skillOf(requirementProfileOf(p).skills, skill)];

  it('reads the heads on completed missions, the discard pile and the core', () => {
    expect(gainsOf('while you do not command a completed mission, this personnel gains medical and programming.')).toEqual([
      'while no completed missions: medical, programming',
    ]);
    expect(gainsOf('while you command a completed space mission, this personnel gains navigation.')).toEqual([
      'while 1+ completed space missions: navigation',
    ]);
    expect(gainsOf('while you command two completed space missions, this personnel is attributes +2.')).toEqual([
      'while 2+ completed space missions: attributes +2',
    ]);
    expect(gainsOf('while you command fewer than two completed missions, this personnel is attributes +1.')).toEqual([
      'while 1- completed missions: attributes +1',
    ]);
    expect(gainsOf('while you have a navigation personnel in your discard pile, this personnel gains navigation.')).toEqual([
      'while 1+ navigation personnel in discard: navigation',
    ]);
    expect(gainsOf('while two [baj] personnel are in your discard pile, this personnel is attributes +2.')).toEqual([
      'while 2+ [baj] personnel in discard: attributes +2',
    ]);
    expect(gainsOf('while you have ten or more cards in your discard pile, this personnel is cunning +1 and gains officer.')).toEqual([
      'while 10+ cards in discard: cunning +1; officer',
    ]);
    expect(gainsOf('while you command an event in your core, this personnel is attributes +1.')).toEqual([
      'while 1+ events in core: attributes +1',
    ]);
  });

  it('gives no gain for a condition on an opponent, the hand, an event keyword or a mission keyword', () => {
    for (const text of [
      'while you command more events in your core than each of your opponents, this personnel gains leadership and security.',
      'while each player commands a completed mission, this personnel is attributes +1 and gains science.',
      'while an opponent commands a completed mission, this personnel gains honor.',
      'while three or more personnel are in an opponent\'s discard pile, this personnel is attributes +1 and gains acquisition and engineer.',
      'while you have no cards in your hand, this personnel gains honor.',
      'while you command a temporal event in your core, this personnel gains honor.',
      'while you command a completed mirror mission, this personnel is attributes +1 and gains geology.',
      'while you have more than ten cards in your discard pile, this personnel gains honor.',
    ]) {
      expect(gainsOf(text)).toEqual([]);
    }
    expect(personnelGainsOf(byName('Rusot Proud Nationalist'))).toEqual([]);
    expect(personnelGainsOf(byName('Richardson'))).toEqual([]);
  });

  it('counts The Doctor, Shmullus only while no mission is completed', () => {
    const doctor = byName('The Doctor Shmullus');
    const open = botPersonnelOf(doctor, undefined, facts());
    expect(both(open, 'medical')).toEqual([2, 2]);
    expect(both(open, 'programming')).toEqual([1, 1]);
    const completed = botPersonnelOf(doctor, undefined, facts({ completedMissions: ['p'] }));
    expect(both(completed, 'medical')).toEqual([1, 1]);
    expect(both(completed, 'programming')).toEqual([0, 0]);
  });

  it('counts Kulan only while a Navigation personnel is in the discard pile', () => {
    const kulan = byName('Kulan Militia Soldier');
    const navigator = traitsOf('Kulan Militia Soldier');
    expect(both(botPersonnelOf(kulan, undefined, facts({ discardPile: [navigator] })), 'navigation')).toEqual([2, 2]);
    // An event, and a personnel with no Navigation, do not count.
    const event = { ...navigator, type: 'event' };
    const other = traitsOf('The Doctor Shmullus');
    expect(both(botPersonnelOf(kulan, undefined, facts({ discardPile: [event, other] })), 'navigation')).toEqual([1, 1]);
  });

  it('counts every table gain in the lab, which has no table', () => {
    expect(both(botPersonnelOf(byName('The Doctor Shmullus')), 'programming')).toEqual([1, 1]);
    expect(both(botPersonnelOf(byName('Kulan Militia Soldier')), 'navigation')).toEqual([2, 2]);
  });

  it('counts no gain of Rusot, with facts or without', () => {
    const rusot = byName('Rusot Proud Nationalist');
    const base = botPersonnelOf({ ...rusot, gametext: '' });
    for (const p of [botPersonnelOf(rusot), botPersonnelOf(rusot, undefined, facts({ coreEvents: 5 }))]) {
      expect(p.skills).toEqual(base.skills);
      expect(requirementProfileOf(p).skills).toEqual(base.skills);
    }
  });

  it('counts the core events, the completed missions of a type, and the size of the discard pile', () => {
    const anneli = byName('Anneli');
    const printed = botPersonnelOf(anneli, undefined, facts()).attrs;
    expect(botPersonnelOf(anneli, undefined, facts({ coreEvents: 1 })).attrs).toEqual(printed.map((n) => n + 1));

    const nadia = byName('Nadia Myers');
    expect(skillOf(botPersonnelOf(nadia, undefined, facts({ completedMissions: ['p'] })).skills, 'navigation')).toBe(
      skillOf(botPersonnelOf(nadia, undefined, facts()).skills, 'navigation'),
    );
    expect(skillOf(botPersonnelOf(nadia, undefined, facts({ completedMissions: ['s'] })).skills, 'navigation')).toBe(
      skillOf(botPersonnelOf(nadia, undefined, facts()).skills, 'navigation') + 1,
    );

    const kira = byName('Kira Nerys Bit of a Fighter');
    const event = traitsOf('Anneli', 'event');
    expect(skillOf(botPersonnelOf(kira, undefined, facts({ discardPile: new Array(9).fill(event) })).skills, 'officer')).toBe(0);
    expect(skillOf(botPersonnelOf(kira, undefined, facts({ discardPile: new Array(10).fill(event) })).skills, 'officer')).toBe(1);
  });
});

describe('the skill loss while you command a [bor] non-dissident personnel (#1360)', () => {
  const byName = (name: string) => data.find((c) => c.originalName === name)! as unknown as BotCardRow;
  const facts = (commanded: string[]): BotTableFacts => ({
    completedMissions: [],
    discardPile: [],
    coreEvents: 0,
    commanded: commanded.map((name) => partnerTraitsOf(byName(name))),
  });
  const DQ = attemptedMissionOf({ missiontype: 'p', quadrant: 'd', points: '35' });
  const tuvok = byName('Tuvok Mostly Assimilated');
  const printed = botPersonnelOf({ ...tuvok, gametext: '' });
  const levels = (p: ReturnType<typeof botPersonnelOf>) => [p.skills, requirementProfileOf(p).skills];
  const none = new Array(BOT_SKILLS.length).fill(0);

  it('reads the loss, its condition and its next ability', () => {
    expect(personnelLossOf(tuvok)).toEqual({
      table: { count: 'commanded', anyOf: [{ affiliation: 'borg', notTraits: ['dissident'] }], min: 1 },
      nextAbility: true,
    });
    expect(personnelLossOf(byName('One Peerless'))?.nextAbility).toBe(false);
    expect(personnelLossOf(byName('Cyber Drone'))).toBeNull();
    // A gain in a sentence other than the next one is no part of the loss.
    expect(
      parseGains(
        'while you command a [bor] non-dissident personnel, this personnel loses all of his skills and his next ability. when you play this personnel, draw a card. while this personnel is facing a dilemma, he gains honor.',
      ).map((g) => g.nextAbility),
    ).toEqual([undefined]);
  });

  it('takes every skill of Tuvok and his [dq] gain while the player commands a Borg non-Dissident', () => {
    const lost = botPersonnelOf(tuvok, DQ, facts(['Tuvok Mostly Assimilated', 'Cyber Drone']));
    expect(levels(lost)).toEqual([none, none]);
    // The partner tests of other personnel still read his printed skills.
    expect(lost.traits!.skills).toEqual(printed.skills);
  });

  it('keeps his skills and his [dq] gain while the player commands only Borg Dissidents, himself included', () => {
    const kept = botPersonnelOf(tuvok, DQ, facts(['Tuvok Mostly Assimilated', 'Seven of Nine Annika']));
    expect(levels(kept)[1]).toEqual(printed.skills);
    for (const skill of ['law', 'leadership', 'officer']) expect(skillOf(kept.skills, skill)).toBe(1);
    expect(skillOf(kept.skills, 'security')).toBe(2);
  });

  it('takes his skills in the lab, which has no table', () => {
    expect(levels(botPersonnelOf(tuvok))).toEqual([none, none]);
    expect(levels(botPersonnelOf(tuvok, DQ))).toEqual([none, none]);
  });

  describe('with Sphere 117, Renegade Borg Sphere (#1363)', () => {
    const inst = (id: string, name: string): CardInstance => ({ id, card: byName(name), face: 'up' });
    const dq = byName('Nudios Reestablish Neural Cooperative');
    const aq = data.find((c) => c.type === 'mission' && c.quadrant === 'a')!;
    // Tuvok at mission 0, a Cyber Drone on a ship at mission 1, the ship Sphere 117 unless `ship` says otherwise.
    const tableOf = ({ quadrant = 'd', ship = 'Sphere 117 Renegade Borg Sphere', crew = ['Cyber Drone'] } = {}): TableState => {
      const slot = (overrides: Partial<MissionSlot>): MissionSlot => ({ mission: null, ships: [], awayTeam: [], underMission: [], ...overrides });
      const missionOf = (i: number) => ({ id: `m${i}`, card: i === 4 && quadrant !== 'd' ? aq : dq, face: 'up' as const });
      return {
        ...initialTableState,
        missions: [
          slot({ mission: missionOf(0), awayTeam: [inst('t', 'Tuvok Mostly Assimilated')] }),
          slot({ mission: missionOf(1), ships: [{ ...inst('s', ship), crew: crew.map((name, i) => inst(`c${i}`, name)) }] }),
          slot({ mission: missionOf(2) }),
          slot({ mission: missionOf(3) }),
          slot({ mission: missionOf(4) }),
        ],
      };
    };
    const tuvokAt = (t: TableState) => botPersonnelOf(tuvok, DQ, botTableFactsOf(t));

    it('turns a commanded Drone into a Dissident while Sphere 117 holds, and leaves it alone otherwise', () => {
      const drone = (t: TableState) => botTableFactsOf(t).commanded.find((c) => c.name === 'cyber drone')!.keywords;
      expect(drone(tableOf())).toContain('dissident');
      expect(drone(tableOf())).not.toContain('drone');
      expect(drone(tableOf({ quadrant: 'a' }))).toEqual(['drone']);
      expect(drone(tableOf({ ship: 'Cyber Drone' }))).toEqual(['drone']);
      expect(asSphere117Dissident(partnerTraitsOf(byName('Borg Queen Bringer of Order'))).keywords).not.toContain('dissident');
    });

    it('keeps Tuvok\'s skills and his [dq] gain when his only [Bor] non-Dissident is a Drone', () => {
      const kept = tuvokAt(tableOf());
      expect(levels(kept)[1]).toEqual(printed.skills);
      expect(skillOf(kept.skills, 'security')).toBe(2);
    });

    it('takes his skills with a non-[DQ] mission, with no Sphere 117, or with a Borg Queen', () => {
      expect(levels(tuvokAt(tableOf({ quadrant: 'a' })))).toEqual([none, none]);
      expect(levels(tuvokAt(tableOf({ ship: 'Cyber Drone' })))).toEqual([none, none]);
      expect(levels(tuvokAt(tableOf({ crew: ['Cyber Drone', 'Borg Queen Bringer of Order'] })))).toEqual([none, none]);
    });

    it('ignores an empty mission slot', () => {
      const t = tableOf();
      const half: TableState = { ...t, missions: t.missions.map((s, i) => (i === 4 ? { ...s, mission: null } : s)) };
      expect(levels(tuvokAt(half))[1]).toEqual(printed.skills);
    });

    it('keeps his skills in the lab only when the deck says Sphere 117 holds', () => {
      expect(levels(botPersonnelOf(tuvok, DQ, undefined, true))[1]).toEqual(printed.skills);
      expect(levels(botPersonnelOf(tuvok, DQ, undefined, false))).toEqual([none, none]);
    });
  });

  it('drops the attributes of Seven of Nine, Annika, the gain of her next ability, with her skills', () => {
    const seven = byName('Seven of Nine Annika');
    const base = botPersonnelOf({ ...seven, gametext: '' });
    expect(botPersonnelOf(seven, DQ, facts(['Cyber Drone'])).attrs).toEqual(base.attrs);
    expect(botPersonnelOf(seven, DQ, facts([])).attrs).toEqual(base.attrs.map((n) => n + 1));
  });
});
