'use client';

import { useEffect, useRef } from 'react';

interface BookmarkletLinkProps {
  href: string;
  className?: string;
  children: React.ReactNode;
}

// React blocks `javascript:` URLs passed through the `href` prop as an XSS
// precaution, even for legitimate bookmarklets. Setting the attribute
// imperatively via a ref bypasses that JSX prop-diffing check.
export default function BookmarkletLink({ href, className, children }: BookmarkletLinkProps) {
  const ref = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.href = href;
    }
  }, [href]);

  return (
    <a ref={ref} className={className}>
      {children}
    </a>
  );
}
