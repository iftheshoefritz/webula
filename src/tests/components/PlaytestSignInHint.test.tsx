const mockUseSession = jest.fn();
const mockSignIn = jest.fn();
jest.mock('next-auth/react', () => ({
  useSession: () => mockUseSession(),
  signIn: (...args: unknown[]) => mockSignIn(...args),
}));

import { fireEvent, render, screen } from '@testing-library/react';
import PlaytestSignInHint from '../../components/PlaytestSignInHint';
import { showPlaytestSignIn } from '../../lib/playtestDevice';

beforeEach(() => {
  localStorage.clear();
  mockSignIn.mockReset();
});

describe('showPlaytestSignIn (#1660)', () => {
  it('shows only on a playtester device, signed out and online', () => {
    expect(showPlaytestSignIn(true, 'unauthenticated', true)).toBe(true);
    expect(showPlaytestSignIn(false, 'unauthenticated', true)).toBe(false);
    expect(showPlaytestSignIn(true, 'authenticated', true)).toBe(false);
    expect(showPlaytestSignIn(true, 'loading', true)).toBe(false);
    expect(showPlaytestSignIn(true, 'unauthenticated', false)).toBe(false);
  });
});

describe('PlaytestSignInHint (#1660)', () => {
  it('never shows without the device flag', () => {
    mockUseSession.mockReturnValue({ status: 'unauthenticated', data: null });
    render(<PlaytestSignInHint />);
    expect(screen.queryByTestId('playtest-sign-in')).toBeNull();
    expect(document.body.textContent).not.toMatch(/playtest/i);
  });

  it('does not show to a signed-in user with the flag', () => {
    localStorage.setItem('playtest-device', '1');
    mockUseSession.mockReturnValue({ status: 'authenticated', data: { user: { email: 'a@b.c' } } });
    render(<PlaytestSignInHint />);
    expect(screen.queryByTestId('playtest-sign-in')).toBeNull();
  });

  it('shows with the flag while signed out, and signs in back to the same page', () => {
    localStorage.setItem('playtest-device', '1');
    mockUseSession.mockReturnValue({ status: 'unauthenticated', data: null });
    render(<PlaytestSignInHint />);
    expect(screen.getByTestId('playtest-sign-in')).toHaveTextContent('You may need to sign in to see playtest cards');
    fireEvent.click(screen.getByRole('button', { name: /sign in with google/i }));
    expect(mockSignIn).toHaveBeenCalledWith('google', { callbackUrl: window.location.href });
  });
});
