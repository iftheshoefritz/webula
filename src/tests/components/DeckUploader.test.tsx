import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react';
import DeckUploader from '../../components/DeckUploader';

// jsdom's FileReader doesn't read real file contents from a File object created in tests,
// so this stubs it to synchronously resolve with the File's own `text` (set via `new File`).
class MockFileReader {
  onload: ((e: any) => void) | null = null;
  onerror: ((e: any) => void) | null = null;
  result: string | null = null;

  readAsText(file: File & { __content?: string }) {
    this.result = file.__content ?? '';
    this.onload?.({ target: { result: this.result } });
  }
}

function makeFile(name: string, content: string): File {
  const file = new File([content], name, { type: 'text/plain' }) as File & { __content?: string };
  file.__content = content;
  return file;
}

describe('DeckUploader', () => {
  const originalFileReader = global.FileReader;

  beforeEach(() => {
    (global as any).FileReader = MockFileReader;
  });

  afterEach(() => {
    global.FileReader = originalFileReader;
  });

  it('renders a file input that accepts multiple files', () => {
    render(<DeckUploader onFilesLoad={jest.fn()} />);
    const input = document.getElementById('fileInput') as HTMLInputElement;
    expect(input).toHaveAttribute('multiple');
  });

  it('reports every selected file, not just the first', async () => {
    const onFilesLoad = jest.fn();
    render(<DeckUploader onFilesLoad={onFilesLoad} />);
    const input = document.getElementById('fileInput') as HTMLInputElement;

    const fileA = makeFile('Deck A.txt', '1\tCard 1');
    const fileB = makeFile('Deck B.txt', '2\tCard 2');
    Object.defineProperty(input, 'files', { value: [fileA, fileB] });

    fireEvent.change(input);

    await waitFor(() => expect(onFilesLoad).toHaveBeenCalledTimes(1));
    expect(onFilesLoad).toHaveBeenCalledWith([
      { name: 'Deck A.txt', content: '1\tCard 1' },
      { name: 'Deck B.txt', content: '2\tCard 2' },
    ]);
  });

  it('reports a single file the same way when only one is selected', async () => {
    const onFilesLoad = jest.fn();
    render(<DeckUploader onFilesLoad={onFilesLoad} />);
    const input = document.getElementById('fileInput') as HTMLInputElement;

    const file = makeFile('Deck A.txt', '1\tCard 1');
    Object.defineProperty(input, 'files', { value: [file] });

    fireEvent.change(input);

    await waitFor(() => expect(onFilesLoad).toHaveBeenCalledTimes(1));
    expect(onFilesLoad).toHaveBeenCalledWith([{ name: 'Deck A.txt', content: '1\tCard 1' }]);
  });

  it('does nothing when the selection is cleared', () => {
    const onFilesLoad = jest.fn();
    render(<DeckUploader onFilesLoad={onFilesLoad} />);
    const input = document.getElementById('fileInput') as HTMLInputElement;

    Object.defineProperty(input, 'files', { value: [] });
    fireEvent.change(input);

    expect(onFilesLoad).not.toHaveBeenCalled();
  });
});
