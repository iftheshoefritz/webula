// The measurements of the pilot of #1320: the pile bot against Think Tank 50's and Cardassian in Gamma
// Quadrant. It adapts the scenario generator of #1287: a random Championship deck, one of its missions,
// a random group of its personnel that meets the mission, N, and a draw of N from the pile less the
// dilemmas under the mission. Run it from the repository root:
//
//   npx jiti scripts/dilemma_bot_pile_pilot.ts                 # every N, 20 scenarios each
//   NS=2,4,6 SCEN=40 npx jiti scripts/dilemma_bot_pile_pilot.ts
//
// It prints Markdown: the families of each pile, then one table per pile.

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { CardData, parseCardData } from '../src/lib/loadCards';
import { attemptedMissionOf } from '../src/lib/dilemmaBot/gains';
import { RequirementBranch, meetsRequirements, parseRequirementBranches } from '../src/lib/dilemmaBot/requirements';
import { requirementProfileOf, seededRandom, Rand } from '../src/lib/dilemmaBot/simulator';
import { PileAttempt, PilePersonnel } from '../src/lib/dilemmaBot/pile/model';
import { botPileOf, pilePersonnelOf } from '../src/lib/dilemmaBot/pile/pile';
import { REGISTRY, familyReport } from '../src/lib/dilemmaBot/pile/registry';
import { chooseStack, drawDilemmas } from '../src/lib/dilemmaBot/search';
import { choosePileStack, countPileStacks, randomLegalPileStack, scorePileStack } from '../src/lib/dilemmaBot/pile/search';

const ROOT = process.cwd();
const NS = (process.env.NS ?? '2,4,6,9,12').split(',').map(Number);
const SCEN = Number(process.env.SCEN ?? 20);
/** Above this many legal stacks the pilot counts them and does not search: the time is reported as "skipped". */
const SEARCH_CAP = Number(process.env.SEARCH_CAP ?? 300000);

const PILES = [
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

const folder = join(ROOT, 'championship-decks');
const decks: Deck[] = [];
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

function shuffle<T>(items: T[], rand: Rand): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

interface Scenario {
  attempt: PileAttempt;
  under: string[];
  deck: string;
  mission: string;
}

function makeScenario(n: number, pile: string[], rand: Rand): Scenario {
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
function drawFrom(pile: string[], under: string[], n: number, rand: Rand): string[] {
  const rest = pile.slice();
  for (const t of under) {
    const i = rest.indexOf(t);
    if (i >= 0) rest.splice(i, 1);
  }
  return shuffle(rest, rand).slice(0, n);
}

const q = (xs: number[], f: number) => {
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(f * s.length))];
};
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : '–');
const n0 = (x: number) => (Number.isFinite(x) ? Math.round(x).toLocaleString('en-US') : '–');

const families: Record<string, Map<string, string[]>> = {};
for (const { label, file } of PILES) {
  const pile = botPileOf(readFileSync(join(folder, file), 'utf-8'));
  const titles = Array.from(new Set([...pile.played, ...pile.ignored, ...pile.missing]));
  families[label] = familyReport(titles);
  console.log(`\n### ${label}: ${pile.played.length} dilemmas, ${titles.length} titles, ${pile.missing.length} copies missing from the registry\n`);
  console.log('| Family | Titles | Which |\n|---|---|---|');
  for (const [family, ts] of [...families[label]].sort((a, b) => b[1].length - a[1].length)) console.log(`| ${family} | ${ts.length} | ${ts.sort().join(', ')} |`);
  const botSide = titles.filter((t) => REGISTRY.get(t)?.category);
  console.log(`\nBot-side titles: ${botSide.map((t) => `${t} (${REGISTRY.get(t)!.category})`).join(', ')}`);
  const gaps = titles.filter((t) => REGISTRY.get(t)?.gap);
  console.log(`\nGaps: ${gaps.map((t) => `${t}: ${REGISTRY.get(t)!.gap}`).join('; ')}`);
}

