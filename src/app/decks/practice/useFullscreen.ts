import { useCallback, useEffect, useState } from 'react';

// The Fullscreen API with Safari's prefixed names (#921). iPadOS Safari and older desktop Safari
// only have the `webkit` names. iPhone Safari has neither for a `<div>`, so `enabled` is false
// there and the table shows no button.
type WebkitDocument = Document & {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

type WebkitElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

function fullscreenEnabled(): boolean {
  const doc = document as WebkitDocument;
  return Boolean(doc.fullscreenEnabled || doc.webkitFullscreenEnabled);
}

function fullscreenElement(): Element | null {
  const doc = document as WebkitDocument;
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

// Puts `element` into fullscreen and takes it out again. `isFullscreen` follows
// `fullscreenchange`, so it is right after the player leaves with Escape or a system gesture too.
export function useFullscreen(element: HTMLElement | null) {
  // False on the server and on the first render, so the pre-rendered page has no button.
  const [enabled, setEnabled] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    setEnabled(fullscreenEnabled());
    const onChange = () => setIsFullscreen(element !== null && fullscreenElement() === element);
    onChange();
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, [element]);

  const toggle = useCallback(() => {
    if (!element) return;
    const doc = document as WebkitDocument;
    // A rejected promise (no user gesture, a permissions policy) leaves the state as it was.
    const ignore = (result: Promise<void> | void) => {
      if (result instanceof Promise) result.catch(() => {});
    };
    if (fullscreenElement()) {
      if (doc.exitFullscreen) ignore(doc.exitFullscreen());
      else if (doc.webkitExitFullscreen) ignore(doc.webkitExitFullscreen());
      return;
    }
    const el = element as WebkitElement;
    if (el.requestFullscreen) ignore(el.requestFullscreen());
    else if (el.webkitRequestFullscreen) ignore(el.webkitRequestFullscreen());
  }, [element]);

  return { enabled, isFullscreen, toggle };
}
