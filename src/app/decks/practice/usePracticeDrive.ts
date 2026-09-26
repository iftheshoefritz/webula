import { useState } from 'react';
import { getSession, signIn } from 'next-auth/react';
import { DRIVE_SCOPE_AUTH_PARAMS } from '../../../hooks/useDriveSync';
import type { DriveFile, Session } from '../../../hooks/useDriveSync';

// The Drive picker of the practice table (#780). A small version of useDriveSync: that hook
// writes the picked file to localStorage.deckFile (the deck builder's Save target) and rewrites
// the URL to /decks on mount, and both would break the practice table.
export function usePracticeDrive() {
  const [showPicker, setShowPicker] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [browsedFolder, setBrowsedFolder] = useState<DriveFile | null>(null);
  const [loading, setLoading] = useState(false);

  // The session is looked up when the picker opens, not on mount, so the table makes no session
  // request until the player asks for a deck.
  const openPicker = async () => {
    setShowPicker(true);
    const fromNextAuth = (await getSession()) as Session | null;
    const resolved = fromNextAuth && new Date() > new Date(fromNextAuth.expires) ? null : fromNextAuth;
    setSession(resolved);
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

  // Fetches a deck file as a Lackey TSV string, or null when the fetch fails.
  const fetchDeckTsv = async (file: { id: string }): Promise<string | null> => {
    setLoading(true);
    try {
      const response = await fetch(`/api/drive/${file.id}`, { method: 'GET', credentials: 'include' });
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    } finally {
      setLoading(false);
    }
  };

  const deleteDriveFile = async (file: { id: string }) => {
    setDriveFiles((files) => files.filter((f) => f.id !== file.id && !f.parents?.includes(file.id)));
    await fetch(`/api/drive/${file.id}`, { method: 'DELETE', credentials: 'include' });
  };

  const signInToDrive = () => {
    signIn('google', { callbackUrl: '/decks/practice' }, DRIVE_SCOPE_AUTH_PARAMS);
  };

  return {
    showPicker,
    openPicker,
    closePicker,
    session,
    driveFiles,
    browsedFolder,
    setBrowsedFolder,
    loading,
    fetchDeckTsv,
    deleteDriveFile,
    signInToDrive,
  };
}
