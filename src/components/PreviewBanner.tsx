'use client';

import { useState, useEffect } from 'react';

export function PreviewBanner() {
  const [isPreview, setIsPreview] = useState(false);

  useEffect(() => {
    setIsPreview(window.location.hostname.endsWith('.vercel.app'));
  }, []);

  if (!isPreview) return null;

  return (
    <div className="bg-yellow-100 border-b border-yellow-300 px-4 py-2 text-sm flex gap-4 flex-wrap">
      <span className="font-semibold text-yellow-800">Preview links:</span>
      <a href="/decks" className="text-blue-700 underline hover:text-blue-900">/decks</a>
      <a href="/decks?fixture=1" className="text-blue-700 underline hover:text-blue-900">/decks?fixture=1</a>
      <a href="/api/auth/signin" className="text-blue-700 underline hover:text-blue-900">/api/auth/signin</a>
      <a href="/api/auth/signout" className="text-blue-700 underline hover:text-blue-900">/api/auth/signout</a>
    </div>
  );
}
