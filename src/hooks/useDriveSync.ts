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
import { isEarlyAccessUser } from '../lib/featureFlags';
import {
  fetchTournamentDeckText,
  fetchTournamentDecks,
  findTournamentDeck,
  groupTournamentDecks,
  isTournamentDeckId,
  tournamentDeckTitle,
} from '../lib/tournamentDecks';
import type { TournamentDeck } from '../lib/tournamentDecks';

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

// The `?driveFile=<id>&name=<name>` parameters (#1111) open one Drive deck, the Edit button of the
// practice table's Load deck picker. Both are removed from the URL and any other parameter stays.
export function urlWithoutDriveFileParams(location: { pathname: string; search: string; hash: string }) {
  const params = new URLSearchParams(location.search);
  params.delete('driveFile');
  params.delete('name');
  const query = params.toString();
  return `${location.pathname}${query ? `?${query}` : ''}${location.hash}`;
}

// The deck builder's Save target. `source` is the trekcc.org page of a loaded tournament deck (#1310).
export interface DeckFileRecord {
  id: string | null;
  name: string;
  source?: string;
}

// A deck's text: a tournament deck from `public/tournament-decks/`, any other id from Drive.
async function fetchDeckText(id: string): Promise<string> {
  if (isTournamentDeckId(id)) return fetchTournamentDeckText(id);
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
  // because handleFileLoad parses it against `data`.
  const [pendingDriveFile, setPendingDriveFile] = useState<{ id: string; name: string; contents: string } | null>(null);
  const [pendingDriveWarning, setPendingDriveWarning] = useState(false);
  const [tournamentDecks, setTournamentDecks] = useState<TournamentDeck[]>([]);

  // The "Tournament decks" folder shows only to an early-access user with Drive scope (#1286).
  const showTournamentDecks = !!session?.hasDriveScope && isEarlyAccessUser(session?.user?.email);

  // The index is fetched only when the folder will show: the picker is open, in load or compare mode.
  useEffect(() => {
    if (!showDrivePicker || !showTournamentDecks || tournamentDecks.length > 0) return;
    fetchTournamentDecks().then(setTournamentDecks).catch(() => {
      // The folder stays empty, and the Drive files still list.
    });
  }, [showDrivePicker, showTournamentDecks, tournamentDecks.length]);

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
        if (resolvedSession) {
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

  const loadPendingDriveFile = (file: { id: string; name: string; contents: string }) => {
    setDeckFile({ id: file.id, name: file.name });
    handleFileLoad(file.name, file.contents);
  };

  // Once the card data is in, the deck loads in render when the deck builder is empty or holds that
  // same Drive file, and asks first otherwise. The decision is made once for each deck and `data`.
  const [decidedDriveFile, setDecidedDriveFile] = useState<{ file: typeof pendingDriveFile; data: CardData[] } | null>(null);
  if (pendingDriveFile && data.length > 0 && (decidedDriveFile?.file !== pendingDriveFile || decidedDriveFile.data !== data)) {
    setDecidedDriveFile({ file: pendingDriveFile, data });
    if (deckIsEmpty || deckFile?.id === pendingDriveFile.id) {
      // The new deck file has no source, so the deck needs no onFullLoad.
      setDeckFile({ id: pendingDriveFile.id, name: pendingDriveFile.name });
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

  // A deck that replaces the current one drops the trekcc.org link of a tournament deck.
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

    if (isTournamentDeckId(driveFile.id)) {
      // A tournament deck has no Drive file, so Save opens Save As (#1310).
      const deck = findTournamentDeck(tournamentDecks, driveFile.id);
      const name = deck ? tournamentDeckTitle(deck) : driveFile.name;
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
    // A tournament deck compares under its title, `<deckName> - <player> - <event>` (#1311).
    const deck = isTournamentDeckId(driveFile.id) ? findTournamentDeck(tournamentDecks, driveFile.id) : undefined;
    setCompareDeckName(deck ? tournamentDeckTitle(deck) : driveFile.name);
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
    showTournamentDecks,
    tournamentEvents: groupTournamentDecks(tournamentDecks),
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
