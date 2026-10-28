// The offline decks to play instead (#1053, part 4 of #1047). Offline, the practice table shows
// this list in two places: in place of a table whose deck is not available offline, and in place
// of the Drive picker of Load deck. Both build on the shared Drive picker pieces (#1110), so the
// offline picker looks and closes like the online `PracticeDeckPicker`.

import { FaPlay } from 'react-icons/fa';
import { DriveModalShell } from '../../../components/drivePicker/DriveModalShell';
import { DriveListRow } from '../../../components/drivePicker/DriveListRow';
import { OfflineDeck } from './offlineDecks';
import { formatBytes } from './OfflineMenuView';

export function OfflineDeckList({ decks, onChoose }: { decks: OfflineDeck[]; onChoose: (deck: OfflineDeck) => void }) {
  if (decks.length === 0) {
    return <p className="text-center text-sm text-text-muted">No decks are available offline.</p>;
  }
  return (
    <div className="max-h-64 overflow-y-auto overflow-x-hidden">
      <ul data-testid="offline-deck-choices" className="w-full divide-y divide-white/[0.06]">
        {decks.map((d) => (
          <DriveListRow key={d.fingerprint} name={d.name}>
            <div className="flex items-center gap-2 whitespace-nowrap shrink-0">
              <span className="text-xs text-text-muted">{formatBytes(d.bytes)}</span>
              <button
                type="button"
                aria-label={`Play ${d.name}`}
                className="btn-icon btn-icon-sm"
                onClick={() => onChoose(d)}
              >
                <FaPlay/>
              </button>
            </div>
          </DriveListRow>
        ))}
      </ul>
    </div>
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
    <DriveModalShell title="Load deck" onClose={onClose} dialogLabel="Load deck" testId="offline-deck-picker">
      <p className="px-1 text-text-primary">You are offline — Google Drive is not available.</p>
      <p className="px-1 mb-2 text-sm text-text-muted">Decks available offline:</p>
      <OfflineDeckList decks={decks} onChoose={onChoose} />
    </DriveModalShell>
  );
}
