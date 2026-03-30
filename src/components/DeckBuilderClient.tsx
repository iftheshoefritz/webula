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
import BarChart from './BarChart';
import SkillsChart from './SkillsChart';
import type { HqOption } from './SkillsChart';
import SearchOverlay from './SearchOverlay';
import SearchBar from './SearchBar';
import SearchPills from './SearchPills';
import SearchResults from './SearchResults';
import { CardDef, Deck } from '../types';
import { getSession, signIn } from 'next-auth/react';
import { aboveMinimumCount, belowMaximumCount, deckFromTsv, decrementedRow, findExistingOrUseRow, incrementedRow, mergeDeckPiles, numericCount } from '../app/decks/deckBuilderUtils';
import { missionRequirements, parseMissionRequirements } from '../lib/missionRequirements';
import type { ParsedMissionRequirements } from '../lib/missionRequirements';
import type { DeckPile } from '../app/decks/deckBuilderUtils';
import Link from 'next/link';
import { FaSave, FaSearch, FaTrash, FaEraser, FaFileExport, FaFileUpload, FaSignInAlt, FaFolderOpen, FaList, FaChevronLeft, FaChevronRight, FaChevronDown, FaChartBar, FaPlayCircle, FaPlus, FaTh, FaPencilAlt, FaShareAlt, FaSpinner } from 'react-icons/fa';
import { Tooltip } from 'react-tooltip';
import type { CardData } from '../lib/loadCards';
import { PRACTICE_DECK_TSV } from '../lib/practiceDeck';
import { isEarlyAccessUser } from '../lib/featureFlags';

function KeywordBadge({
  keyword,
  count,
  onSearch,
  hqOptions = [],
}: {
  keyword: string;
  count: number;
  onSearch?: (keyword: string, hq: string | null) => void;
  hqOptions?: HqOption[];
}) {
  const [open, setOpen] = React.useState(false);
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const hasSearch = !!onSearch;
  const hasOptions = hqOptions.length > 0;
  const colonIndex = keyword.indexOf(':');
  const hasColon = colonIndex !== -1;
  const keywordPrefix = hasColon ? keyword.slice(0, colonIndex) : keyword;
  const keywordSuffix = hasColon ? keyword.slice(colonIndex + 1).trim() : null;

  const handleSelect = (hq: string | null) => {
    setOpen(false);
    onSearch?.(keyword, hq);
  };

  return (
    <div className="relative m-1 px-2 py-1 rounded bg-white/[0.04] surface-hover">
      <span className="text-sm text-text-secondary flex items-center gap-1 flex-wrap">
        {count}x{' '}
        {hasColon ? (
          <span>
            <span>{keywordPrefix}:</span>
            <span className="ml-1 text-text-muted">{keywordSuffix}</span>
          </span>
        ) : (
          <span>{keyword}</span>
        )}
        {hasSearch && (
          <button
            ref={btnRef}
            aria-label={`Search personnel with keyword ${keyword}`}
            aria-haspopup={hasOptions ? 'menu' : undefined}
            aria-expanded={open}
            onClick={(e) => {
              e.stopPropagation();
              if (hasOptions) {
                setOpen((v) => !v);
              } else {
                onSearch(keyword, null);
              }
            }}
            className="ml-0.5 w-4 h-4 flex items-center justify-center text-xs text-text-muted hover:text-text-primary transition-colors cursor-pointer shrink-0"
          >
            +
          </button>
        )}
      </span>
      {open && hasOptions && (
        <SearchOverlay
          label={keyword}
          hqOptions={hqOptions}
          selectedHq="all"
          anchorRef={btnRef}
          onSelect={handleSelect}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

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
  isCollapsed: boolean;
  onToggle: () => void;
}

function CollapsibleSection({ title, children, isCollapsed, onToggle }: CollapsibleSectionProps) {
  return (
    <div className="container mx-auto px-4 py-1 lg:py-4">
      <button
        onClick={onToggle}
        className="text-sm mt-2 mb-1 flex items-center gap-2 w-full text-left text-text-secondary"
      >
        {title}
        {isCollapsed ? <FaChevronRight className="text-lg" /> : <FaChevronDown className="text-lg" />}
      </button>
      {!isCollapsed && children}
    </div>
  );
}

function MissionBranchSelector({
  missionName,
  parsed,
  selected,
  onChange,
}: {
  missionName: string;
  parsed: ParsedMissionRequirements;
  selected: number | null;
  onChange: (index: number | null) => void;
}) {
  if (!parsed.orBranches) return null;

  const branchLabel = (branch: Record<string, number>) =>
    Object.keys(branch)
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join(' + ');

  return (
    <div className="mt-2 flex flex-wrap gap-1 justify-center" data-testid={`branch-selector-${missionName}`}>
      <button
        className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
          selected === null
            ? 'bg-amber-500 border-amber-500 text-black font-semibold'
            : 'border-border text-text-secondary hover:border-amber-400 hover:text-amber-300'
        }`}
        onClick={() => onChange(null)}
        aria-pressed={selected === null}
      >
        All
      </button>
      {parsed.orBranches.map((branch, i) => (
        <button
          key={i}
          className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
            selected === i
              ? 'bg-amber-500 border-amber-500 text-black font-semibold'
              : 'border-border text-text-secondary hover:border-amber-400 hover:text-amber-300'
          }`}
          onClick={() => onChange(i)}
          aria-pressed={selected === i}
        >
          {branchLabel(branch)}
        </button>
      ))}
    </div>
  );
}

