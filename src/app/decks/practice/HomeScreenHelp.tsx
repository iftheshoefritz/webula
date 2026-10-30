import React, { useEffect, useEffectEvent } from 'react';
import { LAYER_MODAL, LAYER_MODAL_BACKDROP } from '../../../lib/layers';
import { runsOnIos } from './useFullscreen';
import { safeModalMaxHeight, safeModalWidth } from './useSafeAreaInsets';

export type HomeScreenPlatform = 'iosSafari' | 'iosOther' | 'android' | 'other';

// The browser the instructions fit (#1127). Every iOS browser other than Safari names itself in
// the user agent.
export function homeScreenPlatform(userAgent: string, maxTouchPoints = 0): HomeScreenPlatform {
  if (runsOnIos(userAgent, maxTouchPoints)) return /CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(userAgent) ? 'iosOther' : 'iosSafari';
  if (/Android/.test(userAgent)) return 'android';
  return 'other';
}

const STEPS: Record<HomeScreenPlatform, string[]> = {
  iosSafari: ['Tap the Share button in the Safari toolbar.', 'Tap “Add to Home Screen”.', 'Open Webula from the home screen.'],
  iosOther: [
    'Tap the Share button of the browser, or open this page in Safari and tap its Share button.',
    'Tap “Add to Home Screen”.',
    'Open Webula from the home screen.',
  ],
  android: ['Open the browser menu (⋮).', 'Tap “Add to Home screen” or “Install app”.', 'Open Webula from the home screen.'],
  other: ['Open the browser menu.', 'Choose “Install” or “Add to Home Screen”.', 'Open Webula from there.'],
};

// Shown by the fullscreen button where the browser has no Fullscreen API (#1127), such as iPhone
// Safari: an app on the home screen plays without the browser's bars. A tap on the backdrop, the
// Close button or Escape closes it, the same as the Controls panel.
export default function HomeScreenHelp({ onClose }: { onClose: () => void }) {
  const platform = homeScreenPlatform(navigator.userAgent, navigator.maxTouchPoints);
  const onEscape = useEffectEvent(() => onClose());

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onEscape();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <>
      <button
        type="button"
        className={`fixed inset-0 ${LAYER_MODAL_BACKDROP} bg-black/40`}
        onClick={onClose}
        aria-label="Close home screen instructions"
      />
      <div
        role="dialog"
        aria-label="Add to Home Screen"
        data-testid="home-screen-help"
        data-platform={platform}
        className={`fixed left-1/2 top-1/2 ${LAYER_MODAL} -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-md border border-white/10 bg-bg-secondary p-3 shadow-lg`}
        style={{ maxHeight: safeModalMaxHeight(85), width: safeModalWidth('24rem') }}
      >
        <h2 className="text-sm font-semibold text-text-primary">Play without the browser bars</h2>
        <p className="mt-1 text-sm text-text-secondary">
          This browser cannot show the table fullscreen. Add Webula to your home screen to play it as an app.
        </p>
        <ol className="mt-2 list-decimal pl-5 text-sm text-text-secondary">
          {STEPS[platform].map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <div className="mt-3 flex justify-end">
          <button type="button" onClick={onClose} className="btn-primary">
            Close
          </button>
        </div>
      </div>
    </>
  );
}
