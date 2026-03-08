import { useEffect, useRef, useState } from 'react';

interface UseScrollVisibilityOptions {
  hideDelay?: number;
  target?: React.RefObject<HTMLElement>;
}

function useScrollVisibility({ hideDelay = 3000, target }: UseScrollVisibilityOptions = {}): boolean {
  const [isVisible, setIsVisible] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // No initial hide timer — the overlay stays visible until the user first scrolls down.

    const handleScroll = () => {
      const scrollPos = target?.current ? target.current.scrollTop : window.scrollY;

      setIsVisible(true);

      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      // Only schedule hiding when the page is scrolled down from the top.
      // When scrollPos === 0 the user is back at the top so the overlay stays visible.
      if (scrollPos > 0) {
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
  }, [hideDelay, target]);

  return isVisible;
}

export default useScrollVisibility;
