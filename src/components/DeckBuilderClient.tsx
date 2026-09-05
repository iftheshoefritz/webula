'use client';

import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import posthog from 'posthog-js';
import { useSearchParams } from 'next/navigation';
import useFilterData from '../hooks/useFilterData';
import useLocalStorage from '../hooks/useLocalStorage';
import DeckUploader from './DeckUploader';
import DeckListPile from './DeckListPile';
import { DrivePickerModal } from './DrivePickerModal';
import { SaveAsDialog } from './SaveAsDialog';
import PileAggregate from './PileAggregate';
import IconPill from './IconPill';
import CollapsibleSection from './CollapsibleSection';
import KeywordBadge from './KeywordBadge';
import SpeciesBadge from './SpeciesBadge';
import PileAggregateCostChart from './PileAggregateCostChart';
import PileAggregateAttributeChart from './PileAggregateAttributeChart';
import PileAggregateDilemmaTypeChart from './PileAggregateDilemmaTypeChart';
import BarChart from './BarChart';
import SkillsChart from './SkillsChart';
import type { HqOption } from './SkillsChart';
import SearchOverlay from './SearchOverlay';
import SearchBar from './SearchBar';
import SearchPills from './SearchPills';
import SearchResults from './SearchResults';
import { CardDef } from '../types';
import { signIn } from 'next-auth/react';
import { missionRequirements, parseMissionRequirements } from '../lib/missionRequirements';
import { unionAlignValues, unionSortedLabels } from '../lib/chartAggregation';
import type { ParsedMissionRequirements } from '../lib/missionRequirements';
import Link from 'next/link';
import { FaSave, FaSearch, FaTrash, FaFileAlt, FaFileExport, FaFileUpload, FaFileImport, FaSignInAlt, FaFolderOpen, FaList, FaChevronLeft, FaChevronDown, FaChartBar, FaPlayCircle, FaPlus, FaTh, FaPencilAlt, FaShareAlt, FaSpinner, FaTimes, FaBalanceScale } from 'react-icons/fa';
import { Tooltip } from 'react-tooltip';
import type { CardData } from '../lib/loadCards';
import { getCardCounts, formatCardCountLabel } from '../lib/cardCount';
import { isEarlyAccessUser } from '../lib/featureFlags';
import useDriveSync from '../hooks/useDriveSync';
import useDeckState from '../hooks/useDeckState';

interface DeckBuilderClientProps {
  data: CardData[];
  columns: string[];
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
  const branchLabel = (branch: Record<string, number>) => {
    const combined = { ...parsed.mandatory, ...branch };
    return Object.keys(combined)
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join(', ');
  };

  const mandatoryLabel = Object.keys(parsed.mandatory)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(', ');

  return (
    <div className="mt-2 flex flex-wrap gap-1 justify-center" data-testid={`branch-selector-${missionName}`}>
      {parsed.orBranches ? (
        <>
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
        </>
      ) : (
        <button
          className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
            selected !== -1
              ? 'bg-amber-500 border-amber-500 text-black font-semibold'
              : 'border-border text-text-secondary hover:border-amber-400 hover:text-amber-300'
          }`}
          onClick={() => onChange(null)}
          aria-pressed={selected !== -1}
        >
          {mandatoryLabel}
        </button>
      )}
      <button
        className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
          selected === -1
            ? 'bg-amber-500 border-amber-500 text-black font-semibold'
            : 'border-border text-text-secondary hover:border-amber-400 hover:text-amber-300'
        }`}
        onClick={() => onChange(-1)}
        aria-pressed={selected === -1}
      >
        None
      </button>
    </div>
  );
}

