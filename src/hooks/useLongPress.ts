import { useCallback, useRef } from "react";

type LongPressCallback = (x: number, y: number) => void;

type LongPressHandlers = {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
};

export function useLongPress(
  callback: LongPressCallback,
  threshold = 500,
): LongPressHandlers {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startPosRef.current = null;
  }, []);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.touches[0];
      const x = touch.clientX;
      const y = touch.clientY;
      startPosRef.current = { x, y };
      timerRef.current = setTimeout(() => {
        callback(x, y);
        timerRef.current = null;
      }, threshold);
    },
    [callback, threshold],
  );

  const onTouchEnd = useCallback(
    (_e: React.TouchEvent) => {
      cancel();
    },
    [cancel],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!startPosRef.current) return;
      const touch = e.touches[0];
      const dx = Math.abs(touch.clientX - startPosRef.current.x);
      const dy = Math.abs(touch.clientY - startPosRef.current.y);
      // Cancel if moved more than 10px
      if (dx > 10 || dy > 10) {
        cancel();
      }
    },
    [cancel],
  );

  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      callback(e.clientX, e.clientY);
    },
    [callback],
  );

  return { onTouchStart, onTouchEnd, onTouchMove, onContextMenu };
}
