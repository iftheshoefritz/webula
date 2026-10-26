import { render, screen, fireEvent } from '@testing-library/react';
import { DrivePickerModal } from '../../components/DrivePickerModal';
import { FOLDER_MIME_TYPE } from '../../app/api/drive/mimeTypes';

const baseProps = {
  driveFiles: [],
  loadDriveFile: jest.fn(),
  deleteDriveFile: jest.fn(),
  inProgress: false,
  onClose: jest.fn(),
  isSignedIn: true,
  hasDriveScope: true,
  onSignIn: jest.fn(),
};

describe('DrivePickerModal – Google Drive section', () => {
  it('shows "no files found" when signed in with no drive files', () => {
    render(<DrivePickerModal {...baseProps} isSignedIn={true} driveFiles={[]} />);
    expect(screen.getByText('no files found')).toBeInTheDocument();
    expect(screen.queryByText(/sign in with google/i)).not.toBeInTheDocument();
  });

  it('shows drive files when signed in', () => {
    const driveFiles = [{ id: '1', name: 'My Deck' }];
    render(<DrivePickerModal {...baseProps} isSignedIn={true} driveFiles={driveFiles} />);
    expect(screen.getByText('My Deck')).toBeInTheDocument();
    expect(screen.queryByText(/sign in/i)).not.toBeInTheDocument();
  });

  it('shows a sign-in button when not signed in', () => {
    render(<DrivePickerModal {...baseProps} isSignedIn={false} driveFiles={[]} />);
    expect(screen.getByText(/sign in with google/i)).toBeInTheDocument();
    expect(screen.queryByText('no files found')).not.toBeInTheDocument();
  });

  it('calls onSignIn when the sign-in button is clicked', () => {
    const onSignIn = jest.fn();
    render(<DrivePickerModal {...baseProps} isSignedIn={false} onSignIn={onSignIn} />);
    fireEvent.click(screen.getByText(/sign in with google/i));
    expect(onSignIn).toHaveBeenCalledTimes(1);
  });

  it('does not show sign-in button when signed in', () => {
    render(<DrivePickerModal {...baseProps} isSignedIn={true} hasDriveScope={true} />);
    expect(screen.queryByText(/sign in with google/i)).not.toBeInTheDocument();
  });

  it('shows grant drive access button when signed in but missing drive scope', () => {
    render(<DrivePickerModal {...baseProps} isSignedIn={true} hasDriveScope={false} driveFiles={[]} />);
    expect(screen.getByText(/grant google drive access/i)).toBeInTheDocument();
    expect(screen.queryByText(/sign in with google/i)).not.toBeInTheDocument();
    expect(screen.queryByText('no files found')).not.toBeInTheDocument();
  });

  it('calls onSignIn when grant drive access button is clicked', () => {
    const onSignIn = jest.fn();
    render(<DrivePickerModal {...baseProps} isSignedIn={true} hasDriveScope={false} onSignIn={onSignIn} />);
    fireEvent.click(screen.getByText(/grant google drive access/i));
    expect(onSignIn).toHaveBeenCalledTimes(1);
  });
});

describe('DrivePickerModal – Google Drive header', () => {
  it('does not show a "This Browser" section header, nor a "Google Drive" heading (#1109)', () => {
    render(<DrivePickerModal {...baseProps} />);
    expect(screen.queryByText('This Browser')).not.toBeInTheDocument();
    expect(screen.queryByText('Google Drive')).not.toBeInTheDocument();
  });

  it('always shows drive content without requiring a click to expand', () => {
    const driveFiles = [{ id: '1', name: 'Drive Deck' }];
    render(<DrivePickerModal {...baseProps} isSignedIn={true} driveFiles={driveFiles} />);
    expect(screen.getByText('Drive Deck')).toBeInTheDocument();
  });
});

describe('DrivePickerModal – folders in load mode', () => {
  const driveFiles = [
    { id: 'f1', name: 'My Folder', mimeType: FOLDER_MIME_TYPE, parents: ['appDataFolder'] },
    { id: 'd1', name: 'My Deck', mimeType: 'application/json', parents: ['appDataFolder'] },
  ];

  it('renders a folder-shaped item as a read-only folder row, not a deck row', () => {
    render(<DrivePickerModal {...baseProps} mode="load" driveFiles={driveFiles} />);

    expect(screen.getByRole('button', { name: /^my folder$/i })).toBeInTheDocument();
    expect(screen.getByText('My Deck')).toBeInTheDocument();
    // Only the deck row gets a pile-subset select; the folder row has no controls.
    expect(screen.getAllByRole('combobox')).toHaveLength(1);
  });

  it('does not show "no files found" when only a folder is present', () => {
    render(<DrivePickerModal {...baseProps} mode="load" driveFiles={[driveFiles[0]]} />);
    expect(screen.getByText('My Folder')).toBeInTheDocument();
    expect(screen.queryByText('no files found')).not.toBeInTheDocument();
  });

  it('renders folder rows in compare mode too', () => {
    render(<DrivePickerModal {...baseProps} mode="compare" driveFiles={driveFiles} />);
    expect(screen.getByRole('button', { name: /^my folder$/i })).toBeInTheDocument();
    expect(screen.getByText('My Deck')).toBeInTheDocument();
  });

  it('renders folder rows in compare-multi mode too', () => {
    render(<DrivePickerModal {...baseProps} mode="compare-multi" driveFiles={driveFiles} />);
    expect(screen.getByRole('button', { name: /^my folder$/i })).toBeInTheDocument();
    expect(screen.getByText('My Deck')).toBeInTheDocument();
  });

  it('does not render folder rows in reports mode', () => {
    render(<DrivePickerModal {...baseProps} mode="reports" driveFiles={driveFiles} />);
    expect(screen.queryByText('My Folder')).not.toBeInTheDocument();
    expect(screen.getByText('My Deck')).toBeInTheDocument();
  });
});

