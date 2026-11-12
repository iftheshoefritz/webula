// The card data once it is complete (#1615): the public cards loaded and the playtest cards of a
// playtester settled. A Drive load resolves its deck text by name in an async closure, which keeps
// the `data` of the render that made it, so it awaits this instead, and a playtest card the deck
// names is never dropped because the playtest request was still on its way.
import { useCallback, useEffect, useRef } from 'react';

export function useCompleteData<T>(data: T, complete: boolean): () => Promise<T> {
  const latest = useRef<{ data: T; complete: boolean }>({ data, complete });
  const waiting = useRef<((data: T) => void)[]>([]);

  useEffect(() => {
    latest.current = { data, complete };
    if (!complete) return;
    const resolvers = waiting.current;
    waiting.current = [];
    resolvers.forEach((resolve) => resolve(data));
  }, [data, complete]);

  return useCallback(() => {
    if (latest.current.complete) return Promise.resolve(latest.current.data);
    return new Promise<T>((resolve) => {
      waiting.current.push(resolve);
    });
  }, []);
}
