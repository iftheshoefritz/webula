import { useEffect, useRef } from 'react';
import { useLatest } from '../../hooks/useLatest';
import { SearchRequest, SearchResponse, answerSearch } from './searchRequest';

/** A search result, and the thread it ran on. */
export type ThreadedSearchResponse = SearchResponse & { thread: 'background' | 'main' };

/**
 * The search of the dilemma bot off the main thread, or on it when the browser has no worker. Shared
 * by the lab and the practice table (#1298). Returns the function that posts a request.
 */
export function useSearchWorker(onResponse: (r: ThreadedSearchResponse) => void, onError: (message: string) => void) {
  const worker = useRef<Worker | null>(null);
  const handlerRef = useLatest(onResponse);
  const errorHandlerRef = useLatest(onError);
  useEffect(() => () => worker.current?.terminate(), []);

  return (request: SearchRequest) => {
    if (!worker.current && typeof Worker !== 'undefined') {
      try {
        worker.current = new Worker(new URL('./search.worker.ts', import.meta.url));
        worker.current.onmessage = (e: MessageEvent<SearchResponse>) => handlerRef.current({ ...e.data, thread: 'background' });
        // A worker that throws sends no message, so the page must hear of it here, or it waits for ever.
        worker.current.onerror = (e: ErrorEvent) => {
          e.preventDefault();
          worker.current?.terminate();
          worker.current = null;
          errorHandlerRef.current(e.message || 'The search failed.');
        };
      } catch {
        worker.current = null;
      }
    }
    if (worker.current) {
      worker.current.postMessage(request);
      return;
    }
    handlerRef.current({ ...answerSearch(request), thread: 'main' });
  };
}
