import { useEffect, useState } from 'react';
import posthog from 'posthog-js';
import { getSession, signIn } from 'next-auth/react';
import useLocalStorage from './useLocalStorage';
import { UploadedFile } from '../components/DeckUploader';
import { buildBulkImportPayloads, deckFromTsv } from '../app/decks/deckBuilderUtils';
import type { DeckPile } from '../app/decks/deckBuilderUtils';
import { CardDef } from '../types';
import type { CardData } from '../lib/loadCards';
import { FOLDER_MIME_TYPE } from '../app/api/drive/mimeTypes';
import { fetchChampionshipDecks, groupChampionshipDecks, visibleChampionshipDecks } from '../lib/championshipDecks';
import type { ChampionshipDeck } from '../lib/championshipDecks';
import { fetchBeginnerDecks, visibleBeginnerDecks } from '../lib/beginnerDecks';
import type { BeginnerDeck } from '../lib/beginnerDecks';
import { fetchPublicDeckText, findPublicDeck, isPublicDeckId } from '../lib/publicDecks';

export interface Session {
  accessToken: string;
  session: { user: { name: string; email: string } };
  user: { name: string; email: string };
  expires: string;
  hasDriveScope?: boolean;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType?: string;
  parents?: string[];
}

interface UseDriveSyncParams {
  data: CardData[];
  deckTitle: string;
  createLackeyTSV: () => string;
  handleFileLoad: (name: string, contents: string, piles?: DeckPile[]) => void;
  /** The load of useDeckState that a render may call: it only sets state. */
  loadDeckInRender: (name: string, contents: string) => void;
  clearDirty: () => void;
  deckIsEmpty: boolean;
}

export const DRIVE_SCOPE_AUTH_PARAMS = {
  scope: 'openid profile email https://www.googleapis.com/auth/drive.appdata',
  include_granted_scopes: 'true',
};

// The practice table's Edit current deck (#1407) opens a deck that no file stands for with
// `?editDeck=1`, and leaves its `{ name, contents }` in sessionStorage under this key for one read.
export const EDIT_DECK_PARAM = 'editDeck';
export const EDIT_DECK_HANDOFF_KEY = 'editDeckHandoff';

// The `?driveFile=<id>&name=<name>` parameters (#1111) open one Drive deck, the Edit button of the
// practice table's Load deck picker, and `?editDeck=1` the deck of the handoff (#1407). They are
// removed from the URL and any other parameter stays.
export function urlWithoutDriveFileParams(location: { pathname: string; search: string; hash: string }) {
  const params = new URLSearchParams(location.search);
  params.delete('driveFile');
  params.delete('name');
  params.delete(EDIT_DECK_PARAM);
  const query = params.toString();
  return `${location.pathname}${query ? `?${query}` : ''}${location.hash}`;
}

// The deck builder's Save target. `source` is the trekcc.org page of a loaded Championship deck (#1310).
export interface DeckFileRecord {
  id: string | null;
  name: string;
  source?: string;
}

