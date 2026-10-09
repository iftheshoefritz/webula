// The names the page and the service worker share (#1051). The page writes the offline decks into
// this cache (`offlineDecks.ts`), and the worker (`src/app/sw.ts`) reads them from it by URL. This
// module imports nothing, so the worker bundle stays free of React and the deck helpers.

export const OFFLINE_CACHE_NAME = 'webula-offline-v1';
export const CARD_DATA_URL = '/cards_with_processed_columns.txt';
export const CARD_IMAGES_PATH = '/cardimages/';