describe('DrivePickerModal – deleting a folder in load mode', () => {
  const confirmSpy = jest.spyOn(window, 'confirm');

  afterEach(() => {
    confirmSpy.mockReset();
  });

  it('renders a delete button on a folder row', () => {
    const emptyFolder = { id: 'f1', name: 'Empty Folder', mimeType: FOLDER_MIME_TYPE, parents: ['appDataFolder'] };
    render(<DrivePickerModal {...baseProps} mode="load" driveFiles={[emptyFolder]} />);
    expect(screen.getByRole('button', { name: /delete empty folder/i })).toBeInTheDocument();
  });

  it('deletes an empty folder with the single-item confirmation copy', () => {
    confirmSpy.mockReturnValue(true);
    const deleteDriveFile = jest.fn();
    const emptyFolder = { id: 'f1', name: 'Empty Folder', mimeType: FOLDER_MIME_TYPE, parents: ['appDataFolder'] };
    render(
      <DrivePickerModal {...baseProps} mode="load" driveFiles={[emptyFolder]} deleteDriveFile={deleteDriveFile} />
    );

    fireEvent.click(screen.getByRole('button', { name: /delete empty folder/i }));

    expect(confirmSpy).toHaveBeenCalledWith(
      'This will permanently delete "Empty Folder" from your Google Drive. Are you sure?'
    );
    expect(deleteDriveFile).toHaveBeenCalledWith(emptyFolder);
  });

  it('warns that contents will also be deleted for a non-empty folder', () => {
    confirmSpy.mockReturnValue(true);
    const deleteDriveFile = jest.fn();
    const nonEmptyFolder = { id: 'f1', name: 'Full Folder', mimeType: FOLDER_MIME_TYPE, parents: ['appDataFolder'] };
    const childDeck = { id: 'd1', name: 'Child Deck', mimeType: 'application/json', parents: ['f1'] };
    render(
      <DrivePickerModal
        {...baseProps}
        mode="load"
        driveFiles={[nonEmptyFolder, childDeck]}
        deleteDriveFile={deleteDriveFile}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /delete full folder/i }));

    expect(confirmSpy).toHaveBeenCalledWith(
      'This will permanently delete "Full Folder" and everything inside it from your Google Drive. Are you sure?'
    );
    expect(deleteDriveFile).toHaveBeenCalledWith(nonEmptyFolder);
  });

  it('does not call deleteDriveFile when the confirmation is dismissed', () => {
    confirmSpy.mockReturnValue(false);
    const deleteDriveFile = jest.fn();
    const emptyFolder = { id: 'f1', name: 'Empty Folder', mimeType: FOLDER_MIME_TYPE, parents: ['appDataFolder'] };
    render(
      <DrivePickerModal {...baseProps} mode="load" driveFiles={[emptyFolder]} deleteDriveFile={deleteDriveFile} />
    );

    fireEvent.click(screen.getByRole('button', { name: /delete empty folder/i }));

    expect(deleteDriveFile).not.toHaveBeenCalled();
  });
});

describe('DrivePickerModal – renaming a folder in load mode', () => {
  const folder = { id: 'f1', name: 'My Folder', mimeType: FOLDER_MIME_TYPE, parents: ['appDataFolder'] };

  it('renders a rename control on a folder row', () => {
    render(<DrivePickerModal {...baseProps} mode="load" driveFiles={[folder]} />);
    expect(screen.getByRole('button', { name: /rename my folder/i })).toBeInTheDocument();
  });

  it('renames a folder via the inline rename control', () => {
    const onRenameFile = jest.fn();
    render(
      <DrivePickerModal {...baseProps} mode="load" driveFiles={[folder]} onRenameFile={onRenameFile} />
    );

    fireEvent.click(screen.getByRole('button', { name: /rename my folder/i }));
    const input = screen.getByRole('textbox', { name: /rename my folder/i });
    fireEvent.change(input, { target: { value: 'Renamed Folder' } });
    fireEvent.click(screen.getByRole('button', { name: /save name for my folder/i }));

    expect(onRenameFile).toHaveBeenCalledWith(folder, 'Renamed Folder');
    expect(screen.queryByRole('textbox', { name: /rename my folder/i })).not.toBeInTheDocument();
  });

  it('cancels a folder rename without calling onRenameFile', () => {
    const onRenameFile = jest.fn();
    render(
      <DrivePickerModal {...baseProps} mode="load" driveFiles={[folder]} onRenameFile={onRenameFile} />
    );

    fireEvent.click(screen.getByRole('button', { name: /rename my folder/i }));
    fireEvent.change(screen.getByRole('textbox', { name: /rename my folder/i }), { target: { value: 'Changed' } });
    fireEvent.click(screen.getByRole('button', { name: /cancel rename/i }));

    expect(onRenameFile).not.toHaveBeenCalled();
    expect(screen.getByText('My Folder')).toBeInTheDocument();
  });

  it('does not call onRenameFile when the name is unchanged', () => {
    const onRenameFile = jest.fn();
    render(
      <DrivePickerModal {...baseProps} mode="load" driveFiles={[folder]} onRenameFile={onRenameFile} />
    );

    fireEvent.click(screen.getByRole('button', { name: /rename my folder/i }));
    fireEvent.click(screen.getByRole('button', { name: /save name for my folder/i }));

    expect(onRenameFile).not.toHaveBeenCalled();
  });
});

