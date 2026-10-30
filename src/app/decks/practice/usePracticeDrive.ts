import { useState } from 'react';
import { getSession, signIn } from 'next-auth/react';
import { DRIVE_SCOPE_AUTH_PARAMS } from '../../../hooks/useDriveSync';
import type { DriveFile, Session } from '../../../hooks/useDriveSync';
import { isBrowserOnline } from './useOnline';
import { fetchChampionshipDecks, groupChampionshipDecks, visibleChampionshipDecks } from '../../../lib/championshipDecks';
import type { ChampionshipDeck } from '../../../lib/championshipDecks';
import { fetchBeginnerDecks, visibleBeginnerDecks } from '../../../lib/beginnerDecks';
import type { BeginnerDeck } from '../../../lib/beginnerDecks';
import { fetchPublicDeckText, isPublicDeckId } from '../../../lib/publicDecks';

// The Drive picker of the practice table (#780). A small version of useDriveSync: that hook
// writes the picked file to localStorage.deckFile (the deck builder's Save target) and rewrites
// the URL to /decks on mount, and both would break the practice table.
export function usePracticeDrive() {
  const [showPicker, setShowPicker] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [browsedFolder, setBrowsedFolder] = useState<DriveFile | null>(null);
  const [loading, setLoading] = useState(false);
  // The rows of the two public folders (#1389), the Championship rows with the email they were
  // fetched for (#1327).
  const [fetchedChampionshipDecks, setFetchedChampionshipDecks] =
    useState<{ email: string; decks: ChampionshipDeck[] } | null>(null);
  const [allBeginnerDecks, setAllBeginnerDecks] = useState<BeginnerDeck[]>([]);
  const email = session?.user?.email ?? '';

  // The route filters the Championship index already; the filter here is a second line, as in
  // useDriveSync. Rows fetched for another email do not show.
  const championshipDecks = fetchedChampionshipDecks?.email === email
    ? visibleChampionshipDecks(fetchedChampionshipDecks.decks, email)
    : [];
  const championshipEvents = groupChampionshipDecks(championshipDecks);
  const beginnerDecks = visibleBeginnerDecks(allBeginnerDecks, email);

  // The session is looked up when the picker opens, not on mount, so the table makes no session
  // request until the player asks for a deck.
  // Offline (#1053) the picker shows the offline decks instead, so it asks for neither the session
  // nor the Drive list.
  const openPicker = async () => {
    setShowPicker(true);
    if (!isBrowserOnline()) return;
    const fromNextAuth = (await getSession()) as Session | null;
    const resolved = fromNextAuth && new Date() > new Date(fromNextAuth.expires) ? null : fromNextAuth;
    setSession(resolved);
    // The folders show to every user, a signed-out user too, so their indexes are fetched whether
    // or not there is a session. Both libs cache the index, so a second open fetches nothing. A
    // failed fetch leaves its folder empty, and the Drive list still loads.
    const indexEmail = resolved?.user?.email ?? '';
    fetchChampionshipDecks(indexEmail)
      .then((decks) => setFetchedChampionshipDecks({ email: indexEmail, decks }))
      .catch(() => setFetchedChampionshipDecks({ email: indexEmail, decks: [] }));
    fetchBeginnerDecks()
      .then(setAllBeginnerDecks)
      .catch(() => setAllBeginnerDecks([]));
    if (!resolved) return;
    setLoading(true);
    try {
      const response = await fetch('/api/drive?includeFolders=true', { method: 'GET', credentials: 'include' });
      const json = await response.json();
      setDriveFiles(json.files ?? []);
    } catch {
      setDriveFiles([]);
    } finally {
      setLoading(false);
    }
  };

  const closePicker = () => {
    setShowPicker(false);
    setBrowsedFolder(null);
  };

  // Fetches a deck file as a Lackey TSV string, or null when the fetch fails. A public deck's id
  // (`championship:` or `beginner:`) fetches the plain text of its folder, any other id the Drive file.
  const fetchDeckTsv = async (file: { id: string }): Promise<string | null> => {
    setLoading(true);
    try {
      if (isPublicDeckId(file.id)) return await fetchPublicDeckText(file.id);
      const response = await fetch(`/api/drive/${file.id}`, { method: 'GET', credentials: 'include' });
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    } finally {
      setLoading(false);
    }
  };

  // The sign-in comes back with `?openPicker=true`, so the table opens the picker again (#980).
  const signInToDrive = () => {
    signIn('google', { callbackUrl: '/decks/practice?openPicker=true' }, DRIVE_SCOPE_AUTH_PARAMS);
  };

  return {
    showPicker,
    openPicker,
    closePicker,
    session,
    driveFiles,
    championshipEvents,
    beginnerDecks,
    browsedFolder,
    setBrowsedFolder,
    loading,
    fetchDeckTsv,
    signInToDrive,
  };
}
