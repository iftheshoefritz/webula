import { DilemmaId } from './opponentPile';
import { BotAttempt, seededRandom } from './simulator';
import { SearchResult, StackScore, chooseStack, fullSearch, legalStacks, randomLegalStack, scoreStack } from './search';

// A request to the search of the dilemma bot, and its answer (#1282). The worker and the main-thread
// fallback of `useSearchWorker` both answer with `answerSearch`, so the two cannot differ (#1298).

export interface SearchRequest {
  id: number;
  /** `'choose'` and `'full'` are the lab's; `'table'` is the practice table's `chooseStack`, with no baseline. */
  kind: 'choose' | 'full' | 'table';
  attempt: BotAttempt;
  drawn: DilemmaId[];
  n: number;
  seed: number;
}

export interface SearchResponse {
  id: number;
  kind: SearchRequest['kind'];
  result: SearchResult;
  /** A random legal stack, scored with 2,000 plays: the baseline of #1282. Absent for `'table'`. */
  baseline?: StackScore;
  ms: number;
}

/** The answer to `request`, on whatever thread calls it. */
export function answerSearch(request: SearchRequest): SearchResponse {
  const { id, kind, attempt, drawn, n, seed } = request;
  const start = performance.now();
  const result = kind === 'full' ? fullSearch(attempt, legalStacks(drawn, n), 500, seed) : chooseStack(attempt, drawn, n, seed);
  const ms = performance.now() - start;
  if (kind === 'table') return { id, kind, result, ms };
  const baseline = scoreStack(attempt, randomLegalStack(drawn, n, seededRandom(seed)), 2000, seed + 1);
  return { id, kind, result, baseline, ms };
}
