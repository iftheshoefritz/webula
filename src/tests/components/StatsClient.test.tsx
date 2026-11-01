let mockSearchParams = new URLSearchParams();
jest.mock('next/navigation', () => ({ useSearchParams: () => mockSearchParams }));

let mockStatus = 'unauthenticated';
jest.mock('next-auth/react', () => ({ useSession: () => ({ status: mockStatus, data: null }) }));

jest.mock('react-chartjs-2', () => ({ Line: () => <div data-testid="line-chart" /> }));

jest.mock('next/link', () =>
  function MockLink({ children, href }: { children: React.ReactNode; href: string }) {
    return <a href={href}>{children}</a>;
  }
);

import React from 'react';
import { act, render, screen } from '@testing-library/react';
import StatsClient from '../../components/StatsClient';
import { STATS_FIXTURE } from '../../lib/statsFixture';

const env = process.env as Record<string, string | undefined>;

describe('StatsClient (#1417)', () => {
  const originalEnv = env.NODE_ENV;
  let fetchMock: jest.Mock;
  beforeEach(() => {
    mockSearchParams = new URLSearchParams();
    mockStatus = 'unauthenticated';
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
