'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { getSession, signIn } from 'next-auth/react';
import { FaArrowLeft, FaChartBar, FaFolderOpen, FaSave, FaTimes } from 'react-icons/fa';
import { DrivePickerModal } from './DrivePickerModal';
import SkillsCompareTable from './SkillsCompareTable';
import CardsInCommonTable from './CardsInCommonTable';
import CharacteristicCompareTable from './CharacteristicCompareTable';
import IconCompareTable from './IconCompareTable';
import PileAggregateCostChart from './PileAggregateCostChart';
import PileAggregateAttributeChart from './PileAggregateAttributeChart';
import PileAggregateRadarChart from './PileAggregateRadarChart';
import { CardDef } from '../types';
import { deckFromTsv } from '../app/decks/deckBuilderUtils';
import { PRACTICE_DECK_TSV, PRACTICE_DECK_TSV_2 } from '../lib/practiceDeck';
import type { CardData } from '../lib/loadCards';

interface Session {
  accessToken: string;
  session: { user: { name: string; email: string } };
  user: { name: string; email: string };
  expires: string;
  hasDriveScope?: boolean;
}

interface DeckReportsClientProps {
  data: CardData[];
}

interface LoadedDeck {
  id: string;
  name: string;
  rows: CardDef[];
  error?: string;
}

function rowsFromTsv(tsv: string, data: CardData[]): CardDef[] {
  const deck = deckFromTsv(tsv, data);
  return Object.keys(deck)
    .map((collectorsinfo) => deck[collectorsinfo].row)
    .filter((row) => row.count > 0);
}

// Fetches the content for each deck ref, reusing already-loaded rows when a ref matches
// a deck that's already in state. A ref whose file can no longer be fetched (e.g. deleted
// from Drive since a Report was saved) surfaces as a per-deck load error rather than
// failing the whole load.
async function fetchDeckRefs(
  files: { id: string; name: string }[],
  data: CardData[],
  cachedDecks: LoadedDeck[]
): Promise<LoadedDeck[]> {
  return Promise.all(
    files.map(async (file) => {
      const existing = cachedDecks.find((d) => d.id === file.id);
      if (existing) return existing;
      try {
        const response = await fetch(`/api/drive/${file.id}`, { method: 'GET', credentials: 'include' });
        if (!response.ok) throw new Error('Failed to load deck');
        const json = await response.json();
        return { id: file.id, name: file.name, rows: rowsFromTsv(json, data) };
      } catch {
        return { id: file.id, name: file.name, rows: [], error: 'Failed to load this deck' };
      }
    })
  );
}

