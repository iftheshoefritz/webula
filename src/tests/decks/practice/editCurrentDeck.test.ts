import { editDeckDestination, DealtDeckState } from '../../../app/decks/practice/editCurrentDeck';
import { deckFromTsv, lackeyText } from '../../../app/decks/deckBuilderUtils';
import { DeckList } from '../../../types';

jest.mock('posthog-js', () => ({ capture: jest.fn() }));

const card = (collectorsinfo: string, type: string) => ({
  collectorsinfo,
  originalName: `Card ${collectorsinfo}`,
  name: `card ${collectorsinfo}`,
  type,
});
const data = [card('1M1', 'mission'), card('1D1', 'dilemma'), card('1P1', 'personnel'), card('1S1', 'ship')];
const deck: DeckList = deckFromTsv('Deck:\n3\tCard 1P1\n1\tCard 1S1\nDilemmas:\n2\tCard 1D1\nMissions:\n1\tCard 1M1', data);

const state = (extra: Partial<DealtDeckState>): DealtDeckState => ({
  isFixture: false,
  loaded: true,
  botGame: false,
  dealtDeck: deck,
  deckName: 'Borg Deck',
  ...extra,
});

describe('lackeyText (#1407)', () => {
  it('round-trips through deckFromTsv', () => {
    const back: DeckList = deckFromTsv(lackeyText(deck), data);
    expect(Object.fromEntries(Object.entries(back).map(([k, v]) => [k, v.count]))).toEqual({ '1P1': 3, '1S1': 1, '1D1': 2, '1M1': 1 });
  });
});

describe('editDeckDestination (#1407)', () => {
  it('opens a Drive deck by its file', () => {
    expect(editDeckDestination(state({ driveFileId: 'abc', driveFileName: 'Borg Deck' }))).toEqual({
      kind: 'link',
      href: '/decks?driveFile=abc&name=Borg%20Deck',
      needsDrive: true,
    });
  });

  it('opens a public deck by its id, with no Drive', () => {
    expect(editDeckDestination(state({ driveFileId: 'beginner:a.txt', driveFileName: 'Level 1' }))).toEqual({
      kind: 'link',
      href: '/decks?driveFile=beginner%3Aa.txt&name=Level%201',
      needsDrive: false,
    });
  });

  it('opens the base file of a bot game', () => {
    const destination = editDeckDestination(state({ driveFileId: 'abc', driveFileName: 'Borg Deck', botGame: true }));
    expect(destination).toEqual({ kind: 'link', href: '/decks?driveFile=abc&name=Borg%20Deck', needsDrive: true });
  });

  it.each([
    ['a two-deck load', { driveFileId: 'abc', dilemmaDriveFileId: 'def', driveFileName: 'A + B dilemmas' }],
    ['an offline deck', { driveFileName: 'Offline deck' }],
    ['a Drive deck with no name', { driveFileId: 'abc' }],
  ])('hands %s over as a copy', (_, extra) => {
    const destination = editDeckDestination(state(extra));
    expect(destination).toEqual({ kind: 'copy', href: '/decks?editDeck=1', name: 'Borg Deck (copy)', contents: lackeyText(deck) });
  });

  it('leaves the dilemma pile out of the copy of a bot game', () => {
    const destination = editDeckDestination(state({ botGame: true }));
    expect(destination.kind).toBe('copy');
    const back = destination.kind === 'copy' ? deckFromTsv(destination.contents, data) : {};
    expect(Object.keys(back).sort()).toEqual(['1M1', '1P1', '1S1']);
  });

  it('goes back to the builder for the builder deck', () => {
    expect(editDeckDestination(state({ loaded: false }))).toEqual({ kind: 'link', href: '/decks', needsDrive: false });
  });

  it('opens the builder fixture for a fixture route', () => {
    expect(editDeckDestination(state({ isFixture: true, loaded: false }))).toEqual({
      kind: 'link',
      href: '/decks?fixture=1',
      needsDrive: false,
    });
  });
});