const [first, second] = PILES.map((p) => p.label);
const firstTitles = new Set([...families[first].values()].flat());
const newTitles = [...families[second].values()].flat().filter((t) => !firstTitles.has(t));
const firstFamilies = new Set(families[first].keys());
const reuse = newTitles.filter((t) => REGISTRY.get(t)!.family !== 'own' && firstFamilies.has(REGISTRY.get(t)!.family));
const own = newTitles.filter((t) => !reuse.includes(t));
console.log(`\n### ${second} against the families of ${first}\n`);
console.log(`${newTitles.length} titles are new. ${reuse.length} fit a family of ${first} with new parameters; ${own.length} needed new code: ${own.sort().map((t) => `${t} (${REGISTRY.get(t)!.family})`).join(', ')}.`);

for (const { label, file } of PILES) {
  const pile = botPileOf(readFileSync(join(folder, file), 'utf-8')).played;
  const withoutBotSide = pile.filter((t) => !REGISTRY.get(t)!.category);
  console.log(`\n### ${label}: ${SCEN} scenarios for each N\n`);
  console.log('| N | Legal stacks, median / max | Search, median / max | P(fail), best | P(fail), random legal stack | P(fail), best with the bot-side titles out of the pile | Damage of the best | Chula search, same groups, median / max |');
  console.log('|---|---|---|---|---|---|---|---|');
  for (const n of NS) {
    const rand = seededRandom(1320 + n);
    const counts: number[] = [];
    const ms: number[] = [];
    const best: number[] = [];
    const random: number[] = [];
    const ignored: number[] = [];
    const damage: number[] = [];
    const chulaMs: number[] = [];
    let skipped = 0;
    for (let i = 0; i < SCEN; i++) {
      const sc = makeScenario(n, pile, rand);
      const drawSeed = Math.floor(rand() * 1e9);
      const drawn = drawFrom(pile, sc.under, n, seededRandom(drawSeed));
      const count = countPileStacks(sc.attempt, drawn, n);
      counts.push(count);
      if (count > SEARCH_CAP) {
        skipped++;
        continue;
      }
      // The Chula bot of #1282 on the same group and N, for a time on the same machine.
      const c0 = performance.now();
      chooseStack({ personnel: sc.attempt.personnel, requirements: sc.attempt.requirements, gameOnMission: 0, choice: 'best' }, drawDilemmas(n, 0, 0, seededRandom(drawSeed)), n, 1 + i);
      chulaMs.push(performance.now() - c0);
      const t0 = performance.now();
      const result = choosePileStack(sc.attempt, drawn, n, 1 + i);
      ms.push(performance.now() - t0);
      best.push(scorePileStack(sc.attempt, result.best.stack, 2000, 5000 + i, drawn.length).pFail);
      damage.push(result.best.damage);
      const r = randomLegalPileStack(sc.attempt, drawn, n, seededRandom(9000 + i));
      random.push(scorePileStack(sc.attempt, r, 2000, 5000 + i, drawn.length).pFail);
      const drawnPlain = drawFrom(withoutBotSide, sc.under.filter((t) => !REGISTRY.get(t)!.category), n, seededRandom(drawSeed));
      if (countPileStacks(sc.attempt, drawnPlain, n) <= SEARCH_CAP) {
        const plain = choosePileStack(sc.attempt, drawnPlain, n, 1 + i);
        ignored.push(scorePileStack(sc.attempt, plain.best.stack, 2000, 5000 + i, drawnPlain.length).pFail);
      }
    }
    const time = ms.length ? `${n0(q(ms, 0.5))} / ${n0(Math.max(...ms))} ms` : '–';
    console.log(
      `| ${n} | ${n0(q(counts, 0.5))} / ${n0(Math.max(...counts))} | ${time}${skipped ? ` (${skipped} over ${n0(SEARCH_CAP)} stacks not searched)` : ''} | ${f2(mean(best))} | ${f2(mean(random))} | ${f2(mean(ignored))} | ${f2(mean(damage))} | ${chulaMs.length ? `${n0(q(chulaMs, 0.5))} / ${n0(Math.max(...chulaMs))} ms` : '–'} |`,
    );
  }
}
console.log(`\nNode ${process.version}, one thread. ${decks.length} decks give the groups.`);
