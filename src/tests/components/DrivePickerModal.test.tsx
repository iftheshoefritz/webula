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
  it('does not show a "This Browser" section header', () => {
    render(<DrivePickerModal {...baseProps} />);
    expect(screen.queryByText('This Browser')).not.toBeInTheDocument();
    expect(screen.getByText('Google Drive')).toBeInTheDocument();
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

    expect(screen.getByText('My Folder')).toBeInTheDocument();
    expect(screen.getByText('My Deck')).toBeInTheDocument();
    // Only the deck row gets a pile-subset select; the folder row has no controls.
    expect(screen.getAllByRole('combobox')).toHaveLength(1);
  });

  it('does not show "no files found" when only a folder is present', () => {
    render(<DrivePickerModal {...baseProps} mode="load" driveFiles={[driveFiles[0]]} />);
    expect(screen.getByText('My Folder')).toBeInTheDocument();
    expect(screen.queryByText('no files found')).not.toBeInTheDocument();
  });

  it('does not render folder rows outside load mode', () => {
    render(<DrivePickerModal {...baseProps} mode="compare" driveFiles={driveFiles} />);
    expect(screen.queryByText('My Folder')).not.toBeInTheDocument();
    expect(screen.getByText('My Deck')).toBeInTheDocument();
  });
});

describe('DrivePickerModal – browsing a folder in load mode', () => {
  const folder = { id: 'f1', name: 'My Folder', mimeType: FOLDER_MIME_TYPE, parents: ['appDataFolder'] };
  const rootDeck = { id: 'd1', name: 'Root Deck', mimeType: 'application/json', parents: ['appDataFolder'] };
  const folderDeck = { id: 'd2', name: 'Folder Deck', mimeType: 'application/json', parents: ['f1'] };
  const driveFiles = [folder, rootDeck, folderDeck];

  it('only shows root-level decks and folders when no folder is being browsed', () => {
    render(<DrivePickerModal {...baseProps} mode="load" driveFiles={driveFiles} />);
    expect(screen.getByText('My Folder')).toBeInTheDocument();
    expect(screen.getByText('Root Deck')).toBeInTheDocument();
    expect(screen.queryByText('Folder Deck')).not.toBeInTheDocument();
  });

  it('calls onBrowseFolder with the folder when a folder row is clicked', () => {
    const onBrowseFolder = jest.fn();
    render(
      <DrivePickerModal {...baseProps} mode="load" driveFiles={driveFiles} onBrowseFolder={onBrowseFolder} />
    );
    fireEvent.click(screen.getByText('My Folder'));
    expect(onBrowseFolder).toHaveBeenCalledWith(folder);
  });

  it('shows only the browsed folder\'s decks, not root decks or other folders, when browsing', () => {
    render(
      <DrivePickerModal {...baseProps} mode="load" driveFiles={driveFiles} browsedFolder={folder} />
    );
    expect(screen.getByText('Folder Deck')).toBeInTheDocument();
    expect(screen.queryByText('Root Deck')).not.toBeInTheDocument();
    // The only "My Folder" text present is the back control's label, not a clickable folder row.
    expect(screen.getAllByText('My Folder')).toHaveLength(1);
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

  it('renders the pile-subset select in load mode (default)', () => {
    render(<DrivePickerModal {...baseProps} driveFiles={driveFiles} />);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
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