describe('DrivePickerModal – browsing a folder in load mode', () => {
  const folder = { id: 'f1', name: 'My Folder', mimeType: FOLDER_MIME_TYPE, parents: ['appDataFolder'] };
  const rootDeck = { id: 'd1', name: 'Root Deck', mimeType: 'application/json', parents: ['appDataFolder'] };
  const folderDeck = { id: 'd2', name: 'Folder Deck', mimeType: 'application/json', parents: ['f1'] };
  const driveFiles = [folder, rootDeck, folderDeck];

  it('only shows root-level decks and folders when no folder is being browsed', () => {
    render(<DrivePickerModal {...baseProps} mode="load" driveFiles={driveFiles} />);
    expect(screen.getByRole('button', { name: /^my folder$/i })).toBeInTheDocument();
    expect(screen.getByText('Root Deck')).toBeInTheDocument();
    expect(screen.queryByText('Folder Deck')).not.toBeInTheDocument();
  });

  it('calls onBrowseFolder with the folder when a folder row is clicked', () => {
    const onBrowseFolder = jest.fn();
    render(
      <DrivePickerModal {...baseProps} mode="load" driveFiles={driveFiles} onBrowseFolder={onBrowseFolder} />
    );
    fireEvent.click(screen.getByRole('button', { name: /^my folder$/i }));
    expect(onBrowseFolder).toHaveBeenCalledWith(folder);
  });

  it('shows only the browsed folder\'s decks, not root decks or other folders, when browsing', () => {
    render(
      <DrivePickerModal {...baseProps} mode="load" driveFiles={driveFiles} browsedFolder={folder} />
    );
    expect(screen.getByText('Folder Deck')).toBeInTheDocument();
    expect(screen.queryByText('Root Deck')).not.toBeInTheDocument();
    // The only folder button present is the back control; no clickable folder row is rendered in the list.
    expect(screen.getAllByRole('button', { name: /my folder/i })).toHaveLength(1);
  });

  it('does not show "New folder" while browsing a folder', () => {
    render(
      <DrivePickerModal {...baseProps} mode="load" driveFiles={driveFiles} browsedFolder={folder} />
    );
    expect(screen.queryByText('New folder')).not.toBeInTheDocument();
  });

  it('shows a back control with the folder name while browsing', () => {
    render(
      <DrivePickerModal {...baseProps} mode="load" driveFiles={driveFiles} browsedFolder={folder} />
    );
    expect(screen.getByRole('button', { name: /my folder/i })).toBeInTheDocument();
  });

  it('calls onBrowseFolder with null when the back control is clicked', () => {
    const onBrowseFolder = jest.fn();
    render(
      <DrivePickerModal
        {...baseProps}
        mode="load"
        driveFiles={driveFiles}
        browsedFolder={folder}
        onBrowseFolder={onBrowseFolder}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /my folder/i }));
    expect(onBrowseFolder).toHaveBeenCalledWith(null);
  });
});

describe.each(['compare', 'compare-multi'] as const)('DrivePickerModal – browsing a folder in %s mode', (mode) => {
  const folder = { id: 'f1', name: 'My Folder', mimeType: FOLDER_MIME_TYPE, parents: ['appDataFolder'] };
  const rootDeck = { id: 'd1', name: 'Root Deck', mimeType: 'application/json', parents: ['appDataFolder'] };
  const folderDeck = { id: 'd2', name: 'Folder Deck', mimeType: 'application/json', parents: ['f1'] };
  const driveFiles = [folder, rootDeck, folderDeck];

  it('only shows root-level decks and folders when no folder is being browsed', () => {
    render(<DrivePickerModal {...baseProps} mode={mode} driveFiles={driveFiles} />);
    expect(screen.getByRole('button', { name: /^my folder$/i })).toBeInTheDocument();
    expect(screen.getByText('Root Deck')).toBeInTheDocument();
    expect(screen.queryByText('Folder Deck')).not.toBeInTheDocument();
  });

  it('navigates into a folder and shows its decks, hiding root decks', () => {
    const onBrowseFolder = jest.fn();
    const { rerender } = render(
      <DrivePickerModal {...baseProps} mode={mode} driveFiles={driveFiles} onBrowseFolder={onBrowseFolder} />
    );
    fireEvent.click(screen.getByRole('button', { name: /^my folder$/i }));
    expect(onBrowseFolder).toHaveBeenCalledWith(folder);

    rerender(
      <DrivePickerModal {...baseProps} mode={mode} driveFiles={driveFiles} browsedFolder={folder} />
    );
    expect(screen.getByText('Folder Deck')).toBeInTheDocument();
    expect(screen.queryByText('Root Deck')).not.toBeInTheDocument();
  });

  it('shows a back-to-root control that calls onBrowseFolder with null', () => {
    const onBrowseFolder = jest.fn();
    render(
      <DrivePickerModal
        {...baseProps}
        mode={mode}
        driveFiles={driveFiles}
        browsedFolder={folder}
        onBrowseFolder={onBrowseFolder}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /my folder/i }));
    expect(onBrowseFolder).toHaveBeenCalledWith(null);
  });

  it('does not render rename or delete controls on a folder row', () => {
    render(<DrivePickerModal {...baseProps} mode={mode} driveFiles={driveFiles} />);
    expect(screen.queryByRole('button', { name: /rename my folder/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete my folder/i })).not.toBeInTheDocument();
  });

  it('does not render a "New folder" control', () => {
    render(<DrivePickerModal {...baseProps} mode={mode} driveFiles={driveFiles} browsedFolder={folder} />);
    expect(screen.queryByText('New folder')).not.toBeInTheDocument();
  });
});

