// The beam search of the pile bot against the fast search and the full search (#1320). For each pile
// and N it runs the scenarios of `dilemmaBotPileScenarios.ts` and, for each beam setting, reports the
// time of each search and how good its stack is. Every chosen stack is scored again with 2,000 plays on
// common seeds, so the searches are compared on one scale. Run it from the repository root:
//
//   npx jiti scripts/dilemma_bot_beam_pilot.ts
//   PILE=cardassian NS=12 BEAMS=40:48,80:64 SCEN=20 npx jiti scripts/dilemma_bot_beam_pilot.ts
//
// BEAMS lists width:plays pairs. REF_LIMIT (default 3,000) is the most legal stacks the full search
// runs on, at 200 plays each, as the reference.

import { readFileSync } from 'fs';
import { join } from 'path';
import { seededRandom } from '../src/lib/dilemmaBot/simulator';
import { botPileOf } from '../src/lib/dilemmaBot/pile/pile';
import {
  beamPileSearch,
  countPileStacks,
  fastPileSearch,
  fullPileSearch,
  legalPileStacks,
  scorePileStack,
} from '../src/lib/dilemmaBot/pile/search';
import { ALL_PILES, drawFrom, f2, folder, makeScenario, mean, n0, q } from './dilemmaBotPileScenarios';

const NS = (process.env.NS ?? '6,9,12').split(',').map(Number);
const SCEN = Number(process.env.SCEN ?? 20);
const REF_LIMIT = Number(process.env.REF_LIMIT ?? 3000);
const FAST_LIMIT = Number(process.env.FAST_LIMIT ?? 300000);
const BEAMS = (process.env.BEAMS ?? '20:32,40:48,80:64').split(',').map((b) => {
  const [width, plays] = b.split(':').map(Number);
  return { width, plays };
});
const PILES = ALL_PILES.filter((p) => !process.env.PILE || p.label.toLowerCase().includes(process.env.PILE.toLowerCase()));

const JUDGE_PLAYS = 2000;
const key = (stack: string[]) => stack.join(' / ');

interface Tally {
  ms: number[];
  plays: number[];
  pFail: number[];
  damage: number[];
  /** Against the full search, where it ran: the same stack, and the P(fail) and damage lost. */
  same: number;
  refRuns: number;
  pLoss: number[];
  dLoss: number[];
}
const tally = (): Tally => ({ ms: [], plays: [], pFail: [], damage: [], same: 0, refRuns: 0, pLoss: [], dLoss: [] });

for (const { label, file } of PILES) {
  const pile = botPileOf(readFileSync(join(folder, file), 'utf-8')).played;
  console.log(`\n### ${label}: ${SCEN} scenarios for each N\n`);
  console.log('| N | Search | Time, median / max | Plays, median | P(fail), mean | Damage, mean | Same stack as the full search | P(fail) lost, mean / max | Damage lost, mean |');
  console.log('|---|---|---|---|---|---|---|---|---|');
  for (const n of NS) {
    const rand = seededRandom(1320 + n);
    const fast = tally();
    const beams = BEAMS.map(tally);
    const counts: number[] = [];
    for (let i = 0; i < SCEN; i++) {
      const sc = makeScenario(n, pile, rand);
      const drawn = drawFrom(pile, sc.under, n, seededRandom(Math.floor(rand() * 1e9)));
      const count = countPileStacks(sc.attempt, drawn, n);
      counts.push(count);
      const judge = (stack: string[]) => scorePileStack(sc.attempt, stack, JUDGE_PLAYS, 7000 + i, drawn.length);
      const ref = count <= REF_LIMIT ? judge(fullPileSearch(sc.attempt, legalPileStacks(sc.attempt, drawn, n), 200, 1 + i, drawn.length).best.stack) : null;
      const record = (t: Tally, stack: string[], ms: number, plays: number) => {
        const s = judge(stack);
        t.ms.push(ms);
        t.plays.push(plays);
        t.pFail.push(s.pFail);
        t.damage.push(s.damage);
        if (!ref) return;
        t.refRuns++;
        if (key(stack) === key(ref.stack)) t.same++;
        t.pLoss.push(Math.max(0, ref.pFail - s.pFail));
        t.dLoss.push(Math.max(0, ref.damage - s.damage));
      };
      if (count <= FAST_LIMIT) {
        const t0 = performance.now();
        const r = fastPileSearch(sc.attempt, legalPileStacks(sc.attempt, drawn, n), 1 + i, 400, drawn.length);
        record(fast, r.best.stack, performance.now() - t0, r.plays);
      }
      BEAMS.forEach((b, j) => {
        const t0 = performance.now();
        const r = beamPileSearch(sc.attempt, drawn, n, 1 + i, b);
        record(beams[j], r.best.stack, performance.now() - t0, r.plays);
      });
    }
    const row = (name: string, t: Tally) =>
      console.log(
        `| ${n} | ${name} | ${t.ms.length ? `${n0(q(t.ms, 0.5))} / ${n0(Math.max(...t.ms))} ms` : '–'} | ${n0(q(t.plays, 0.5))} | ${f2(mean(t.pFail))} | ${f2(mean(t.damage))} | ${
          t.refRuns ? `${t.same} of ${t.refRuns}` : '–'
        } | ${t.refRuns ? `${f2(mean(t.pLoss))} / ${f2(Math.max(...t.pLoss))}` : '–'} | ${t.refRuns ? f2(mean(t.dLoss)) : '–'} |`,
      );
    console.log(`| ${n} | legal stacks: ${n0(q(counts, 0.5))} median, ${n0(Math.max(...counts))} max | | | | | | | |`);
    row(`fast${fast.ms.length < SCEN ? ` (${fast.ms.length} of ${SCEN})` : ''}`, fast);
    BEAMS.forEach((b, j) => row(`beam ${b.width}×${b.plays}`, beams[j]));
  }
}
console.log(`\nNode ${process.version}, one thread. The full search, the reference, runs where a draw has ${n0(REF_LIMIT)} legal stacks or fewer.`);
