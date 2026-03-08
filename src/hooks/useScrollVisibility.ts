import { useEffect, useRef, useState } from 'react';

interface UseScrollVisibilityOptions {
  hideDelay?: number;
  target?: React.RefObject<HTMLElement>;
}

function useScrollVisibility({ hideDelay = 3000, target }: UseScrollVisibilityOptions = {}): boolean {
  const [isVisible, setIsVisible] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Start the hide timer immediately so the bar fades out if the user never scrolls.
    timerRef.current = setTimeout(() => {
      setIsVisible(false);
    }, hideDelay);

    const handleScroll = () => {
      setIsVisible(true);

      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }

      timerRef.current = setTimeout(() => {
        setIsVisible(false);
      }, hideDelay);
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
