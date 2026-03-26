import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CardDef } from "../types";

type SharePopupProps = {
  card: CardDef;
  x: number;
  y: number;
  onDismiss: () => void;
};

export default function SharePopup({ card, x, y, onDismiss }: SharePopupProps) {
  const [copied, setCopied] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideTouch = (e: TouchEvent | MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onDismiss();
      }
    };
    document.addEventListener("touchstart", handleOutsideTouch);
    document.addEventListener("mousedown", handleOutsideTouch);
    return () => {
      document.removeEventListener("touchstart", handleOutsideTouch);
      document.removeEventListener("mousedown", handleOutsideTouch);
    };
  }, [onDismiss]);

  const handleCopy = async () => {
    const url =
      window.location.origin +
      window.location.pathname +
      "?q=collectorsinfo:" +
      encodeURIComponent(card.collectorsinfo);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => {
        onDismiss();
      }, 1500);
    } catch {
      // Fallback: show the URL in a prompt
      window.prompt("Copy this link:", url);
      onDismiss();
    }
  };

  // Position popup so it stays within the viewport
  const popupWidth = 160;
  const popupHeight = 60;
  const margin = 8;
  const left = Math.min(x + margin, window.innerWidth - popupWidth - margin);
  const top = Math.min(y + margin, window.innerHeight - popupHeight - margin);

  return createPortal(
    <div
      ref={popupRef}
      style={{ position: "fixed", left, top, zIndex: 1000 }}
      className="bg-gray-900 border border-white/20 rounded-lg shadow-xl px-3 py-2 flex flex-col items-center gap-1"
    >
      {copied ? (
        <span className="text-green-400 text-sm font-medium">Copied!</span>
      ) : (
        <button
          onClick={handleCopy}
          className="flex items-center gap-2 text-white text-sm font-medium hover:text-blue-400 transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-4 h-4"
          >
            <path d="M12.232 4.232a2.5 2.5 0 0 1 3.536 3.536l-1.225 1.224a.75.75 0 0 0 1.061 1.06l1.224-1.224a4 4 0 0 0-5.656-5.656l-3 3a4 4 0 0 0 .225 5.865.75.75 0 0 0 .977-1.138 2.5 2.5 0 0 1-.142-3.667l3-3Z" />
            <path d="M11.603 7.963a.75.75 0 0 0-.977 1.138 2.5 2.5 0 0 1 .142 3.667l-3 3a2.5 2.5 0 0 1-3.536-3.536l1.225-1.224a.75.75 0 0 0-1.061-1.06l-1.224 1.224a4 4 0 1 0 5.656 5.656l3-3a4 4 0 0 0-.225-5.865Z" />
          </svg>
          Copy link
        </button>
      )}
    </div>,
    document.body,
  );
}
