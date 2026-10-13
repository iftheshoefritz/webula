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

  it('gives each deck a Load button and nothing else', () => {
    render(<PracticeDeckPicker {...baseProps} driveFiles={files} />);
    expect(screen.getByRole('button', { name: 'Load Root Deck' })).toBeInTheDocument();
    expect(screen.queryByText('Folder Deck')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Move / })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Delete / })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Rename / })).not.toBeInTheDocument();
    expect(screen.queryByText('New folder')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    const deckRow = screen.getByText('Root Deck').closest('li')!;
    expect(within(deckRow).getAllByRole('button')).toHaveLength(1);
    const folderRow = screen.getByText('Tournament').closest('li')!;
    expect(within(folderRow).getAllByRole('button')).toHaveLength(1);
  });

  it('calls onLoad with the deck', () => {
    const onLoad = jest.fn();
    render(<PracticeDeckPicker {...baseProps} driveFiles={files} onLoad={onLoad} />);
    fireEvent.click(screen.getByRole('button', { name: 'Load Root Deck' }));
    expect(onLoad).toHaveBeenCalledWith(files[1]);
  });

  it('opens a folder, and the back row returns to the root', () => {
    const onBrowseFolder = jest.fn();
    const { rerender } = render(<PracticeDeckPicker {...baseProps} driveFiles={files} onBrowseFolder={onBrowseFolder} />);
    fireEvent.click(screen.getByText('Tournament'));
    expect(onBrowseFolder).toHaveBeenCalledWith(folder);

    rerender(<PracticeDeckPicker {...baseProps} driveFiles={files} onBrowseFolder={onBrowseFolder} browsedFolder={folder} />);
    expect(screen.getByRole('button', { name: 'Load Folder Deck' })).toBeInTheDocument();
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
