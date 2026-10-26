import { SearchRequest, SearchResponse, answerSearch } from './searchRequest';

// The search of the dilemma bot runs in this background thread (#1282), so the page stays smooth.

export type { SearchRequest, SearchResponse };

const scope = self as unknown as {
  onmessage: (event: MessageEvent<SearchRequest>) => void;
  postMessage: (message: SearchResponse) => void;
};

scope.onmessage = (event) => {
  scope.postMessage(answerSearch(event.data));
};
