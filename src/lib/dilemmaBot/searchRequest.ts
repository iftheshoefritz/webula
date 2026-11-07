import { seededRandom } from './simulator';
import { PileAttempt } from './pile/model';
import { PileSearchResult, PileStackScore, attemptAtSpend, choosePileStack, randomLegalPileStack, scorePileStack } from './pile/search';

// A request to the search of the dilemma bot, and its answer (#1282). The worker and the main-thread
// fallback of `useSearchWorker` both answer with `answerSearch`, so the two cannot differ (#1298).

/** The lab's request (#1509): `choosePileStack` of the pile bot, over titles, and a baseline. */
export interface LabSearchRequest {
  id: number;
  kind: 'lab';
  attempt: PileAttempt;
  drawn: string[];
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
  kind: 'lab';
  result: PileSearchResult;
  /** A random legal stack, scored with 2,000 plays: the baseline of #1282. */
  baseline: PileStackScore;
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
  const result = choosePileStack(attempt, drawn, n, seed);
  const ms = performance.now() - start;
  // The baseline sees the same "not in the stack" count as the beam did.
  const baseline = scorePileStack(attemptAtSpend(attempt, n), randomLegalPileStack(attempt, drawn, n, seededRandom(seed)), 2000, seed + 1, drawn.length);
  return { id, kind, result, baseline, ms };
}
