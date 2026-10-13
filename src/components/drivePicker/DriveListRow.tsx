import React from 'react';

type Props = {
  /** The name shown, truncated, with the full name as its tooltip. Leave it out to fill the row with `children` alone. */
  name?: string
  /** The row's actions, after the name. */
  children?: React.ReactNode
}

export const DRIVE_LIST_ROW_CLASS = 'flex items-center text-text-primary py-1 px-1 hover:bg-white/[0.04] rounded transition-colors';

// One row of a Drive picker's list (#1109): a deck, a folder, or a link.
export const DriveListRow: React.FC<Props> = ({ name, children }) => (
  <li className={DRIVE_LIST_ROW_CLASS}>
    {name !== undefined && (
      <span className="flex-1 min-w-0 px-3 truncate" title={name}>{name}</span>
    )}
    {children}
  </li>
);
