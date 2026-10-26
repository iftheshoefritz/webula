import { RefObject, useLayoutEffect, useRef } from 'react';

/**
 * A ref that holds the value of the last committed render (#1306), for an event handler, a timer or
 * a worker callback to read. It is stored after each commit, not during render, so read `.current`
 * only outside render. It keeps the last value after unmount, for a cleanup to read.
 */
export function useLatest<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
