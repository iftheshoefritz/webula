import { DilemmaId } from './opponentPile';
import { BotAttempt, seededRandom } from './simulator';
import { SearchResult, StackScore, chooseStack, fullSearch, legalStacks, randomLegalStack, scoreStack } from './search';
import { PileAttempt } from './pile/model';
import { PileSearchResult, choosePileStack } from './pile/search';

// A request to the search of the dilemma bot, and its answer (#1282). The worker and the main-thread
// fallback of `useSearchWorker` both answer with `answerSearch`, so the two cannot differ (#1298).

/** The lab's request: `'choose'` is `chooseStack` of the Chula bot, `'full'` the full search. */
export interface LabSearchRequest {
  id: number;
  kind: 'choose' | 'full';
  attempt: BotAttempt;
  drawn: DilemmaId[];
  n: number;
  seed: number;
}

/** The practice table's request (#1508): `choosePileStack` of the pile bot, over titles, with no baseline. */
export interface TableSearchRequest {
  id: number;
  kind: 'table';
  attempt: PileAttempt;
  drawn: string[];
  n: number;
  seed: number;
}

export type SearchRequest = LabSearchRequest | TableSearchRequest;

export interface LabSearchResponse {
  id: number;
  kind: LabSearchRequest['kind'];
  result: SearchResult;
  /** A random legal stack, scored with 2,000 plays: the baseline of #1282. */
  baseline: StackScore;
  ms: number;
}

export interface TableSearchResponse {
  id: number;
  kind: 'table';
  result: PileSearchResult;
  ms: number;
}

export type SearchResponse = LabSearchResponse | TableSearchResponse;

/** The answer to `request`, on whatever thread calls it. */
export function answerSearch(request: TableSearchRequest): TableSearchResponse;
export function answerSearch(request: LabSearchRequest): LabSearchResponse;
export function answerSearch(request: SearchRequest): SearchResponse;
export function answerSearch(request: SearchRequest): SearchResponse {
  const start = performance.now();
  if (request.kind === 'table') {
    const { id, kind, attempt, drawn, n, seed } = request;
    const result = choosePileStack(attempt, drawn, n, seed);
    return { id, kind, result, ms: performance.now() - start };
  }
  const { id, kind, attempt, drawn, n, seed } = request;
  const result = kind === 'full' ? fullSearch(attempt, legalStacks(drawn, n), 500, seed) : chooseStack(attempt, drawn, n, seed);
  const ms = performance.now() - start;
  const baseline = scoreStack(attempt, randomLegalStack(drawn, n, seededRandom(seed)), 2000, seed + 1);
  return { id, kind, result, baseline, ms };
}
