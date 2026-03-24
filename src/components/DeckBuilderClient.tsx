'use client';

import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import posthog from 'posthog-js';
import { useSearchParams } from 'next/navigation';
import useFilterData from '../hooks/useFilterData';
import useLocalStorage from '../hooks/useLocalStorage';
import DeckUploader from './DeckUploader';
import DeckListPile from './DeckListPile';
import { DrivePickerModal } from './DrivePickerModal';
import PileAggregate from './PileAggregate';
import IconPill from './IconPill';
import PileAggregateCostChart from './PileAggregateCostChart';
import SkillsChart from './SkillsChart';
import SearchBar from './SearchBar';
import SearchPills from './SearchPills';
import SearchResults from './SearchResults';
import { CardDef, Deck } from '../types';
import { getSession, signIn } from 'next-auth/react';
import { aboveMinimumCount, belowMaximumCount, deckFromTsv, expandDeck, decrementedRow, findExistingOrUseRow, incrementedRow, mergeDeckPiles, numericCount } from '../app/decks/deckBuilderUtils';
import { missionRequirements } from '../lib/missionRequirements';
import type { DeckPile } from '../app/decks/deckBuilderUtils';
import Link from 'next/link';
import { FaSave, FaCloudUploadAlt, FaSearch, FaTrash, FaFileExport, FaSignInAlt, FaFolderOpen, FaList, FaChevronRight, FaChevronDown, FaChartBar, FaPlayCircle, FaPlus, FaTh } from 'react-icons/fa';
import { Tooltip } from 'react-tooltip';
import type { CardData } from '../lib/loadCards';
import { PRACTICE_DECK_TSV } from '../lib/practiceDeck';
import { isEarlyAccessUser } from '../lib/featureFlags';

const skillList = [
  'acquisition',
  'anthropology',
  'archaeology',
  'astrometrics',
  'biology',
  'diplomacy',
  'engineer',
  'exobiology',
  'geology',
  'honor',
  'intelligence',
  'law',
  'leadership',
  'medical',
  'navigation',
  'officer',
  'physics',
  'programming',
  'science',
  'security',
  'telepathy',
  'transporters',
  'treachery',
];

interface Session {
  accessToken: string;
  session: { user: { name: string; email: string } };
  user: { name: string; email: string };
  expires: string;
  hasDriveScope?: boolean;
}

interface DeckBuilderClientProps {
  data: CardData[];
  columns: string[];
}

interface CollapsibleSectionProps {
  title: string;
  children: React.ReactNode;
}

function CollapsibleSection({ title, children }: CollapsibleSectionProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  return (
    <div className="container mx-auto p-4">
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="text-2xl font-display font-medium mt-4 mb-2 flex items-center gap-2 w-full text-left text-text-primary"
      >
        {title}
        {isCollapsed ? <FaChevronRight className="text-lg" /> : <FaChevronDown className="text-lg" />}
      </button>
      {!isCollapsed && children}
    </div>
  );
}

