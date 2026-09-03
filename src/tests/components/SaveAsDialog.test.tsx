import { render, screen, fireEvent } from '@testing-library/react';
import { SaveAsDialog } from '../../components/SaveAsDialog';
import { FOLDER_MIME_TYPE } from '../../app/api/drive/mimeTypes';

const baseProps = {
  deckTitle: 'My Deck',
  driveFiles: [],
  inProgress: false,
  onConfirm: jest.fn(),
  onCreateFolder: jest.fn(),
  onClose: jest.fn(),
};

describe('SaveAsDialog', () => {
  it('shows the deck title and a Root destination', () => {
    render(<SaveAsDialog {...baseProps} />);
    expect(screen.getByText('Save "My Deck" to…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save to Root' })).toBeInTheDocument();
  });

  it('shows a "please wait" message while folders are loading, hiding the destination list', () => {
    render(<SaveAsDialog {...baseProps} inProgress={true} />);
    expect(screen.getByText('please wait...')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save to Root' })).not.toBeInTheDocument();
  });

  it('lists root-level folders alongside Root', () => {
    const driveFiles = [
      { id: 'f1', name: 'My Folder', mimeType: FOLDER_MIME_TYPE, parents: ['appDataFolder'] },
      { id: 'deck1', name: 'Some Deck', parents: ['appDataFolder'] },
    ];
    render(<SaveAsDialog {...baseProps} driveFiles={driveFiles} />);
    expect(screen.getByRole('button', { name: 'Save to My Folder' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save to Some Deck' })).not.toBeInTheDocument();
  });

  it('calls onConfirm with "appDataFolder" when Root is chosen', () => {
    const onConfirm = jest.fn();
    render(<SaveAsDialog {...baseProps} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save to Root' }));
    expect(onConfirm).toHaveBeenCalledWith('appDataFolder');
  });

  it('calls onConfirm with the folder id when a folder is chosen', () => {
    const onConfirm = jest.fn();
    const driveFiles = [{ id: 'f1', name: 'My Folder', mimeType: FOLDER_MIME_TYPE, parents: ['appDataFolder'] }];
    render(<SaveAsDialog {...baseProps} driveFiles={driveFiles} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save to My Folder' }));
    expect(onConfirm).toHaveBeenCalledWith('f1');
  });

  it('calls onClose without confirming when the close button is clicked', () => {
    const onConfirm = jest.fn();
    const onClose = jest.fn();
    render(<SaveAsDialog {...baseProps} onConfirm={onConfirm} onClose={onClose} />);
    fireEvent.click(screen.getByText('×'));
    expect(onClose).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('creates a folder via the inline new-folder control', () => {
    const onCreateFolder = jest.fn();
    render(<SaveAsDialog {...baseProps} onCreateFolder={onCreateFolder} />);
    fireEvent.click(screen.getByRole('button', { name: /new folder/i }));
    fireEvent.change(screen.getByLabelText('New folder name'), { target: { value: 'New Folder' } });
    fireEvent.click(screen.getByRole('button', { name: /save new folder/i }));
    expect(onCreateFolder).toHaveBeenCalledWith('New Folder');
  });

  it('cancels creating a folder without calling onCreateFolder', () => {
    const onCreateFolder = jest.fn();
    render(<SaveAsDialog {...baseProps} onCreateFolder={onCreateFolder} />);
    fireEvent.click(screen.getByRole('button', { name: /new folder/i }));
    fireEvent.change(screen.getByLabelText('New folder name'), { target: { value: 'New Folder' } });
    fireEvent.click(screen.getByRole('button', { name: /cancel new folder/i }));
    expect(onCreateFolder).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /new folder/i })).toBeInTheDocument();
  });

  it('does not call onCreateFolder with a blank name', () => {
    const onCreateFolder = jest.fn();
    render(<SaveAsDialog {...baseProps} onCreateFolder={onCreateFolder} />);
    fireEvent.click(screen.getByRole('button', { name: /new folder/i }));
    fireEvent.click(screen.getByRole('button', { name: /save new folder/i }));
    expect(onCreateFolder).not.toHaveBeenCalled();
  });
});
