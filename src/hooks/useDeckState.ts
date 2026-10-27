import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  withCurrentPiles,
} from '../app/decks/deckBuilderUtils';
import type { DeckPile } from '../app/decks/deckBuilderUtils';
import { CardDef, DeckList } from '../types';
import type { CardData } from '../lib/loadCards';
import { PRACTICE_DECK_TSV } from '../lib/practiceDeck';

interface UseDeckStateParams {
  data: CardData[];
  isFixture: boolean;
  /** Called on every load that replaces the whole deck: a Drive file, a file upload, a shared deck. */
  onFullLoad?: () => void;
}

export function useDeckState({
  data,
  isFixture,
  onFullLoad,
}: UseDeckStateParams) {
  const [localCurrentDeck, setLocalCurrentDeck] = useLocalStorage<DeckList>('currentDeck', {});
  const [fixtureCurrentDeck, setFixtureCurrentDeck] = useState<DeckList>({});
  // A deck saved before #837 holds the old pile values, so compute each pile again on load.
  const storedCurrentDeck = useMemo(() => withCurrentPiles(localCurrentDeck), [localCurrentDeck]);
  const currentDeck = isFixture ? fixtureCurrentDeck : storedCurrentDeck;
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

  // The fixture deck is built in render from the card data, once for each `data`. It can still be
  // edited through setCurrentDeck, and an edit lasts until `data` changes.
  const [fixtureDeckData, setFixtureDeckData] = useState<CardData[] | null>(null);
  if (isFixture && data.length > 0 && data !== fixtureDeckData) {
    setFixtureDeckData(data);
    setFixtureCurrentDeck(deckFromTsv(PRACTICE_DECK_TSV, data));
  }

  // Sets the state of a load and nothing more.
  const setLoadedDeck = (name: string, contents: string, piles?: DeckPile[]) => {
    const incoming = deckFromTsv(contents, data);
    const next = piles ? mergeDeckPiles(currentDeck, incoming, piles) : incoming;
    setCurrentDeck(next);
    if (name && !piles) {
      setDeckTitle(name.replace('.txt', ''));
      setMissionBranchSelections({});
    }
  };

  const handleFileLoad = (name: string, contents: string, piles?: DeckPile[]) => {
    posthog.capture('deckBuilder.handleFileLoad.start');
    setLoadedDeck(name, contents, piles);
    if (!piles) onFullLoad?.();
    posthog.capture('deckBuilder.handleFileLoad.finish', { lines: Object.keys(currentDeck).length });
  };

  // A load that a render makes: a `?share=` deck or a `?driveFile=` deck once the card data is in.
  // It only sets state, so it neither reports nor calls onFullLoad; the caller clears the deck's
  // source itself. The report waits for the load to commit, in the effect below, so a render that
  // runs twice or is thrown away reports nothing extra.
  const [renderLoad, setRenderLoad] = useState<{ lines: number } | null>(null);
  const loadDeckInRender = (name: string, contents: string) => {
    setLoadedDeck(name, contents);
    setRenderLoad({ lines: Object.keys(currentDeck).length });
  };

  useEffect(() => {
    if (!renderLoad) return;
    posthog.capture('deckBuilder.handleFileLoad.start');
    posthog.capture('deckBuilder.handleFileLoad.finish', { lines: renderLoad.lines });
  }, [renderLoad]);

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
    loadDeckInRender,
  };
}

export default useDeckState;
