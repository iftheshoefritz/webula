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
    render(<DrivePickerModal {...baseProps} isSignedIn={true} />);
    expect(screen.queryByText(/sign in with google/i)).not.toBeInTheDocument();
  });
});
