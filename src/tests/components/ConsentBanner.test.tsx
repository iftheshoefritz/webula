import React from 'react';
import { act, render, screen } from '@testing-library/react';
import ConsentBanner from '../../components/ConsentBanner';

jest.mock('next/link', () => {
  return function MockLink({ children, href }: { children: React.ReactNode; href: string }) {
    return <a href={href}>{children}</a>;
  };
});

describe('ConsentBanner', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    localStorage.clear();
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_VERCEL_ENV;
    delete process.env.NEXT_PUBLIC_AGENT_BROWSER;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  const renderBanner = async () => {
    await act(async () => {
      render(<ConsentBanner />);
    });
  };

  it('shows the banner to a visitor who has not answered', async () => {
    await renderBanner();

    expect(screen.getByRole('button', { name: 'Accept' })).toBeInTheDocument();
  });

  it('does not show the banner to a visitor who has answered', async () => {
    localStorage.setItem('analytics_consent', 'false');

    await renderBanner();

    expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument();
  });

  it('does not show the banner on a Vercel preview deployment', async () => {
    process.env.NEXT_PUBLIC_VERCEL_ENV = 'preview';

    await renderBanner();

    expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument();
  });

  it('does not show the banner when NEXT_PUBLIC_AGENT_BROWSER is 1', async () => {
    process.env.NEXT_PUBLIC_AGENT_BROWSER = '1';

    await renderBanner();

    expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument();
  });

  it('shows the banner on a production deployment', async () => {
    process.env.NEXT_PUBLIC_VERCEL_ENV = 'production';

    await renderBanner();

    expect(screen.getByRole('button', { name: 'Accept' })).toBeInTheDocument();
  });
});
