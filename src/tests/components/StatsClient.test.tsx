let mockSearchParams = new URLSearchParams();
jest.mock('next/navigation', () => ({ useSearchParams: () => mockSearchParams }));

let mockStatus = 'unauthenticated';
const mockSignIn = jest.fn();
const mockSignOut = jest.fn();
jest.mock('next-auth/react', () => ({
  useSession: () => ({ status: mockStatus, data: null }),
  signIn: (...args: unknown[]) => mockSignIn(...args),
  signOut: (...args: unknown[]) => mockSignOut(...args),
}));

jest.mock('react-chartjs-2', () => ({ Line: () => <div data-testid="line-chart" /> }));

jest.mock('next/link', () =>
  function MockLink({ children, href }: { children: React.ReactNode; href: string }) {
    return <a href={href}>{children}</a>;
  }
);

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import StatsClient from '../../components/StatsClient';
import { STATS_FIXTURE } from '../../lib/statsFixture';

const env = process.env as Record<string, string | undefined>;

describe('StatsClient (#1417)', () => {
  const originalEnv = env.NODE_ENV;
  let fetchMock: jest.Mock;
  beforeEach(() => {
    mockSearchParams = new URLSearchParams();
    mockStatus = 'unauthenticated';
    mockSignIn.mockReset();
    mockSignOut.mockReset();
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => { env.NODE_ENV = originalEnv; });

  it('shows no stats and calls no route for a signed-out user', async () => {
    await act(async () => { render(<StatsClient />); });
    expect(screen.getByTestId('stats-denied')).toBeInTheDocument();
    expect(screen.queryByTestId('stats-view')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows no stats when the route answers 404', async () => {
    mockStatus = 'authenticated';
    fetchMock.mockResolvedValue({ ok: false, status: 404 });
    await act(async () => { render(<StatsClient />); });
    expect(fetchMock).toHaveBeenCalledWith('/api/stats', expect.anything());
    expect(screen.getByTestId('stats-denied')).toBeInTheDocument();
    expect(screen.queryByTestId('stats-view')).not.toBeInTheDocument();
  });

  it('offers a Google sign-in that returns to /stats to a signed-out user (#1442)', async () => {
    await act(async () => { render(<StatsClient />); });
    expect(screen.queryByTestId('stats-switch-account')).not.toBeInTheDocument();
    const button = screen.getByTestId('stats-sign-in');
    expect(button).toHaveTextContent('Sign in with Google');
    fireEvent.click(button);
    expect(mockSignIn).toHaveBeenCalledWith('google', { callbackUrl: '/stats' });
  });

  it('offers a signed-in user who is not early-access another account, not a sign-in (#1442)', async () => {
    mockStatus = 'authenticated';
    fetchMock.mockResolvedValue({ ok: false, status: 404 });
    await act(async () => { render(<StatsClient />); });
    expect(screen.getByTestId('stats-denied')).toHaveTextContent('Stats are for early-access users.');
    expect(screen.queryByTestId('stats-sign-in')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('stats-switch-account'));
    expect(mockSignOut).toHaveBeenCalledWith({ callbackUrl: '/stats' });
  });

  it('shows the stats the route returns to an early-access user', async () => {
    mockStatus = 'authenticated';
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => STATS_FIXTURE });
    await act(async () => { render(<StatsClient />); });
    expect(screen.getByTestId('stats-view')).toBeInTheDocument();
    expect(screen.getByText('Claude Issue Implementation')).toBeInTheDocument();
    expect(screen.getByText('typecheck')).toBeInTheDocument();
    const link = screen.getByText(`#${STATS_FIXTURE.slowestIssues[0].number}`);
    expect(link).toHaveAttribute('href', STATS_FIXTURE.slowestIssues[0].url);
  });

  it('renders the fixture with ?fixture=1 in development, without the route', async () => {
    env.NODE_ENV = 'development';
    mockSearchParams = new URLSearchParams('fixture=1');
    await act(async () => { render(<StatsClient />); });
    expect(screen.getByTestId('stats-view')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never renders the fixture in production', async () => {
    env.NODE_ENV = 'production';
    mockSearchParams = new URLSearchParams('fixture=1');
    await act(async () => { render(<StatsClient />); });
    expect(screen.queryByTestId('stats-view')).not.toBeInTheDocument();
    expect(screen.getByTestId('stats-denied')).toBeInTheDocument();
  });
});
