// The scenario generator of the pile bot's pilots (#1320), adapted from #1287: a random Championship
// deck, one of its missions, a random group of its personnel that meets the mission, N, and the
// dilemmas under the mission. `dilemma_bot_pile_pilot.ts` uses it.

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { CardData, parseCardData } from '../src/lib/loadCards';
import { attemptedMissionOf } from '../src/lib/dilemmaBot/gains';
import { RequirementBranch, meetsRequirements, parseRequirementBranches } from '../src/lib/dilemmaBot/requirements';
import { requirementProfileOf, Rand } from '../src/lib/dilemmaBot/simulator';
import { PileAttempt, PilePersonnel } from '../src/lib/dilemmaBot/pile/model';
import { pilePersonnelOf } from '../src/lib/dilemmaBot/pile/pile';

const ROOT = process.cwd();

export const ALL_PILES = [
  { label: "Think Tank 50's", file: "2026 Trek Masters - Think Tank 50's - Matt S.txt" },
  { label: 'Cardassian in Gamma Quadrant', file: '2026 European Continental - Cardassian in Gamma Quadrant for EM 2026 - Matthias Weller.txt' },
];

const { data } = parseCardData(readFileSync(join(ROOT, 'public/cards_with_processed_columns.txt'), 'utf-8'));
const byName = new Map<string, CardData>();
for (const c of data) if (!byName.has(c.originalName)) byName.set(c.originalName, c);

interface Deck {
  file: string;
  personnel: CardData[];
  missions: { row: CardData; branches: RequirementBranch[] }[];
  ships: CardData[];
  headquarters: number;
  missionSkills: number[][];
}

export const folder = join(ROOT, 'championship-decks');
export const decks: Deck[] = [];
for (const file of readdirSync(folder).filter((f) => f.endsWith('.txt'))) {
  const deck: Deck = { file, personnel: [], missions: [], ships: [], headquarters: 0, missionSkills: [] };
  let section = '';
  for (const line of readFileSync(join(folder, file), 'utf-8').split('\n')) {
    if (/^\w+:\s*$/.test(line)) {
      section = line.trim();
      continue;
    }
    const name = /^\d+\t(.+?)\s*$/.exec(line)?.[1];
    const row = name ? byName.get(name) : undefined;
    if (!row) continue;
    if (section === 'Missions:') {
      if (row.missiontype === 'h') {
        deck.headquarters++;
        continue;
      }
      const branches = parseRequirementBranches(String(row.skills));
      if (!branches) continue;
      deck.missions.push({ row, branches });
      deck.missionSkills.push(Array.from(new Set(branches.flatMap((b) => b.skills.flatMap((n, i) => (n ? [i] : []))))));
    } else if (section === 'Deck:' && row.type === 'personnel') deck.personnel.push(row);
    else if (section === 'Deck:' && row.type === 'ship') deck.ships.push(row);
  }
  if (deck.personnel.length >= 12 && deck.missions.length) decks.push(deck);
}

export function shuffle<T>(items: T[], rand: Rand): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

export interface Scenario {
  attempt: PileAttempt;
  under: string[];
  deck: string;
  mission: string;
}

export function makeScenario(n: number, pile: string[], rand: Rand): Scenario {
  for (;;) {
    const deck = decks[Math.floor(rand() * decks.length)];
    const { row, branches } = deck.missions[Math.floor(rand() * deck.missions.length)];
    const kind = row.missiontype === 's' ? 'space' : 'planet';
    if (kind === 'space' && !deck.ships.length) continue;
    const g = n <= 4 ? 8 + Math.floor(rand() * 5) : n + Math.floor(rand() * (Math.min(3, 12 - n) + 1));
    const u = g - n;
    const attempted = attemptedMissionOf(row);
    for (let t = 0; t < 300; t++) {
      const group: PilePersonnel[] = shuffle(deck.personnel.slice(), rand).slice(0, g).map((p) => pilePersonnelOf(p as never, attempted));
      if (!meetsRequirements(branches, group.map(requirementProfileOf))) continue;
      const ship = kind === 'space' ? deck.ships[Math.floor(rand() * deck.ships.length)] : undefined;
      const rest = shuffle(pile.slice(), rand);
      const under = rest.slice(0, u);
      const attempt: PileAttempt = {
        personnel: group,
        requirements: branches,
        mission: {
          kind,
          points: Number(row.points) || 0,
          span: Number(row.span) || 0,
          nebula: /nebula/.test(String(row.keywords)) || /nebula/.test(String(row.name)),
        },
        ship: ship && { name: ship.originalName, range: Number(ship.range) || 0, weapons: Number(ship.weapons) || 0, shields: Number(ship.shields) || 0 },
        table: {
          headquarters: deck.headquarters,
          completedMissions: 0,
          completedSpaceMission: false,
          handSize: 7,
          handHasCunning7Or11: false,
          discardCopiesMax: 0,
          missionSkills: deck.missionSkills,
          underMission: under,
          turn: 1,
        },
      };
      return { attempt, under, deck: deck.file, mission: row.originalName };
    }
  }
}

/** Remove `under` from `pile`, one copy each, shuffle, and draw `n`. */
export function drawFrom(pile: string[], under: string[], n: number, rand: Rand): string[] {
  const rest = pile.slice();
  for (const t of under) {
    const i = rest.indexOf(t);
    if (i >= 0) rest.splice(i, 1);
  }
  return shuffle(rest, rand).slice(0, n);
}

export const q = (xs: number[], f: number) => {
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(f * s.length))];
};
export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
export const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : '–');
export const n0 = (x: number) => (Number.isFinite(x) ? Math.round(x).toLocaleString('en-US') : '–');
