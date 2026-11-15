import React from 'react';
import { FaSignInAlt } from 'react-icons/fa';

type Props = {
  isSignedIn: boolean
  hasDriveScope: boolean
  onSignIn: () => void
  /** The Google refresh failed, so the signed-in user signs in again for Drive. */
  driveAccessExpired?: boolean
}

// The row that asks for a sign-in, or for Drive access, before a picker can list anything. It
// renders nothing once both are there, so the caller renders its list. No "Google Drive" heading
// sits above it (#1109): the button says it is Google Drive.
export const DriveSignInRows: React.FC<Props> = ({ isSignedIn, hasDriveScope, onSignIn, driveAccessExpired = false }) => {
  if (isSignedIn && hasDriveScope) return null;
  return (
    <li className="text-text-primary py-2 px-3">
      <button className="btn-primary" onClick={onSignIn}>
        <FaSignInAlt className="inline mr-2" />
        {!isSignedIn || driveAccessExpired
          ? 'Sign in with Google to load Drive decks'
          : 'Grant Google Drive access'}
      </button>
    </li>
  );
};
