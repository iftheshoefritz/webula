import { readFileSync } from 'fs';
import { join } from 'path';
import { BOT_SKILLS, parseRequirementBranches } from '../../../../lib/dilemmaBot/requirements';
import { seededRandom } from '../../../../lib/dilemmaBot/simulator';
import { PileAttempt, PilePersonnel, PileResult, PileTable, costOf } from '../../../../lib/dilemmaBot/pile/model';
import { playPileStack } from '../../../../lib/dilemmaBot/pile/play';
import { REGISTRY } from '../../../../lib/dilemmaBot/pile/registry';

// The helpers of the Championship batch tests (#1515, #1516, #1517).

const DIR = join(process.cwd(), 'championship-decks');
export const championshipPiles = (): { file: string; text: string }[] =>
  (JSON.parse(readFileSync(join(DIR, 'index.json'), 'utf-8')) as { file: string }[]).map(({ file }) => ({
    file,
    text: readFileSync(join(DIR, file), 'utf-8'),
  }));

export function person(
  name: string,
  {
    attrs = [5, 5, 5] as [number, number, number],
    skills = {} as Record<string, number>,
    cost = 3,
    species = ['human'],
    affiliation = 'federation',
    icons = [] as string[],
    keywords = [] as string[],
    firstSkill,
  }: {
    attrs?: [number, number, number];
    skills?: Record<string, number>;
    cost?: number;
    species?: string[];
    affiliation?: string;
    icons?: string[];
    keywords?: string[];
    firstSkill?: string;
  } = {},
): PilePersonnel {
  const levels = BOT_SKILLS.map((s) => skills[s] ?? 0);
  return {
    name,
    cost,
    attrs: [...attrs] as [number, number, number],
    skills: levels,
    species,
    affiliation,
    skillDots: Object.keys(skills).length,
    hologram: species.includes('hologram'),
    printed: { skills: levels.slice(), attrs: [...attrs] as [number, number, number] },
    traits: { name: name.toLowerCase(), affiliation, species, keywords, icons, skills: levels.slice() },
    ...(firstSkill ? { firstSkill: BOT_SKILLS.indexOf(firstSkill) } : {}),
  };
}

export function attemptOf(
  personnel: PilePersonnel[],
  over: Partial<Omit<PileAttempt, 'requirements' | 'table'>> & { requirements?: string; table?: Partial<PileTable> } = {},
): PileAttempt {
  const { requirements = 'Cunning>0', table = {}, ...rest } = over;
  return {
    personnel,
    requirements: parseRequirementBranches(requirements)!,
    mission: { kind: 'planet', points: 35, span: 2, nebula: false },
    table: {
      headquarters: 1,
      completedMissions: 0,
      completedSpaceMission: false,
      handSize: 7,
      handHasCunning7Or11: false,
      discardCopiesMax: 0,
      missionSkills: [],
      underMission: [],
      turn: 1,
      ...table,
    },
    ...rest,
  };
}

export const SPACE = { kind: 'space' as const, points: 35, span: 2, nebula: false };

export const play = (attempt: PileAttempt, titles: string[], seed = 1): PileResult =>
  playPileStack(attempt, titles.map((t) => REGISTRY.get(t)!), seededRandom(seed));

export const group = (n: number, opts: Parameters<typeof person>[1] = {}) => Array.from({ length: n }, (_, k) => person(`P${k}`, opts));
export const cost = (title: string, attempt: PileAttempt) => costOf(REGISTRY.get(title)!, attempt);
export const labelsOf = (r: PileResult) => r.labels.map((l) => l.label);
export const model = (title: string) => REGISTRY.get(title)!;
