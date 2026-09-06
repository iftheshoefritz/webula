// Derives the HQ/reportsto filter options a deck currently qualifies for.
// Regular HQ missions (missiontype='h') use their name as the reportsto key.
// No-HQ scenarios (Caretaker's Array, Prevent Historical Disruption, Ceti Alpha V)
// are determined by the combination of missions and ships/events in the draw pile.
//
// Extracted from the `hqOptions` useMemo in DeckBuilderClient.tsx so the same
// derivation can be reused by filterCards.ts for the `playable:currentDeck`
// search keyword.

type CardRow = Record<string, any>;

export interface ReportsToOption {
  label: string;
  value: string;
}

export function getReportsToOptions(deckRows: CardRow[]): ReportsToOption[] {
  const options: ReportsToOption[] = [];
  const missions = deckRows.filter((row) => row.pile === 'mission');

  // Regular HQ missions
  const hqMissions = missions.filter((row) => row.missiontype === 'h');
  for (const hq of hqMissions) {
    options.push({ label: hq.name, value: hq.name.toLowerCase() });
  }

  // No-HQ: Caretaker's Array + U.S.S. Equinox
  const hasCaretakers = missions.some((row) => row.name.startsWith("caretaker's array"));
  if (hasCaretakers) {
    const hasEquinox = deckRows.some(
      (row) => row.pile === 'draw' && row.type === 'ship' && row.name.includes('equinox')
    );
    const hasVoyager = deckRows.some(
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
    const hasRelativity = deckRows.some(
      (row) => row.pile === 'draw' && row.type === 'ship' && row.name.includes('relativity')
    );
    if (hasRelativity) {
      options.push({ label: 'Prevent Historical Disruption (Relativity)', value: 'prevent historical disruption relativity' });
    }
  }

  // No-HQ: To Rule In Hell (event in draw pile) + Ceti Alpha V (any version in missions)
  const hasCetiAlphaV = missions.some((row) => row.name.startsWith('ceti alpha v'));
  const hasToRuleInHell = deckRows.some(
    (row) => row.pile === 'draw' && row.name.includes('to rule in hell')
  );
  if (hasCetiAlphaV && hasToRuleInHell) {
    options.push({ label: 'Ceti Alpha V (Khan)', value: 'ceti alpha v khan' });
  }

  return options;
}