describe('DrivePickerModal – compare-multi selection persists across folder navigation', () => {
  const folder = { id: 'f1', name: 'My Folder', mimeType: FOLDER_MIME_TYPE, parents: ['appDataFolder'] };
  const rootDeck = { id: 'd1', name: 'Root Deck', mimeType: 'application/json', parents: ['appDataFolder'] };
  const folderDeck = { id: 'd2', name: 'Folder Deck', mimeType: 'application/json', parents: ['f1'] };
  const driveFiles = [folder, rootDeck, folderDeck];

  it('keeps a root deck checked and counted after navigating into and back out of a folder', () => {
    const { rerender } = render(
      <DrivePickerModal {...baseProps} mode="compare-multi" driveFiles={driveFiles} />
    );
    fireEvent.click(screen.getByRole('checkbox', { name: /select root deck/i }));
    expect(screen.getByText('1 selected')).toBeInTheDocument();

    rerender(
      <DrivePickerModal {...baseProps} mode="compare-multi" driveFiles={driveFiles} browsedFolder={folder} />
    );
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /select root deck/i })).not.toBeInTheDocument();

    rerender(
      <DrivePickerModal {...baseProps} mode="compare-multi" driveFiles={driveFiles} />
    );
    expect(screen.getByRole('checkbox', { name: /select root deck/i })).toBeChecked();
    expect(screen.getByText('1 selected')).toBeInTheDocument();
  });
});

