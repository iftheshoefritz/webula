import { DilemmaId } from './opponentPile';
import { BotAttempt, seededRandom } from './simulator';
import { SearchResult, StackScore, chooseStack, fullSearch, legalStacks, randomLegalStack, scoreStack } from './search';

// The search of the dilemma bot runs in this background thread (#1282), so the page stays smooth.

export interface SearchRequest {
  id: number;
  kind: 'choose' | 'full';
  attempt: BotAttempt;
  drawn: DilemmaId[];
  n: number;
  seed: number;
}

export interface SearchResponse {
  id: number;
  kind: SearchRequest['kind'];
  result: SearchResult;
  /** A random legal stack, scored with 2,000 plays: the baseline of #1282. */
  baseline: StackScore;
  ms: number;
}

const scope = self as unknown as {
  onmessage: (event: MessageEvent<SearchRequest>) => void;
  postMessage: (message: SearchResponse) => void;
};

scope.onmessage = (event) => {
  const { id, kind, attempt, drawn, n, seed } = event.data;
  const start = performance.now();
  const result = kind === 'choose' ? chooseStack(attempt, drawn, n, seed) : fullSearch(attempt, legalStacks(drawn, n), 500, seed);
  const ms = performance.now() - start;
  const baseline = scoreStack(attempt, randomLegalStack(drawn, n, seededRandom(seed)), 2000, seed + 1);
  scope.postMessage({ id, kind, result, baseline, ms });
};
