import useLocalStorage from './useLocalStorage';

export type SearchViewMode = 'image' | 'list';

// The v2 key resets every user to the list once (#1453). The old `search-view-mode` held the
// default that `useLocalStorage` wrote on mount before #1456, not a choice, so it stays unread.
export const SEARCH_VIEW_MODE_KEY = 'search-view-mode-v2';

/** The view of the search results, shared by `/` and `/decks`: the text list unless chosen otherwise. */
export default function useSearchViewMode() {
  return useLocalStorage<SearchViewMode>(SEARCH_VIEW_MODE_KEY, 'list');
}