describe('DrivePickerModal – moving a deck via the folder-picker modal in load mode', () => {
  const folder = { id: 'f1', name: 'My Folder', mimeType: FOLDER_MIME_TYPE, parents: ['appDataFolder'] };
  const rootDeck = { id: 'd1', name: 'Root Deck', mimeType: 'application/json', parents: ['appDataFolder'] };
  const folderDeck = { id: 'd2', name: 'Folder Deck', mimeType: 'application/json', parents: ['f1'] };
  const driveFiles = [folder, rootDeck, folderDeck];

  it('renders a move icon button per deck row and no folder indicator on the row itself', () => {
    render(<DrivePickerModal {...baseProps} mode="load" driveFiles={driveFiles} />);
    expect(screen.getByRole('button', { name: /move root deck/i })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /move/i })).not.toBeInTheDocument();
  });

  it('does not render a move button outside load mode', () => {
    render(<DrivePickerModal {...baseProps} mode="compare" driveFiles={driveFiles} />);
    expect(screen.queryByRole('button', { name: /move root deck/i })).not.toBeInTheDocument();
  });

  it('opens a destination modal listing root and every folder, regardless of the browsed view', () => {
    render(<DrivePickerModal {...baseProps} mode="load" driveFiles={driveFiles} browsedFolder={folder} />);
    fireEvent.click(screen.getByRole('button', { name: /move folder deck/i }));

    expect(screen.getByText('Move "Folder Deck"')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move to Root' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move to My Folder' })).toBeInTheDocument();
  });

  it('calls onMoveFile with the chosen destination and closes the modal', () => {
    const onMoveFile = jest.fn();
    render(
      <DrivePickerModal {...baseProps} mode="load" driveFiles={driveFiles} onMoveFile={onMoveFile} />
    );
    fireEvent.click(screen.getByRole('button', { name: /move root deck/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Move to My Folder' }));

    expect(onMoveFile).toHaveBeenCalledWith(rootDeck, 'f1');
    expect(screen.queryByText('Move "Root Deck"')).not.toBeInTheDocument();
  });

  it('does not call onMoveFile when the chosen destination matches the current folder', () => {
    const onMoveFile = jest.fn();
    render(
      <DrivePickerModal {...baseProps} mode="load" driveFiles={driveFiles} onMoveFile={onMoveFile} />
    );
    fireEvent.click(screen.getByRole('button', { name: /move root deck/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Move to Root' }));

    expect(onMoveFile).not.toHaveBeenCalled();
  });

  it('closes the destination modal via the close button without calling onMoveFile', () => {
    const onMoveFile = jest.fn();
    render(
      <DrivePickerModal {...baseProps} mode="load" driveFiles={driveFiles} onMoveFile={onMoveFile} />
    );
    fireEvent.click(screen.getByRole('button', { name: /move root deck/i }));
    expect(screen.getByText('Move "Root Deck"')).toBeInTheDocument();

    const closeButtons = screen.getAllByText('×');
    fireEvent.click(closeButtons[closeButtons.length - 1]);

    expect(onMoveFile).not.toHaveBeenCalled();
    expect(screen.queryByText('Move "Root Deck"')).not.toBeInTheDocument();
  });
});

describe('DrivePickerModal – creating a folder in load mode', () => {
  it('shows a "New folder" control in load mode', () => {
    render(<DrivePickerModal {...baseProps} mode="load" driveFiles={[]} />);
    expect(screen.getByText('New folder')).toBeInTheDocument();
  });

  it('does not show a "New folder" control outside load mode', () => {
    render(<DrivePickerModal {...baseProps} mode="compare" driveFiles={[]} />);
    expect(screen.queryByText('New folder')).not.toBeInTheDocument();
  });

  it('creates a folder via the inline new-folder control', () => {
    const onCreateFolder = jest.fn();
    render(<DrivePickerModal {...baseProps} mode="load" driveFiles={[]} onCreateFolder={onCreateFolder} />);

    fireEvent.click(screen.getByText('New folder'));
    const input = screen.getByRole('textbox', { name: /new folder name/i });
    fireEvent.change(input, { target: { value: 'Tournament Decks' } });
    fireEvent.click(screen.getByRole('button', { name: /save new folder/i }));

    expect(onCreateFolder).toHaveBeenCalledWith('Tournament Decks');
    expect(screen.queryByRole('textbox', { name: /new folder name/i })).not.toBeInTheDocument();
  });

  it('cancels creating a folder without calling onCreateFolder', () => {
    const onCreateFolder = jest.fn();
    render(<DrivePickerModal {...baseProps} mode="load" driveFiles={[]} onCreateFolder={onCreateFolder} />);

    fireEvent.click(screen.getByText('New folder'));
    fireEvent.change(screen.getByRole('textbox', { name: /new folder name/i }), { target: { value: 'Discard me' } });
    fireEvent.click(screen.getByRole('button', { name: /cancel new folder/i }));

    expect(onCreateFolder).not.toHaveBeenCalled();
    expect(screen.getByText('New folder')).toBeInTheDocument();
  });

  it('does not call onCreateFolder with a blank name', () => {
    const onCreateFolder = jest.fn();
    render(<DrivePickerModal {...baseProps} mode="load" driveFiles={[]} onCreateFolder={onCreateFolder} />);

    fireEvent.click(screen.getByText('New folder'));
    fireEvent.change(screen.getByRole('textbox', { name: /new folder name/i }), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: /save new folder/i }));

    expect(onCreateFolder).not.toHaveBeenCalled();
  });
});

describe('DrivePickerModal – compare mode', () => {
  const driveFiles = [{ id: '1', name: 'Drive Deck' }];

  it('does not render the pile-subset select in compare mode', () => {
    render(<DrivePickerModal {...baseProps} mode="compare" driveFiles={driveFiles} />);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('renders the pile-subset select and move icon button in load mode (default)', () => {
    render(<DrivePickerModal {...baseProps} driveFiles={driveFiles} />);
    expect(screen.getAllByRole('combobox')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /move drive deck/i })).toBeInTheDocument();
  });

  it('calls loadDriveFile with no piles argument when a file is opened in compare mode', () => {
    const loadDriveFile = jest.fn();
    render(<DrivePickerModal {...baseProps} mode="compare" driveFiles={driveFiles} loadDriveFile={loadDriveFile} />);
    // Buttons in order: modal close (×), then per-file open, then per-file delete.
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[1]);
    expect(loadDriveFile).toHaveBeenCalledWith(driveFiles[0]);
    expect(loadDriveFile.mock.calls[0]).toHaveLength(1);
  });

  it('shows a "Compare deck" title in compare mode', () => {
    render(<DrivePickerModal {...baseProps} mode="compare" driveFiles={driveFiles} />);
    expect(screen.getByText('Compare deck')).toBeInTheDocument();
    expect(screen.queryByText('Your decks')).not.toBeInTheDocument();
  });
});

describe('DrivePickerModal – compare-multi mode', () => {
  const driveFiles = [
    { id: '1', name: 'Deck One' },
    { id: '2', name: 'Deck Two' },
    { id: '3', name: 'Deck Three' },
    { id: '4', name: 'Deck Four' },
    { id: '5', name: 'Deck Five' },
    { id: '6', name: 'Deck Six' },
  ];

  it('shows a "Compare decks" title', () => {
    render(<DrivePickerModal {...baseProps} mode="compare-multi" driveFiles={driveFiles} />);
    expect(screen.getByText('Compare decks')).toBeInTheDocument();
    expect(screen.queryByText('Your decks')).not.toBeInTheDocument();
  });

  it('renders a checkbox per file instead of the pile-subset select or open button', () => {
    render(<DrivePickerModal {...baseProps} mode="compare-multi" driveFiles={driveFiles} />);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(driveFiles.length);
  });

  it('updates the "N selected" indicator as checkboxes are toggled', () => {
    render(<DrivePickerModal {...baseProps} mode="compare-multi" driveFiles={driveFiles} />);
    expect(screen.getByText('0 selected')).toBeInTheDocument();

    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);
    expect(screen.getByText('2 selected')).toBeInTheDocument();

    fireEvent.click(checkboxes[0]);
    expect(screen.getByText('1 selected')).toBeInTheDocument();
  });

  it('prevents checking a 6th file once 5 are selected', () => {
    render(<DrivePickerModal {...baseProps} mode="compare-multi" driveFiles={driveFiles} />);
    const checkboxes = screen.getAllByRole('checkbox');
    checkboxes.slice(0, 5).forEach((cb) => fireEvent.click(cb));
    expect(screen.getByText('5 selected')).toBeInTheDocument();

    fireEvent.click(checkboxes[5]);
    expect(screen.getByText('5 selected')).toBeInTheDocument();
    expect(checkboxes[5]).not.toBeChecked();
  });

  it('enables the confirm button at 0, 1, and 2-5 selections', () => {
    render(<DrivePickerModal {...baseProps} mode="compare-multi" driveFiles={driveFiles} />);
    const checkboxes = screen.getAllByRole('checkbox');

    expect(screen.getByRole('button', { name: /compare 0 decks/i })).toBeEnabled();

    fireEvent.click(checkboxes[0]);
    expect(screen.getByRole('button', { name: /compare 1 deck/i })).toBeEnabled();

    fireEvent.click(checkboxes[1]);
    expect(screen.getByRole('button', { name: /compare 2 decks/i })).toBeEnabled();
  });

  it('confirms with an empty selection', () => {
    const onConfirmSelection = jest.fn();
    render(
      <DrivePickerModal
        {...baseProps}
        mode="compare-multi"
        driveFiles={driveFiles}
        onConfirmSelection={onConfirmSelection}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /compare 0 decks/i }));

    expect(onConfirmSelection).toHaveBeenCalledWith([]);
  });

  it('confirms with a single selected file', () => {
    const onConfirmSelection = jest.fn();
    render(
      <DrivePickerModal
        {...baseProps}
        mode="compare-multi"
        driveFiles={driveFiles}
        onConfirmSelection={onConfirmSelection}
      />
    );

    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    fireEvent.click(screen.getByRole('button', { name: /compare 1 deck/i }));

    expect(onConfirmSelection).toHaveBeenCalledWith([driveFiles[0]]);
  });

  it('confirms with the full list of selected files and closes', () => {
    const onConfirmSelection = jest.fn();
    render(
      <DrivePickerModal
        {...baseProps}
        mode="compare-multi"
        driveFiles={driveFiles}
        onConfirmSelection={onConfirmSelection}
      />
    );
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[2]);

    fireEvent.click(screen.getByRole('button', { name: /compare 2 decks/i }));

    expect(onConfirmSelection).toHaveBeenCalledWith([driveFiles[0], driveFiles[2]]);
  });

  it('does not render a delete button per file', () => {
    render(<DrivePickerModal {...baseProps} mode="compare-multi" driveFiles={driveFiles} />);
    // Only the modal close (×) and the confirm-selection button should be buttons; no per-file delete buttons.
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('pre-checks files passed in preSelectedFiles', () => {
    render(
      <DrivePickerModal
        {...baseProps}
        mode="compare-multi"
        driveFiles={driveFiles}
        preSelectedFiles={[driveFiles[0], driveFiles[1]]}
      />
    );
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).toBeChecked();
    expect(checkboxes[2]).not.toBeChecked();
  });
});

