import { useCallback, useReducer, useRef, useState, useSyncExternalStore } from 'react';

// A value kept in localStorage, read through useSyncExternalStore (#1456). The server snapshot is
// the default, so the hydrating render draws what the server drew, and the stored value follows
// once hydration commits. A client-only render reads the stored value at once.

const listeners = new Map<string, Set<() => void>>();
// The parsed value of each key, against the raw string it came from, so a snapshot keeps its
// identity while the stored string does not change.
const parsed = new Map<string, { raw: string; value: unknown }>();

function notify(key: string, except: (() => void) | null) {
  listeners.get(key)?.forEach((listener) => {
    if (listener !== except) listener();
  });
}

function subscribeKey(key: string, listener: () => void) {
  let keyListeners = listeners.get(key);
  if (!keyListeners) {
    keyListeners = new Set();
    listeners.set(key, keyListeners);
  }
  keyListeners.add(listener);
  // A write from another tab.
  const onStorage = (event: StorageEvent) => {
    if (event.key === key || event.key === null) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    keyListeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

function readStored<T>(key: string, defaultValue: T): T {
  const raw = localStorage.getItem(key);
  if (!raw) return defaultValue;
  const cached = parsed.get(key);
  if (cached && cached.raw === raw) return cached.value as T;
  let value: T;
  try {
    value = JSON.parse(raw);
  } catch {
    // Bad stored JSON gives the default.
    return defaultValue;
  }
  parsed.set(key, { raw, value });
  return value;
}

const subscribeNothing = () => () => {};

/** False in the server render and the hydrating render, true from then on. */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribeNothing, () => true, () => false);
}

function useLocalStorage<T>(key: string, defaultValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  // The first default stays, so a caller may pass a fresh object on every render.
  const [initialDefault] = useState(defaultValue);

  // The setter re-renders its own instance through a state update, which React allows during a
  // render (`useDriveSync` sets `deckFile` in render), and notifies only the other instances.
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const ownListener = useRef<(() => void) | null>(null);
  const subscribe = useCallback(
    (listener: () => void) => {
      ownListener.current = listener;
      return subscribeKey(key, listener);
    },
    [key]
  );
  const getSnapshot = useCallback(() => readStored(key, initialDefault), [key, initialDefault]);
  const getServerSnapshot = useCallback(() => initialDefault, [initialDefault]);
  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // The only write: a default the user never changed stays unwritten, and nothing writes the
  // default over a stored value on load.
  const setValue = useCallback<React.Dispatch<React.SetStateAction<T>>>(
    (action) => {
      const previous = readStored(key, initialDefault);
      const next = typeof action === 'function' ? (action as (prev: T) => T)(previous) : action;
      const raw = JSON.stringify(next);
      localStorage.setItem(key, raw);
      parsed.set(key, { raw, value: next });
      rerender();
      notify(key, ownListener.current);
    },
    [key, initialDefault]
  );

  return [value, setValue];
}

export default useLocalStorage;
