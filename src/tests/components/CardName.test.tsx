import { render, screen } from '@testing-library/react';
import CardName from '../../components/CardName';
import { versionSuffixOf } from '../../lib/cardCount';

// Invented cards (#1975).
describe('CardName', () => {
  it('shows the title and the subtitle apart, the subtitle muted', () => {
    const { container } = render(<CardName title="Zarn Tavik" subtitle="Restless Pilot" name="Zarn Tavik Restless Pilot" />);
    expect(screen.getByTestId('card-name-title')).toHaveTextContent('Zarn Tavik');
    const sub = screen.getByTestId('card-name-subtitle');
    expect(sub).toHaveTextContent('Restless Pilot');
    expect(sub).toHaveClass('text-text-muted');
    expect(container).toHaveTextContent('Zarn Tavik Restless Pilot');
  });

  it('shows the title alone when the subtitle is empty', () => {
    render(<CardName title="Quiet Harbor" subtitle="" name="Quiet Harbor" />);
    expect(screen.getByTestId('card-name-title')).toHaveTextContent('Quiet Harbor');
    expect(screen.queryByTestId('card-name-subtitle')).toBeNull();
  });

  it('puts the unique dot before the title', () => {
    const { container } = render(<CardName title="Zarn Tavik" subtitle="Restless Pilot" name="Zarn Tavik Restless Pilot" unique />);
    expect(container.textContent).toBe('·Zarn Tavik Restless Pilot');
  });

  it('keeps the version suffix after the subtitle, in the secondary style', () => {
    render(<CardName title="Zarn Tavik" subtitle="Restless Pilot" name="Zarn Tavik Restless Pilot *AP" />);
    expect(screen.getByTestId('card-name-subtitle')).toHaveTextContent('Restless Pilot *AP');
  });

  it('shows the suffix in the secondary style when there is no subtitle', () => {
    render(<CardName title="Quiet Harbor" subtitle="" name="quiet harbor *vp" />);
    expect(screen.getByTestId('card-name-title')).toHaveTextContent('Quiet Harbor');
    expect(screen.getByTestId('card-name-subtitle')).toHaveTextContent('*vp');
  });

  it('shows the name alone for a row with no title', () => {
    const { container } = render(<CardName name="Lost Card *VP" unique />);
    expect(container.textContent).toBe('·Lost Card *VP');
    expect(screen.queryByTestId('card-name-title')).toBeNull();
  });
});

describe('versionSuffixOf', () => {
  it('returns the suffix as written, or nothing', () => {
    expect(versionSuffixOf('Zarn Tavik *VAP')).toBe('*VAP');
    expect(versionSuffixOf('zarn tavik *a')).toBe('*a');
    expect(versionSuffixOf('Zarn Tavik')).toBe('');
  });
});
