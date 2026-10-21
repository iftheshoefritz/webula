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
// `navigator.standalone` as well as the media query. The manifest asks for `fullscreen`, which iOS
// opens as `standalone` and other browsers may report as asked (#1155).
export function runsStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  if (nav.standalone) return true;
  if (typeof window.matchMedia !== 'function') return false;
  return ['(display-mode: standalone)', '(display-mode: fullscreen)'].some((query) =>
    Boolean(window.matchMedia(query)?.matches)
  );
}

// True on iOS and iPadOS (#1127). iPadOS Safari reports a Mac, so a Mac with touch points counts.
export function runsOnIos(userAgent: string, maxTouchPoints = 0): boolean {
  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

// True where the browser draws its own fullscreen controls, a close X and a shrink button, over the
// top-left corner of a fullscreen element (#1207): iPadOS, in every browser, since all run WebKit.
// The page cannot move them, so the corner column moves below them while the table is fullscreen.
// iPhone has no element fullscreen for a `<div>`, so it never gets that far.
export function drawsSystemFullscreenControls(): boolean {
  return runsOnIos(navigator.userAgent, navigator.maxTouchPoints);
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
  // False on the server and on the first render too, so the pre-rendered page matches (#1207).
  const [systemControlsInset, setSystemControlsInset] = useState(false);

  useEffect(() => {
    setEnabled(fullscreenEnabled(element));
    // Unknown until the element mounts, so the button does not show the wrong mode for a render.
    setStandalone(element ? runsStandalone() : null);
    setSystemControlsInset(drawsSystemFullscreenControls());
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

  return { enabled, mode, standalone, isFullscreen, systemControlsInset, toggle };
}
