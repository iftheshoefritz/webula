// The measurements of the pilot of #1320: the pile bot against Think Tank 50's and Cardassian in Gamma
// Quadrant. It adapts the scenario generator of #1287: a random Championship deck, one of its missions,
// a random group of its personnel that meets the mission, N, and a draw of N from the pile less the
// dilemmas under the mission. Run it from the repository root:
//
//   npx jiti scripts/dilemma_bot_pile_pilot.ts                 # every N, 20 scenarios each
//   NS=2,4,6 SCEN=40 npx jiti scripts/dilemma_bot_pile_pilot.ts
//   PILE=cardassian NS=9 npx jiti scripts/dilemma_bot_pile_pilot.ts   # one pile
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

import { ALL_PILES, decks, drawFrom, f2, folder, makeScenario, mean, n0, q } from './dilemmaBotPileScenarios';

/** `PILE=think` or `PILE=cardassian` measures one pile; the family report always covers both. */
const PILES = ALL_PILES;
const MEASURED = ALL_PILES.filter((p) => !process.env.PILE || p.label.toLowerCase().includes(process.env.PILE.toLowerCase()));

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

for (const { label, file } of MEASURED) {
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
