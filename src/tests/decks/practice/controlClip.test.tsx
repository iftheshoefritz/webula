import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import ControlsPanel from '../../../app/decks/practice/ControlsPanel';
import { REDUCED_MOTION_QUERY } from '../../../app/decks/practice/ControlClip';
import { CONTROL_ROWS, clipFiles, type ControlRow } from '../../../app/decks/practice/controls';

// #1090: the playback of a row's clip in the Controls panel. These tests use rows made here, so
// they do not change as the rows of `controls.ts` gain clips (#1091).

const clipRow: ControlRow = {
  id: 'test-gesture',
  section: 'Basics',
  action: 'A test gesture',
  touch: 'Do the gesture with a finger.',
  mouse: 'Do the gesture with a mouse.',
  clip: { touch: true, mouse: true },
};

const mockMedia = ({ fine = false, reducedMotion = false } = {}) => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches: query === REDUCED_MOTION_QUERY ? reducedMotion : fine,
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    })),
  });
};

let observerCallback: IntersectionObserverCallback | null = null;
const observe = jest.fn();
const disconnect = jest.fn();

const setInView = (video: HTMLElement, isIntersecting: boolean) =>
  act(() => {
    observerCallback?.([{ isIntersecting, target: video } as unknown as IntersectionObserverEntry], {} as IntersectionObserver);
  });

let play: jest.SpyInstance;
let pause: jest.SpyInstance;

beforeEach(() => {
  observerCallback = null;
  observe.mockClear();
  disconnect.mockClear();
  (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = jest.fn((callback: IntersectionObserverCallback) => {
    observerCallback = callback;
    return { observe, disconnect, unobserve: jest.fn(), takeRecords: () => [] };
  });
  play = jest.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
  pause = jest.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
});

afterEach(() => {
  play.mockRestore();
  pause.mockRestore();
  delete (window as unknown as { IntersectionObserver?: unknown }).IntersectionObserver;
});

describe('clipFiles (#1090)', () => {
  it('gives the paths of a row clip for each column', () => {
    expect(clipFiles(clipRow, 'touch')).toEqual({
      webm: '/controls/test-gesture-touch.webm',
      mp4: '/controls/test-gesture-touch.mp4',
      poster: '/controls/test-gesture-touch.webp',
    });
    expect(clipFiles(clipRow, 'mouse')?.webm).toBe('/controls/test-gesture-mouse.webm');
  });

  it('gives null for a column with no clip', () => {
    expect(clipFiles({ ...clipRow, clip: { mouse: true } }, 'touch')).toBeNull();
    expect(clipFiles({ ...clipRow, clip: undefined }, 'mouse')).toBeNull();
  });
});

describe('ControlClip in the Controls panel (#1090)', () => {
  it('renders a muted, looped video with a poster, a WebM source and an MP4 source after it', () => {
    mockMedia();
    render(<ControlsPanel onClose={jest.fn()} rows={[clipRow]} />);
    const video = screen.getByTestId('control-clip') as HTMLVideoElement;
    expect(video.muted).toBe(true);
    expect(video.loop).toBe(true);
    expect(video).toHaveAttribute('playsinline');
    expect(video).toHaveAttribute('preload', 'none');
    expect(video).toHaveAttribute('poster', '/controls/test-gesture-touch.webp');
    const sources = video.querySelectorAll('source');
    expect(Array.from(sources).map((s) => [s.getAttribute('src'), s.getAttribute('type')])).toEqual([
      ['/controls/test-gesture-touch.webm', 'video/webm'],
      ['/controls/test-gesture-touch.mp4', 'video/mp4'],
    ]);
  });

  it('shows the clip of the column on show', () => {
    mockMedia();
    render(<ControlsPanel onClose={jest.fn()} rows={[clipRow]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mouse' }));
    expect(screen.getByTestId('control-clip')).toHaveAttribute('poster', '/controls/test-gesture-mouse.webp');
  });

  it('plays while the row is in view and pauses when it leaves', () => {
    mockMedia();
    render(<ControlsPanel onClose={jest.fn()} rows={[clipRow]} />);
    const video = screen.getByTestId('control-clip');
    expect(observe).toHaveBeenCalledWith(video);
    expect(play).not.toHaveBeenCalled();

    setInView(video, true);
    expect(play).toHaveBeenCalledTimes(1);

    pause.mockClear();
    setInView(video, false);
    expect(pause).toHaveBeenCalledTimes(1);
  });

  it('under reduced motion shows the poster, does not autoplay, and a tap plays the clip once', () => {
    mockMedia({ reducedMotion: true });
    render(<ControlsPanel onClose={jest.fn()} rows={[clipRow]} />);
    const video = screen.getByTestId('control-clip') as HTMLVideoElement;
    expect(observe).not.toHaveBeenCalled();
    expect(video).toHaveAttribute('poster', '/controls/test-gesture-touch.webp');
    expect(video.loop).toBe(false);
    expect(play).not.toHaveBeenCalled();

    fireEvent.click(video);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('hides the video on an error and keeps the row text', () => {
    mockMedia();
    render(<ControlsPanel onClose={jest.fn()} rows={[clipRow]} />);
    fireEvent.error(screen.getByTestId('control-clip'));
    expect(screen.queryByTestId('control-clip')).not.toBeInTheDocument();
    expect(screen.getByText('A test gesture')).toBeInTheDocument();
    expect(screen.getByText('Do the gesture with a finger.')).toBeInTheDocument();
  });

  it('hides the video when its last source fails to load', () => {
    mockMedia();
    render(<ControlsPanel onClose={jest.fn()} rows={[clipRow]} />);
    const sources = screen.getByTestId('control-clip').querySelectorAll('source');
    fireEvent.error(sources[sources.length - 1]);
    expect(screen.queryByTestId('control-clip')).not.toBeInTheDocument();
    expect(screen.getByText('Do the gesture with a finger.')).toBeInTheDocument();
  });

  it('shows a video only on the rows of the real panel that have a clip', () => {
    mockMedia();
    render(<ControlsPanel onClose={jest.fn()} />);
    for (const row of CONTROL_ROWS) {
      const clip = screen.getByTestId(`control-${row.id}`).querySelector('[data-testid="control-clip"]');
      if (row.clip?.touch) expect(clip).not.toBeNull();
      else expect(clip).toBeNull();
    }
  });
});
