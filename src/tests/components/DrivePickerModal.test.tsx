import { render, screen, fireEvent } from '@testing-library/react';
import { DrivePickerModal } from '../../components/DrivePickerModal';

const baseProps = {
  browserFiles: [],
  driveFiles: [],
  loadDriveFile: jest.fn(),
  deleteDriveFile: jest.fn(),
  loadBrowserFile: jest.fn(),
  deleteBrowserFile: jest.fn(),
  inProgress: false,
  onClose: jest.fn(),
  isSignedIn: true,
  hasDriveScope: true,
  onSignIn: jest.fn(),
};

describe('DrivePickerModal – Google Drive section', () => {
  it('shows "no files found" in drive section when signed in with no drive files', () => {
    render(<DrivePickerModal {...baseProps} isSignedIn={true} driveFiles={[]} />);
    // Both browser and drive sections show "no files found" when empty and signed in
    const messages = screen.getAllByText('no files found');
    expect(messages.length).toBeGreaterThanOrEqual(1);
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
    // Drive section shows sign-in, not "no files found"; browser section may still show it
    const noFilesMessages = screen.queryAllByText('no files found');
    // Only the browser section's "no files found" should appear (drive section shows sign-in)
    expect(noFilesMessages).toHaveLength(1);
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
    // Drive section shows grant button, not "no files found"
    // (browser section may still show "no files found")
    const noFilesMessages = screen.queryAllByText('no files found');
    expect(noFilesMessages).toHaveLength(1); // only from browser section
  });

  it('calls onSignIn when grant drive access button is clicked', () => {
    const onSignIn = jest.fn();
    render(<DrivePickerModal {...baseProps} isSignedIn={true} hasDriveScope={false} onSignIn={onSignIn} />);
    fireEvent.click(screen.getByText(/grant google drive access/i));
    expect(onSignIn).toHaveBeenCalledTimes(1);
  });
});

describe('DrivePickerModal – collapsible sections', () => {
  it('shows "This Browser" and "Google Drive" section headers', () => {
    render(<DrivePickerModal {...baseProps} />);
    expect(screen.getByText('This Browser')).toBeInTheDocument();
    expect(screen.getByText('Google Drive')).toBeInTheDocument();
  });

  it('collapses the browser section when the header is clicked', () => {
    const browserFiles = [{ name: 'Local Deck', deck: {} as any }];
    render(<DrivePickerModal {...baseProps} browserFiles={browserFiles} />);
    expect(screen.getByText('Local Deck')).toBeInTheDocument();
    fireEvent.click(screen.getByText('This Browser'));
    expect(screen.queryByText('Local Deck')).not.toBeInTheDocument();
  });

  it('expands the browser section again after a second click', () => {
    const browserFiles = [{ name: 'Local Deck', deck: {} as any }];
    render(<DrivePickerModal {...baseProps} browserFiles={browserFiles} />);
    fireEvent.click(screen.getByText('This Browser'));
    expect(screen.queryByText('Local Deck')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('This Browser'));
    expect(screen.getByText('Local Deck')).toBeInTheDocument();
  });

  it('collapses the drive section when the header is clicked', () => {
    const driveFiles = [{ id: '1', name: 'Drive Deck' }];
    render(<DrivePickerModal {...baseProps} isSignedIn={true} driveFiles={driveFiles} />);
    expect(screen.getByText('Drive Deck')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Google Drive'));
    expect(screen.queryByText('Drive Deck')).not.toBeInTheDocument();
  });

  it('expands the drive section again after a second click', () => {
    const driveFiles = [{ id: '1', name: 'Drive Deck' }];
    render(<DrivePickerModal {...baseProps} isSignedIn={true} driveFiles={driveFiles} />);
    fireEvent.click(screen.getByText('Google Drive'));
    expect(screen.queryByText('Drive Deck')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Google Drive'));
    expect(screen.getByText('Drive Deck')).toBeInTheDocument();
  });
});
