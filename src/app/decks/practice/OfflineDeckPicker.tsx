// The offline decks to play instead (#1053, part 4 of #1047). Offline, the practice table shows
// this list in two places: in place of a table whose deck is not available offline, and in place
// of the Drive picker of Load deck.

import { LAYER_MODAL_BACKDROP } from '../../../lib/layers';
import { OfflineDeck } from './offlineDecks';
import { formatBytes } from './OfflineMenuView';

export function OfflineDeckList({ decks, onChoose }: { decks: OfflineDeck[]; onChoose: (deck: OfflineDeck) => void }) {
  if (decks.length === 0) {
    return <p className="text-center text-sm text-text-muted">No decks are available offline.</p>;
  }
  return (
    <ul data-testid="offline-deck-choices" className="flex max-h-60 flex-col gap-1 overflow-y-auto">
      {decks.map((d) => (
        <li key={d.fingerprint}>
          <button
            type="button"
            onClick={() => onChoose(d)}
            aria-label={`Play ${d.name}`}
            className="flex w-full items-center justify-between gap-2 rounded-md border border-white/10 bg-bg-secondary px-4 py-2 text-left text-sm text-text-secondary hover:bg-white/[0.1] hover:text-text-primary"
          >
            <span className="min-w-0 truncate">{d.name}</span>
            <span className="shrink-0 text-xs text-text-muted">{formatBytes(d.bytes)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

// Load deck while offline: Google Drive is out of reach, so the picker offers the offline decks.
export function OfflineDeckPicker({
  decks,
  onChoose,
  onClose,
}: {
  decks: OfflineDeck[];
  onChoose: (deck: OfflineDeck) => void;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Load deck"
      data-testid="offline-deck-picker"
      className={`fixed inset-0 ${LAYER_MODAL_BACKDROP} flex items-center justify-center bg-black/60 p-4`}
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-sm flex-col gap-3 rounded-lg border border-white/10 bg-bg-secondary p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-center text-text-primary">You are offline — Google Drive is not available.</p>
        <p className="text-center text-sm text-text-muted">Decks available offline:</p>
        <OfflineDeckList decks={decks} onChoose={onChoose} />
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-white/10 px-4 py-2 text-sm text-text-secondary hover:bg-white/[0.1]"
        >
          Close
        </button>
      </div>
    </div>
  );
}
