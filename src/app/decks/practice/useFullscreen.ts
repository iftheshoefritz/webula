import { useCallback, useEffect, useState } from 'react';

// The Fullscreen API with Safari's prefixed names (#921). iPadOS Safari and older desktop Safari
// only have the `webkit` names. iPhone Safari has neither for a `<div>`, so `enabled` is false
// there, and the button shows how to add the app to the home screen instead (#1127).
type WebkitDocument = Document & {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

type WebkitElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

function fullscreenEnabled(element: HTMLElement | null): boolean {
  const doc = document as WebkitDocument;
  if (!doc.fullscreenEnabled && !doc.webkitFullscreenEnabled) return false;
  if (!element) return false;
  const el = element as WebkitElement;
  return typeof el.requestFullscreen === 'function' || typeof el.webkitRequestFullscreen === 'function';
}

// True when the page runs as an app added to the home screen (#1127). iOS Safari reports it with
// `navigator.standalone` as well as the media query.
function runsStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  if (nav.standalone) return true;
  return typeof window.matchMedia === 'function' && Boolean(window.matchMedia('(display-mode: standalone)')?.matches);
}

// What the fullscreen button does (#1127): `fullscreen` toggles fullscreen, `homeScreen` shows how
// to add the app to the home screen, and `none` hides the button. An installed app with no
// Fullscreen API hides it, because it already shows no browser bars.
export type FullscreenButtonMode = 'none' | 'fullscreen' | 'homeScreen';

function fullscreenElement(): Element | null {
  const doc = document as WebkitDocument;
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

// Puts `element` into fullscreen and takes it out again. `isFullscreen` follows
// `fullscreenchange`, so it is right after the player leaves with Escape or a system gesture too.
export function useFullscreen(element: HTMLElement | null) {
  // False on the server and on the first render, so the pre-rendered page has no button.
  const [enabled, setEnabled] = useState(false);
  const [standalone, setStandalone] = useState<boolean | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    setEnabled(fullscreenEnabled(element));
    // Unknown until the element mounts, so the button does not show the wrong mode for a render.
    setStandalone(element ? runsStandalone() : null);
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

  const mode: FullscreenButtonMode = enabled ? 'fullscreen' : standalone === false ? 'homeScreen' : 'none';

  return { enabled, mode, isFullscreen, toggle };
}
