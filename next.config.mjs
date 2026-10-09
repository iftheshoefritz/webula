import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import withSerwistInit from '@serwist/next';

// The revision of the practice page's HTML in the precache (#1051). A new build gets a new one, so
// a deploy installs a new shell. Vercel gives the commit; elsewhere git does, or a random id.
const buildRevision =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).stdout?.trim() ||
  randomUUID();

// The service worker of the practice table (#1051, part 2 of #1047). `src/app/sw.ts` is built into
// `public/sw.js`. Only `src/app/decks/practice/useServiceWorker.ts` registers it, so the rest of
// the app runs as before. `yarn dev` builds no worker.
const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  register: false,
  reloadOnOnline: false,
  disable: process.env.NODE_ENV === 'development',
  // A list here replaces the default glob of `public/`, which would precache all of
  // `public/cardimages` (~206 MB). The practice page is the only entry outside `_next/static`.
  additionalPrecacheEntries: [{ url: '/decks/practice', revision: buildRevision }],
  exclude: [/cardimages\//, /cards_with_processed_columns\.txt$/],
  manifestTransforms: [
    async (entries) => ({
      manifest: entries.filter(
        (entry) => entry.url.startsWith('/_next/static/') || entry.url === '/decks/practice',
      ),
      warnings: [],
    }),
  ],
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // An agent that checks the dev server in a browser sets NEXT_PUBLIC_AGENT_BROWSER=1. The dev tools
  // button sits in the bottom-left corner and covers page elements there, such as the practice
  // draw pile. Build errors still show.
  devIndicators: process.env.NEXT_PUBLIC_AGENT_BROWSER === '1' ? false : undefined,
  env: {
    // Vercel sets VERCEL_ENV on the server only. Expose it so client components can tell a
    // preview deployment from production.
    NEXT_PUBLIC_VERCEL_ENV: process.env.VERCEL_ENV || '',
  },
}

export default withSerwist(nextConfig)
