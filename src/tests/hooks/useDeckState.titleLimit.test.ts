jest.mock('posthog-js', () => ({ capture: jest.fn() }));

import { act, renderHook } from '@testing-library/react';
import { useDeckState } from '../../hooks/useDeckState';
import { makeCardData } from '../fixtures/makeCardData';
import type { CardDef } from '../../types';

// Invented cards: two versions of one title (#1972).
const explorer = makeCardData({
  collectorsinfo: '90P1', name: 'vexa morn, explorer', originalName: 'Vexa Morn, Explorer', type: 'personnel',
  title: 'vexa morn', originalTitle: 'Vexa Morn', subtitle: 'explorer', originalSubtitle: 'Explorer',
});
const pilot = makeCardData({
  collectorsinfo: '90P2', name: 'vexa morn, pilot', originalName: 'Vexa Morn, Pilot', type: 'personnel',
  title: 'vexa morn', originalTitle: 'Vexa Morn', subtitle: 'pilot', originalSubtitle: 'Pilot',
});
const data = [explorer, pilot];
// The row the search results pass to incrementIncluded.
const asRow = (card: typeof explorer) => card as unknown as CardDef;

describe('useDeckState – three copies of each card title (#1972)', () => {
  beforeEach(() => localStorage.clear());

  it('refuses a fourth copy across two versions of a title and names the title', () => {
    const { result } = renderHook(() => useDeckState({ data, isFixture: false }));
    act(() => result.current.incrementIncluded(asRow(explorer)));
    act(() => result.current.incrementIncluded(asRow(explorer)));
    act(() => result.current.incrementIncluded(asRow(pilot)));
    expect(result.current.titleLimitNotice).toBeNull();
    act(() => result.current.incrementIncluded(asRow(pilot)));
    act(() => result.current.incrementIncluded(asRow(explorer)));
    expect(result.current.currentDeck['90P1'].count).toEqual(2);
    expect(result.current.currentDeck['90P2'].count).toEqual(1);
    expect(result.current.titleLimitNotice).toEqual('Vexa Morn');
    act(() => result.current.dismissTitleLimitNotice());
    expect(result.current.titleLimitNotice).toBeNull();
  });

  it('loads a deck over the limit and flags it until copies are removed', () => {
    const { result } = renderHook(() => useDeckState({ data, isFixture: false }));
    act(() => result.current.handleFileLoad('deck.txt', '2\tVexa Morn, Explorer\n2\tVexa Morn, Pilot'));
    expect(result.current.currentDeck['90P1'].count).toEqual(2);
    expect(result.current.currentDeck['90P2'].count).toEqual(2);
    expect(result.current.overLimitTitles).toEqual([{ title: 'Vexa Morn', count: 4 }]);
    act(() => result.current.decrementIncluded({ preventDefault: () => {} }, asRow(pilot)));
    expect(result.current.overLimitTitles).toEqual([]);
  });
});
