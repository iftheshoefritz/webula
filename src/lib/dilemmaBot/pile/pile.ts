import { AttemptedMission, BotTableFacts } from '../gains';
import { BOT_SKILLS, SKILL_INDEX } from '../requirements';
import { TraitsRow, botPersonnelOf } from '../simulator';
import { PilePersonnel } from './model';
import { REGISTRY, pileTitleOf } from './registry';

// A dilemma pile as the pile bot reads it (#1320, the pilot), and a personnel row as its dilemmas read it.

export interface BotPile {
  /** One title per copy the bot can draw. */
  played: string[];
  /** The titles the registry marks `'ignore'`: they leave the pile when the game starts. */
  ignored: string[];
  /** The titles the registry lacks: they leave the pile too. */
  missing: string[];
}

/** The `Dilemmas:` section of a deck file, as titles: each version maps to one model, by its title. */
export function botPileOf(deckText: string): BotPile {
  const pile: BotPile = { played: [], ignored: [], missing: [] };
  let section = '';
  for (const line of deckText.split('\n')) {
    if (/^\w+:\s*$/.test(line)) {
      section = line.trim();
      continue;
    }
    const match = /^(\d+)\t(.+?)\s*$/.exec(line);
    if (!match || section !== 'Dilemmas:') continue;
    const title = pileTitleOf(match[2]);
    const model = REGISTRY.get(title);
    const into = !model ? pile.missing : model.status === 'ignore' ? pile.ignored : pile.played;
    for (let c = 0; c < Number(match[1]); c++) into.push(title);
  }
  return pile;
}

/** A card row as `botAffiliationsOf` reads it: the name with its subtitle, the type and the affiliation. */
export interface DeckCardRow {
  originalName: string;
  type: string;
  affiliation: string;
}

/**
 * The bot's side for Abrasive Allies (#1513): the different affiliations, lowercased, of the personnel of
 * a deck file's `Deck:` section. A deck line is a name and a subtitle, as the card data names a row, with
 * a version suffix, so each line is matched to its row by `pileTitleOf`. A line with no row is left out.
 */
export function botAffiliationsOf(deckText: string, rows: ReadonlyArray<DeckCardRow>): string[] {
  const byTitle = new Map<string, DeckCardRow>();
  for (const row of rows) {
    const title = pileTitleOf(row.originalName);
    if (!byTitle.has(title)) byTitle.set(title, row);
  }
  const out = new Set<string>();
  let section = '';
  for (const line of deckText.split('\n')) {
    if (/^\w+:\s*$/.test(line)) {
      section = line.trim();
      continue;
    }
    const match = /^(\d+)\t(.+?)\s*$/.exec(line);
    if (!match || section !== 'Deck:') continue;
    const row = byTitle.get(pileTitleOf(match[2]));
    if (row && row.type.toLowerCase() === 'personnel' && row.affiliation) out.add(row.affiliation.toLowerCase());
  }
  return Array.from(out).sort();
}

type PersonnelRow = Parameters<typeof botPersonnelOf>[0] & TraitsRow;

/** The printed skills of a row, indexed as `BOT_SKILLS`, and the number of skill dots: one per skill line. */
export function printedSkillsOf(text: string | number | undefined): { skills: number[]; dots: number } {
  const skills = new Array(BOT_SKILLS.length).fill(0);
  let dots = 0;
  const pattern = /(\d+\s+)?([a-z]+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(String(text ?? '').toLowerCase())) !== null) {
    const i = SKILL_INDEX[match[2]];
    if (i === undefined) continue;
    skills[i] += match[1] ? parseInt(match[1], 10) : 1;
    dots++;
  }
  return { skills, dots };
}

/**
 * A personnel row as the pile's dilemmas read it: the bot's personnel, with its species, affiliation,
 * skill dots and printed profile. `lossSuspended` is `botPersonnelOf`'s: Sphere 117 holds (#1363).
 */
export function pilePersonnelOf(row: PersonnelRow, mission?: AttemptedMission, facts?: BotTableFacts, lossSuspended = false): PilePersonnel {
  const base = botPersonnelOf(row, mission, facts, lossSuspended);
  const { skills, dots } = printedSkillsOf(row.skills);
  const firstSkill = (String(row.skills ?? '').toLowerCase().match(/[a-z]+/g) ?? []).map((w) => SKILL_INDEX[w]).find((i) => i !== undefined);
  const species = String(row.species ?? '').toLowerCase().split('/').map((x) => x.trim()).filter(Boolean);
  return {
    ...base,
    species,
    affiliation: String(row.affiliation ?? '').toLowerCase(),
    skillDots: dots,
    hologram: species.includes('hologram'),
    printed: {
      skills,
      attrs: [Number(row.integrity) || 0, Number(row.cunning) || 0, Number(row.strength) || 0],
    },
    ...(firstSkill !== undefined ? { firstSkill } : {}),
  };
}
