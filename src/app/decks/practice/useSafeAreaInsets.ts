import { useEffect, useState } from 'react';

// Issue #1383: the safe-area insets of the screen, in CSS px. The practice route sets
// `viewport-fit=cover` (`page.tsx`), so on an iPhone the table draws under the home indicator and
// the rounded corners, and `env(safe-area-inset-*)` gives the parts of the screen it must keep
// clear. Headless Chromium, a desktop, Android, and every page without `viewport-fit=cover` give 0
// on every side, so every consumer reduces to the numbers it had before.
export type SafeAreaInsets = { top: number; right: number; bottom: number; left: number };

export const NO_SAFE_AREA_INSETS: SafeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 };

// A computed padding, such as `'34px'`, as a number. 0 when it does not parse.
export function parseInsetPx(value: string | null | undefined): number {
  const parsed = parseFloat(value ?? '');
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

// The insets read from the computed paddings of a probe whose padding is `env(...)`.
export function insetsFromStyle(style: Pick<CSSStyleDeclaration, 'paddingTop' | 'paddingRight' | 'paddingBottom' | 'paddingLeft'>): SafeAreaInsets {
  return {
    top: parseInsetPx(style.paddingTop),
    right: parseInsetPx(style.paddingRight),
    bottom: parseInsetPx(style.paddingBottom),
    left: parseInsetPx(style.paddingLeft),
  };
}

function sameInsets(a: SafeAreaInsets, b: SafeAreaInsets): boolean {
  return a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left;
}

// Mounts a hidden probe element whose padding is the four insets, reads them through
// `getComputedStyle`, and reads them again on `resize` and `orientationchange`: the insets swap
// sides when the phone turns. 0 on every side before mount and in jsdom, which has no `env()`.
export function useSafeAreaInsets(): SafeAreaInsets {
  const [insets, setInsets] = useState<SafeAreaInsets>(NO_SAFE_AREA_INSETS);

  useEffect(() => {
    const probe = document.createElement('div');
    probe.setAttribute('aria-hidden', 'true');
    probe.dataset.testid = 'safe-area-probe';
    probe.style.cssText =
      'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
      'padding-top:env(safe-area-inset-top);padding-right:env(safe-area-inset-right);' +
      'padding-bottom:env(safe-area-inset-bottom);padding-left:env(safe-area-inset-left);';
    document.body.appendChild(probe);
    const measure = () => {
      const next = insetsFromStyle(getComputedStyle(probe));
      setInsets((current) => (sameInsets(current, next) ? current : next));
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
      probe.remove();
    };
  }, []);

  return insets;
}
