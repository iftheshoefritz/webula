import { useEffect, useRef, useState } from 'react';

interface UseScrollVisibilityOptions {
  hideDelay?: number;
  target?: React.RefObject<HTMLElement>;
  suspended?: boolean;
}

function useScrollVisibility({ hideDelay = 3000, target, suspended = false }: UseScrollVisibilityOptions = {}): boolean {
  const [isVisible, setIsVisible] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // When suspended (e.g. a popover is open), cancel any pending hide timer so the
  // overlay stays visible until the user resumes scrolling.
  useEffect(() => {
    if (suspended && timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, [suspended]);

  useEffect(() => {
    // No initial hide timer — the overlay stays visible until the user first scrolls down.

    const handleScroll = () => {
      const scrollPos = target?.current ? target.current.scrollTop : window.scrollY;

      setIsVisible(true);

      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      // Only schedule hiding when the page is scrolled down from the top and nothing
      // is holding visibility open (e.g. an open popover).
      if (scrollPos > 0 && !suspended) {
        timerRef.current = setTimeout(() => {
          setIsVisible(false);
        }, hideDelay);
      }
    };

    const element = target?.current ?? window;
    element.addEventListener('scroll', handleScroll);

    return () => {
      element.removeEventListener('scroll', handleScroll);
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, [hideDelay, target, suspended]);

  return isVisible;
}

export default useScrollVisibility;