export default function DeckBuilderClient({ data, columns }: DeckBuilderClientProps) {
  const searchParams = useSearchParams();
  const isFixture = searchParams.get('fixture') === '1';

  const [searchQuery, setSearchQuery] = useState('');
  const filteredData = useFilterData(false, data, columns, searchQuery);
  const cardCountLabel = useMemo(() => formatCardCountLabel(getCardCounts(filteredData)), [filteredData]);

  const [analysisCollapsed, setAnalysisCollapsed] = useLocalStorage<Record<string, boolean>>('analysisCollapsed', {
    'Personnel skills': true,
    'Keywords': true,
    'Species': true,
    'Icons': true,
    'Costs': true,
    'Attributes': true,
  });
  const [shareState, setShareState] = useState<'idle' | 'copying' | 'copied' | 'error'>('idle');
  const [pendingShareContent, setPendingShareContent] = useState<string | null>(null);
  const [pendingShareTitle, setPendingShareTitle] = useState<string | null>(null);
  const [pendingShareWarning, setPendingShareWarning] = useState<boolean>(false);
  const [shareLoadError, setShareLoadError] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  const {
    currentDeck,
    setCurrentDeck,
    deckTitle,
    setDeckTitle,
    missionBranchSelections,
    setMissionBranchSelections,
    isDirty,
    clearDirty,
    incrementIncluded,
    decrementIncluded,
    clearDeck,
    handleFileLoad,
  } = useDeckState({
    data,
    isFixture,
    pendingShareContent,
    pendingShareTitle,
    setPendingShareContent,
    setPendingShareWarning,
  });

  useEffect(() => {
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const shareId = params.get('share');
      if (shareId) {
        window.history.replaceState({}, '', '/decks');
        try {
          const pasteResponse = await fetch(`/api/share?id=${shareId}`);
          const { content, title } = await pasteResponse.json();
          setPendingShareContent(content);
          setPendingShareTitle(title || null);
        } catch {
          setShareLoadError('Failed to load shared deck');
        }
      }
    })();
  }, []);

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

  const {
    session,
    deckFile,
    resetDeckFile,
    driveFiles,
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
  } = useDriveSync({
    data,
    deckTitle,
    createLackeyTSV,
    handleFileLoad,
    clearDirty,
  });

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
    if (currentDeckRows.length === 0) {
      setShareState('error');
      setShareError('Deck is empty');
      setTimeout(() => { setShareState('idle'); setShareError(null); }, 3000);
      return;
    }
    setShareState('copying');
    setShareError(null);
    setShareUrl(null);
    try {
      const tsv = createLackeyTSV();
      // Build the URL as a promise so we can pass it to ClipboardItem synchronously
      // (preserves the user gesture context on iOS Safari, where writeText fails after async)
      const urlPromise = fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: tsv, title: deckTitle }),
      }).then(res => {
        if (!res.ok) throw new Error('Share failed');
        return res.json();
      }).then((json: { id: string }) => `${window.location.origin}/decks?share=${json.id}`);

      let copied = false;
      // ClipboardItem with a Promise preserves the user gesture on iOS Safari
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        try {
          await navigator.clipboard.write([
            new ClipboardItem({
              'text/plain': urlPromise.then(url => new Blob([url], { type: 'text/plain' })),
            }),
          ]);
          copied = true;
        } catch {
          // Clipboard write failed — fall through to writeText fallback
        }
      }

      const url = await urlPromise;
      setShareUrl(url);

      if (!copied) {
        try {
          await navigator.clipboard.writeText(url);
          copied = true;
        } catch {
          // Clipboard unavailable — URL input is shown for manual copy
        }
      }

      setShareState(copied ? 'copied' : 'idle');
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

  const activeCompareDeckRows = compareDeckRows.length > 0 ? compareDeckRows : undefined;

  const costAttributeDecks = useMemo(() => {
    const decks = [{ id: 'current', name: '# of Occurrences', rows: currentDeckRows }];
    if (activeCompareDeckRows) {
      decks.push({ id: 'compare', name: compareDeckName ?? 'Comparison deck', rows: activeCompareDeckRows });
    }
    return decks;
  }, [currentDeckRows, activeCompareDeckRows, compareDeckName]);

  const aggregatedMissionReqs = useMemo(() => {
    const totals: Record<string, number> = {};
    currentDeckRows
      .filter((row) => row.pile === 'mission')
      .forEach((row) => {
        const parsed = parseMissionRequirements(row.skills || '');
        const selectedIndex = missionBranchSelections[row.name] ?? null;

        // "None" (-1) means ignore this mission entirely for skill requirements
        if (selectedIndex === -1) return;

        // Always include mandatory skills (common to every branch)
        Object.entries(parsed.mandatory).forEach(([skill, n]) => {
          totals[skill] = (totals[skill] || 0) + n;
        });
        if (parsed.orBranches) {
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

  const handleSpeciesSearch = useCallback((species: string, hq: string | null) => {
    const query = hq
      ? `type:personnel species:"${species}" reportsto:"${hq}"`
      : `type:personnel species:"${species}"`;
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

  const drawTypeChart = useMemo(() => {
    const countByType = (rows: Array<Record<string, any>>) => {
      const counts: Record<string, number> = {};
      for (const row of rows) {
        if (row.pile === 'draw') {
          counts[row.type] = (counts[row.type] ?? 0) + (row.count ?? 0);
        }
      }
      return counts;
    };
    const primaryCounts = countByType(currentDeckRows);
    const compareCounts = activeCompareDeckRows ? countByType(activeCompareDeckRows) : undefined;
    const seriesCounts = compareCounts ? [primaryCounts, compareCounts] : [primaryCounts];
    const labels = unionSortedLabels(seriesCounts, (a, b) => (primaryCounts[b] ?? 0) - (primaryCounts[a] ?? 0) || a.localeCompare(b));
    const values = unionAlignValues(seriesCounts, labels);
    const series = values.map((v, i) => ({
      label: i === 0 ? '# of Occurrences' : compareDeckName ?? 'Comparison deck',
      values: v,
    }));
    return { labels, series };
  }, [currentDeckRows, activeCompareDeckRows, compareDeckName]);

  const searchPanel = (
    <div className="mx-2 mt-4 flex flex-col flex-1 min-h-0 overflow-hidden">
      <div className="shrink-0">
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <SearchBar
              ref={searchInputRef}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              variant="styled"
              countLabel={cardCountLabel}
            />
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
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden px-2 pt-2">
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
                    onClick={() => { clearDeck(resetDeckFile); setDeckActionsOpen(false); }}
                  >
                    <FaFileAlt className="shrink-0" />
                    <span>New deck</span>
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
                  <Link
                    href="/import-trekcc"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center space-x-3 w-full px-4 py-2 text-sm hover:bg-white/10"
                    onClick={() => setDeckActionsOpen(false)}
                  >
                    <FaFileImport className="shrink-0" />
                    <span>Import from TrekCC</span>
                  </Link>
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
              onClick={() => clearDeck(resetDeckFile)}
              data-tooltip-id="button-tooltip"
              data-tooltip-content="Start a new deck (your saved decks are not affected)"
            >
              <FaFileAlt />
            </button>
            <DeckUploader onFilesLoad={handleFilesLoad} />
            <Link
              href="/import-trekcc"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-icon flex items-center justify-center"
              data-tooltip-id="button-tooltip"
              data-tooltip-content="Import a deck from TrekCC.org"
            >
              <FaFileImport />
            </Link>
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
          {/* Mobile-only header for Analysis tab: title + controls in one row, matching the deck tab */}
          <div className="lg:hidden shrink-0 border-b border-border bg-bg-secondary px-2 py-2">
            {mobileTitleEditing ? (
              <input
                type="text"
                id="deckTitleAnalysisMobile"
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
                  className={`btn-icon ${compareDeckName ? 'text-accent' : ''}`}
                  onClick={() => (compareDeckName ? clearCompareDeck() : openComparePicker())}
                  aria-label={compareDeckName ? `Comparing to ${compareDeckName}, tap to clear` : 'Compare deck'}
                  data-tooltip-id="button-tooltip"
                  data-tooltip-content={compareDeckName ? `Comparing to ${compareDeckName} — tap to clear` : 'Compare deck'}
                >
                  <FaBalanceScale />
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
                <button
                  className="btn-icon"
                  onClick={() => writeToDrive()}
                  data-tooltip-id="button-tooltip"
                  data-tooltip-content={savingToGDrive ? 'Saving...' : 'Save to G Drive'}
                >
                  <FaSave />
                </button>
              </div>
            )}
            {(savedRecently || saveError || shareState === 'copied' || (shareState === 'error' && shareError)) && (
              <div className="flex items-center gap-2 pt-1">
                {savedRecently && <span className="text-sm text-green-400 font-medium">Saved!</span>}
                {shareState === 'copied' && <span className="text-sm text-green-400 font-medium">Copied!</span>}
                {saveError && <span className="text-sm text-red-400 font-medium">{saveError}</span>}
                {shareState === 'error' && shareError && <span className="text-sm text-red-400 font-medium">{shareError}</span>}
              </div>
            )}
            {shareUrl && (
              <div className="pt-2">
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
          {/* Desktop-only compare deck toolbar for the Analysis tab */}
          <div className="hidden lg:flex items-center gap-2 px-4 py-2 border-b border-border bg-bg-secondary">
            {compareDeckName ? (
              <>
                <FaBalanceScale className="shrink-0 text-text-muted" />
                <span className="flex-1 min-w-0 truncate text-sm text-text-muted">
                  Comparing to <span className="text-text-primary">{compareDeckName}</span>
                </span>
                <button
                  className="btn-icon"
                  onClick={clearCompareDeck}
                  aria-label="Clear comparison deck"
                  data-tooltip-id="button-tooltip"
                  data-tooltip-content="Clear comparison deck"
                >
                  <FaTimes />
                </button>
              </>
            ) : (
              <button
                className="btn-secondary text-sm flex items-center gap-2"
                onClick={openComparePicker}
              >
                <FaBalanceScale />
                Compare deck
              </button>
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
              compareDeckRows={activeCompareDeckRows}
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
              compareDeckRows={activeCompareDeckRows}
            >
              {([keyword, count], compareCount) => (
                <KeywordBadge
                  key={keyword}
                  keyword={keyword}
                  count={count}
                  compareCount={compareCount}
                  onSearch={handleKeywordSearch}
                  hqOptions={hqOptions}
                />
              )}
            </PileAggregate>
          </CollapsibleSection>

          <CollapsibleSection title="Species" isCollapsed={analysisCollapsed['Species'] ?? true} onToggle={() => setAnalysisCollapsed((prev) => ({ ...prev, 'Species': !(prev['Species'] ?? true) }))}>
            <PileAggregate
              currentDeckRows={currentDeckRows}
              characteristicName="species"
              filterFunction={(row) => row.pile === 'draw' && row.type === 'personnel'}
              splitFunction={(species) =>
                species
                  .split('/')
                  .map((s) => s.trim())
                  .filter((s) => s.length > 0)
              }
              assembleCounts={(counts, species, count) => {
                counts[species] = (counts[species] || 0) + count;
                return counts;
              }}
              compareDeckRows={activeCompareDeckRows}
            >
              {([species, count], compareCount) => (
                <SpeciesBadge
                  key={species}
                  species={species}
                  count={count}
                  compareCount={compareCount}
                  onSearch={handleSpeciesSearch}
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
              compareDeckRows={activeCompareDeckRows}
            >
              {([icon, count], compareCount) => (
                <IconPill key={icon} icon={icon} count={count} compareCount={compareCount} onSearch={handleIconSearch} hqOptions={hqOptions} />
              )}
            </PileAggregate>
          </CollapsibleSection>

          <CollapsibleSection title="Costs" isCollapsed={analysisCollapsed['Costs'] ?? true} onToggle={() => setAnalysisCollapsed((prev) => ({ ...prev, 'Costs': !(prev['Costs'] ?? true) }))}>
            <div className="flex flex-col lg:flex-row">
              <div className="w-full lg:w-1/2 lg:flex-row">
                <span className="text-xl font-bold mt-4 mb-2 block text-text-secondary">Draw Deck</span>
                <PileAggregateCostChart decks={costAttributeDecks} filterFunction={(row) => row.pile === 'draw'} />
              </div>
              <div className="w-full lg:w-1/2 lg:flex-row">
                <span className="text-xl font-bold mt-4 mb-2 block text-text-secondary">Dilemma Pile</span>
                <PileAggregateCostChart decks={costAttributeDecks} filterFunction={(row) => row.pile === 'dilemma'} />
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Attributes" isCollapsed={analysisCollapsed['Attributes'] ?? true} onToggle={() => setAnalysisCollapsed((prev) => ({ ...prev, 'Attributes': !(prev['Attributes'] ?? true) }))}>
            <div className="flex flex-col lg:flex-row">
              {(['integrity', 'cunning', 'strength'] as const).map((attr) => (
                <div key={attr} className="w-full lg:w-1/3">
                  <span className="text-xl font-bold mt-4 mb-2 block text-text-secondary capitalize">{attr}</span>
                  <PileAggregateAttributeChart
                    decks={costAttributeDecks}
                    filterFunction={(row) => row.pile === 'draw' && row.type === 'personnel'}
                    attribute={attr}
                  />
                </div>
              ))}
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Card types" isCollapsed={analysisCollapsed['Card types'] ?? true} onToggle={() => setAnalysisCollapsed((prev) => ({ ...prev, 'Card types': !(prev['Card types'] ?? true) }))}>
            <BarChart
              labels={drawTypeChart.labels}
              series={drawTypeChart.series}
            />
          </CollapsibleSection>

          <CollapsibleSection title="Dilemma types" isCollapsed={analysisCollapsed['Dilemma types'] ?? true} onToggle={() => setAnalysisCollapsed((prev) => ({ ...prev, 'Dilemma types': !(prev['Dilemma types'] ?? true) }))}>
            <PileAggregateDilemmaTypeChart currentDeckRows={currentDeckRows} compareDeckRows={activeCompareDeckRows} compareLabel={compareDeckName ?? undefined} />
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

      {shareLoadError && (
        <div className="fixed top-2 inset-x-0 z-50 flex justify-center px-4">
          <div className="bg-red-900/90 border border-red-700 text-red-100 text-sm rounded-lg px-4 py-2 shadow-xl flex items-center gap-3">
            <span>{shareLoadError}</span>
            <button
              onClick={() => setShareLoadError(null)}
              className="text-red-200 hover:text-white"
              aria-label="Dismiss"
            >
              <FaTimes />
            </button>
          </div>
        </div>
      )}

      {pendingShareWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-gray-800 border border-gray-600 rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
            <h2 className="text-lg font-semibold text-white mb-3">A shared deck is ready to load</h2>
            <p className="text-gray-300 text-sm mb-6">
              Loading this deck will replace your current deck in the browser. Save to Google Drive or export your deck first if you want to keep it.
            </p>
            <div className="flex flex-col gap-3">
              <button
                className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm"
                onClick={() => { setPendingShareWarning(false); setPendingShareContent(null); setPendingShareTitle(null); }}
              >
                Go back to my previous deck to save
              </button>
              <button
                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm"
                onClick={() => { handleFileLoad(pendingShareTitle || 'shared-deck', pendingShareContent!); setPendingShareContent(null); setPendingShareTitle(null); setPendingShareWarning(false); }}
              >
                I&apos;m ready to load this awesome shared deck
              </button>
            </div>
          </div>
        </div>
      )}

      {showDrivePicker && (
        <DrivePickerModal
          driveFiles={driveFiles}
          loadDriveFile={drivePickerMode === 'compare' ? fetchCompareDriveFile : fetchDriveFile}
          deleteDriveFile={deleteDriveFile}
          onRenameFile={renameDriveFile}
          onCreateFolder={createDriveFolder}
          browsedFolder={browsedFolder}
          onBrowseFolder={setBrowsedFolder}
          onMoveFile={moveDriveFile}
          inProgress={loadingFromGDrive}
          onClose={closeDrivePicker}
          isSignedIn={!!session}
          hasDriveScope={session?.hasDriveScope ?? false}
          mode={drivePickerMode}
          onSignIn={() => signIn('google',
            { callbackUrl: `/decks?openPicker=true&pickerMode=${drivePickerMode}` },
            { scope: 'openid profile email https://www.googleapis.com/auth/drive.appdata', include_granted_scopes: 'true' }
          )}
        />
      )}

      {showSaveAsDialog && (
        <SaveAsDialog
          deckTitle={deckTitle}
          driveFiles={driveFiles}
          inProgress={loadingFromGDrive}
          onConfirm={confirmSaveAs}
          onCreateFolder={createDriveFolder}
          onClose={cancelSaveAs}
        />
      )}

      {showBulkSaveAsDialog && bulkImportPending && (
        <SaveAsDialog
          deckTitle={`${bulkImportPending.length} decks`}
          driveFiles={driveFiles}
          inProgress={loadingFromGDrive}
          onConfirm={confirmBulkSaveAs}
          onCreateFolder={createDriveFolder}
          onClose={cancelBulkSaveAs}
        />
      )}

      {bulkImportStatus !== 'idle' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-bg-secondary border border-white/10 rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
            <h2 className="text-lg font-semibold text-text-primary mb-3">Importing decks from disk</h2>
            {bulkImportStatus === 'saving' && bulkImportResults.length === 0 && (
              <p className="text-text-secondary text-sm mb-4">Saving decks to Google Drive&hellip;</p>
            )}
            {bulkImportError && <p className="text-red-400 text-sm mb-4">{bulkImportError}</p>}
            {(bulkImportResults.length > 0 || bulkImportSkipped.length > 0) && (
              <ul className="space-y-2 mb-4 max-h-64 overflow-y-auto text-sm">
                {bulkImportResults.map((r, i) => (
                  <li key={`bulk-result-${i}`} className="flex justify-between border-b border-white/10 pb-1">
                    <span>
                      {r.title}
                      {r.status === 'failed' && r.error && (
                        <span className="block text-xs text-red-400">{r.error}</span>
                      )}
                    </span>
                    <span
                      className={
                        r.status === 'failed'
                          ? 'text-red-400'
                          : r.status === 'updated'
                          ? 'text-blue-400'
                          : 'text-green-400'
                      }
                    >
                      {r.status}
                    </span>
                  </li>
                ))}
                {bulkImportSkipped.map((s, i) => (
                  <li key={`bulk-skipped-${i}`} className="flex justify-between border-b border-white/10 pb-1">
                    <span>
                      {s.name}
                      <span className="block text-xs text-red-400">{s.error}</span>
                    </span>
                    <span className="text-red-400">skipped</span>
                  </li>
                ))}
              </ul>
            )}
            {bulkImportStatus === 'done' && (
              <button
                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm"
                onClick={closeBulkImportResults}
              >
                Close
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
