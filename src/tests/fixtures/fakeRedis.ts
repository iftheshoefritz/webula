// An in-memory stand-in for the few `@upstash/redis` commands the playtest store sends (#1644),
// with `automaticDeserialization: false`: every value is a string. `log` lists each command.

import type { Redis } from '@upstash/redis';

export interface FakeRedis {
  redis: Redis;
  strings: Map<string, string>;
  sets: Map<string, Set<string>>;
  log: string[];
}

export function fakeRedis(strings: Record<string, string> = {}, sets: Record<string, string[]> = {}): FakeRedis {
  const s = new Map(Object.entries(strings));
  const z = new Map(Object.entries(sets).map(([k, v]) => [k, new Set(v)]));
  const log: string[] = [];
  const members = (key: string) => {
    if (!z.has(key)) z.set(key, new Set());
    return z.get(key)!;
  };
  const commands = {
    get: (key: string) => s.get(key) ?? null,
    mget: (...keys: string[]) => keys.map((k) => s.get(k) ?? null),
    set: (key: string, value: string) => { s.set(key, value); return 'OK'; },
    mset: (values: Record<string, string>) => { Object.entries(values).forEach(([k, v]) => s.set(k, v)); return 'OK'; },
    del: (...keys: string[]) => keys.filter((k) => s.delete(k) || z.delete(k)).length,
    incr: (key: string) => { const next = Number(s.get(key) ?? 0) + 1; s.set(key, String(next)); return next; },
    exists: (...keys: string[]) => keys.filter((k) => s.has(k) || z.has(k)).length,
    copy: (from: string, to: string) => {
      if (!s.has(from)) return 'NOT_COPIED';
      s.set(to, s.get(from)!);
      return 'COPIED';
    },
    sadd: (key: string, ...values: string[]) => values.filter((v) => !members(key).has(v) && !!members(key).add(v)).length,
    srem: (key: string, ...values: string[]) => values.filter((v) => members(key).delete(v)).length,
    smembers: (key: string) => [...(z.get(key) ?? [])],
    sismember: (key: string, value: string) => (z.get(key)?.has(value) ? 1 : 0),
  };
  type Name = keyof typeof commands;
  const run = (name: Name, args: unknown[]) => {
    // A value is never logged: `set` and `mset` name their keys only.
    const shown = name === 'set' ? [args[0]] : name === 'mset' ? Object.keys(args[0] as object) : args;
    log.push(`${name} ${shown.filter((a) => typeof a === 'string').join(' ')}`.trim());
    return (commands[name] as (...a: unknown[]) => unknown)(...args);
  };
  const redis: Record<string, unknown> = {};
  for (const name of Object.keys(commands) as Name[]) redis[name] = async (...args: unknown[]) => run(name, args);
  redis.pipeline = () => {
    const queued: [Name, unknown[]][] = [];
    const pipeline: Record<string, unknown> = {
      exec: async () => queued.map(([name, args]) => run(name, args)),
    };
    for (const name of Object.keys(commands) as Name[]) {
      pipeline[name] = (...args: unknown[]) => { queued.push([name, args]); return pipeline; };
    }
    return pipeline;
  };
  return { redis: redis as unknown as Redis, strings: s, sets: z, log };
}