export default function DeckBuilderClient({ data, columns }: DeckBuilderClientProps) {
  const searchParams = useSearchParams();
  const isFixture = searchParams.get('fixture') === '1';

  const [searchQuery, setSearchQuery] = useState('');
  const filteredData = useFilterData(false, data, columns, searchQuery);

  const [localCurrentDeck, setLocalCurrentDeck] = useLocalStorage<Deck>('currentDeck', {});
  const [fixtureCurrentDeck, setFixtureCurrentDeck] = useState<Deck>({});
  const currentDeck = isFixture ? fixtureCurrentDeck : localCurrentDeck;
  const setCurrentDeck = isFixture ? setFixtureCurrentDeck : setLocalCurrentDeck;
  const [deckTitle, setDeckTitle] = useLocalStorage<string>('deckTitle', '');
  // Per-mission chosen OR branch index (0-based). Absent = all branches included (conservative default).
  const [missionBranchSelections, setMissionBranchSelections] = useLocalStorage<Record<string, number | null>>(
    'missionBranchSelections',
    {}
  );
  const [deckFile, setDeckFile] = useLocalStorage<{ id: string | null; name: string }>('deckFile', { id: null, name: 'My deck' });
  const [analysisCollapsed, setAnalysisCollapsed] = useLocalStorage<Record<string, boolean>>('analysisCollapsed', {
    'Personnel skills': true,
    'Keywords': true,
    'Icons': true,
    'Costs': true,
  });
  const [driveFiles, setDriveFiles] = useState([]);
  const [showDrivePicker, setShowDrivePicker] = useState(false);
  const [loadingFromGDrive, setLoadingFromGDrive] = useState(false);
  const [savingToGDrive, setSavingToGDrive] = useState(false);
  const [savedRecently, setSavedRecently] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [shareState, setShareState] = useState<'idle' | 'copying' | 'copied' | 'error'>('idle');
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
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

      const gistId = params.get('gist');
      if (gistId) {
        window.history.replaceState({}, '', '/decks');
        try {
          const pasteResponse = await fetch(`https://dpaste.com/${gistId}.txt`);
          const content = await pasteResponse.text();
          handleFileLoad('shared-deck.txt', content);
        } catch {
          console.error('Failed to load shared deck');
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
    const message = isDirty
      ? 'You have unsaved changes. This will remove all cards from your deck. Your saved decks are not affected. Are you sure?'
      : 'This will remove all cards from your deck. Your saved decks are not affected. Are you sure?';
    if (!window.confirm(message)) return;
    setCurrentDeck({});
    setDeckTitle('');
    setDeckFile({ id: null, name: 'My deck' });
    setMissionBranchSelections({});
  };

  const handleFileLoad = (name: string, contents: string, piles?: DeckPile[]) => {
    posthog.capture('deckBuilder.handleFileLoad.start');

    const incoming = deckFromTsv(contents, data);
    const next = piles ? mergeDeckPiles(currentDeck, incoming, piles) : incoming;
    setCurrentDeck(next);
    if (name && !piles) {
      setDeckTitle(name.replace('.txt', ''));
      setMissionBranchSelections({});
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
    if (!session) {
      signIn('google',
        { callbackUrl: '/decks' },
        { scope: 'openid profile email https://www.googleapis.com/auth/drive.appdata', include_granted_scopes: 'true' }
      );
      return;
    }
    if (savingToGDrive) return;
    if (deckTitle.length === 0) {
      window.alert('please enter a deck name!');
    } else {
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

  const shareDeck = async () => {
    setShareState('copying');
    setShareError(null);
    setShareUrl(null);
    try {
      const tsv = createLackeyTSV();
      const res = await fetch('/api/gist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: tsv, title: deckTitle }),
      });
      if (!res.ok) throw new Error('Gist creation failed');
      const json = await res.json();
      const url = `${window.location.origin}/decks?gist=${json.id}`;
      setShareUrl(url);
      try {
        await navigator.clipboard.writeText(url);
        setShareState('copied');
      } catch {
        // Clipboard API unavailable (common on iOS after async) — show URL for manual copy
        setShareState('copied');
      }
      setTimeout(() => { setShareState('idle'); setShareUrl(null); }, 15000);
    } catch {
      setShareState('error');
      setShareError('Share failed');
      setTimeout(() => { setShareState('idle'); setShareError(null); }, 3000);
    }
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
        const parsed = parseMissionRequirements(row.skills || '');
        // Always include mandatory skills (common to every branch)
        Object.entries(parsed.mandatory).forEach(([skill, n]) => {
          totals[skill] = (totals[skill] || 0) + n;
        });
        if (parsed.orBranches) {
          const selectedIndex = missionBranchSelections[row.name] ?? null;
          const branches =
            selectedIndex !== null ? [parsed.orBranches[selectedIndex]] : parsed.orBranches;
          // Union across all included branches (conservative when no selection)
          const branchUnion: Record<string, number> = {};
          for (const branch of branches) {
            Object.entries(branch).forEach(([skill, n]) => {
              branchUnion[skill] = Math.max(branchUnion[skill] || 0, n);
            });
          }
          Object.entries(branchUnion).forEach(([skill, n]) => {
            totals[skill] = (totals[skill] || 0) + n;
          });
        }
      });
    return totals;
  }, [currentDeckRows, missionBranchSelections]);

  const parsedMissionReqs = useMemo(() => {
    const result: Record<string, ParsedMissionRequirements> = {};
    currentDeckRows
      .filter((row) => row.pile === 'mission')
      .forEach((row) => {
        result[row.name] = parseMissionRequirements(row.skills || '');
      });
    return result;
  }, [currentDeckRows]);

  const [viewMode, setViewMode] = useLocalStorage<'image' | 'list'>(
    'search-view-mode',
    typeof window !== 'undefined' && window.innerWidth < 640 ? 'list' : 'image',
  );

  // activeView controls which panel is shown in the desktop left panel
  const [activeView, setActiveView] = useState<'search' | 'deck'>('deck');
  // mobileView controls which full-page view is shown on mobile
  const [mobileView, setMobileView] = useState<'analysis' | 'search' | 'deck'>('deck');
  // previousMobileView tracks where the user came from before entering search
  const [previousMobileView, setPreviousMobileView] = useState<'analysis' | 'deck'>('deck');
  // activePile controls which pile tab is shown in the deck panel
  const [activePile, setActivePile] = useState<'mission' | 'dilemma' | 'draw'>('draw');
  const [deckActionsOpen, setDeckActionsOpen] = useState(false);
  const [mobileTitleEditing, setMobileTitleEditing] = useState(false);
  // missionIndex controls which mission is shown in the mobile carousel
  const [missionIndex, setMissionIndex] = useState(0);



  const missions = currentDeckRows.filter((row) => row.pile === 'mission');

  useEffect(() => {
    setMissionIndex((i) => Math.min(i, Math.max(0, missions.length - 1)));
  }, [missions.length]);

  // Compute available HQ/reportsto filter options from the deck contents.
  // Regular HQ missions (missiontype='h') use their name as the reportsto key.
  // No-HQ scenarios (Caretaker's Array, Prevent Historical Disruption, Ceti Alpha V)
  // are determined by the combination of missions and ships/events in the draw pile.
  const hqOptions = useMemo((): HqOption[] => {
    const options: HqOption[] = [];

    // Regular HQ missions
    const hqMissions = missions.filter((row) => row.missiontype === 'h');
    for (const hq of hqMissions) {
      options.push({ label: hq.name, value: hq.name.toLowerCase() });
    }

    // No-HQ: Caretaker's Array + U.S.S. Equinox
    const hasCaretakers = missions.some((row) => row.name.startsWith("caretaker's array"));
    if (hasCaretakers) {
      const hasEquinox = currentDeckRows.some(
        (row) => row.pile === 'draw' && row.type === 'ship' && row.name.includes('equinox')
      );
      const hasVoyager = currentDeckRows.some(
        (row) => row.pile === 'draw' && row.type === 'ship' && (
          row.name.includes('u.s.s. voyager') || (row.keywords || '').includes('commander: uss voyager')
        )
      );
      if (hasEquinox) {
        options.push({ label: "Caretaker's Array (Equinox)", value: "caretaker's array equinox" });
      }
      if (hasVoyager) {
        options.push({ label: "Caretaker's Array (Voyager)", value: "caretaker's array voyager" });
      }
    }

    // No-HQ: Prevent Historical Disruption + U.S.S. Relativity
    const hasPreventHistorical = missions.some((row) => row.name.startsWith('prevent historical disruption'));
    if (hasPreventHistorical) {
      const hasRelativity = currentDeckRows.some(
        (row) => row.pile === 'draw' && row.type === 'ship' && row.name.includes('relativity')
      );
      if (hasRelativity) {
        options.push({ label: 'Prevent Historical Disruption (Relativity)', value: 'prevent historical disruption relativity' });
      }
    }

    // No-HQ: To Rule In Hell (event in draw pile) + Ceti Alpha V (any version in missions)
    const hasCetiAlphaV = missions.some((row) => row.name.startsWith('ceti alpha v'));
    const hasToRuleInHell = currentDeckRows.some(
      (row) => row.pile === 'draw' && row.name.includes('to rule in hell')
    );
    if (hasCetiAlphaV && hasToRuleInHell) {
      options.push({ label: 'Ceti Alpha V (Khan)', value: 'ceti alpha v khan' });
    }

    return options;
  }, [missions, currentDeckRows]);

  const compare = (a: string | undefined | null, b: string | undefined | null) => {
    return (a ?? '').localeCompare(b ?? '', 'en', { ignorePunctuation: true });
  };

  const searchInputRef = useRef<HTMLInputElement>(null);

  const searchPile = useCallback((query: string) => {
    setPreviousMobileView(mobileView === 'search' ? previousMobileView : (mobileView as 'analysis' | 'deck'));
    setSearchQuery(query);
    setActiveView('search');
    setMobileView('search');
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }, [mobileView, previousMobileView]);

  const handleSkillSearch = useCallback((skill: string, hq: string | null) => {
    const query = hq
      ? `type:personnel skills:${skill} reportsto:"${hq}"`
      : `type:personnel skills:${skill}`;
    setPreviousMobileView(mobileView === 'search' ? previousMobileView : (mobileView as 'analysis' | 'deck'));
    setSearchQuery(query);
    setActiveView('search');
    setMobileView('search');
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }, [mobileView, previousMobileView]);

  const handleKeywordSearch = useCallback((keyword: string, hq: string | null) => {
    const query = hq
      ? `type:personnel keywords:"${keyword}" reportsto:"${hq}"`
      : `type:personnel keywords:"${keyword}"`;
    searchPile(query);
  }, [searchPile]);

  const handleIconSearch = useCallback((icon: string, hq: string | null) => {
    const query = hq
      ? `type:personnel icons:"${icon}" reportsto:"${hq}"`
      : `type:personnel icons:"${icon}"`;
    searchPile(query);
  }, [searchPile]);

  const removeMission = useCallback((row: CardDef) => {
    setCurrentDeck((prevState) => ({
      ...prevState,
      [row.collectorsinfo]: {
        count: 0,
        row: { ...row, count: 0 },
      },
    }));
  }, [setCurrentDeck]);

  const missionCount = currentDeckRows.filter(r => r.pile === 'mission').reduce((s, r) => s + r.count, 0);
  const dilemmaCount = currentDeckRows.filter(r => r.pile === 'dilemma').reduce((s, r) => s + r.count, 0);
  const drawCount = currentDeckRows.filter(r => r.pile === 'draw').reduce((s, r) => s + r.count, 0);

  const drawTypeBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const row of currentDeckRows) {
      if (row.pile === 'draw') {
        counts[row.type] = (counts[row.type] ?? 0) + (row.count ?? 0);
      }
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [currentDeckRows]);

  const searchPanel = (
    <div className="mx-2 mt-4 flex flex-col flex-1 min-h-0 overflow-hidden">
      <div className="shrink-0">
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <SearchBar ref={searchInputRef} searchQuery={searchQuery} setSearchQuery={setSearchQuery} variant="styled" />
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
      <Tooltip id="button-tooltip" />

      {/* Mobile compact header (hidden on lg+) */}
      <div className="lg:hidden shrink-0">
        {mobileTitleEditing ? (
          <input
            type="text"
            id="deckTitleMobile"
            placeholder="Set deck title here"
            value={deckTitle}
            autoFocus
            onChange={(e) => setDeckTitle(e.target.value)}
            onBlur={() => setMobileTitleEditing(false)}
            className="bg-white/[0.05] text-text-primary font-body font-bold py-2 px-4 rounded my-0 border border-white/10 w-full placeholder:text-text-disabled focus:outline-none focus:border-accent/40"
          />
        ) : (
          <div className="flex items-center space-x-2">
            <button
              className="flex-1 flex items-center gap-2 min-w-0 text-left"
              onClick={() => setMobileTitleEditing(true)}
              aria-label="Edit deck title"
            >
              <span className="text-text-primary font-body font-bold truncate min-w-0">
                {deckTitle || <span className="text-text-disabled">Set deck title here</span>}
              </span>
              <FaPencilAlt className="shrink-0 text-text-disabled text-xs" />
            </button>
            <button
              className="btn-icon"
              onClick={openDeckPicker}
              data-tooltip-id="button-tooltip"
              data-tooltip-content="Load decks"
            >
              <FaFolderOpen />
            </button>
            <button
              className="btn-icon"
              onClick={() => writeToDrive()}
              data-tooltip-id="button-tooltip"
              data-tooltip-content={savingToGDrive ? 'Saving...' : 'Save to G Drive'}
            >
              <FaSave />
            </button>
            {savedRecently && (
              <span className="text-sm text-green-400 font-medium">Saved!</span>
            )}
            {saveError && (
              <span className="text-sm text-red-400 font-medium">{saveError}</span>
            )}
            <div className="relative">
              <button
                className="btn-icon"
                onClick={() => setDeckActionsOpen((prev) => !prev)}
                data-tooltip-id="button-tooltip"
                data-tooltip-content="More actions"
                aria-label="More deck actions"
              >
                <FaChevronDown className={`transition-transform ${deckActionsOpen ? 'rotate-180' : ''}`} />
              </button>
              {deckActionsOpen && (
                <div className="absolute right-0 top-full mt-1 z-20 bg-[#131713] border border-white/20 rounded shadow-lg py-1 flex flex-col min-w-[180px]">
                  <button
                    className="flex items-center space-x-3 w-full px-4 py-2 text-sm hover:bg-white/10 text-left"
                    onClick={() => { clearDeck(); setDeckActionsOpen(false); }}
                  >
                    <FaEraser className="shrink-0" />
                    <span>Clear deck</span>
                  </button>
                  <label
                    htmlFor="fileInputMobile"
                    className="flex items-center space-x-3 w-full px-4 py-2 text-sm hover:bg-white/10 cursor-pointer"
                  >
                    <FaFileUpload className="shrink-0" />
                    <span>Load from file</span>
                    <input
                      id="fileInputMobile"
                      type="file"
                      onChange={(e) => {
                        if (!e.target.files) return;
                        const file = e.target.files[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (ev) => {
                            if (!ev.target?.result) return;
                            handleFileLoad(file.name, ev.target.result as string);
                            setDeckActionsOpen(false);
                          };
                          reader.readAsText(file);
                        }
                      }}
                      className="hidden"
                    />
                  </label>
                  <button
                    className="flex items-center space-x-3 w-full px-4 py-2 text-sm hover:bg-white/10 text-left"
                    onClick={() => { exportLackeyDeckToDisk(); setDeckActionsOpen(false); }}
                  >
                    <FaFileExport className="shrink-0" />
                    <span>Export to LackeyCCG</span>
                  </button>
                  <button
                    className="flex items-center space-x-3 w-full px-4 py-2 text-sm hover:bg-white/10 text-left"
                    onClick={() => shareDeck()}
                    disabled={shareState === 'copying'}
                  >
                    {shareState === 'copying' ? <FaSpinner className="shrink-0 animate-spin" /> : <FaShareAlt className="shrink-0" />}
                    <span>{shareState === 'copying' ? 'Creating...' : shareState === 'copied' ? 'Copied!' : shareState === 'error' ? (shareError ?? 'Share failed') : 'Copy share link'}</span>
                  </button>
                  {shareUrl && (
                    <div className="px-4 py-2">
                      <input
                        className="text-xs bg-bg-secondary text-text-primary border border-border rounded px-2 py-1 w-full cursor-text"
                        value={shareUrl}
                        readOnly
                        onClick={(e) => e.currentTarget.select()}
                        aria-label="Share link"
                      />
                    </div>
                  )}
                  {isEarlyAccessUser(session?.user?.email) && (
                    <Link
                      href={isFixture ? '/decks/practice?fixture=1' : '/decks/practice'}
                      className={`flex items-center space-x-3 w-full px-4 py-2 text-sm hover:bg-white/10 ${currentDeckRows.filter((row) => row.pile === 'draw').length === 0 ? 'opacity-50 pointer-events-none' : ''}`}
                      aria-disabled={currentDeckRows.filter((row) => row.pile === 'draw').length === 0}
                    >
                      <FaPlayCircle className="shrink-0" />
                      <span>Practice draw</span>
                    </Link>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Desktop full header (hidden below lg) */}
      <div className="hidden lg:block shrink-0">
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
          <div className="flex justify-start items-center space-x-2">
            <button
              className="btn-icon"
              onClick={clearDeck}
              data-tooltip-id="button-tooltip"
              data-tooltip-content="Clear current deck (your saved decks are not affected)"
            >
              <FaEraser />
            </button>
            <DeckUploader onFileLoad={handleFileLoad} />
            <button
              className="btn-icon"
              onClick={exportLackeyDeckToDisk}
              data-tooltip-id="button-tooltip"
              data-tooltip-content="Export the current deck to a LackeyCCG file"
            >
              <FaFileExport />
            </button>
            <button
              className="btn-icon"
              onClick={shareDeck}
              disabled={shareState === 'copying'}
              data-tooltip-id="button-tooltip"
              data-tooltip-content={shareState === 'copying' ? 'Creating share link...' : 'Copy share link to clipboard'}
            >
              {shareState === 'copying' ? <FaSpinner className="animate-spin" /> : <FaShareAlt />}
            </button>
            {shareState === 'copied' && (
              <span className="text-sm text-green-400 font-medium">Copied!</span>
            )}
            {shareUrl && (
              <input
                className="text-xs bg-bg-secondary text-text-primary border border-border rounded px-2 py-1 w-72 cursor-text"
                value={shareUrl}
                readOnly
                onClick={(e) => e.currentTarget.select()}
                aria-label="Share link"
              />
            )}
            {shareState === 'error' && shareError && (
              <span className="text-sm text-red-400 font-medium">{shareError}</span>
            )}
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
            <button
              className="btn-icon"
              onClick={openDeckPicker}
              data-tooltip-id="button-tooltip"
              data-tooltip-content="Load decks"
            >
              <FaFolderOpen />
            </button>
            <button
              className="btn-icon"
              onClick={() => writeToDrive()}
              data-tooltip-id="button-tooltip"
              data-tooltip-content={savingToGDrive ? 'Saving...' : 'Save to G Drive'}
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
          {/* Mobile-only save toolbar for Analysis tab */}
          <div className="lg:hidden flex flex-col border-b border-border bg-bg-secondary">
            <div className="flex items-center justify-between px-4 py-2">
              <span className="text-sm font-medium truncate text-text-muted">
                {deckTitle || 'Untitled Deck'}{isDirty && <span className="text-yellow-400 font-bold"> *</span>}
              </span>
              <div className="flex items-center gap-2">
                <button
                  className="btn-icon"
                  onClick={shareDeck}
                  disabled={shareState === 'copying'}
                  data-tooltip-id="button-tooltip"
                  data-tooltip-content={shareState === 'copying' ? 'Creating share link...' : 'Copy share link to clipboard'}
                >
                  {shareState === 'copying' ? <FaSpinner className="animate-spin" /> : <FaShareAlt />}
                </button>
                <button
                  className="btn-icon"
                  onClick={() => writeToDrive()}
                  data-tooltip-id="button-tooltip"
                  data-tooltip-content={savingToGDrive ? 'Saving...' : 'Save to G Drive'}
                >
                  <FaSave />
                </button>
                {savedRecently && <span className="text-sm text-green-400 font-medium">Saved!</span>}
                {shareState === 'copied' && <span className="text-sm text-green-400 font-medium">Copied!</span>}
                {saveError && <span className="text-sm text-red-400 font-medium">{saveError}</span>}
                {shareState === 'error' && shareError && <span className="text-sm text-red-400 font-medium">{shareError}</span>}
              </div>
            </div>
            {shareUrl && (
              <div className="px-4 pb-2">
                <input
                  className="text-xs bg-bg-secondary text-text-primary border border-border rounded px-2 py-1 w-full cursor-text"
                  value={shareUrl}
                  readOnly
                  onClick={(e) => e.currentTarget.select()}
                  aria-label="Share link"
                />
              </div>
            )}
          </div>
          <div className="container mx-auto p-4">
            {/* Desktop: horizontal scroll row */}
            <div className="hidden lg:flex space-x-4 overflow-x-scroll">
              {Array.from({ length: 5 }, (_, i) => missions[i] ?? null).map((row, i) =>
                row ? (
                  <div key={row.collectorsinfo} className="flex-shrink-0 flex flex-col items-center w-56">
                    <div className="relative group w-full">
                      <img
                        src={`/cardimages/${row.imagefile}.jpg`}
                        width={165}
                        height={229}
                        loading="lazy"
                        alt={row.name}
                        className="w-56 h-auto rounded-xl block"
                      />
                      <div className="absolute inset-0 rounded-xl shadow-[inset_0_0_0_6px_black] pointer-events-none" />
                      <button
                        onClick={() => removeMission(row)}
                        className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600/80"
                        aria-label={`Remove ${row.name}`}
                        title={`Remove ${row.name}`}
                      >
                        ×
                      </button>
                    </div>
                    <MissionBranchSelector
                      missionName={row.name}
                      parsed={parsedMissionReqs[row.name] ?? { mandatory: {}, orBranches: null }}
                      selected={missionBranchSelections[row.name] ?? null}
                      onChange={(idx) =>
                        setMissionBranchSelections((prev) => ({ ...prev, [row.name]: idx }))
                      }
                    />
                  </div>
                ) : (
                  <div
                    key={`empty-${i}`}
                    className="flex-shrink-0 w-56 rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-2 p-3"
                    style={{ aspectRatio: '165/229' }}
                  >
                    <span className="text-xs text-text-secondary mb-1">Add mission</span>
                    <button
                      onClick={() => searchPile('type:mission missiontype:h')}
                      className="btn-secondary text-xs w-full"
                    >
                      HQ
                    </button>
                    <button
                      onClick={() => searchPile('type:mission missiontype:s')}
                      className="btn-secondary text-xs w-full"
                    >
                      Space
                    </button>
                    <button
                      onClick={() => searchPile('type:mission missiontype:p')}
                      className="btn-secondary text-xs w-full"
                    >
                      Planet
                    </button>
                  </div>
                )
              )}
            </div>

            {/* Mobile: single-card carousel */}
            <div className="lg:hidden">
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => setMissionIndex((i) => (i - 1 + 5) % 5)}
                  className="text-2xl px-2"
                  aria-label="Previous mission"
                >
                  ‹
                </button>
                {missions[missionIndex] ? (
                  <div className="relative flex-shrink-0">
                    <img
                      src={`/cardimages/${missions[missionIndex].imagefile}.jpg`}
                      width={165}
                      height={229}
                      loading="lazy"
                      alt={missions[missionIndex].name}
                      className="w-72 h-auto rounded-xl block"
                    />
                    <div className="absolute inset-0 rounded-xl shadow-[inset_0_0_0_6px_black] pointer-events-none" />
                    <button
                      onClick={() => removeMission(missions[missionIndex])}
                      className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/70 text-white text-sm flex items-center justify-center hover:bg-red-600/80"
                      aria-label={`Remove ${missions[missionIndex].name}`}
                      title={`Remove ${missions[missionIndex].name}`}
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <div
                    className="flex-shrink-0 w-72 rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-2 p-4"
                    style={{ aspectRatio: '165/229' }}
                  >
                    <span className="text-xs text-text-secondary mb-1">Add mission</span>
                    <button
                      onClick={() => searchPile('type:mission missiontype:h')}
                      className="btn-secondary text-xs w-full"
                    >
                      HQ
                    </button>
                    <button
                      onClick={() => searchPile('type:mission missiontype:s')}
                      className="btn-secondary text-xs w-full"
                    >
                      Space
                    </button>
                    <button
                      onClick={() => searchPile('type:mission missiontype:p')}
                      className="btn-secondary text-xs w-full"
                    >
                      Planet
                    </button>
                  </div>
                )}
                <button
                  onClick={() => setMissionIndex((i) => (i + 1) % 5)}
                  className="text-2xl px-2"
                  aria-label="Next mission"
                >
                  ›
                </button>
              </div>
              <p className="text-xs text-center text-text-secondary mt-2">
                {missionIndex + 1} / 5
              </p>
              {missions[missionIndex] && (
                <MissionBranchSelector
                  missionName={missions[missionIndex].name}
                  parsed={parsedMissionReqs[missions[missionIndex].name] ?? { mandatory: {}, orBranches: null }}
                  selected={missionBranchSelections[missions[missionIndex].name] ?? null}
                  onChange={(idx) =>
                    setMissionBranchSelections((prev) => ({
                      ...prev,
                      [missions[missionIndex].name]: idx,
                    }))
                  }
                />
              )}
            </div>
          </div>

          <CollapsibleSection title="Personnel skills" isCollapsed={analysisCollapsed['Personnel skills'] ?? true} onToggle={() => setAnalysisCollapsed((prev) => ({ ...prev, 'Personnel skills': !(prev['Personnel skills'] ?? true) }))}>
            <SkillsChart
              currentDeckRows={currentDeckRows}
              missionRequirements={aggregatedMissionReqs}
              onSkillSearch={handleSkillSearch}
              hqOptions={hqOptions}
            />
          </CollapsibleSection>

          <CollapsibleSection title="Keywords" isCollapsed={analysisCollapsed['Keywords'] ?? true} onToggle={() => setAnalysisCollapsed((prev) => ({ ...prev, 'Keywords': !(prev['Keywords'] ?? true) }))}>
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
                <KeywordBadge
                  key={keyword}
                  keyword={keyword}
                  count={count}
                  onSearch={handleKeywordSearch}
                  hqOptions={hqOptions}
                />
              )}
            </PileAggregate>
          </CollapsibleSection>

          <CollapsibleSection title="Icons" isCollapsed={analysisCollapsed['Icons'] ?? true} onToggle={() => setAnalysisCollapsed((prev) => ({ ...prev, 'Icons': !(prev['Icons'] ?? true) }))}>
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
                <IconPill key={icon} icon={icon} count={count} onSearch={handleIconSearch} hqOptions={hqOptions} />
              )}
            </PileAggregate>
          </CollapsibleSection>

          <CollapsibleSection title="Costs" isCollapsed={analysisCollapsed['Costs'] ?? true} onToggle={() => setAnalysisCollapsed((prev) => ({ ...prev, 'Costs': !(prev['Costs'] ?? true) }))}>
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

          <CollapsibleSection title="Card types" isCollapsed={analysisCollapsed['Card types'] ?? true} onToggle={() => setAnalysisCollapsed((prev) => ({ ...prev, 'Card types': !(prev['Card types'] ?? true) }))}>
            <BarChart
              labels={drawTypeBreakdown.map(([type]) => type)}
              values={drawTypeBreakdown.map(([, count]) => count)}
            />
          </CollapsibleSection>
        </div>
      </div>

      {/* Mobile: Full-page search view */}
      {mobileView === 'search' && (
        <div className="lg:hidden fixed inset-x-0 top-0 bottom-14 z-20 bg-[#131713] flex flex-col">
          <div className="shrink-0 flex items-center px-2 pt-2">
            <button
              onClick={() => setMobileView(previousMobileView)}
              className="flex items-center gap-1 text-sm text-text-muted hover:text-text-secondary"
              aria-label={previousMobileView === 'analysis' ? 'Back to analysis' : 'Back to deck'}
            >
              <FaChevronLeft className="text-xs" /> {previousMobileView === 'analysis' ? 'Back to analysis' : 'Back to deck'}
            </button>
          </div>
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
          loadDriveFile={fetchDriveFile}
          deleteDriveFile={deleteDriveFile}
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
