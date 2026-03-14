'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { track } from '@vercel/analytics';
import useFilterData from '../hooks/useFilterData';
import useLocalStorage from '../hooks/useLocalStorage';
import DeckUploader from './DeckUploader';
import DeckListPile from './DeckListPile';
import { DrivePickerModal } from './DrivePickerModal';
import Help from './Help';
import PileAggregate from './PileAggregate';
import PileAggregateCostChart from './PileAggregateCostChart';
import SearchBar from './SearchBar';
import SearchPills from './SearchPills';
import SearchResults from './SearchResults';
import { CardDef, Deck } from '../types';
import { getSession, signIn } from 'next-auth/react';
import { aboveMinimumCount, belowMaximumCount, deckFromTsv, decrementedRow, findExistingOrUseRow, incrementedRow, numericCount } from '../app/decks/deckBuilderUtils';
import { FaSave, FaCloudUploadAlt, FaSearch, FaTrash, FaFileExport, FaSignInAlt, FaFolderOpen, FaList, FaChevronRight, FaChevronDown } from 'react-icons/fa';
import { Tooltip } from 'react-tooltip';
import type { CardData } from '../lib/loadCards';

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
  session: { user: { name: string } };
  user: { name: string };
  expires: string;
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
  const [searchQuery, setSearchQuery] = useState('');
  const filteredData = useFilterData(false, data, columns, searchQuery);

  const [browserDecks, setBrowserDecks] = useLocalStorage<Array<{ name: string; deck: Deck }>>('browserDecks', []);
  const [currentDeck, setCurrentDeck] = useLocalStorage<Deck>('currentDeck', {});
  const [deckTitle, setDeckTitle] = useLocalStorage<string>('deckTitle', '');
  const [deckFile, setDeckFile] = useLocalStorage<{ id: string | null; name: string }>('deckFile', { id: null, name: 'My deck' });
  const [driveFiles, setDriveFiles] = useState([]);
  const [showDrivePicker, setShowDrivePicker] = useState(false);
  const [loadingFromGDrive, setLoadingFromGDrive] = useState(false);
  const [savingToGDrive, setSavingToGDrive] = useState(false);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    (async () => {
      const sessionFromNextAuth = (await getSession()) as Session;
      const isSessionExpired = sessionFromNextAuth && new Date() > new Date(sessionFromNextAuth.expires);
      setSession(isSessionExpired ? null : sessionFromNextAuth);
    })();
  }, []);

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

  const handleFileLoad = (name: string, contents: string) => {
    track('deckBuilder.handleFileLoad.start');

    setCurrentDeck(deckFromTsv(contents, data));
    if (name) {
      setDeckTitle(name.replace('.txt', ''));
    }
    track('deckBuilder.handleFileLoad.finish', { lines: Object.keys(currentDeck).length });
  };

  const fetchDriveFile = async (driveFile: { id: string; name: string }) => {
    track('deckBuilder.driveFileLoad.start');
    console.log('id from modal', driveFile.id);
    setLoadingFromGDrive(true);
    const response = await fetch(`/api/drive/${driveFile.id}`, { method: 'GET', credentials: 'include' });
    const json = await response.json();
    console.log(`fetched ${driveFile.id} `, json);

    setDeckFile(driveFile);
    handleFileLoad(driveFile.name, json);
    setLoadingFromGDrive(false);
    setShowDrivePicker(false);
    track('deckBuilder.driveFileLoad.end');
  };

  const deleteDriveFile = async (file: { id: number }) => {
    track('deckBuilder.driveFileDelete.start');
    console.log('file', file);
    console.log('id from modal', file.id);
    setDriveFiles(driveFiles.filter((f: { id: number }) => f.id !== file.id));
    await fetch(`/api/drive/${file.id}`, { method: 'DELETE', credentials: 'include' });
    track('deckBuilder.driveFileDelete.end');
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

  const writeToDrive = async () => {
    if (deckTitle.length === 0) {
      window.alert('please enter a deck name!');
    } else {
      setSavingToGDrive(true);
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
      setSavingToGDrive(false);

      console.log('JSON FROM api/drive POST/PUT!', json);
    }
  };

  const writeToBrowserList = () => {
    if (deckTitle.length === 0) {
      window.alert('please enter a deck name!');
    } else {
      setBrowserDecks([...browserDecks, { name: deckTitle, deck: currentDeck }]);
    }
  };

  const loadFilesFromDrive = async () => {
    setLoadingFromGDrive(true);
    setShowDrivePicker(true);
    const response = await fetch('/api/drive', { method: 'GET', credentials: 'include' });
    const json = await response.json();
    console.log('JSON FROM api/drive GET', json);
    setDriveFiles(json.files);
    setLoadingFromGDrive(false);
  };

  const exportLackeyDeckToDisk = () => {
    track('deckBuilder.lackeyExport.start');

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
    track('deckBuilder.lackeyExport.finish', { bytes: tsvString.length });
  };

  const currentDeckRows = useMemo(() => {
    return Object.keys(currentDeck)
      .map((collectorsinfo) => currentDeck[collectorsinfo].row)
      .filter((row) => row.count > 0);
  }, [currentDeck]);

  // activeView controls which panel is shown (search or deck list)
  const [activeView, setActiveView] = useState<'search' | 'deck'>('deck');
  // isMobileSheetOpen controls the mobile bottom sheet visibility
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false);

  const handleMobileTabClick = (tab: 'search' | 'deck') => {
    if (isMobileSheetOpen && activeView === tab) {
      setIsMobileSheetOpen(false);
    } else {
      setActiveView(tab);
      setIsMobileSheetOpen(true);
    }
  };

  const compare = (a: string, b: string) => {
    return a.localeCompare(b, 'en', { ignorePunctuation: true });
  };

  const searchPanel = (
    <div className="mx-2 mt-4 flex flex-col flex-1 min-h-0 overflow-hidden">
      <div className="shrink-0">
        <SearchBar searchQuery={searchQuery} setSearchQuery={setSearchQuery} variant="styled" />
        <SearchPills searchQuery={searchQuery} setSearchQuery={setSearchQuery} />
        <Help variant="styled" />
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
        />
      </div>
    </div>
  );

  const deckPanel = (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-scroll px-2 mt-4">
      <div className="flex flex-col space-y-2">
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
        </div>
        {!session && (
          <div className="flex justify-start space-x-2">
            <button
              className="btn-icon"
              onClick={() => signIn()}
              data-tooltip-id="button-tooltip"
              data-tooltip-content="Sign in to load and save your decks with Google Drive"
            >
              <FaSignInAlt />
            </button>
          </div>
        )}
        {session && (
          <div className="flex justify-start items-center space-x-2">
            <button
              className="btn-icon"
              onClick={loadFilesFromDrive}
              data-tooltip-id="button-tooltip"
              data-tooltip-content="Load a deck from Google Drive"
            >
              <FaFolderOpen />
            </button>
            <button
              className="btn-icon"
              onClick={() => writeToDrive()}
              data-tooltip-id="button-tooltip"
              data-tooltip-content={savingToGDrive ? 'Saving...' : 'Save to G Drive'}
            >
              <FaCloudUploadAlt />
            </button>
            <button
              className="btn-icon"
              onClick={() => writeToBrowserList()}
              data-tooltip-id="button-tooltip"
              data-tooltip-content="Save to this browser"
            >
              <FaSave />
            </button>
          </div>
        )}
      </div>
      <DeckListPile
        pileName="Missions"
        cardsForPile={currentDeckRows.filter((row) => row.pile === 'mission')}
        incrementIncluded={incrementIncluded}
        decrementIncluded={decrementIncluded}
        sortBy={(r1: CardDef, r2: CardDef) => compare(r1.mission, r2.mission)}
      />
      <DeckListPile
        pileName="Dilemmas"
        cardsForPile={currentDeckRows.filter((row) => row.pile === 'dilemma')}
        decrementIncluded={decrementIncluded}
        incrementIncluded={incrementIncluded}
        sortBy={(r1: CardDef, r2: CardDef) =>
          r1.dilemmatype === r2.dilemmatype ? compare(r1.name, r2.name) : compare(r1.dilemmatype, r2.dilemmatype)
        }
      />
      <DeckListPile
        pileName="Draw"
        cardsForPile={currentDeckRows.filter((row) => row.pile === 'draw')}
        sortBy={(r1: CardDef, r2: CardDef) =>
          r1.type === r2.type ? compare(r1.name, r2.name) : compare(r1.type, r2.type)
        }
        incrementIncluded={incrementIncluded}
        decrementIncluded={decrementIncluded}
      />
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
              Deck
            </button>
          </div>

          {activeView === 'search' ? searchPanel : deckPanel}
        </div>

        {/* Main content area */}
        <div className="flex-grow lg:w-3/4 overflow-y-scroll pb-16 lg:pb-0">
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
            <PileAggregate
              currentDeckRows={currentDeckRows}
              characteristicName="skills"
              filterFunction={(row) => row.pile === 'draw' && row.type === 'personnel'}
              splitFunction={(skills: string): Array<string> => skills.match(/(?:\d+ \w+|\w+)/g) || []}
              assembleCounts={(counts, skillItem, rowcount) => {
                let [, levelStr, skill] = skillItem.trim().match(/(\d*)\s*(\w+)/) || [null, null, null];
                let count = levelStr ? Number(levelStr) : 1;

                if (skillList.includes(skill)) {
                  if (counts[skill] === undefined) {
                    counts[skill] = {};
                  }
                  counts[skill][String(count)] = (counts[skill][String(count)] || 0) + rowcount;
                }

                return counts;
              }}
            >
              {([skill, skillLevels]) => (
                <div key={skill} className="m-2 p-2 border border-white/[0.06] rounded surface-hover">
                  <div className="font-bold text-text-primary">{skill}</div>
                  <div className="text-text-secondary">
                    {skillLevels['1'] && <span className="px-1">{skillLevels['1']}x1</span>}
                    {skillLevels['2'] && <span className="px-1">{skillLevels['2']}x2</span>}
                    {skillLevels['3'] && <span className="px-1">{skillLevels['3']}x3</span>}
                  </div>
                </div>
              )}
            </PileAggregate>
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
              {([keyword, count]) => (
                <div key={keyword} className="m-2 p-2 border border-white/[0.06] rounded surface-hover">
                  <span className="px-1 text-text-secondary">
                    {count}x <b className="text-text-primary">{keyword}</b>
                  </span>
                </div>
              )}
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
                <div key={icon} className="m-2 p-2 border border-white/[0.06] rounded surface-hover">
                  <span className="px-1 text-text-secondary">
                    {count}x <b className="text-text-primary">[{icon}]</b>
                  </span>
                </div>
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

      {/* Mobile: Bottom sheet */}
      <div
        className={`lg:hidden fixed inset-x-0 bottom-14 z-20 h-[85dvh] bg-[#131713] transform transition-transform duration-300 ease-in-out rounded-t-xl border-t border-white/[0.06] flex flex-col ${
          isMobileSheetOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        {/* Drag handle */}
        <div className="flex justify-center py-2 shrink-0">
          <div className="w-12 h-1 bg-white/20 rounded-full" />
        </div>
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {activeView === 'search' ? searchPanel : deckPanel}
        </div>
      </div>

      {/* Mobile: Persistent tab bar */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-30 flex bg-[#131713] border-t border-white/[0.06]">
        <button
          onClick={() => handleMobileTabClick('search')}
          className={`flex-1 flex flex-col items-center py-2 gap-0.5 text-xs transition-colors ${
            activeView === 'search' && isMobileSheetOpen ? 'text-accent' : 'text-text-muted'
          }`}
        >
          <FaSearch className="text-base" />
          <span>Search</span>
        </button>
        <button
          onClick={() => handleMobileTabClick('deck')}
          className={`flex-1 flex flex-col items-center py-2 gap-0.5 text-xs transition-colors ${
            activeView === 'deck' && isMobileSheetOpen ? 'text-accent' : 'text-text-muted'
          }`}
        >
          <FaList className="text-base" />
          <span>Deck</span>
        </button>
      </div>

      {showDrivePicker && (
        <DrivePickerModal
          driveFiles={driveFiles}
          browserFiles={browserDecks}
          loadDriveFile={fetchDriveFile}
          deleteDriveFile={deleteDriveFile}
          loadBrowserFile={(file) => {
            setCurrentDeck(file.deck);
            setDeckTitle(file.name);
          }}
          deleteBrowserFile={deleteBrowserFile}
          inProgress={loadingFromGDrive}
          onClose={() => setShowDrivePicker(false)}
        />
      )}
    </div>
  );
}