export default function DeckReportsClient({ data }: DeckReportsClientProps) {
  const searchParams = useSearchParams();
  const isFixture = searchParams.get('fixture') === '1';

  const [session, setSession] = useState<Session | null>(null);
  const [showDrivePicker, setShowDrivePicker] = useState(false);
  const [driveFiles, setDriveFiles] = useState<any[]>([]);
  const [browsedFolder, setBrowsedFolder] = useState<{ id: string; name: string } | null>(null);
  const [loadingFromGDrive, setLoadingFromGDrive] = useState(false);
  const [decks, setDecks] = useState<LoadedDeck[]>([]);
  const [showReportsPicker, setShowReportsPicker] = useState(false);
  const [reportFiles, setReportFiles] = useState<any[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [reportName, setReportName] = useState('');
  const [savingReport, setSavingReport] = useState(false);

  useEffect(() => {
    if (!isFixture || data.length === 0) return;
    setDecks([
      { id: 'fixture-1', name: 'Fixture deck A', rows: rowsFromTsv(PRACTICE_DECK_TSV, data) },
      { id: 'fixture-2', name: 'Fixture deck B', rows: rowsFromTsv(PRACTICE_DECK_TSV_2, data) },
    ]);
  }, [isFixture, data]);

  useEffect(() => {
    if (isFixture) return;
    (async () => {
      const sessionFromNextAuth = (await getSession()) as Session;
      const isSessionExpired = sessionFromNextAuth && new Date() > new Date(sessionFromNextAuth.expires);
      const resolvedSession = isSessionExpired ? null : sessionFromNextAuth;
      setSession(resolvedSession);

      const params = new URLSearchParams(window.location.search);
      if (params.get('openPicker') === 'true') {
        window.history.replaceState({}, '', '/decks/reports');
        setShowDrivePicker(true);
        setBrowsedFolder(null);
        if (resolvedSession) {
          setLoadingFromGDrive(true);
          const response = await fetch('/api/drive?includeFolders=true', { method: 'GET', credentials: 'include' });
          const json = await response.json();
          setDriveFiles(json.files);
          setLoadingFromGDrive(false);
        }
      }

      if (params.get('openReports') === 'true') {
        window.history.replaceState({}, '', '/decks/reports');
        setShowReportsPicker(true);
        if (resolvedSession) {
          setLoadingReports(true);
          const response = await fetch('/api/drive/reports', { method: 'GET', credentials: 'include' });
          const json = await response.json();
          setReportFiles(json.files ?? []);
          setLoadingReports(false);
        }
      }

      const reportId = params.get('report');
      if (reportId && resolvedSession) {
        window.history.replaceState({}, '', '/decks/reports');
        setLoadingFromGDrive(true);
        const response = await fetch(`/api/drive/${reportId}`, { method: 'GET', credentials: 'include' });
        const json = await response.json();
        const refs: { id: string; name: string }[] = json?.decks ?? [];
        const loaded = await fetchDeckRefs(refs, data, []);
        setDecks(loaded);
        setLoadingFromGDrive(false);
      }
    })();
  }, [isFixture]);

  const openPicker = async () => {
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

  const handleConfirmSelection = async (files: { id: string; name: string }[]) => {
    setLoadingFromGDrive(true);
    const loaded = await fetchDeckRefs(files, data, decks);
    setDecks(loaded);
    setLoadingFromGDrive(false);
    setShowDrivePicker(false);
  };

  const removeDeck = (id: string) => {
    setDecks((prev) => prev.filter((d) => d.id !== id));
  };

  const deleteDriveFile = async (file: { id: string }) => {
    setDriveFiles(driveFiles.filter((f: { id: string }) => f.id !== file.id));
    await fetch(`/api/drive/${file.id}`, { method: 'DELETE', credentials: 'include' });
  };

  const openReportsPicker = async () => {
    setShowReportsPicker(true);
    if (session) {
      setLoadingReports(true);
      const response = await fetch('/api/drive/reports', { method: 'GET', credentials: 'include' });
      const json = await response.json();
      setReportFiles(json.files ?? []);
      setLoadingReports(false);
    }
  };

  const loadReport = async (file: { id: string; name: string }) => {
    setLoadingFromGDrive(true);
    const response = await fetch(`/api/drive/${file.id}`, { method: 'GET', credentials: 'include' });
    const json = await response.json();
    const refs: { id: string; name: string }[] = json?.decks ?? [];
    const loaded = await fetchDeckRefs(refs, data, []);
    setDecks(loaded);
    setLoadingFromGDrive(false);
    setShowReportsPicker(false);
  };

  const saveReport = async () => {
    const name = reportName.trim();
    if (!name || decks.length === 0) return;
    if (!session) {
      signIn('google',
        { callbackUrl: '/decks/reports' },
        { scope: 'openid profile email https://www.googleapis.com/auth/drive.appdata', include_granted_scopes: 'true' }
      );
      return;
    }
    setSavingReport(true);
    try {
      const response = await fetch('/api/drive/reports', {
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ name, decks: decks.map((d) => ({ id: d.id, name: d.name })) }),
      });
      const json = await response.json();
      if (!response.ok) {
        if (json?.error === 'drive_scope_missing') {
          signIn('google',
            { callbackUrl: '/decks/reports' },
            { scope: 'openid profile email https://www.googleapis.com/auth/drive.appdata', include_granted_scopes: 'true' }
          );
        }
        return;
      }
      setReportName('');
    } finally {
      setSavingReport(false);
    }
  };

  const renameReportFile = async (file: { id: string }, newName: string) => {
    setReportFiles((prev) => prev.map((f: { id: string }) => (f.id === file.id ? { ...f, name: newName } : f)));
    await fetch(`/api/drive/${file.id}`, {
      method: 'PUT',
      credentials: 'include',
      body: JSON.stringify({ fileName: newName }),
    });
  };

  const deleteReportFile = async (file: { id: string }) => {
    setReportFiles((prev) => prev.filter((f: { id: string }) => f.id !== file.id));
    await fetch(`/api/drive/${file.id}`, { method: 'DELETE', credentials: 'include' });
  };

  const hasDeck = decks.length > 0;

  return (
    <div className="min-h-screen bg-gradient-page font-body text-text-primary flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-[#131713]">
        <Link href="/decks" className="flex items-center gap-2 text-text-muted hover:text-text-primary transition-colors text-sm">
          <FaArrowLeft />
          Back to Deck Builder
        </Link>
        <span className="text-lg font-display font-medium text-text-primary">Deck Reports</span>
        <div className="w-24" />
      </div>

      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06] flex-wrap">
        <button className="btn-secondary text-sm flex items-center gap-2" onClick={openPicker}>
          <FaFolderOpen />
          Select decks
        </button>

        <div className="flex items-center gap-2 ml-auto">
          <button className="btn-secondary text-sm flex items-center gap-2" onClick={openReportsPicker}>
            <FaFolderOpen />
            My Reports
          </button>
          {hasDeck && (
            <>
              <input
                type="text"
                aria-label="Report name"
                placeholder="Report name"
                value={reportName}
                onChange={(e) => setReportName(e.target.value)}
                className="bg-white/[0.05] text-text-primary text-sm py-1.5 px-2 rounded border border-white/10 placeholder:text-text-disabled focus:outline-none focus:border-accent/40"
              />
              <button
                type="button"
                className="btn-secondary text-sm flex items-center gap-2"
                disabled={!reportName.trim() || savingReport}
                onClick={saveReport}
              >
                <FaSave />
                {savingReport ? 'Saving...' : 'Save as Report'}
              </button>
            </>
          )}
        </div>
      </div>

      {!hasDeck && (
        <div className="flex flex-col items-center justify-center flex-1 text-text-muted gap-2 p-8">
          <FaChartBar className="text-4xl" />
          <p className="text-lg">No deck selected.</p>
          <p className="text-sm">Select decks from Google Drive to see their report.</p>
        </div>
      )}

      <div className="p-4 flex flex-col gap-4">
        <h2 className="text-xl font-bold text-text-secondary">Selected decks</h2>
        <ul className="flex flex-col gap-2">
          {decks.map((deck) => (
            <li key={deck.id} className="flex items-center justify-between border border-white/10 px-3 py-2">
              <span className="text-text-primary truncate">
                {deck.name}
                {deck.error && <span className="text-red-400 text-xs ml-2">({deck.error})</span>}
              </span>
              <button
                type="button"
                aria-label={`Remove ${deck.name}`}
                className="text-text-muted hover:text-text-primary"
                onClick={() => removeDeck(deck.id)}
              >
                <FaTimes />
              </button>
            </li>
          ))}
        </ul>
        {decks.length < 5 && (
          <button className="btn-secondary text-sm flex items-center gap-2 self-start" onClick={openPicker}>
            <FaFolderOpen />
            Add deck
          </button>
        )}
      </div>

      <div className="p-4 flex flex-col gap-8">
        <section>
          <h2 className="text-xl font-bold mb-2 text-text-secondary">Overview</h2>
          <PileAggregateRadarChart decks={decks} />
        </section>
      </div>

      <div className="p-4 flex flex-col gap-8">
        <section>
          <h2 className="text-xl font-bold mb-2 text-text-secondary">Personnel skills</h2>
          <SkillsCompareTable decks={decks} />
        </section>
      </div>

      <div className="p-4 flex flex-col gap-8">
        <section>
          <h2 className="text-xl font-bold mb-2 text-text-secondary">Costs</h2>
          <div className="flex flex-col lg:flex-row">
            <div className="w-full lg:w-1/2">
              <span className="text-lg font-semibold mt-4 mb-2 block text-text-secondary">Draw Deck</span>
              <PileAggregateCostChart decks={decks} filterFunction={(row) => row.pile === 'draw'} type="line" />
            </div>
            <div className="w-full lg:w-1/2">
              <span className="text-lg font-semibold mt-4 mb-2 block text-text-secondary">Dilemma Pile</span>
              <PileAggregateCostChart decks={decks} filterFunction={(row) => row.pile === 'dilemma'} type="line" />
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-2 text-text-secondary">Attributes</h2>
          <div className="flex flex-col lg:flex-row">
            {(['integrity', 'cunning', 'strength'] as const).map((attr) => (
              <div key={attr} className="w-full lg:w-1/3">
                <span className="text-lg font-semibold mt-4 mb-2 block text-text-secondary capitalize">{attr}</span>
                <PileAggregateAttributeChart
                  decks={decks}
                  filterFunction={(row) => row.pile === 'draw' && row.type === 'personnel'}
                  attribute={attr}
                  type="line"
                />
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="p-4 flex flex-col gap-8">
        <section>
          <h2 className="text-xl font-bold mb-2 text-text-secondary">Keywords</h2>
          <CharacteristicCompareTable
            decks={decks}
            label="Keyword"
            characteristicName="keywords"
            filterFunction={(row) => row.pile === 'draw' && row.type === 'personnel'}
            splitFunction={(keywords) =>
              keywords
                .split('.')
                .map((k: string) => k.trim())
                .filter((k: string) => k.length > 0)
            }
            assembleCounts={(counts, keyword, count) => {
              counts[keyword] = (counts[keyword] || 0) + count;
              return counts;
            }}
          />
        </section>

        <section>
          <h2 className="text-xl font-bold mb-2 text-text-secondary">Species</h2>
          <CharacteristicCompareTable
            decks={decks}
            label="Species"
            characteristicName="species"
            filterFunction={(row) => row.pile === 'draw' && row.type === 'personnel'}
            splitFunction={(species) =>
              species
                .split('/')
                .map((s: string) => s.trim())
                .filter((s: string) => s.length > 0)
            }
            assembleCounts={(counts, species, count) => {
              counts[species] = (counts[species] || 0) + count;
              return counts;
            }}
          />
        </section>

        <section>
          <h2 className="text-xl font-bold mb-2 text-text-secondary">Icons</h2>
          <IconCompareTable
            decks={decks}
            label="Icon"
            characteristicName="icons"
            filterFunction={(row) => row.pile === 'draw' && row.type === 'personnel'}
            splitFunction={(keywords) =>
              keywords
                .split(/[[\]]/)
                .map((k: string) => k.trim())
                .filter((k: string) => k.length > 0)
            }
            assembleCounts={(counts, icon, count) => {
              counts[icon] = (counts[icon] || 0) + count;
              return counts;
            }}
          />
        </section>
      </div>

      <div className="p-4 flex flex-col gap-8">
        <section>
          <h2 className="text-xl font-bold mb-2 text-text-secondary">Mission cards in common</h2>
          <CardsInCommonTable decks={decks} filterFunction={(row) => row.pile === 'mission'} />
        </section>

        <section>
          <h2 className="text-xl font-bold mb-2 text-text-secondary">Draw deck cards in common</h2>
          <CardsInCommonTable decks={decks} filterFunction={(row) => row.pile === 'draw'} />
        </section>

        <section>
          <h2 className="text-xl font-bold mb-2 text-text-secondary">Dilemma cards in common</h2>
          <CardsInCommonTable decks={decks} filterFunction={(row) => row.pile === 'dilemma'} />
        </section>
      </div>

      {showDrivePicker && (
        <DrivePickerModal
          driveFiles={driveFiles}
          loadDriveFile={() => {}}
          deleteDriveFile={deleteDriveFile}
          inProgress={loadingFromGDrive}
          onClose={() => { setShowDrivePicker(false); setBrowsedFolder(null); }}
          isSignedIn={!!session}
          hasDriveScope={session?.hasDriveScope ?? false}
          mode="compare-multi"
          onConfirmSelection={handleConfirmSelection}
          preSelectedFiles={decks.map((d) => ({ id: d.id, name: d.name }))}
          browsedFolder={browsedFolder}
          onBrowseFolder={setBrowsedFolder}
          onSignIn={() => signIn('google',
            { callbackUrl: '/decks/reports?openPicker=true' },
            { scope: 'openid profile email https://www.googleapis.com/auth/drive.appdata', include_granted_scopes: 'true' }
          )}
        />
      )}

      {showReportsPicker && (
        <DrivePickerModal
          driveFiles={reportFiles}
          loadDriveFile={(file) => loadReport(file)}
          deleteDriveFile={deleteReportFile}
          onRenameFile={renameReportFile}
          inProgress={loadingReports}
          onClose={() => setShowReportsPicker(false)}
          isSignedIn={!!session}
          hasDriveScope={session?.hasDriveScope ?? false}
          mode="reports"
          onSignIn={() => signIn('google',
            { callbackUrl: '/decks/reports?openReports=true' },
            { scope: 'openid profile email https://www.googleapis.com/auth/drive.appdata', include_granted_scopes: 'true' }
          )}
        />
      )}
    </div>
  );
}
