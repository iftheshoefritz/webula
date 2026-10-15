// The service worker of the practice table (#1051, part 2 of #1047). `@serwist/next` builds it into
// `public/sw.js` at `yarn build`, with the precache manifest of the build in `self.__SW_MANIFEST`.
// Only the practice page registers it (`useServiceWorker`), and `yarn dev` builds no worker.
//
// The rules, in order:
// - The precache holds the build's `_next/static` chunks and the HTML of `/decks/practice`
//   (`next.config.mjs` keeps every other file out of it, `public/cardimages` above all).
// - A navigation to `/decks/practice` goes to the network first, and falls back to the HTML of the
//   page when the network fails or takes longer than 3 s. Other routes have no offline fallback.
// - `/cardimages/*` and the card data come from the offline deck cache of `offlineDecks.ts` when it
//   holds them, and from the network otherwise. Nothing stores an image the player only looked at.
// - Google Fonts are stale-while-revalidate into a small cache.
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { ExpirationPlugin, NetworkFirst, Serwist, StaleWhileRevalidate } from 'serwist';
import { CARD_DATA_URL, CARD_IMAGES_PATH, OFFLINE_CACHE_NAME } from './decks/practice/offlineCache';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const PRACTICE_PATH = '/decks/practice';
const SHELL_CACHE_PREFIX = 'webula-practice-shell-';
// How long a navigation to the practice page waits for the network before it takes the cache.
const NAVIGATION_TIMEOUT_SECONDS = 3;
const FONTS_CACHE_NAME = 'webula-fonts';
const FONT_ORIGINS = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'];

const manifest = self.__SW_MANIFEST ?? [];

// The HTML of a navigation is kept per build: an old page asks for chunks the new precache no
// longer holds. The revision of the practice page in the manifest names the build.
const practiceEntry = manifest.find(
  (entry): entry is PrecacheEntry => typeof entry !== 'string' && entry.url === PRACTICE_PATH,
);
const shellCacheName = `${SHELL_CACHE_PREFIX}${practiceEntry?.revision ?? 'none'}`;

const serwist = new Serwist({
  precacheEntries: manifest,
  precacheOptions: { cleanupOutdatedCaches: true },
  skipWaiting: true,
  clientsClaim: true,
  runtimeCaching: [
    {
      matcher: ({ request, url, sameOrigin }) =>
        sameOrigin && request.mode === 'navigate' && url.pathname === PRACTICE_PATH,
      handler: new NetworkFirst({
        cacheName: shellCacheName,
        plugins: [
          // `?fixture=1` and every other query load the same page, so one entry serves them all.
          { cacheKeyWillBeUsed: async () => PRACTICE_PATH },
          // The cache of the navigations is empty until the first one; the precache has the page
          // from the install. Both caches belong to this build, so the fallback never pairs the
          // HTML of an old build with the chunks of this one.
          {
            cachedResponseWillBeUsed: async ({ cachedResponse }) =>
              cachedResponse ?? (await serwist.matchPrecache(PRACTICE_PATH)),
          },
          { handlerDidError: async () => serwist.matchPrecache(PRACTICE_PATH) },
        ],
        // A slow network falls back to the cached page of this build (#1134). The first navigation
        // after an update, the Reload of the update prompt, finds the shell cache empty, so the
        // plugin above serves the precache.
        networkTimeoutSeconds: NAVIGATION_TIMEOUT_SECONDS,
      }),
    },
    {
      matcher: ({ url, sameOrigin }) =>
        sameOrigin && (url.pathname.startsWith(CARD_IMAGES_PATH) || url.pathname === CARD_DATA_URL),
      handler: async ({ request }) =>
        (await caches.match(request, { cacheName: OFFLINE_CACHE_NAME, ignoreVary: true })) ??
        fetch(request),
    },
    {
      matcher: ({ url }) => FONT_ORIGINS.includes(url.origin),
      handler: new StaleWhileRevalidate({
        cacheName: FONTS_CACHE_NAME,
        plugins: [new ExpirationPlugin({ maxEntries: 30 })],
      }),
    },
  ],
});

// A new build drops the HTML the navigations of the old build cached.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith(SHELL_CACHE_PREFIX) && name !== shellCacheName)
            .map((name) => caches.delete(name)),
        ),
      ),
  );
});

serwist.addEventListeners();