// Takes the handoff of Edit current deck out of sessionStorage, so it is used once; null when there
// is none or it is not a `{ name, contents }` of strings.
function takeEditDeckHandoff(): { name: string; contents: string } | null {
  try {
    const raw = window.sessionStorage.getItem(EDIT_DECK_HANDOFF_KEY);
    window.sessionStorage.removeItem(EDIT_DECK_HANDOFF_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (typeof parsed?.name !== 'string' || typeof parsed?.contents !== 'string') return null;
    return { name: parsed.name, contents: parsed.contents };
  } catch {
    return null;
  }
}

// A deck's text: a public deck from its folder under `public/`, any other id from Drive.
async function fetchDeckText(id: string): Promise<string> {
  if (isPublicDeckId(id)) return fetchPublicDeckText(id);
  const response = await fetch(`/api/drive/${id}`, { method: 'GET', credentials: 'include' });
  return response.json();
}

export function useDriveSync({ data, deckTitle, createLackeyTSV, handleFileLoad, loadDeckInRender, clearDirty, deckIsEmpty }: UseDriveSyncParams) {
  const [deckFile, setDeckFile] = useLocalStorage<DeckFileRecord>('deckFile', { id: null, name: 'My deck' });
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [showDrivePicker, setShowDrivePicker] = useState(false);
  const [showSaveAsDialog, setShowSaveAsDialog] = useState(false);
  const [drivePickerMode, setDrivePickerMode] = useState<'load' | 'compare'>('load');
  const [browsedFolder, setBrowsedFolder] = useState<DriveFile | null>(null);
  const [loadingFromGDrive, setLoadingFromGDrive] = useState(false);
  const [compareDeckRows, setCompareDeckRows] = useState<CardDef[]>([]);
  const [compareDeckName, setCompareDeckName] = useState<string | null>(null);
  const [savingToGDrive, setSavingToGDrive] = useState(false);
  const [savedRecently, setSavedRecently] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [bulkImportPending, setBulkImportPending] = useState<UploadedFile[] | null>(null);
  const [showBulkSaveAsDialog, setShowBulkSaveAsDialog] = useState(false);
  const [bulkImportStatus, setBulkImportStatus] = useState<'idle' | 'saving' | 'done'>('idle');
  const [bulkImportResults, setBulkImportResults] = useState<
    { title: string; status: 'created' | 'updated' | 'failed'; error?: string }[]
  >([]);
  const [bulkImportSkipped, setBulkImportSkipped] = useState<{ name: string; error: string }[]>([]);
  const [bulkImportError, setBulkImportError] = useState<string | null>(null);
  // A Drive deck the URL asked for (#1111). It waits for the card data, as a `?share=` deck does,
  // because handleFileLoad parses it against `data`. A public deck or the copy of Edit current deck
  // (#1407) has a null id: it loads linked to no Drive file, so a Save opens Save As.
  const [pendingDriveFile, setPendingDriveFile] =
    useState<{ id: string | null; name: string; contents: string; source?: string } | null>(null);
  const [pendingDriveWarning, setPendingDriveWarning] = useState(false);
  // The index rows the API route gave, and the email they were fetched for (#1327).
  const [fetchedChampionshipDecks, setFetchedChampionshipDecks] =
    useState<{ email: string; decks: ChampionshipDeck[] } | null>(null);
  const championshipEmail = session?.user?.email ?? '';

  // The "Championship decks" folder shows to every user, a signed-out user too, when it holds a deck
  // that `visibleChampionshipDecks` lets the user see (#1327). The route filters the index already;
  // the filter here is a second line. Rows fetched for another email do not show.
  const championshipDecks = fetchedChampionshipDecks?.email === championshipEmail
    ? visibleChampionshipDecks(fetchedChampionshipDecks.decks, championshipEmail)
    : [];
  const showChampionshipDecks = championshipDecks.length > 0;

  // The index is fetched only when the folder can show: the picker is open. It is fetched again
  // when the signed-in email changes.
  useEffect(() => {
    if (!showDrivePicker || fetchedChampionshipDecks?.email === championshipEmail) return;
    fetchChampionshipDecks(championshipEmail)
      .then((decks) => setFetchedChampionshipDecks({ email: championshipEmail, decks }))
      .catch(() => {
        // The folder stays hidden, and the Drive files still list.
      });
  }, [showDrivePicker, championshipEmail, fetchedChampionshipDecks?.email]);

  // The "Beginner decks" folder shows to every user, a signed-out user too (#1323, #1387), when it
  // holds a deck that `visibleBeginnerDecks` lets the user see.
  const [allBeginnerDecks, setAllBeginnerDecks] = useState<BeginnerDeck[]>([]);
  const beginnerDecks = visibleBeginnerDecks(allBeginnerDecks, session?.user?.email);
  const showBeginnerDecks = beginnerDecks.length > 0;

  // The index is a static file that does not depend on the user, so it is fetched once, when the
  // picker first opens.
  useEffect(() => {
    if (!showDrivePicker || allBeginnerDecks.length > 0) return;
    fetchBeginnerDecks().then(setAllBeginnerDecks).catch(() => {
      // The folder stays hidden, and the Drive files still list.
    });
  }, [showDrivePicker, allBeginnerDecks.length]);

  useEffect(() => {
    (async () => {
      const sessionFromNextAuth = (await getSession()) as Session;
      const isSessionExpired = sessionFromNextAuth && new Date() > new Date(sessionFromNextAuth.expires);
      const resolvedSession = isSessionExpired ? null : sessionFromNextAuth;
      setSession(resolvedSession);

      const params = new URLSearchParams(window.location.search);
      const driveFileId = params.get('driveFile');
      if (driveFileId) {
        const name = params.get('name') || 'My deck';
        window.history.replaceState({}, '', urlWithoutDriveFileParams(window.location));
        if (isPublicDeckId(driveFileId)) {
          // A public deck needs no session (#1407). It loads as the picker loads it, under its
          // title and with its trekcc.org page when the index is in.
          try {
            const contents = await fetchPublicDeckText(driveFileId);
            const email = resolvedSession?.user?.email ?? '';
            const [championship, beginner] = await Promise.all([
              fetchChampionshipDecks(email).catch(() => []),
              fetchBeginnerDecks().catch(() => []),
            ]);
            const deck = findPublicDeck(driveFileId, championship, beginner);
            setPendingDriveFile({ id: null, name: deck?.title ?? name, contents, source: deck?.source });
          } catch {
            // A deck that does not load leaves the deck builder as it was.
          }
        } else if (resolvedSession) {
          try {
            const response = await fetch(`/api/drive/${encodeURIComponent(driveFileId)}`, { method: 'GET', credentials: 'include' });
            if (response.ok) {
              const contents = await response.json();
              if (typeof contents === 'string') setPendingDriveFile({ id: driveFileId, name, contents });
            }
          } catch {
            // A deck that does not load leaves the deck builder as it was.
          }
        }
        return;
      }
      if (params.has(EDIT_DECK_PARAM)) {
        window.history.replaceState({}, '', urlWithoutDriveFileParams(window.location));
        const handoff = takeEditDeckHandoff();
        if (handoff) setPendingDriveFile({ id: null, ...handoff });
        return;
      }
      if (params.get('openPicker') === 'true') {
        window.history.replaceState({}, '', '/decks');
        if (params.get('pickerMode') === 'compare') {
          setDrivePickerMode('compare');
        }
        setShowDrivePicker(true);
        if (resolvedSession) {
          setLoadingFromGDrive(true);
          const response = await fetch('/api/drive?includeFolders=true', { method: 'GET', credentials: 'include' });
          const json = await response.json();
          setDriveFiles(json.files);
          setLoadingFromGDrive(false);
        }
      }
    })();
  }, []);

  // The deck file of a pending deck. A public deck keeps its trekcc.org page.
  const pendingDeckFile = (file: NonNullable<typeof pendingDriveFile>): DeckFileRecord =>
    ({ id: file.id, name: file.name, ...(file.source ? { source: file.source } : {}) });

  // handleFileLoad clears the source of the old deck file, so the new deck file is set after it.
  const loadPendingDriveFile = (file: NonNullable<typeof pendingDriveFile>) => {
    handleFileLoad(file.name, file.contents);
    setDeckFile(pendingDeckFile(file));
  };

  // Once the card data is in, the deck loads in render when the deck builder is empty or holds that
  // same Drive file, and asks first otherwise. The decision is made once for each deck and `data`.
  const [decidedDriveFile, setDecidedDriveFile] = useState<{ file: typeof pendingDriveFile; data: CardData[] } | null>(null);
  if (pendingDriveFile && data.length > 0 && (decidedDriveFile?.file !== pendingDriveFile || decidedDriveFile.data !== data)) {
    setDecidedDriveFile({ file: pendingDriveFile, data });
    // A deck with no file is never the deck builder's own file, so it asks first unless the builder is empty.
    if (deckIsEmpty || (pendingDriveFile.id !== null && deckFile?.id === pendingDriveFile.id)) {
      // The new deck file replaces the old one whole, source too, so the deck needs no onFullLoad.
      setDeckFile(pendingDeckFile(pendingDriveFile));
      loadDeckInRender(pendingDriveFile.name, pendingDriveFile.contents);
      setPendingDriveFile(null);
    } else {
      setPendingDriveWarning(true);
    }
  }

  const confirmPendingDriveFile = () => {
    if (pendingDriveFile) loadPendingDriveFile(pendingDriveFile);
    setPendingDriveFile(null);
    setPendingDriveWarning(false);
  };

  const cancelPendingDriveFile = () => {
    setPendingDriveFile(null);
    setPendingDriveWarning(false);
  };

  const resetDeckFile = () => {
    setDeckFile({ id: null, name: 'My deck' });
  };

  // A deck that replaces the current one drops the trekcc.org link of a Championship deck.
  const clearDeckSource = () => {
    setDeckFile((prev) => (prev?.source ? { id: prev.id, name: prev.name } : prev));
  };

  // A single selected file keeps today's behaviour (load into the builder). Selecting more
  // than one file at once skips the builder entirely and saves each one straight to Drive.
  const handleFilesLoad = (files: UploadedFile[]) => {
    if (files.length <= 1) {
      const file = files[0];
      if (file) handleFileLoad(file.name, file.content);
      return;
    }
    posthog.capture('deckBuilder.bulkImportFromDisk.start', { fileCount: files.length });
    if (!session) {
      signIn('google', { callbackUrl: '/decks' }, DRIVE_SCOPE_AUTH_PARAMS);
      return;
    }
    startBulkImport(files);
  };

  const startBulkImport = async (files: UploadedFile[]) => {
    setBulkImportPending(files);
    setShowBulkSaveAsDialog(true);
    setLoadingFromGDrive(true);
    const response = await fetch('/api/drive?includeFolders=true', { method: 'GET', credentials: 'include' });
    const json = await response.json();
    setDriveFiles(json.files);
    setLoadingFromGDrive(false);
  };

  const cancelBulkSaveAs = () => {
    setShowBulkSaveAsDialog(false);
    setBulkImportPending(null);
  };

  const requestDriveSignInForBulkImport = () => {
    signIn('google', { callbackUrl: '/decks' }, DRIVE_SCOPE_AUTH_PARAMS);
  };

  const confirmBulkSaveAs = async (targetParentId: string) => {
    setShowBulkSaveAsDialog(false);
    const files = bulkImportPending;
    setBulkImportPending(null);
    if (!files) return;

    const { payloads, failures } = buildBulkImportPayloads(files, data);
    setBulkImportSkipped(failures);
    setBulkImportResults([]);
    setBulkImportError(null);

    if (payloads.length === 0) {
      setBulkImportStatus('done');
      return;
    }

    setBulkImportStatus('saving');
    try {
      const response = await fetch('/api/drive/bulk', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decks: payloads, targetParentId }),
      });

      if (!response.ok) {
        const json = await response.json().catch(() => null);
        if (json?.error === 'drive_scope_missing') {
          setBulkImportStatus('idle');
          requestDriveSignInForBulkImport();
          return;
        }
        throw new Error(json?.error || 'Import failed');
      }

      // The route streams one NDJSON line per deck result as it finishes, so results are
      // read incrementally and appended live instead of waiting for a single JSON body.
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Import failed');
      const decoder = new TextDecoder();
      let buffer = '';
      let scopeMissing = false;

      while (true) {
        const { done, value } = await reader.read();
        if (value) buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          const parsed = JSON.parse(line);
          if (parsed?.error === 'drive_scope_missing') {
            scopeMissing = true;
            break;
          }
          setBulkImportResults((prev) => [...prev, parsed]);
        }
        if (scopeMissing || done) break;
      }

      if (scopeMissing) {
        setBulkImportStatus('idle');
        requestDriveSignInForBulkImport();
        return;
      }
      setBulkImportStatus('done');
      posthog.capture('deckBuilder.bulkImportFromDisk.finish', { fileCount: files.length });
    } catch (err: any) {
      setBulkImportError(err?.message || 'Import failed');
      setBulkImportStatus('done');
    }
  };

  const closeBulkImportResults = () => {
    setBulkImportStatus('idle');
    setBulkImportResults([]);
    setBulkImportSkipped([]);
    setBulkImportError(null);
  };

  const fetchDriveFile = async (driveFile: { id: string; name: string }, piles?: DeckPile[]) => {
    posthog.capture('deckBuilder.driveFileLoad.start');
    setLoadingFromGDrive(true);
    const contents = await fetchDeckText(driveFile.id);

    if (isPublicDeckId(driveFile.id)) {
      // A public deck has no Drive file, so Save opens Save As (#1310, #1323).
      const deck = findPublicDeck(driveFile.id, championshipDecks, allBeginnerDecks);
      const name = deck ? deck.title : driveFile.name;
      handleFileLoad(name, contents, piles);
      if (!piles) setDeckFile({ id: null, name, source: deck?.source });
    } else {
      handleFileLoad(driveFile.name, contents, piles);
      if (!piles) setDeckFile(driveFile);
    }
    setLoadingFromGDrive(false);
    setShowDrivePicker(false);
    posthog.capture('deckBuilder.driveFileLoad.end');
  };

  const fetchCompareDriveFile = async (driveFile: { id: string; name: string }) => {
    posthog.capture('deckBuilder.compareDeckLoad.start');
    setLoadingFromGDrive(true);
    const contents = await fetchDeckText(driveFile.id);
    const incoming = deckFromTsv(contents, data);
    const rows = Object.keys(incoming)
      .map((collectorsinfo) => incoming[collectorsinfo].row)
      .filter((row) => row.count > 0);
    setCompareDeckRows(rows);
    // A public deck compares under its title (#1311, #1323).
    const deck = findPublicDeck(driveFile.id, championshipDecks, allBeginnerDecks);
    setCompareDeckName(deck ? deck.title : driveFile.name);
    setLoadingFromGDrive(false);
    setShowDrivePicker(false);
    posthog.capture('deckBuilder.compareDeckLoad.end');
  };

  const clearCompareDeck = () => {
    setCompareDeckRows([]);
    setCompareDeckName(null);
  };

  const deleteDriveFile = async (file: { id: string }) => {
    posthog.capture('deckBuilder.driveFileDelete.start');
    setDriveFiles(driveFiles.filter((f: DriveFile) => f.id !== file.id && !f.parents?.includes(file.id)));
    await fetch(`/api/drive/${file.id}`, { method: 'DELETE', credentials: 'include' });
    posthog.capture('deckBuilder.driveFileDelete.end');
  };

  const createDriveFolder = async (name: string) => {
    posthog.capture('deckBuilder.driveFolderCreate.start');
    const response = await fetch('/api/drive', {
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify({ folderName: name }),
    });
    const json = await response.json();
    if (json?.file?.id) {
      setDriveFiles((prev) => [
        ...prev,
        { id: json.file.id, name, mimeType: FOLDER_MIME_TYPE, parents: ['appDataFolder'] },
      ]);
    }
    posthog.capture('deckBuilder.driveFolderCreate.end');
  };

  const moveDriveFile = async (file: DriveFile, targetParentId: string) => {
    posthog.capture('deckBuilder.driveFileMove.start');
    const currentParentId = file.parents?.[0] ?? 'appDataFolder';
    if (currentParentId === targetParentId) return;
    const response = await fetch(`/api/drive/${file.id}`, {
      method: 'PUT',
      credentials: 'include',
      body: JSON.stringify({ targetParentId, currentParentId }),
    });
    const json = await response.json();
    setDriveFiles((prev) =>
      prev.map((f: DriveFile) => (f.id === file.id ? { ...f, parents: json.parents ?? [targetParentId] } : f))
    );
    posthog.capture('deckBuilder.driveFileMove.end');
  };

  const renameDriveFile = async (file: { id: string }, newName: string) => {
    posthog.capture('deckBuilder.driveFileRename.start');
    setDriveFiles((prev) => prev.map((f: DriveFile) => (f.id === file.id ? { ...f, name: newName } : f)));
    await fetch(`/api/drive/${file.id}`, {
      method: 'PUT',
      credentials: 'include',
      body: JSON.stringify({ fileName: newName }),
    });
    posthog.capture('deckBuilder.driveFileRename.end');
  };

  const showSavedFeedback = () => {
    setSavedRecently(true);
    setSaveError(null);
    clearDirty();
    setTimeout(() => setSavedRecently(false), 2000);
  };

  // Performs the actual Drive write. targetParentId is only meaningful on create (no
  // deckFile.id yet) and comes from the Save As dialog; updates always write in place.
  const performDriveSave = async (targetParentId?: string) => {
    setSavingToGDrive(true);
    setSaveError(null);
    try {
      let response: Response | null = null;
      if (deckFile?.id) {
        response = await fetch(`/api/drive/${deckFile.id}`, {
          method: 'PUT',
          credentials: 'include',
          body: JSON.stringify({ fileName: deckTitle, content: createLackeyTSV() }),
        });
      } else {
        response = await fetch('/api/drive', {
          method: 'POST',
          credentials: 'include',
          body: JSON.stringify({ fileName: deckTitle, content: createLackeyTSV(), targetParentId }),
        });
      }
      const json = await response.json();
      if (!response.ok) {
        if (json?.error === 'drive_scope_missing') {
          signIn('google', { callbackUrl: '/decks' }, DRIVE_SCOPE_AUTH_PARAMS);
          return;
        }
        setSaveError('Save failed');
      } else {
        if (json?.file?.id) {
          setDeckFile({ id: json.file.id, name: deckTitle });
        } else if (deckFile?.id) {
          setDeckFile({ id: deckFile.id, name: deckTitle });
        }
        showSavedFeedback();
      }
    } catch {
      setSaveError('Save failed');
    } finally {
      setSavingToGDrive(false);
    }
  };

  // Saving a deck that has never been written to Drive (no deckFile.id) opens the Save As
  // dialog to choose a destination folder first, the same pattern desktop apps use for an
  // unsaved document. Saving an already-saved deck updates it in place with no prompt.
  const writeToDrive = async () => {
    if (!session) {
      signIn('google', { callbackUrl: '/decks' }, DRIVE_SCOPE_AUTH_PARAMS);
      return;
    }
    if (savingToGDrive) return;
    if (deckTitle.length === 0) {
      window.alert('please enter a deck name!');
      return;
    }
    if (!deckFile?.id) {
      setShowSaveAsDialog(true);
      setLoadingFromGDrive(true);
      const response = await fetch('/api/drive?includeFolders=true', { method: 'GET', credentials: 'include' });
      const json = await response.json();
      setDriveFiles(json.files);
      setLoadingFromGDrive(false);
      return;
    }
    await performDriveSave();
  };

  const confirmSaveAs = async (targetParentId: string) => {
    setShowSaveAsDialog(false);
    await performDriveSave(targetParentId);
  };

  const cancelSaveAs = () => {
    setShowSaveAsDialog(false);
  };

  const openDrivePicker = async (mode: 'load' | 'compare') => {
    setDrivePickerMode(mode);
    setShowDrivePicker(true);
    setBrowsedFolder(null);
    if (session) {
      setLoadingFromGDrive(true);
      const response = await fetch('/api/drive?includeFolders=true', { method: 'GET', credentials: 'include' });
      const json = await response.json();
      setDriveFiles(json.files);
      setLoadingFromGDrive(false);
    }
  };

  const openDeckPicker = () => openDrivePicker('load');
  const openComparePicker = () => openDrivePicker('compare');

  const closeDrivePicker = () => {
    setShowDrivePicker(false);
    setBrowsedFolder(null);
  };

  return {
    session,
    deckFile,
    resetDeckFile,
    clearDeckSource,
    driveFiles,
    showChampionshipDecks,
    championshipEvents: groupChampionshipDecks(championshipDecks),
    showBeginnerDecks,
    beginnerDecks,
    showDrivePicker,
    drivePickerMode,
    browsedFolder,
    setBrowsedFolder,
    loadingFromGDrive,
    compareDeckRows,
    compareDeckName,
    savingToGDrive,
    savedRecently,
    saveError,
    showSaveAsDialog,
    fetchDriveFile,
    fetchCompareDriveFile,
    clearCompareDeck,
    deleteDriveFile,
    createDriveFolder,
    moveDriveFile,
    renameDriveFile,
    writeToDrive,
    confirmSaveAs,
    cancelSaveAs,
    openDrivePicker,
    openDeckPicker,
    openComparePicker,
    closeDrivePicker,
    handleFilesLoad,
    bulkImportPending,
    showBulkSaveAsDialog,
    bulkImportStatus,
    bulkImportResults,
    bulkImportSkipped,
    bulkImportError,
    cancelBulkSaveAs,
    requestDriveSignInForBulkImport,
    confirmBulkSaveAs,
    closeBulkImportResults,
    pendingDriveWarning,
    pendingDriveFileName: pendingDriveFile?.name ?? null,
    confirmPendingDriveFile,
    cancelPendingDriveFile,
  };
}

export default useDriveSync;
