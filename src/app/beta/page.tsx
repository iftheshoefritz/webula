'use client'

import { useEffect, useMemo, useState, useCallback } from 'react';
import { track } from '@vercel/analytics';
import Image from 'next/image';
import useDataFetching from '../../hooks/useDataFetching';
import useFilterData from '../../hooks/useFilterData';
import useLocalStorage from '../../hooks/useLocalStorage';
import DeckUploader from '../../components/DeckUploader';
import DeckListPile from '../../components/DeckListPile';
import { DrivePickerModal } from '../../components/DrivePickerModal'
import Help from '../../components/Help';
import PileAggregate from '../../components/PileAggregate';
import PileAggregateCostChart from '../../components/PileAggregateCostChart';
import SearchBar from '../../components/SearchBar';
import SearchResults from '../../components/SearchResults';
import '../../styles/globals.css';
import { CardDef, Deck } from '../../types';
import { getSession, signIn } from 'next-auth/react';
import { aboveMinimumCount, belowMaximumCount, deckFromTsv, decrementedRow, findExistingOrUseRow, incrementedRow, numericCount } from './deckBuilderUtils';
import { FaSave, FaCloudUploadAlt, FaDownload, FaSearch, FaTrash, FaFileExport, FaSignInAlt } from 'react-icons/fa';
import { Tooltip } from 'react-tooltip';

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
]

interface Session {
  accessToken: string
  session: {user: {name: string}}
  user: {name: string}
  expires: string
}

