// The Offline sub-view of the game menu splash (#1052, part 3 of #1047; one item since #1087):
// Make available offline for the dealt deck, with its progress and the cards a failed download
// missed, the list of every offline deck with its size, a Remove action, and the storage use, and
// Back, which returns to the item list.
//
// The download state lives in the page (`useOfflineDecks`), not here, so a download keeps going
// when the player goes Back or closes the splash. `offlineItemLabel` shows its count on the item.

import { useEffect, useState } from 'react';
import { DeckList } from '../../../types';
import { isDeckEmpty } from '../deckBuilderUtils';
import { useOfflineDecks } from './offlineDecks';

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

interface StorageUse {
  usage: number;
  quota: number;
}

async function readStorageUse(): Promise<StorageUse | null> {
  try {
    const estimate = await navigator.storage?.estimate?.();
    if (!estimate) return null;
    return { usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 };
  } catch {
    return null;
  }
}

// Asks the browser not to evict the offline cache under storage pressure. A refusal leaves the
// cache in place as best-effort storage, so the result is ignored.
async function requestPersistentStorage(): Promise<void> {
  try {
    await navigator.storage?.persist?.();
  } catch {
    // best-effort storage
  }
}

// The label of the Offline item of the splash: during a download it shows the count, so the player
// sees it without opening the sub-view.
export function offlineItemLabel(progress: ReturnType<typeof useOfflineDecks>['progress']): string {
  return progress ? `Offline · ${progress.done} / ${progress.total}` : 'Offline';
}

export function OfflineMenuView({
  deck,
  deckName,
  offline,
  itemClassName,
  onBack,
}: {
  deck: DeckList;
  deckName: string;
  offline: ReturnType<typeof useOfflineDecks>;
  itemClassName: string;
  onBack: () => void;
}) {
  const [storage, setStorage] = useState<StorageUse | null>(null);
  const { decks, progress, refreshing, failed, makeOffline, remove, isOffline } = offline;
  const deckIsOffline = !isDeckEmpty(deck) && isOffline(deck);
  const downloading = progress !== null;

  useEffect(() => {
    let cancelled = false;
    readStorageUse().then((use) => {
      if (!cancelled) setStorage(use);
    });
    return () => {
      cancelled = true;
    };
  }, [decks]);

  const handleMakeOffline = async () => {
    if (decks.length === 0) void requestPersistentStorage();
    await makeOffline(deckName, deck);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleMakeOffline}
        disabled={deckIsOffline || downloading || isDeckEmpty(deck)}
        className={`${itemClassName} disabled:opacity-60 disabled:hover:bg-bg-secondary disabled:hover:text-text-secondary`}
      >
        {deckIsOffline ? 'Available offline ✓' : 'Make available offline'}
      </button>
      {progress && (
        <p role="status" data-testid="offline-progress" className="text-center text-sm text-text-muted">
          {refreshing && 'Refreshing offline decks: '}
          {progress.done} / {progress.total} cards · {formatBytes(progress.bytes)}
        </p>
      )}
      {!downloading && failed.length > 0 && (
        <div data-testid="offline-failed" className="rounded-md border border-red-400/40 bg-red-900/20 p-2 text-sm text-text-secondary">
          <p className="mb-1">These cards did not download:</p>
          <ul className="mb-2 max-h-24 list-disc overflow-y-auto pl-5">
            {failed.map((f) => (
              <li key={f.url}>{f.name}</li>
            ))}
          </ul>
          <button type="button" onClick={handleMakeOffline} className={itemClassName}>
            Retry
          </button>
        </div>
      )}
      <div data-testid="offline-decks-list" className="rounded-md border border-white/10 bg-bg-secondary p-2 text-sm text-text-secondary">
        {decks.length === 0 ? (
          <p className="text-center text-text-muted">No offline decks yet.</p>
        ) : (
          <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto">
            {decks.map((d) => (
              <li key={d.fingerprint} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">
                  {d.name} <span className="text-text-muted">· {formatBytes(d.bytes)}</span>
                </span>
                <button
                  type="button"
                  onClick={() => remove(d.deck)}
                  aria-label={`Remove ${d.name}`}
                  className="shrink-0 rounded border border-white/10 px-2 py-0.5 text-xs hover:bg-white/[0.1] hover:text-text-primary"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        {storage && (
          <p data-testid="offline-storage" className="mt-2 text-center text-xs text-text-muted">
            Storage used: {formatBytes(storage.usage)}
            {storage.quota > 0 && ` of ${formatBytes(storage.quota)}`}
          </p>
        )}
      </div>
      <button type="button" onClick={onBack} className={itemClassName}>
        Back
      </button>
    </>
  );
}
