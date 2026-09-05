import { useCallback, useEffect, useRef, useState } from 'react';
import posthog from 'posthog-js';
import useLocalStorage from './useLocalStorage';
import {
  aboveMinimumCount,
  belowMaximumCount,
  deckFromTsv,
  decrementedRow,
  findExistingOrUseRow,
  incrementedRow,
  mergeDeckPiles,
} from '../app/decks/deckBuilderUtils';
import type { DeckPile } from '../app/decks/deckBuilderUtils';
import { CardDef, Deck } from '../types';
import type { CardData } from '../lib/loadCards';
import { PRACTICE_DECK_TSV } from '../lib/practiceDeck';

interface UseDeckStateParams {
  data: CardData[];
  isFixture: boolean;
  pendingShareContent: string | null;
  pendingShareTitle: string | null;
  setPendingShareContent: (content: string | null) => void;
  setPendingShareWarning: (warning: boolean) => void;
}

export function useDeckState({
  data,
  isFixture,
  pendingShareContent,
  pendingShareTitle,
  setPendingShareContent,
  setPendingShareWarning,
}: UseDeckStateParams) {
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
  const [isDirty, setIsDirty] = useState(false);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setIsDirty(true);
  }, [currentDeck, deckTitle]);

  useEffect(() => {
    if (!isFixture || data.length === 0) return;
    setFixtureCurrentDeck(deckFromTsv(PRACTICE_DECK_TSV, data));
  }, [data, isFixture]);

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

  useEffect(() => {
    if (!pendingShareContent || data.length === 0) return;
    const deckIsEmpty = Object.keys(currentDeck).length === 0;
    if (deckIsEmpty) {
      handleFileLoad(pendingShareTitle || 'shared-deck', pendingShareContent);
      setPendingShareContent(null);
    } else {
      setPendingShareWarning(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingShareContent, data]);

  const incrementIncluded = useCallback(
    (row: CardDef) => {
      if (belowMaximumCount(currentDeck[row.collectorsinfo])) {
        const currentRow = findExistingOrUseRow(currentDeck, row);
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
      event.preventDefault();
      if (aboveMinimumCount(currentDeck[row.collectorsinfo])) {
        const newRow = decrementedRow(currentDeck[row.collectorsinfo].row);
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

  // deckFile is owned by useDriveSync, so clearDeck takes the Drive reset as a callback
  // rather than reaching into Drive state directly.
  const clearDeck = (resetDeckFile: () => void) => {
    const message = isDirty
      ? 'You have unsaved changes. This will start a new deck. Your saved decks are not affected. Are you sure?'
      : 'This will start a new deck. Your saved decks are not affected. Are you sure?';
    if (!window.confirm(message)) return;
    setCurrentDeck({});
    setDeckTitle('');
    resetDeckFile();
    setMissionBranchSelections({});
  };

  const clearDirty = () => setIsDirty(false);

  return {
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
  };
}

export default useDeckState;
