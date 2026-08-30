import { render, screen, fireEvent } from '@testing-library/react';
import { DrivePickerModal } from '../../components/DrivePickerModal';

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

  it('disables the confirm button below 2 selections and enables it at 2-5', () => {
    render(<DrivePickerModal {...baseProps} mode="compare-multi" driveFiles={driveFiles} />);
    const checkboxes = screen.getAllByRole('checkbox');

    expect(screen.getByRole('button', { name: /compare 0 decks/i })).toBeDisabled();

    fireEvent.click(checkboxes[0]);
    expect(screen.getByRole('button', { name: /compare 1 deck/i })).toBeDisabled();

    fireEvent.click(checkboxes[1]);
    expect(screen.getByRole('button', { name: /compare 2 decks/i })).toBeEnabled();
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
