import { render, screen, act } from '@testing-library/react';
import { PreviewBanner } from '../../components/PreviewBanner';

describe('PreviewBanner', () => {
  const originalHostname = window.location.hostname;

  function setHostname(hostname: string) {
    Object.defineProperty(window, 'location', {
      value: { ...window.location, hostname },
      writable: true,
    });
  }

  afterEach(() => {
    setHostname(originalHostname);
  });

  it('shows the banner on a .vercel.app hostname', async () => {
    setHostname('webula-git-feature-fritz-s-team.vercel.app');

    await act(async () => {
      render(<PreviewBanner />);
    });

    expect(screen.getByText('Preview links:')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '/decks' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '/decks?fixture=1' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '/api/auth/signin' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '/api/auth/signout' })).toBeInTheDocument();
  });

  it('does not show the banner on the production hostname', async () => {
    setHostname('webula.app');

    await act(async () => {
      render(<PreviewBanner />);
    });

    expect(screen.queryByText('Preview links:')).not.toBeInTheDocument();
  });

  it('does not show the banner on localhost', async () => {
    setHostname('localhost');

    await act(async () => {
      render(<PreviewBanner />);
    });

    expect(screen.queryByText('Preview links:')).not.toBeInTheDocument();
  });
});