describe('DrivePickerModal – reports mode', () => {
  const driveFiles = [
    { id: '1', name: 'Report One' },
    { id: '2', name: 'Report Two' },
  ];

  it('shows a "Your Reports" title', () => {
    render(<DrivePickerModal {...baseProps} mode="reports" driveFiles={driveFiles} />);
    expect(screen.getByText('Your Reports')).toBeInTheDocument();
  });

  it('does not render the pile-subset select or checkboxes', () => {
    render(<DrivePickerModal {...baseProps} mode="reports" driveFiles={driveFiles} />);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('calls loadDriveFile with no piles argument when a report is loaded', () => {
    const loadDriveFile = jest.fn();
    render(<DrivePickerModal {...baseProps} mode="reports" driveFiles={driveFiles} loadDriveFile={loadDriveFile} />);
    fireEvent.click(screen.getByRole('button', { name: /load report one/i }));
    expect(loadDriveFile).toHaveBeenCalledWith(driveFiles[0]);
    expect(loadDriveFile.mock.calls[0]).toHaveLength(1);
  });

  it('renames a report via the inline rename control', () => {
    const onRenameFile = jest.fn();
    render(
      <DrivePickerModal {...baseProps} mode="reports" driveFiles={driveFiles} onRenameFile={onRenameFile} />
    );

    fireEvent.click(screen.getByRole('button', { name: /rename report one/i }));
    const input = screen.getByRole('textbox', { name: /rename report one/i });
    fireEvent.change(input, { target: { value: 'Renamed Report' } });
    fireEvent.click(screen.getByRole('button', { name: /save name for report one/i }));

    expect(onRenameFile).toHaveBeenCalledWith(driveFiles[0], 'Renamed Report');
    expect(screen.queryByRole('textbox', { name: /rename report one/i })).not.toBeInTheDocument();
  });

  it('cancels a rename without calling onRenameFile', () => {
    const onRenameFile = jest.fn();
    render(
      <DrivePickerModal {...baseProps} mode="reports" driveFiles={driveFiles} onRenameFile={onRenameFile} />
    );

    fireEvent.click(screen.getByRole('button', { name: /rename report one/i }));
    fireEvent.change(screen.getByRole('textbox', { name: /rename report one/i }), { target: { value: 'Changed' } });
    fireEvent.click(screen.getByRole('button', { name: /cancel rename/i }));

    expect(onRenameFile).not.toHaveBeenCalled();
    expect(screen.getByText('Report One')).toBeInTheDocument();
  });
});

describe('DrivePickerModal – layer (#897)', () => {
  // The practice table's pile count badges sit at `z-[140]`, and the splash of its game menu at
  // `z-[160]`. At `z-50` the badges drew through the picker.
  it('stacks the picker above the pile count badges and the menu splash', () => {
    const { container } = render(<DrivePickerModal {...baseProps} />);
    const zIndex = (container.firstElementChild as HTMLElement).className.match(/\bz-\[(\d+)\]/);
    expect(zIndex).not.toBeNull();
    expect(Number(zIndex![1])).toBeGreaterThan(160);
  });
});

describe('DrivePickerModal – the Tournament decks folder (#1310)', () => {
  const tournamentDeck = (event: string, deckName: string, player: string) => ({
    event,
    tournamentId: 1,
    deckId: 2,
    deckName,
    player,
    file: `${event} - ${deckName} - ${player}.txt`,
    source: 'https://www.trekcc.org/decklists/?mode=viewdeck&deckID=2',
  });
  const ledos = tournamentDeck('2026 Worlds Day One', 'Common Ledos Deck', 'Michael Van Breemen');
  const borg = tournamentDeck('2026 Trek Masters', 'Big Borg Worlds', 'Eric R');
  const tournamentEvents = [
    { event: '2026 Trek Masters', decks: [borg] },
    { event: '2026 Worlds Day One', decks: [ledos] },
  ];
  const gatedProps = { ...baseProps, showTournamentDecks: true, tournamentEvents };
  const driveFolder = { id: 'f1', name: 'My Folder', mimeType: FOLDER_MIME_TYPE, parents: ['appDataFolder'] };
  const driveDeck = { id: 'd1', name: 'Drive Deck', parents: ['appDataFolder'] };

  it('lists the folder at the root in load mode, and no "no files found"', () => {
    render(<DrivePickerModal {...gatedProps} />);
    expect(screen.getByRole('button', { name: 'Tournament decks' })).toBeInTheDocument();
    expect(screen.queryByText('no files found')).not.toBeInTheDocument();
  });

  it('lists one folder per event in order, and the deck name and player inside an event', () => {
    render(<DrivePickerModal {...gatedProps} driveFiles={[driveFolder, driveDeck]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tournament decks' }));
    const events = screen.getAllByRole('button').map((b) => b.textContent);
    expect(events.indexOf('2026 Trek Masters')).toBeLessThan(events.indexOf('2026 Worlds Day One'));
    expect(screen.queryByText('Drive Deck')).not.toBeInTheDocument();
    expect(screen.queryByText('My Folder')).not.toBeInTheDocument();
    expect(screen.queryByText('New folder')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '2026 Worlds Day One' }));
    expect(screen.getByText('Common Ledos Deck')).toBeInTheDocument();
    expect(screen.getByText(/Michael Van Breemen/)).toBeInTheDocument();
    expect(screen.queryByText('Big Borg Worlds')).not.toBeInTheDocument();
  });

  it('goes back from an event to the folder, and from the folder to the root', () => {
    render(<DrivePickerModal {...gatedProps} driveFiles={[driveDeck]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tournament decks' }));
    fireEvent.click(screen.getByRole('button', { name: '2026 Worlds Day One' }));
    fireEvent.click(screen.getByRole('button', { name: '2026 Worlds Day One' }));
    expect(screen.getByRole('button', { name: '2026 Trek Masters' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tournament decks' }));
    expect(screen.getByText('Drive Deck')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tournament decks' })).toBeInTheDocument();
  });

  it('shows no delete, rename or move action on a tournament row', () => {
    render(<DrivePickerModal {...gatedProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tournament decks' }));
    expect(screen.queryByRole('button', { name: /^(Rename|Delete)/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '2026 Worlds Day One' }));
    const row = screen.getByTestId('tournament-deck-row');
    const labels = Array.from(row.querySelectorAll('button')).map((b) => b.getAttribute('aria-label'));
    expect(labels).toEqual(['Load Common Ledos Deck - Michael Van Breemen']);
  });

  it('never lists the tournament folders as Move destinations', () => {
    render(<DrivePickerModal {...gatedProps} driveFiles={[driveFolder, driveDeck]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Move Drive Deck' }));
    expect(screen.getByRole('button', { name: 'Move to My Folder' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Move to (Tournament decks|2026)/ })).not.toBeInTheDocument();
  });

  it('loads a deck by its tournament id with the chosen pile', () => {
    const loadDriveFile = jest.fn();
    render(<DrivePickerModal {...gatedProps} loadDriveFile={loadDriveFile} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tournament decks' }));
    fireEvent.click(screen.getByRole('button', { name: '2026 Worlds Day One' }));
    const label = 'Common Ledos Deck - Michael Van Breemen';
    fireEvent.click(screen.getByRole('button', { name: `Load ${label}` }));
    const id = `tournament:${ledos.file}`;
    const name = 'Common Ledos Deck - Michael Van Breemen - 2026 Worlds Day One';
    expect(loadDriveFile).toHaveBeenLastCalledWith({ id, name }, undefined);
    fireEvent.change(screen.getByRole('combobox', { name: `Load mode for ${label}` }), { target: { value: 'mission' } });
    fireEvent.click(screen.getByRole('button', { name: `Load ${label}` }));
    expect(loadDriveFile).toHaveBeenLastCalledWith({ id, name }, ['mission']);
  });

  it('shows no folder in reports mode', () => {
    render(<DrivePickerModal {...gatedProps} mode="reports" />);
    expect(screen.queryByText('Tournament decks')).not.toBeInTheDocument();
  });

  it.each(['compare', 'compare-multi'] as const)('lists the folder, its events and decks in %s mode (#1311)', (mode) => {
    render(<DrivePickerModal {...gatedProps} mode={mode} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tournament decks' }));
    fireEvent.click(screen.getByRole('button', { name: '2026 Worlds Day One' }));
    expect(screen.getByText('Common Ledos Deck')).toBeInTheDocument();
    expect(screen.getByText(/Michael Van Breemen/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^(Rename|Delete|Move)/ })).not.toBeInTheDocument();
  });

  it('loads a tournament deck under its title in compare mode, with no pile choice (#1311)', () => {
    const loadDriveFile = jest.fn();
    render(<DrivePickerModal {...gatedProps} mode="compare" loadDriveFile={loadDriveFile} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tournament decks' }));
    fireEvent.click(screen.getByRole('button', { name: '2026 Worlds Day One' }));
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Load Common Ledos Deck - Michael Van Breemen' }));
    expect(loadDriveFile).toHaveBeenCalledWith({
      id: `tournament:${ledos.file}`,
      name: 'Common Ledos Deck - Michael Van Breemen - 2026 Worlds Day One',
    });
  });

  it('confirms the checked tournament decks with the Drive decks in compare-multi mode (#1311)', () => {
    const onConfirmSelection = jest.fn();
    render(
      <DrivePickerModal {...gatedProps} mode="compare-multi" driveFiles={[driveDeck]} onConfirmSelection={onConfirmSelection} />
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Drive Deck' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tournament decks' }));
    fireEvent.click(screen.getByRole('button', { name: '2026 Worlds Day One' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Common Ledos Deck - Michael Van Breemen' }));
    fireEvent.click(screen.getByRole('button', { name: 'Compare 2 decks' }));
    expect(onConfirmSelection).toHaveBeenCalledWith([
      driveDeck,
      { id: `tournament:${ledos.file}`, name: 'Common Ledos Deck - Michael Van Breemen - 2026 Worlds Day One' },
    ]);
  });

  it('checks a pre-selected tournament deck again, and keeps it on confirm (#1311)', () => {
    const onConfirmSelection = jest.fn();
    const borgRef = { id: `tournament:${borg.file}`, name: 'Big Borg Worlds - Eric R - 2026 Trek Masters' };
    render(
      <DrivePickerModal
        {...gatedProps}
        mode="compare-multi"
        preSelectedFiles={[borgRef]}
        onConfirmSelection={onConfirmSelection}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tournament decks' }));
    fireEvent.click(screen.getByRole('button', { name: '2026 Trek Masters' }));
    expect(screen.getByRole('checkbox', { name: 'Select Big Borg Worlds - Eric R' })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Compare 1 deck' }));
    expect(onConfirmSelection).toHaveBeenCalledWith([borgRef]);
  });

  it('keeps a pre-selected tournament deck on confirm before the index loads (#1311)', () => {
    const onConfirmSelection = jest.fn();
    const borgRef = { id: `tournament:${borg.file}`, name: 'Big Borg Worlds - Eric R - 2026 Trek Masters' };
    render(
      <DrivePickerModal
        {...gatedProps}
        tournamentEvents={[]}
        mode="compare-multi"
        preSelectedFiles={[borgRef]}
        onConfirmSelection={onConfirmSelection}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Compare 1 deck' }));
    expect(onConfirmSelection).toHaveBeenCalledWith([borgRef]);
  });

  it('shows no folder with the gate off', () => {
    render(<DrivePickerModal {...baseProps} tournamentEvents={tournamentEvents} />);
    expect(screen.queryByText('Tournament decks')).not.toBeInTheDocument();
    expect(screen.getByText('no files found')).toBeInTheDocument();
  });

  it('shows only the sign-in rows to a signed-out user', () => {
    render(<DrivePickerModal {...gatedProps} isSignedIn={false} hasDriveScope={false} />);
    expect(screen.getByText(/sign in with google/i)).toBeInTheDocument();
    expect(screen.queryByText('Tournament decks')).not.toBeInTheDocument();
  });
});
