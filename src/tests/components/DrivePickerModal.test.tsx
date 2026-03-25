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

describe('DrivePickerModal – collapsible section', () => {
  it('does not show a "This Browser" section header', () => {
    render(<DrivePickerModal {...baseProps} />);
    expect(screen.queryByText('This Browser')).not.toBeInTheDocument();
    expect(screen.getByText('Google Drive')).toBeInTheDocument();
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
