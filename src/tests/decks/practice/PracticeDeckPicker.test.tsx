// The practice table's own Drive picker (#1109): load only, folder browsing, and a link to the
// deck builder when there are no decks.
import { render, screen, fireEvent, within } from '@testing-library/react';
import { PracticeDeckPicker } from '../../../app/decks/practice/PracticeDeckPicker';
import { FOLDER_MIME_TYPE } from '../../../app/api/drive/mimeTypes';

const baseProps = {
  driveFiles: [],
  inProgress: false,
  isSignedIn: true,
  hasDriveScope: true,
  onSignIn: jest.fn(),
  browsedFolder: null,
  onBrowseFolder: jest.fn(),
  onLoad: jest.fn(),
  onLoadDilemmas: jest.fn(),
  canKeepCurrent: true,
  onClose: jest.fn(),
};

const folder = { id: 'f1', name: 'Tournament', mimeType: FOLDER_MIME_TYPE, parents: ['appDataFolder'] };
const files = [
  folder,
  { id: 'd1', name: 'Root Deck', parents: ['appDataFolder'] },
  { id: 'd2', name: 'Folder Deck', parents: ['f1'] },
];

describe('PracticeDeckPicker (#1109)', () => {
  it('signed out, shows the sign-in button with no "Google Drive" heading', () => {
    const onSignIn = jest.fn();
    render(<PracticeDeckPicker {...baseProps} isSignedIn={false} hasDriveScope={false} onSignIn={onSignIn} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google to load Drive decks' }));
    expect(onSignIn).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Google Drive')).not.toBeInTheDocument();
  });

  it('signed in without Drive access, shows the grant button', () => {
    render(<PracticeDeckPicker {...baseProps} hasDriveScope={false} />);
    expect(screen.getByRole('button', { name: 'Grant Google Drive access' })).toBeInTheDocument();
    expect(screen.queryByText('Google Drive')).not.toBeInTheDocument();
  });

  it('with no decks and no folders, links to the deck builder in the same tab', () => {
    render(<PracticeDeckPicker {...baseProps} />);
    const link = screen.getByRole('link', { name: /No decks yet\. Build one in the deck builder/ });
    expect(link).toHaveAttribute('href', '/decks');
    expect(link).not.toHaveAttribute('target');
    expect(screen.queryByText('no files found')).not.toBeInTheDocument();
  });

  it('shows no deck builder link while the list loads', () => {
    render(<PracticeDeckPicker {...baseProps} inProgress={true} />);
    expect(screen.getByText('please wait...')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('gives each deck two Load buttons and an Edit link, and nothing else', () => {
    render(<PracticeDeckPicker {...baseProps} driveFiles={files} />);
    expect(screen.getByRole('button', { name: 'Load the whole deck Root Deck' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load the missions and draw deck of Root Deck' })).toBeInTheDocument();
    expect(screen.queryByText('Folder Deck')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Move / })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Delete / })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Rename / })).not.toBeInTheDocument();
    expect(screen.queryByText('New folder')).not.toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(1);
    const deckRow = screen.getByText('Root Deck').closest('li')!;
    expect(within(deckRow).getAllByRole('button')).toHaveLength(2);
    expect(within(deckRow).getAllByRole('link')).toHaveLength(1);
    const folderRow = screen.getByText('Tournament').closest('li')!;
    expect(within(folderRow).getAllByRole('button')).toHaveLength(1);
  });

  it('links each deck to the deck builder in the same tab (#1111)', () => {
    const named = [{ id: 'd 1', name: 'Borg & Co', parents: ['appDataFolder'] }];
    render(<PracticeDeckPicker {...baseProps} driveFiles={named} />);
    const edit = screen.getByRole('link', { name: 'Edit Borg & Co' });
    expect(edit).toHaveAttribute('href', '/decks?driveFile=d%201&name=Borg%20%26%20Co');
    expect(edit).not.toHaveAttribute('target');
    expect(edit).toHaveClass('btn-icon', 'btn-icon-sm');

    const href = new URL(edit.getAttribute('href')!, 'http://localhost');
    expect(href.searchParams.get('driveFile')).toBe('d 1');
    expect(href.searchParams.get('name')).toBe('Borg & Co');
  });

  it('calls onLoad with the deck on Load whole deck', () => {
    const onLoad = jest.fn();
    render(<PracticeDeckPicker {...baseProps} driveFiles={files} onLoad={onLoad} />);
    fireEvent.click(screen.getByRole('button', { name: 'Load the whole deck Root Deck' }));
    expect(onLoad).toHaveBeenCalledWith(files[1]);
    expect(onLoad.mock.calls[0]).toHaveLength(1);
  });

  it('opens a folder, and the back row returns to the root', () => {
    const onBrowseFolder = jest.fn();
    const { rerender } = render(<PracticeDeckPicker {...baseProps} driveFiles={files} onBrowseFolder={onBrowseFolder} />);
    fireEvent.click(screen.getByText('Tournament'));
    expect(onBrowseFolder).toHaveBeenCalledWith(folder);

    rerender(<PracticeDeckPicker {...baseProps} driveFiles={files} onBrowseFolder={onBrowseFolder} browsedFolder={folder} />);
    expect(screen.getByRole('button', { name: 'Load the whole deck Folder Deck' })).toBeInTheDocument();
    expect(screen.queryByText('Root Deck')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Tournament'));
    expect(onBrowseFolder).toHaveBeenLastCalledWith(null);
  });

  it('closes on the ×', () => {
    const onClose = jest.fn();
    render(<PracticeDeckPicker {...baseProps} onClose={onClose} />);
    fireEvent.click(screen.getByText('×'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('PracticeDeckPicker, the two-step load (#1114)', () => {
  const decks = [
    { id: 'a', name: 'Deck A', parents: ['appDataFolder'] },
    { id: 'b', name: 'Deck B', parents: ['appDataFolder'] },
  ];
  const keepCurrent = () => screen.getByRole('button', { name: 'Keep the current missions and draw deck' });

  it('shows "Keep the current missions and draw deck" above the list, disabled with no deck dealt', () => {
    const { rerender } = render(<PracticeDeckPicker {...baseProps} driveFiles={decks} />);
    expect(keepCurrent()).toBeEnabled();
    expect(keepCurrent().compareDocumentPosition(screen.getByText('Deck A')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    rerender(<PracticeDeckPicker {...baseProps} driveFiles={decks} canKeepCurrent={false} />);
    expect(keepCurrent()).toBeDisabled();
  });

  it('moves to step 2 for a deck\'s missions and draw deck, and loads its pick of dilemmas', () => {
    const onLoad = jest.fn();
    const onLoadDilemmas = jest.fn();
    render(<PracticeDeckPicker {...baseProps} driveFiles={decks} onLoad={onLoad} onLoadDilemmas={onLoadDilemmas} />);
    fireEvent.click(screen.getByRole('button', { name: 'Load the missions and draw deck of Deck A' }));

    expect(screen.getByText('Dilemmas for Deck A')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Load the whole deck/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Keep the current missions and draw deck' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit Deck B' })).toHaveAttribute('href', '/decks?driveFile=b&name=Deck%20B');

    fireEvent.click(screen.getByRole('button', { name: 'Load the dilemmas of Deck B' }));
    expect(onLoadDilemmas).toHaveBeenCalledWith({ kind: 'drive', file: decks[0] }, decks[1]);
    expect(onLoad).not.toHaveBeenCalled();
  });

  it('moves to step 2 for the current missions and draw deck', () => {
    const onLoadDilemmas = jest.fn();
    render(<PracticeDeckPicker {...baseProps} driveFiles={decks} onLoadDilemmas={onLoadDilemmas} />);
    fireEvent.click(keepCurrent());

    expect(screen.getByText('Dilemmas for the current missions and draw deck')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Load the dilemmas of Deck A' }));
    expect(onLoadDilemmas).toHaveBeenCalledWith({ kind: 'current' }, decks[0]);
  });

  it('returns to step 1 on Back, and a close at step 2 loads nothing', () => {
    const onLoad = jest.fn();
    const onLoadDilemmas = jest.fn();
    const onClose = jest.fn();
    render(
      <PracticeDeckPicker {...baseProps} driveFiles={decks} onLoad={onLoad} onLoadDilemmas={onLoadDilemmas} onClose={onClose} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Load the missions and draw deck of Deck A' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('Your decks')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load the whole deck Deck A' })).toBeInTheDocument();

    fireEvent.click(keepCurrent());
    fireEvent.click(screen.getByText('×'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onLoad).not.toHaveBeenCalled();
    expect(onLoadDilemmas).not.toHaveBeenCalled();
  });
});
