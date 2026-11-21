import { readdirSync } from 'fs';
import path from 'path';

// On a case-insensitive file system (macOS, Windows), `./playTarget` and
// `./PlayTarget` resolve to the same file, so an import can load the wrong
// module. TypeScript and Jest try `.ts` before `.tsx`, so two modules whose
// paths differ only in case or extension clash there.
const ROOTS = ['src', 'scripts'];
const MODULE_EXTENSION = /\.(tsx?|jsx?|mjs|cjs)$/;

function modulesIn(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return modulesIn(full);
    return MODULE_EXTENSION.test(entry.name) ? [full] : [];
  });
}

describe('module paths', () => {
  it('has no two modules whose paths differ only in case or extension', () => {
    const byKey = new Map<string, string[]>();
    for (const root of ROOTS) {
      for (const file of modulesIn(path.join(process.cwd(), root))) {
        const relative = path.relative(process.cwd(), file);
        const key = relative.replace(MODULE_EXTENSION, '').toLowerCase();
        byKey.set(key, [...(byKey.get(key) ?? []), relative]);
      }
    }
    const clashes = [...byKey.values()].filter((files) => files.length > 1);
    expect(clashes).toEqual([]);
  });
});