export default function DeckBuilderClient({ data, columns }: DeckBuilderClientProps) {
  const searchParams = useSearchParams();
  const isFixture = searchParams.get('fixture') === '1';

  const [searchQuery, setSearchQuery] = useState('');
  const filteredData = useFilterData(false, data, columns, searchQuery);

  const [browserDecks, setBrowserDecks] = useLocalStorage<Array<{ name: string; deck: Deck }>>('browserDecks', []);
  const [localCurrentDeck, setLocalCurrentDeck] = useLocalStorage<Deck>('currentDeck', {});
  const [fixtureCurrentDeck, setFixtureCurrentDeck] = useState<Deck>({});
  const currentDeck = isFixture ? fixtureCurrentDeck : localCurrentDeck;
  const setCurrentDeck = isFixture ? setFixtureCurrentDeck : setLocalCurrentDeck;
  const [deckTitle, setDeckTitle] = useLocalStorage<string>('deckTitle', '');
  const [deckFile, setDeckFile] = useLocalStorage<{ id: string | null; name: string }>('deckFile', { id: null, name: 'My deck' });
  const [driveFiles, setDriveFiles] = useState([]);
  const [showDrivePicker, setShowDrivePicker] = useState(false);
  const [loadingFromGDrive, setLoadingFromGDrive] = useState(false);
  const [savingToGDrive, setSavingToGDrive] = useState(false);
  const [savedRecently, setSavedRecently] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [loadedBrowserDeckName, setLoadedBrowserDeckName] = useState<string | null>(null);
  const isFirstRender = useRef(true);
  const suppressDirtyRef = useRef(false);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (suppressDirtyRef.current) {
      suppressDirtyRef.current = false;
      setIsDirty(false);
      return;
    }
    setIsDirty(true);
  }, [currentDeck, deckTitle]);

  useEffect(() => {
    (async () => {
      const sessionFromNextAuth = (await getSession()) as Session;
      const isSessionExpired = sessionFromNextAuth && new Date() > new Date(sessionFromNextAuth.expires);
      const resolvedSession = isSessionExpired ? null : sessionFromNextAuth;
      setSession(resolvedSession);

      const params = new URLSearchParams(window.location.search);
      if (params.get('openPicker') === 'true') {
        window.history.replaceState({}, '', '/decks');
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
  }, []);

  useEffect(() => {
    if (!isFixture || data.length === 0) return;
    setFixtureCurrentDeck(deckFromTsv(PRACTICE_DECK_TSV, data));
  }, [data, isFixture]);

  useEffect(() => {
    console.log('currentDeck modified!');
    console.log(currentDeck);
  }, [currentDeck]);

  const incrementIncluded = useCallback(
    (row: CardDef) => {
      console.log('incrementIncluded: ');
      console.log(row.collectorsinfo);
      console.log('incrementIncluded wants to increment: ' + numericCount(currentDeck[row.collectorsinfo]));
      if (belowMaximumCount(currentDeck[row.collectorsinfo])) {
        const currentRow = findExistingOrUseRow(currentDeck, row);
        console.log('found currentRow with count: ' + numericCount(currentRow));

        const newRow = incrementedRow(currentRow);
        setCurrentDeck((prevState) => ({
          ...prevState,
          [row.collectorsinfo]: {
            count: newRow.count,
            row: newRow,
          },
        }));
      }
    },
    [currentDeck, setCurrentDeck]
  );

  const decrementIncluded = useCallback(
    (event: any, row: CardDef) => {
      console.log('decrementIncluded: ' + row.collectorsinfo);
      event.preventDefault();
      if (aboveMinimumCount(currentDeck[row.collectorsinfo])) {
        console.log('function thinks it is possible to decrement from ' + numericCount(currentDeck[row.collectorsinfo]));
        const newRow = decrementedRow(currentDeck[row.collectorsinfo].row);
        setCurrentDeck((prevState) => ({
          ...prevState,
          [row.collectorsinfo]: {
            count: newRow.count,
            row: newRow,
          },
        }));
      } else {
        console.log('function thinks it is NOT possible to decrement:');
        console.log(numericCount(currentDeck[row.collectorsinfo]));
      }
    },
    [currentDeck, setCurrentDeck]
  );

  const clearDeck = () => {
    setCurrentDeck({});
    setDeckTitle('');
    setDeckFile({ id: null, name: 'My deck' });
  };

  const handleFileLoad = (name: string, contents: string, piles?: DeckPile[]) => {
    posthog.capture('deckBuilder.handleFileLoad.start');

    const incoming = deckFromTsv(contents, data);
    const next = piles ? mergeDeckPiles(currentDeck, incoming, piles) : incoming;
    setCurrentDeck(next);
    if (name && !piles) {
      setDeckTitle(name.replace('.txt', ''));
    }
    posthog.capture('deckBuilder.handleFileLoad.finish', { lines: Object.keys(currentDeck).length });
  };

  const fetchDriveFile = async (driveFile: { id: string; name: string }, piles?: DeckPile[]) => {
    posthog.capture('deckBuilder.driveFileLoad.start');
    console.log('id from modal', driveFile.id);
    setLoadingFromGDrive(true);
    const response = await fetch(`/api/drive/${driveFile.id}`, { method: 'GET', credentials: 'include' });
    const json = await response.json();
    console.log(`fetched ${driveFile.id} `, json);

    if (!piles) setDeckFile(driveFile);
    handleFileLoad(driveFile.name, json, piles);
    setLoadingFromGDrive(false);
    setShowDrivePicker(false);
    posthog.capture('deckBuilder.driveFileLoad.end');
  };

  const deleteDriveFile = async (file: { id: number }) => {
    posthog.capture('deckBuilder.driveFileDelete.start');
    console.log('file', file);
    console.log('id from modal', file.id);
    setDriveFiles(driveFiles.filter((f: { id: number }) => f.id !== file.id));
    await fetch(`/api/drive/${file.id}`, { method: 'DELETE', credentials: 'include' });
    posthog.capture('deckBuilder.driveFileDelete.end');
  };

  const deleteBrowserFile = (file: { name: string }) => {
    setBrowserDecks(browserDecks.filter((deck: { name: string }) => deck.name !== file.name));
  };

  const createLackeyTSV = (): string => {
    const lackeyPileNameFor: Record<string, string> = {
      mission: 'Missions:',
      dilemma: 'Dilemmas:',
      draw: 'Deck:',
    };
    const lackeyPileOrder: Record<string, number> = {
      draw: 0,
      dilemma: 1,
      mission: 2,
    };
    const tsvArray: string[] = [];
    let currentPile = '';

    const sortedCollectorsInfo = Object.keys(currentDeck).sort(
      (a, b) => lackeyPileOrder[currentDeck[a].row.pile] - lackeyPileOrder[currentDeck[b].row.pile]
    );
    for (const collectorsinfo of sortedCollectorsInfo) {
      const card = currentDeck[collectorsinfo];
      if (card.row.pile !== currentPile) {
        currentPile = card.row.pile;
        tsvArray.push(lackeyPileNameFor[currentPile]);
      }
      if (card.count > 0) {
        tsvArray.push(`${card.count}\t${card.row.originalName}`);
      }
    }

    return tsvArray.join('\n');
  };

  const showSavedFeedback = () => {
    setSavedRecently(true);
    setSaveError(null);
    setIsDirty(false);
    setTimeout(() => setSavedRecently(false), 2000);
  };

  const writeToDrive = async () => {
    if (deckTitle.length === 0) {
      window.alert('please enter a deck name!');
    } else {
      setSavingToGDrive(true);
      setSaveError(null);
      try {
        let response: Response | null = null;
        if (deckFile?.id && deckFile?.name === deckTitle) {
          response = await fetch(`/api/drive/${deckFile.id}`, {
            method: 'PUT',
            credentials: 'include',
            body: JSON.stringify({ fileName: deckTitle, content: createLackeyTSV() }),
          });
        } else {
          response = await fetch('/api/drive', {
            method: 'POST',
            credentials: 'include',
            body: JSON.stringify({ fileName: deckTitle, content: createLackeyTSV() }),
          });
        }
        const json = await response.json();
        console.log('JSON FROM api/drive POST/PUT!', json);
        if (!response.ok) {
          if (json?.error === 'drive_scope_missing') {
            signIn('google',
              { callbackUrl: '/decks' },
              { scope: 'openid profile email https://www.googleapis.com/auth/drive.appdata', include_granted_scopes: 'true' }
            );
            return;
          }
          setSaveError('Save failed');
        } else {
          if (json?.file?.id) {
            setDeckFile({ id: json.file.id, name: deckTitle });
          }
          showSavedFeedback();
        }
      } catch {
        setSaveError('Save failed');
      } finally {
        setSavingToGDrive(false);
      }
    }
  };

  const writeToBrowserList = () => {
    if (deckTitle.length === 0) {
      window.alert('please enter a deck name!');
    } else {
      const existingIndex = browserDecks.findIndex((d: { name: string }) => d.name === deckTitle);
      if (existingIndex !== -1) {
        const isSavingLoadedDeck = deckTitle === loadedBrowserDeckName;
        if (!isSavingLoadedDeck) {
          const overwrite = window.confirm(`A deck named "${deckTitle}" already exists. Overwrite it?`);
          if (!overwrite) return;
        }
        const updated = [...browserDecks];
        updated[existingIndex] = { name: deckTitle, deck: currentDeck };
        setBrowserDecks(updated);
      } else {
        setBrowserDecks([...browserDecks, { name: deckTitle, deck: currentDeck }]);
      }
      setLoadedBrowserDeckName(deckTitle);
      showSavedFeedback();
    }
  };

  const openDeckPicker = async () => {
    setShowDrivePicker(true);
    if (session) {
      setLoadingFromGDrive(true);
      const response = await fetch('/api/drive', { method: 'GET', credentials: 'include' });
      const json = await response.json();
      console.log('JSON FROM api/drive GET', json);
      setDriveFiles(json.files);
      setLoadingFromGDrive(false);
    }
  };

  const exportLackeyDeckToDisk = () => {
    posthog.capture('deckBuilder.lackeyExport.start');

    const tsvString = createLackeyTSV();
    const blob = new Blob([tsvString], { type: 'text/tab-separated-values' });

    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `${deckTitle || 'deck'}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
    posthog.capture('deckBuilder.lackeyExport.finish', { bytes: tsvString.length });
  };

  const currentDeckRows = useMemo(() => {
    return Object.keys(currentDeck)
      .map((collectorsinfo) => currentDeck[collectorsinfo].row)
      .filter((row) => row.count > 0);
  }, [currentDeck]);

  const aggregatedMissionReqs = useMemo(() => {
    const totals: Record<string, number> = {};
    currentDeckRows
      .filter((row) => row.pile === 'mission')
      .forEach((row) => {
        const reqs = missionRequirements(row);
        Object.entries(reqs).forEach(([skill, n]) => {
          const key = skill.toLowerCase();
          totals[key] = (totals[key] || 0) + (n as number);
        });
      });
    return totals;
  }, [currentDeckRows]);

  const [viewMode, setViewMode] = useLocalStorage<'image' | 'list'>(
    'search-view-mode',
    typeof window !== 'undefined' && window.innerWidth < 640 ? 'list' : 'image',
  );

  // activeView controls which panel is shown in the desktop left panel
  const [activeView, setActiveView] = useState<'search' | 'deck'>('deck');
  // mobileView controls which full-page view is shown on mobile
  const [mobileView, setMobileView] = useState<'analysis' | 'search' | 'deck'>('deck');
  // activePile controls which pile tab is shown in the deck panel
  const [activePile, setActivePile] = useState<'mission' | 'dilemma' | 'draw'>('draw');

  useEffect(() => {
    if (mobileView === 'analysis') {
      const id = requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
      return () => cancelAnimationFrame(id);
    }
  }, [mobileView]);

  const compare = (a: string, b: string) => {
    return a.localeCompare(b, 'en', { ignorePunctuation: true });
  };

  const searchPile = useCallback((query: string) => {
    setSearchQuery(query);
    setActiveView('search');
    setMobileView('search');
  }, []);

  const missionCount = currentDeckRows.filter(r => r.pile === 'mission').reduce((s, r) => s + r.count, 0);
  const dilemmaCount = currentDeckRows.filter(r => r.pile === 'dilemma').reduce((s, r) => s + r.count, 0);
  const drawCount = currentDeckRows.filter(r => r.pile === 'draw').reduce((s, r) => s + r.count, 0);

  const searchPanel = (
    <div className="mx-2 mt-4 flex flex-col flex-1 min-h-0 overflow-hidden">
      <div className="shrink-0">
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <SearchBar searchQuery={searchQuery} setSearchQuery={setSearchQuery} variant="styled" />
          </div>
          <button
            onClick={() => setViewMode(viewMode === 'image' ? 'list' : 'image')}
            className="btn-icon mt-1 flex-shrink-0"
            title={viewMode === 'image' ? 'Switch to list view' : 'Switch to image view'}
            aria-label={viewMode === 'image' ? 'Switch to list view' : 'Switch to image view'}
          >
            {viewMode === 'image' ? <FaList /> : <FaTh />}
          </button>
        </div>
        <SearchPills searchQuery={searchQuery} setSearchQuery={setSearchQuery} />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <SearchResults
          filteredData={filteredData}
          onCardSelected={incrementIncluded}
          onCardDeselected={decrementIncluded}
          currentDeck={currentDeck}
          withHover={true}
          useWindowScroll={false}
          gridClassName="grid grid-cols-1 lg:grid-cols-2 gap-4"
          viewMode={viewMode}
        />
      </div>
    </div>
  );

  const deckPanel = (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden px-2 mt-4">
      <div className="shrink-0 flex flex-col space-y-2">
        <div className="flex justify-start space-x-2">
          <input
            type="text"
            id="deckTitle"
            placeholder="Set deck title here"
            value={deckTitle}
            onChange={(e) => {
              setDeckTitle(e.target.value);
            }}
            className="bg-white/[0.05] text-text-primary font-body font-bold py-2 px-4 rounded my-0 border border-white/10 w-full placeholder:text-text-disabled focus:outline-none focus:border-accent/40"
          />
        </div>
        <Tooltip id="button-tooltip" />
        <div className="flex justify-start items-center space-x-2">
          <button
            className="btn-icon"
            onClick={clearDeck}
            data-tooltip-id="button-tooltip"
            data-tooltip-content="Clear the current deck"
          >
            <FaTrash />
          </button>
          &nbsp;
          <DeckUploader onFileLoad={handleFileLoad} />
          <button
            className="btn-icon"
            onClick={exportLackeyDeckToDisk}
            data-tooltip-id="button-tooltip"
            data-tooltip-content="Export the current deck to a LackeyCCG file"
          >
            <FaFileExport />
          </button>
          {isEarlyAccessUser(session?.user?.email) && (
            <Link
              href={isFixture ? '/decks/practice?fixture=1' : '/decks/practice'}
              className={`btn-icon flex items-center justify-center ${currentDeckRows.filter((row) => row.pile === 'draw').length === 0 ? 'opacity-50 pointer-events-none' : ''}`}
              data-tooltip-id="button-tooltip"
              data-tooltip-content="Practice drawing from your draw pile"
              aria-disabled={currentDeckRows.filter((row) => row.pile === 'draw').length === 0}
            >
              <FaPlayCircle />
            </Link>
          )}
        </div>
        <div className="flex justify-start items-center space-x-2">
          <button
            className="btn-icon"
            onClick={openDeckPicker}
            data-tooltip-id="button-tooltip"
            data-tooltip-content="Load decks"
          >
            <FaFolderOpen />
          </button>
          {session && (
            <button
              className="btn-icon"
              onClick={() => writeToDrive()}
              data-tooltip-id="button-tooltip"
              data-tooltip-content={savingToGDrive ? 'Saving...' : 'Save to G Drive'}
            >
              <FaCloudUploadAlt />
            </button>
          )}
          <button
            className="btn-icon"
            onClick={() => writeToBrowserList()}
            data-tooltip-id="button-tooltip"
            data-tooltip-content="Save to this browser"
          >
            <FaSave />
          </button>
          {savedRecently && (
            <span className="text-sm text-green-400 font-medium">Saved!</span>
          )}
          {saveError && (
            <span className="text-sm text-red-400 font-medium">{saveError}</span>
          )}
        </div>
      </div>
      {/* Nested pile tabs */}
      <div className="flex shrink-0 border-b border-white/[0.06] mt-2">
        {([
          { key: 'mission', label: 'Missions', count: missionCount },
          { key: 'dilemma', label: 'Dilemmas', count: dilemmaCount },
          { key: 'draw',    label: 'Draw',     count: drawCount    },
        ] as const).map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setActivePile(key)}
            className={`flex-1 py-2 text-sm transition-colors ${
              activePile === key
                ? 'text-accent border-b-2 border-accent'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            {label} ({count})
          </button>
        ))}
      </div>

      {/* Active pile content - scrollable, with floating plus button */}
      <div className="flex-1 min-h-0 relative">
        <button
          onClick={() => {
            if (activePile === 'mission') searchPile('type:mission');
            else if (activePile === 'dilemma') searchPile('type:dilemma');
            else searchPile('-type:mission -type:dilemma');
          }}
          className="btn-icon text-sm absolute top-1 right-3 z-10"
          title={`Search ${activePile === 'mission' ? 'Missions' : activePile === 'dilemma' ? 'Dilemmas' : 'Draw pile'}`}
        >
          <FaPlus />
        </button>
      <div className="h-full overflow-y-auto">
        {activePile === 'mission' && (
          <DeckListPile
            pileName="Missions"
            cardsForPile={currentDeckRows.filter((row) => row.pile === 'mission')}
            incrementIncluded={incrementIncluded}
            decrementIncluded={decrementIncluded}
            sortBy={(r1: CardDef, r2: CardDef) => compare(r1.missiontype, r2.missiontype)}
            collapsed={false}
          />
        )}
        {activePile === 'dilemma' && (
          <DeckListPile
            pileName="Dilemmas"
            cardsForPile={currentDeckRows.filter((row) => row.pile === 'dilemma')}
            decrementIncluded={decrementIncluded}
            incrementIncluded={incrementIncluded}
            sortBy={(r1: CardDef, r2: CardDef) =>
              r1.dilemmatype === r2.dilemmatype ? compare(r1.name, r2.name) : compare(r1.dilemmatype, r2.dilemmatype)
            }
            collapsed={false}
          />
        )}
        {activePile === 'draw' && (
          <DeckListPile
            pileName="Draw"
            cardsForPile={currentDeckRows.filter((row) => row.pile === 'draw')}
            sortBy={(r1: CardDef, r2: CardDef) =>
              r1.type === r2.type ? compare(r1.name, r2.name) : compare(r1.type, r2.type)
            }
            incrementIncluded={incrementIncluded}
            decrementIncluded={decrementIncluded}
            collapsed={false}
          />
        )}
      </div>
      </div>
    </div>
  );

  return (
    <div className="bg-gradient-page font-body text-text-primary">
      <div className="flex flex-col lg:flex-row h-[100dvh] overflow-hidden">
        {/* Desktop left panel - always visible on lg+ */}
        <div className="hidden lg:flex flex-col lg:w-1/4 bg-[#131713] border-r border-white/[0.06] overflow-hidden">
          {/* Desktop tab bar */}
          <div className="flex shrink-0 border-b border-white/[0.06]">
            <button
              onClick={() => setActiveView('search')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm transition-colors ${
                activeView === 'search' ? 'text-accent border-b-2 border-accent' : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              <FaSearch className="text-xs" />
              Search
            </button>
            <button
              onClick={() => setActiveView('deck')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm transition-colors ${
                activeView === 'deck' ? 'text-accent border-b-2 border-accent' : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              <FaList className="text-xs" />
              Deck{isDirty && <span className="text-yellow-400 font-bold"> *</span>}
            </button>
          </div>

          {activeView === 'search' ? searchPanel : deckPanel}
        </div>

        {/* Main content area */}
        <div className={`flex-grow lg:w-3/4 overflow-y-scroll pb-16 lg:pb-0 ${mobileView !== 'analysis' ? 'hidden lg:block' : ''}`}>
          <div className="container mx-auto p-4">
            <span className="text-2xl font-display font-medium mt-4 mb-2 block text-text-primary">Missions</span>
            <div className="flex space-x-4 overflow-x-scroll">
              {currentDeckRows
                .filter((row) => row.pile === 'mission')
                .map((row) => {
                  return (
                    <div key={row.collectorsinfo} className="relative flex-shrink-0">
                      <img
                        src={`/cardimages/${row.imagefile}.jpg`}
                        width={165}
                        height={229}
                        loading="lazy"
                        alt={row.name}
                        className="w-56 h-auto rounded-xl block"
                      />
                      <div className="absolute inset-0 rounded-xl shadow-[inset_0_0_0_6px_black] pointer-events-none" />
                    </div>
                  );
                })}
            </div>
          </div>

          <CollapsibleSection title="Personnel skills">
            <SkillsChart currentDeckRows={currentDeckRows} missionRequirements={aggregatedMissionReqs} />
          </CollapsibleSection>

          <CollapsibleSection title="Keywords">
            <PileAggregate
              currentDeckRows={currentDeckRows}
              characteristicName="keywords"
              filterFunction={(row) => row.pile === 'draw' && row.type === 'personnel'}
              splitFunction={(keywords) =>
                keywords
                  .split('.')
                  .map((k) => k.trim())
                  .filter((k) => k.length > 0)
              }
              assembleCounts={(counts, keyword, count) => {
                counts[keyword] = (counts[keyword] || 0) + count;
                return counts;
              }}
            >
              {([keyword, count]) => {
                const colonIndex = keyword.indexOf(':');
                const hasColon = colonIndex !== -1;
                const keywordPrefix = hasColon ? keyword.slice(0, colonIndex) : keyword;
                const keywordSuffix = hasColon ? keyword.slice(colonIndex + 1).trim() : null;
                return (
                  <div key={keyword} className="m-2 p-2 border border-white/[0.06] rounded surface-hover">
                    <span className="px-1 text-text-secondary">
                      {count}x{' '}
                      {hasColon ? (
                        <span className="inline-flex flex-col">
                          <b className="text-text-primary">{keywordPrefix}:</b>
                          <span className="text-text-secondary font-normal">{keywordSuffix}</span>
                        </span>
                      ) : (
                        <b className="text-text-primary">{keyword}</b>
                      )}
                    </span>
                  </div>
                );
              }}
            </PileAggregate>
          </CollapsibleSection>

          <CollapsibleSection title="Icons">
            <PileAggregate
              currentDeckRows={currentDeckRows}
              characteristicName="icons"
              filterFunction={(row) => row.pile === 'draw' && row.type === 'personnel'}
              splitFunction={(keywords) =>
                keywords
                  .split(/[\[\]]/)
                  .map((k) => k.trim())
                  .filter((k) => k.length > 0)
              }
              assembleCounts={(counts, icon, count) => {
                counts[icon] = (counts[icon] || 0) + count;
                return counts;
              }}
            >
              {([icon, count]) => (
                <IconPill key={icon} icon={icon} count={count} />
              )}
            </PileAggregate>
          </CollapsibleSection>

          <CollapsibleSection title="Costs">
            <div className="flex flex-col lg:flex-row">
              <div className="w-full lg:w-1/2 lg:flex-row">
                <span className="text-xl font-bold mt-4 mb-2 block text-text-secondary">Draw Deck</span>
                <PileAggregateCostChart currentDeckRows={currentDeckRows} filterFunction={(row) => row.pile === 'draw'} />
              </div>
              <div className="w-full lg:w-1/2 lg:flex-row">
                <span className="text-xl font-bold mt-4 mb-2 block text-text-secondary">Dilemma Pile</span>
                <PileAggregateCostChart currentDeckRows={currentDeckRows} filterFunction={(row) => row.pile === 'dilemma'} />
              </div>
            </div>
          </CollapsibleSection>
        </div>
      </div>

      {/* Mobile: Full-page search view */}
      {mobileView === 'search' && (
        <div className="lg:hidden fixed inset-x-0 top-0 bottom-14 z-20 bg-[#131713] flex flex-col">
          {searchPanel}
        </div>
      )}

      {/* Mobile: Full-page deck view */}
      {mobileView === 'deck' && (
        <div className="lg:hidden fixed inset-x-0 top-0 bottom-14 z-20 bg-[#131713] flex flex-col">
          {deckPanel}
        </div>
      )}

      {/* Mobile: Persistent tab bar */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-30 flex bg-[#131713] border-t border-white/[0.06]">
        <button
          onClick={() => setMobileView('analysis')}
          className={`flex-1 flex flex-col items-center py-2 gap-0.5 text-xs transition-colors ${
            mobileView === 'analysis' ? 'text-accent' : 'text-text-muted'
          }`}
        >
          <FaChartBar className="text-base" />
          <span>Analysis</span>
        </button>
        <button
          onClick={() => setMobileView('search')}
          className={`flex-1 flex flex-col items-center py-2 gap-0.5 text-xs transition-colors ${
            mobileView === 'search' ? 'text-accent' : 'text-text-muted'
          }`}
        >
          <FaSearch className="text-base" />
          <span>Search</span>
        </button>
        <button
          onClick={() => setMobileView('deck')}
          className={`flex-1 flex flex-col items-center py-2 gap-0.5 text-xs transition-colors ${
            mobileView === 'deck' ? 'text-accent' : 'text-text-muted'
          }`}
        >
          <FaList className="text-base" />
          <span>Deck{isDirty && <span className="text-yellow-400 font-bold"> *</span>}</span>
        </button>
      </div>

      {showDrivePicker && (
        <DrivePickerModal
          driveFiles={driveFiles}
          browserFiles={browserDecks}
          loadDriveFile={fetchDriveFile}
          deleteDriveFile={deleteDriveFile}
          loadBrowserFile={(file, piles) => {
            if (piles) {
              setCurrentDeck(mergeDeckPiles(currentDeck, file.deck, piles));
            } else {
              suppressDirtyRef.current = true;
              setCurrentDeck(file.deck);
              setDeckTitle(file.name);
              setLoadedBrowserDeckName(file.name);
            }
          }}
          deleteBrowserFile={deleteBrowserFile}
          inProgress={loadingFromGDrive}
          onClose={() => setShowDrivePicker(false)}
          isSignedIn={!!session}
          hasDriveScope={session?.hasDriveScope ?? false}
          onSignIn={() => signIn('google',
            { callbackUrl: '/decks?openPicker=true' },
            { scope: 'openid profile email https://www.googleapis.com/auth/drive.appdata', include_granted_scopes: 'true' }
          )}
        />
      )}
    </div>
  );
}
