// The game menu's Edit current deck (#1407): where the deck builder opens for the deck dealt now.
// Pure, so a unit test covers each kind of deal; the table does the navigation.

import { DeckList } from '../../../types';
import { cardPileFor, lackeyText } from '../deckBuilderUtils';
import { EDIT_DECK_PARAM } from '../../../hooks/useDriveSync';
import { editDeckHref } from './PracticeDeckPicker';
import { isPublicDeckId } from '../../../lib/publicDecks';

export interface DealtDeckState {
  isFixture: boolean;
  // Whether a deck was loaded on the table (`loadedDeck`), and not dealt from the builder's deck.
  loaded: boolean;
  driveFileId?: string;
  dilemmaDriveFileId?: string;
  driveFileName?: string;
  botGame: boolean;
  dealtDeck: DeckList;
  // `dealtDeckName()` of the table.
  deckName: string;
}

// A full page load of the deck builder, in the same tab (#922, #1111). Its own function, so a test
// can see where the table went.
export const navigateTo = (href: string) => window.location.assign(href);

export type EditDeckDestination =
  // A link the builder opens as it is. `needsDrive` is set for a Drive file, which loads only with
  // a session.
  | { kind: 'link'; href: string; needsDrive: boolean }
  // A deck no file stands for: the table hands its Lackey text over in sessionStorage, and the
  // builder loads it linked to no Drive file, so a Save makes a new deck.
  | { kind: 'copy'; href: string; name: string; contents: string };

export function editDeckDestination(state: DealtDeckState): EditDeckDestination {
  if (state.isFixture) return { kind: 'link', href: '/decks?fixture=1', needsDrive: false };
  if (!state.loaded) return { kind: 'link', href: '/decks', needsDrive: false };
  // One file stands for the deck: the whole deck of a file, or the base file of a bot game, whose
  // Chula pile never goes to the builder. The name is the file's, and a Save of a Drive file writes
  // that name, so a deck with no name takes the copy below.
  if (state.driveFileId && !state.dilemmaDriveFileId && state.driveFileName) {
    return {
      kind: 'link',
      href: editDeckHref({ id: state.driveFileId, name: state.driveFileName }),
      needsDrive: !isPublicDeckId(state.driveFileId),
    };
  }
  const deck = state.botGame
    ? Object.fromEntries(Object.entries(state.dealtDeck).filter(([, entry]) => cardPileFor(entry.row) !== 'dilemmaPile'))
    : state.dealtDeck;
  return { kind: 'copy', href: `/decks?${EDIT_DECK_PARAM}=1`, name: `${state.deckName} (copy)`, contents: lackeyText(deck) };
}
