import React, { useEffect, useRef, useState } from 'react';
import type { ClipFiles } from './controls';

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

// The clip of a row of the Controls panel (#1090, part of #1089): a short muted loop of the
// gesture. It plays while it is in view and pauses when it leaves. Under reduced motion it shows
// the poster, and a tap plays it once. A clip that cannot load (offline, or a missing file) hides
// itself, so the row shows its text only, with no broken frame.
export default function ControlClip({ files, label }: { files: ClipFiles; label: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  // Read after the mount, so the pre-rendered page and the first render agree.
  const [reducedMotion, setReducedMotion] = useState<boolean | null>(null);

  useEffect(() => {
    setReducedMotion(typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION_QUERY).matches);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || failed || reducedMotion !== false || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) return;
      // `play` rejects when the load fails or a pause interrupts it; the `error` event handles the
      // first, and the second needs nothing.
      if (entry.isIntersecting) video.play()?.catch(() => {});
      else video.pause();
    });
    observer.observe(video);
    return () => {
      observer.disconnect();
      video.pause();
    };
  }, [failed, reducedMotion]);

  if (failed) return null;

  const fail = () => setFailed(true);
  const playOnce = () => {
    const video = videoRef.current;
    if (!video || !reducedMotion) return;
    video.currentTime = 0;
    video.play()?.catch(() => {});
  };

  return (
    <video
      ref={videoRef}
      data-testid="control-clip"
      aria-label={label}
      muted
      loop={reducedMotion === false}
      playsInline
      preload="none"
      poster={files.poster}
      onError={fail}
      onClick={playOnce}
      className={`mt-1 w-full max-w-xs rounded border border-white/10 bg-black/20 ${reducedMotion ? 'cursor-pointer' : ''}`}
    >
      <source src={files.webm} type="video/webm" />
      {/* The browser tries the sources in order and fires `error` on the last one when none loads. */}
      <source src={files.mp4} type="video/mp4" onError={fail} />
    </video>
  );
}
