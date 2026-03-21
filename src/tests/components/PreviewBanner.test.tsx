import { render, screen } from '@testing-library/react';
import { PreviewBanner } from '../../components/PreviewBanner';

describe('PreviewBanner', () => {
  it('shows the banner when isPreview is true', () => {
    render(<PreviewBanner isPreview={true} />);

    expect(screen.getByText('Preview links:')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '/decks' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '/decks?fixture=1' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '/api/auth/signin' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '/api/auth/signout' })).toBeInTheDocument();
  });

  it('does not show the banner when isPreview is false', () => {
    render(<PreviewBanner isPreview={false} />);

    expect(screen.queryByText('Preview links:')).not.toBeInTheDocument();
  });
});