export default function Home() {
  const { data, columns, loading } = useDataFetching()
  const [searchQuery, setSearchQuery] = useState('')
  const filteredData = useFilterData(loading, data, columns, searchQuery)

  const [browserDecks, setBrowserDecks] = useLocalStorage<Array<{name: string, deck: Deck}>>('browserDecks', [])
  const [currentDeck, setCurrentDeck] = useLocalStorage<Deck>('currentDeck', {})
  const [deckTitle, setDeckTitle] = useLocalStorage<string>('deckTitle', '')
  const [deckFile, setDeckFile] = useLocalStorage<{ id: string|null, name: string }>('deckFile', {id: null, name: 'My deck'})
  const [driveFiles, setDriveFiles] = useState([])
  const [showDrivePicker, setShowDrivePicker] = useState(false)
  const [loadingFromGDrive, setLoadingFromGDrive] = useState(false)
  const [savingToGDrive, setSavingToGDrive] = useState(false)
  const [session, setSession] = useState<Session | null>(null)

  useEffect((() => {
    (async () => {
      const sessionFromNextAuth = await getSession() as Session
      // Check if the session has expired
      const isSessionExpired = sessionFromNextAuth && new Date() > new Date(sessionFromNextAuth.expires)

      // Update the state based on the session expiration
      setSession(isSessionExpired ? null : sessionFromNextAuth)
    })()}), [])


  useEffect(() => {
    console.log('currentDeck modified!');
    console.log(currentDeck);
  }, [currentDeck]);

  const incrementIncluded = useCallback((row: CardDef) => {
    console.log('incrementIncluded: ');
    console.log(row.collectorsinfo);
    console.log('incrementIncluded wants to increment: ' + numericCount(currentDeck[row.collectorsinfo]))
    if (belowMaximumCount(currentDeck[row.collectorsinfo])) {
      // First, get the current row from the deck or use the given row if it doesn't exist in the deck yet
      const currentRow = findExistingOrUseRow(currentDeck, row)
      console.log('found currentRow with count: ' + numericCount(currentRow));

      // Then, create a new row based on the current row and increment its count
      const newRow = incrementedRow(currentRow);
      setCurrentDeck(prevState => ({
        ...prevState,
        [row.collectorsinfo]: {
          count: newRow.count,
          row: newRow
        }
      }));
    }
  }, [currentDeck, setCurrentDeck]);

  const decrementIncluded = useCallback((event: any, row: CardDef) => {
    console.log('decrementIncluded: ' + row.collectorsinfo);
    event.preventDefault();
    if (aboveMinimumCount(currentDeck[row.collectorsinfo])) {
      console.log('function thinks it is possible to decrement from ' + numericCount(currentDeck[row.collectorsinfo]))
      const newRow = decrementedRow(currentDeck[row.collectorsinfo].row)
      setCurrentDeck(prevState => ({
        ...prevState,
        [row.collectorsinfo]: {
          count: newRow.count,
          row: newRow
        }
      }));
    } else {
      console.log('function thinks it is NOT possible to decrement:');
      console.log(numericCount(currentDeck[row.collectorsinfo]));
    }
  }, [currentDeck, setCurrentDeck]);

  const clearDeck = () => {
    setCurrentDeck({})
    setDeckTitle('')
    setDeckFile({id: null, name: 'My deck'})
  }

  const handleFileLoad = (name: string, contents: string) => {
    track('deckBuilder.handleFileLoad.start');

    setCurrentDeck(deckFromTsv(contents, data))
    if (name) {
      setDeckTitle(name.replace('.txt', ''));
    }
    track('deckBuilder.handleFileLoad.finish', {lines: Object.keys(currentDeck).length});
  }

  const fetchDriveFile = async (driveFile) => {
    track('deckBuilder.driveFileLoad.start')
    console.log('id from modal', driveFile.id)
    setLoadingFromGDrive(true)
    const response = await fetch(`/api/drive/${driveFile.id}`, {method: 'GET', credentials: 'include'})
    const json = await response.json() // data coming back is actually non-JSON string
    console.log(`fetched ${driveFile.id} `, json)

    setDeckFile(driveFile)
    handleFileLoad(driveFile.name, json)
    setLoadingFromGDrive(false)
    setShowDrivePicker(false)
    track('deckBuilder.driveFileLoad.end')
  }

  const deleteDriveFile = async (file) => {
    track('deckBuilder.driveFileDelete.start')
    console.log('file', file)
    console.log('id from modal', file.id)
    setDriveFiles(driveFiles.filter((f: {id: number}) => f.id !== file.id))
    await fetch(`/api/drive/${file.id}`, {method: 'DELETE', credentials: 'include'})
    // TODO: handle error
    track('deckBuilder.driveFileDelete.end')
  }

  const deleteBrowserFile = (file) => {
    setBrowserDecks(
      browserDecks.filter((deck: {name: string}) => deck.name !== file.name)
    )
  }

  const writeToDrive = async () => {
    if (deckTitle.length === 0) {
      window.alert('please enter a deck name!')
    } else {
      setSavingToGDrive(true)
      let response: Response | null = null
      if (deckFile?.id && deckFile?.name === deckTitle) {
        response = await fetch(`/api/drive/${deckFile.id}`, {method: 'PUT', credentials: 'include', body: JSON.stringify(
          {fileName: deckTitle, content: createLackeyTSV()}
        )});
      } else {
        response = await fetch('/api/drive', {method: 'POST', credentials: 'include', body: JSON.stringify(
          {fileName: deckTitle, content: createLackeyTSV()}
        )});
      }
      const json = await response.json()
      setSavingToGDrive(false)

      console.log('JSON FROM api/drive POST/PUT!', json)
    }
  }

  const writeToBrowserList = () => {
    if (deckTitle.length === 0) {
      window.alert('please enter a deck name!')
    } else {
      setBrowserDecks([...browserDecks, {name: deckTitle, deck: currentDeck}])
    }
  }

  const loadFilesFromDrive = async () => {
    setLoadingFromGDrive(true)
    setShowDrivePicker(true)
    const response = await fetch('/api/drive', {method: 'GET', credentials: 'include'})
    const json = await response.json()
    console.log('JSON FROM api/drive GET', json)
    setDriveFiles(json.files)
    setLoadingFromGDrive(false)
  }

  const createLackeyTSV = (): string => {
    const lackeyPileNameFor = {
      mission: "Missions:",
      dilemma: "Dilemmas:",
      draw: "Deck:"
    }
    const lackeyPileOrder = {
      draw: 0,
      dilemma: 1,
      mission: 2,
    }
    const tsvArray: string[] = [];
    let currentPile = '';

    const sortedCollectorsInfo = Object
      .keys(currentDeck)
      .sort((a, b) => lackeyPileOrder[currentDeck[a].row.pile] - lackeyPileOrder[currentDeck[b].row.pile]);
    for (const collectorsinfo of sortedCollectorsInfo) {
      const card = currentDeck[collectorsinfo];
      if (card.row.pile !== currentPile ) {
        currentPile = card.row.pile
        tsvArray.push(lackeyPileNameFor[currentPile]);
      }
      if (card.count > 0) {
        tsvArray.push(`${card.count}\t${card.row.originalName}`);
      }
    }

    return tsvArray.join('\n');
  }

  const exportLackeyDeckToDisk = () => {
    track('deckBuilder.lackeyExport.start');

    const tsvString = createLackeyTSV()
    const blob = new Blob([tsvString], { type: 'text/tab-separated-values' });

    // Create a URL for the Blob
    const url = URL.createObjectURL(blob);

    // Create a temporary anchor element and start a download
    const a = document.createElement('a');
    a.href = url;
    a.download = `${deckTitle || 'deck'}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Release the Blob URL
    URL.revokeObjectURL(url);
    track('deckBuilder.lackeyExport.finish', {bytes: tsvString.length});
  }

  const currentDeckRows = useMemo(() => {
    return Object.keys(currentDeck)
      .map((collectorsinfo) => currentDeck[collectorsinfo].row)
      .filter((row) => row.count > 0);
  }, [currentDeck]);

  const [isSearching, setIsSearching] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(
    //typeof window !== 'undefined' ? window.innerWidth > 1024 : false
    false
  );

  useEffect(() => {
    // Function to update state based on window width
    const handleResize = () => {
      setIsDrawerOpen(window.innerWidth > 1024);
    };

    // Add event listener
    window.addEventListener('resize', handleResize);

    // Call handler right away so state gets updated with initial window size
    handleResize();

    // Remove event listener on cleanup
    return () => window.removeEventListener('resize', handleResize);
  }, []); // Empty array ensures that effect is only run on mount and unmount

  const compare = (a: string, b: string) => {
    return a.localeCompare(b, 'en', { ignorePunctuation: true });
  }

  return (
    <div>
      {loading ? (
        <p>Loading data...</p>
      ) : (
        <>
          <div className="flex flex-col lg:flex-row h-[100dvh] overflow-hidden">
            <div className={`fixed left-0 top-0 h-[100dvh] lg:relative lg:flex lg:flex-col lg:w-1/4 bg-white transform transition-transform ease-in-out duration-200 ${isDrawerOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 z-10 overflow-y-auto`}>
              <button
                className="lg:hidden px-4 py-2"
                onClick={() => setIsDrawerOpen(false)}
              >
                Close List
              </button>
              { isSearching &&
                <div className="mx-2 mt-4">
                  <SearchBar searchQuery={searchQuery} setSearchQuery={setSearchQuery} />
                  <button className="py-2" onClick={() => setIsSearching(false)}>
                &lt;&lt; Back to list
                  </button>
                  <Help/>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <SearchResults filteredData={filteredData} onCardSelected={incrementIncluded} onCardDeselected={decrementIncluded} currentDeck={currentDeck} withHover={true}/>
                  </div>
                </div>
              }

              <div className={`flex flex-col h-full overflow-y-scroll px-2 mt-4 ${isSearching ? 'invisible': 'visible'}`}>
                <div className="flex flex-col space-y-2">
                  <div className="flex justify-start space-x-2">
                    <input
                      type="text"
                      id="deckTitle"
                      placeholder="Set deck title here"
                      value={deckTitle}
                      onChange={
                      (e) => {
                        setDeckTitle(e.target.value);
                      }}
                      className="bg-white text-black font-bold py-2 px-4 rounded my-0 border border-gray-600 w-full"
                    />
                  </div>
                  <Tooltip id="button-tooltip" />
                  <div className="flex justify-start items-center space-x-2">
                    <button
                      className="bg-black hover:bg-gray-600 text-white font-bold py-2 px-4 rounded"
                      onClick={() => setIsSearching(true)}
                      data-tooltip-id="button-tooltip"
                      data-tooltip-content="Search for cards to add to your deck"
                    >
                      <FaSearch/>
                    </button>
                    <button
                      className="bg-black hover:bg-gray-600 text-white font-bold py-2 px-4 rounded"
                      onClick={clearDeck}
                      data-tooltip-id="button-tooltip"
                      data-tooltip-content="Clear the current deck"
                    >
                      <FaTrash/>
                    </button>&nbsp;
                    <DeckUploader onFileLoad={handleFileLoad}/>
                    <button
                      className="bg-black hover:bg-gray-600 text-white font-bold py-2 px-4 rounded"
                      onClick={exportLackeyDeckToDisk}
                      data-tooltip-id="button-tooltip"
                      data-tooltip-content="Export the current deck to a LackeyCCG file"
                    >
                      <FaFileExport/>
                    </button>
                  </div>
                  { !session &&
                    <div className="flex justify-start space-x-2">
                      <button
                        className="bg-black hover:bg-gray-600 text-white font-bold py-2 px-4 rounded"
                        onClick={() => signIn() }
                        data-tooltip-id="button-tooltip"
                        data-tooltip-content="Sign in to load and save your decks with Google Drive"
                      >
                        <FaSignInAlt/>
                      </button>
                    </div>
                  }
                  { session &&
                    <div className="flex justify-start items-center space-x-2">
                      <button
                        className="bg-black hover:bg-gray-600 text-white font-bold py-2 px-4 rounded"
                        onClick={loadFilesFromDrive}
                        data-tooltip-id="button-tooltip"
                        data-tooltip-content="Load a deck from Google Drive"
                      >
                        <FaDownload/>
                      </button>
                      <button
                        className="bg-black hover:bg-gray-600 text-white font-bold py-2 px-4 rounded"
                        onClick={() => writeToDrive()}
                        data-tooltip-id="button-tooltip"
                        data-tooltip-content={savingToGDrive ? "Saving..." : "Save to G Drive"}
                      >
                        <FaCloudUploadAlt/>
                      </button>
                      <button
                        className="bg-black hover:bg-gray-600 text-white font-bold py-2 px-4 rounded"
                        onClick={() => writeToBrowserList()}
                        data-tooltip-id="button-tooltip"
                        data-tooltip-content="Save to this browser"
                      >
                        <FaSave/>
                      </button>
                    </div>
                  }
                </div>
                <DeckListPile
                  pileName="Missions"
                  cardsForPile={
                  currentDeckRows.filter((row) => row.pile === "mission")
                  }
                  incrementIncluded={incrementIncluded}
                  decrementIncluded={decrementIncluded}
                  sortBy={(r1: CardDef, r2: CardDef) => compare(r1.mission, r2.mission)}
                />
                <DeckListPile
                  pileName="Dilemmas"
                  cardsForPile={
                  currentDeckRows.filter((row) => row.pile === "dilemma")
                  }
                  decrementIncluded={decrementIncluded}
                  incrementIncluded={incrementIncluded}
                  sortBy={(r1: CardDef, r2: CardDef) => r1.dilemmatype === r2.dilemmatype ? compare(r1.name, r2.name) : compare(r1.dilemmatype, r2.dilemmatype)}
                />
                <DeckListPile
                  pileName="Draw"
                  cardsForPile={
                  currentDeckRows.filter((row) => row.pile === "draw")
                  }
                  sortBy={(r1: CardDef, r2: CardDef) => r1.type === r2.type ? compare(r1.name, r2.name) : compare(r1.type, r2.type)}
                  incrementIncluded={incrementIncluded}
                  decrementIncluded={decrementIncluded}
                />
              </div>
            </div>
            <div className="flex-grow lg:w-3/4 overflow-y-scroll">
              <div className="container mx-auto p-4">
                <button
                  className="lg:hidden px-4 py-2"
                  onClick={() => setIsDrawerOpen(true)}
                >
                  Open List
                </button>

                <span className="text-2xl font-bold mt-4 mb-2 block">Missions</span>
                <div className="flex space-x-4 overflow-x-scroll">
                  {

                    currentDeckRows
                      .filter((row) => row.pile === "mission")
                      .map((row) => {
                        return <Image
                                 src={`/cardimages/${row.imagefile}.jpg`}
                                 width={165}
                                 height={229}
                                 placeholder='blur'
                                 blurDataURL='/cardimages/cardback.jpg'
                                 alt={row.name}
                                 key={row.collectorsinfo}
                                 className='w-56 h-auto'
                               />
                      })
                  }
                </div>
              </div>
              <div className="container mx-auto p-4">
                <span className="text-2xl font-bold mt-4 mb-2 block">Personnel skills</span>
                <div>
                  <PileAggregate
                    currentDeckRows={currentDeckRows}
                    characteristicName="skills"
                    filterFunction={(row) => row.pile === "draw" && row.type === "personnel"}
                    splitFunction={(skills: string): Array<string> => (skills.match(/(?:\d+ \w+|\w+)/g) || [])}
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
                    {([skill, skillLevels]) =>
                      <div key={skill} className="m-2 p-2 border rounded">
                        <div className="font-bold">{skill}</div>
                        <div>
                          { skillLevels['1'] && <span className="px-1">{skillLevels['1']}x1</span>}
                          { skillLevels['2'] && <span className="px-1">{skillLevels['2']}x2</span>}
                          { skillLevels['3'] && <span className="px-1">{skillLevels['3']}x3</span>}
                        </div>
                      </div>
                    }
                  </PileAggregate>
                </div>
              </div>
              <div className="container mx-auto p-4">
                <span className="text-2xl font-bold mt-4 mb-2 block">Keywords</span>
                <div>
                  <PileAggregate
                    currentDeckRows={currentDeckRows}
                    characteristicName="keywords"
                    filterFunction={(row) => row.pile === "draw" && row.type === "personnel"}
                    splitFunction={(keywords) => keywords.split('.').map((k) => k.trim()).filter((k) => k.length > 0)}
                    assembleCounts={(counts, keyword, count) => {
                      counts[keyword] = (counts[keyword] || 0) + count;
                      return counts;
                    }}
                  >
                    {([keyword, count]) =>
                      <div key={keyword} className="m-2 p-2 border rounded">
                        <span className="px-1">{count}x <b>{keyword}</b></span>
                      </div>
                    }
                  </PileAggregate>
                </div>
              </div>
              <div className="container mx-auto p-4">
                <span className="text-2xl font-bold mt-4 mb-2 block">Icons</span>
                <div>
                  <PileAggregate
                    currentDeckRows={currentDeckRows}
                    characteristicName="icons"
                    filterFunction={(row) => row.pile === "draw" && row.type === "personnel"}
                    splitFunction={(keywords) => keywords.split(/[\[\]]/).map((k) => k.trim()).filter((k) => k.length > 0)}
                    assembleCounts={(counts, icon, count) => {
                      counts[icon] = (counts[icon] || 0) + count;
                      return counts;
                    }}
                  >
                    {([icon, count]) =>
                      <div key={icon} className="m-2 p-2 border rounded">
                        <span className="px-1">{count}x <b>[{icon}]</b></span>
                      </div>
                    }
                  </PileAggregate>
                </div>
              </div>
              <div className="container mx-auto p-4">
                <div className="flex flex-col lg:flex-row">
                  <div className="w-full lg:w-1/2 lg:flex-row">
                    <span className="text-2xl font-bold mt-4 mb-2 block">Draw Deck Costs</span>
                    <PileAggregateCostChart
                      currentDeckRows={currentDeckRows}
                      filterFunction={ (row) => row.pile === "draw" }
                    />
                  </div>
                  <div className="w-full lg:w-1/2 lg:flex-row">
                    <span className="text-2xl font-bold mt-4 mb-2 block">Dilemma Pile Costs</span>
                    <PileAggregateCostChart
                      currentDeckRows={currentDeckRows}
                      filterFunction={ (row) => row.pile === "dilemma" }
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
          {showDrivePicker &&
           <DrivePickerModal
             driveFiles={driveFiles}
             browserFiles={browserDecks}
             loadDriveFile={fetchDriveFile}
             deleteDriveFile={deleteDriveFile}
             loadBrowserFile={(file) => {
               setCurrentDeck(file.deck)
               setDeckTitle(file.name)
             }}
             deleteBrowserFile={deleteBrowserFile}
             inProgress={loadingFromGDrive}
             onClose={() => setShowDrivePicker(false) }
           />
          }
        </>
      )}
    </div>
  );
}
