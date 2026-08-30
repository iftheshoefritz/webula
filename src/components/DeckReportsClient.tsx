'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { getSession, signIn } from 'next-auth/react';
import { FaArrowLeft, FaChartBar, FaFolderOpen, FaTimes } from 'react-icons/fa';
import { DrivePickerModal } from './DrivePickerModal';
import SkillsCompareTable from './SkillsCompareTable';
import PileAggregate from './PileAggregate';
import PileAggregateCostChart from './PileAggregateCostChart';
import PileAggregateAttributeChart from './PileAggregateAttributeChart';
import KeywordBadge from './KeywordBadge';
import SpeciesBadge from './SpeciesBadge';
import IconPill from './IconPill';
import { CardDef } from '../types';
import { deckFromTsv } from '../app/decks/deckBuilderUtils';
import { PRACTICE_DECK_TSV } from '../lib/practiceDeck';
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
}

function rowsFromTsv(tsv: string, data: CardData[]): CardDef[] {
  const deck = deckFromTsv(tsv, data);
  return Object.keys(deck)
    .map((collectorsinfo) => deck[collectorsinfo].row)
    .filter((row) => row.count > 0);
}

export default function DeckReportsClient({ data }: DeckReportsClientProps) {
  const searchParams = useSearchParams();
  const isFixture = searchParams.get('fixture') === '1';

  const [session, setSession] = useState<Session | null>(null);
  const [showDrivePicker, setShowDrivePicker] = useState(false);
  const [driveFiles, setDriveFiles] = useState<any[]>([]);
  const [loadingFromGDrive, setLoadingFromGDrive] = useState(false);
  const [decks, setDecks] = useState<LoadedDeck[]>([]);

  useEffect(() => {
    if (!isFixture || data.length === 0) return;
    setDecks([{ id: 'fixture', name: 'Fixture deck', rows: rowsFromTsv(PRACTICE_DECK_TSV, data) }]);
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
        if (resolvedSession) {
          setLoadingFromGDrive(true);
          const response = await fetch('/api/drive', { method: 'GET', credentials: 'include' });
          const json = await response.json();
          setDriveFiles(json.files);
          setLoadingFromGDrive(false);
        }
      }
    })();
  }, [isFixture]);

  const openPicker = async () => {
    setShowDrivePicker(true);
    if (session) {
      setLoadingFromGDrive(true);
      const response = await fetch('/api/drive', { method: 'GET', credentials: 'include' });
      const json = await response.json();
      setDriveFiles(json.files);
      setLoadingFromGDrive(false);
    }
  };

  const handleConfirmSelection = async (files: { id: string; name: string }[]) => {
    setLoadingFromGDrive(true);
    const loaded = await Promise.all(
      files.map(async (file) => {
        const existing = decks.find((d) => d.id === file.id);
        if (existing) return existing;
        const response = await fetch(`/api/drive/${file.id}`, { method: 'GET', credentials: 'include' });
        const json = await response.json();
        return { id: file.id, name: file.name, rows: rowsFromTsv(json, data) };
      })
    );
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

  const hasDeck = decks.length > 0;
  const singleDeck = decks.length === 1 ? decks[0] : null;

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

      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06]">
        {singleDeck ? (
          <>
            <span className="text-sm text-text-muted">
              Showing <span className="text-text-primary">{singleDeck.name}</span>
            </span>
            <button className="btn-secondary text-sm flex items-center gap-2" onClick={openPicker}>
              <FaFolderOpen />
              Change deck
            </button>
            <button
              type="button"
              aria-label={`Remove ${singleDeck.name}`}
              className="text-text-muted hover:text-text-primary"
              onClick={() => removeDeck(singleDeck.id)}
            >
              <FaTimes />
            </button>
          </>
        ) : decks.length >= 2 ? (
          <span className="text-sm text-text-muted">
            Comparing <span className="text-text-primary">{decks.length}</span> decks
          </span>
        ) : (
          <button className="btn-secondary text-sm flex items-center gap-2" onClick={openPicker}>
            <FaFolderOpen />
            Pick a deck
          </button>
        )}
      </div>

      {!hasDeck && (
        <div className="flex flex-col items-center justify-center flex-1 text-text-muted gap-2 p-8">
          <FaChartBar className="text-4xl" />
          <p className="text-lg">No deck selected.</p>
          <p className="text-sm">Pick a deck from Google Drive to see its report.</p>
        </div>
      )}

      {decks.length >= 2 && (
        <div className="p-4 flex flex-col gap-4">
          <h2 className="text-xl font-bold text-text-secondary">Selected decks</h2>
          <ul className="flex flex-col gap-2">
            {decks.map((deck) => (
              <li key={deck.id} className="flex items-center justify-between border border-white/10 px-3 py-2">
                <span className="text-text-primary truncate">{deck.name}</span>
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
      )}

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
              <PileAggregateCostChart decks={decks} filterFunction={(row) => row.pile === 'draw'} />
            </div>
            <div className="w-full lg:w-1/2">
              <span className="text-lg font-semibold mt-4 mb-2 block text-text-secondary">Dilemma Pile</span>
              <PileAggregateCostChart decks={decks} filterFunction={(row) => row.pile === 'dilemma'} />
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
                />
              </div>
            ))}
          </div>
        </section>
      </div>

      {singleDeck && (
        <div className="p-4 flex flex-col gap-8">
          <section>
            <h2 className="text-xl font-bold mb-2 text-text-secondary">Keywords</h2>
            <PileAggregate
              currentDeckRows={singleDeck.rows}
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
            >
              {([keyword, count]) => <KeywordBadge key={keyword} keyword={keyword} count={count} />}
            </PileAggregate>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-2 text-text-secondary">Species</h2>
            <PileAggregate
              currentDeckRows={singleDeck.rows}
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
            >
              {([species, count]) => <SpeciesBadge key={species} species={species} count={count} />}
            </PileAggregate>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-2 text-text-secondary">Icons</h2>
            <PileAggregate
              currentDeckRows={singleDeck.rows}
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
            >
              {([icon, count]) => <IconPill key={icon} icon={icon} count={count} />}
            </PileAggregate>
          </section>
        </div>
      )}

      {showDrivePicker && (
        <DrivePickerModal
          driveFiles={driveFiles}
          loadDriveFile={() => {}}
          deleteDriveFile={deleteDriveFile}
          inProgress={loadingFromGDrive}
          onClose={() => setShowDrivePicker(false)}
          isSignedIn={!!session}
          hasDriveScope={session?.hasDriveScope ?? false}
          mode="compare-multi"
          onConfirmSelection={handleConfirmSelection}
          preSelectedFiles={decks.map((d) => ({ id: d.id, name: d.name }))}
          onSignIn={() => signIn('google',
            { callbackUrl: '/decks/reports?openPicker=true' },
            { scope: 'openid profile email https://www.googleapis.com/auth/drive.appdata', include_granted_scopes: 'true' }
          )}
        />
      )}
    </div>
  );
}
