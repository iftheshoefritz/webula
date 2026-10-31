import { render, screen } from '@testing-library/react';
import { DriveModalShell } from '../../components/drivePicker/DriveModalShell';

describe('DriveModalShell', () => {
  // #1396: the box was a fraction of the screen, a third of it at `lg`, so an iPad mini drew it
  // about 375 px wide. It is 11/12 of the screen now, capped at 36rem.
  it('sizes the box to 11/12 of the screen, capped at max-w-xl, with no screen fractions', () => {
    render(
      <DriveModalShell title="Load deck" onClose={jest.fn()} testId="shell">
        <p>content</p>
      </DriveModalShell>,
    );
    const box = screen.getByText('content').parentElement!;
    expect(box).toHaveClass('w-11/12', 'max-w-xl');
    expect(box).not.toHaveClass('lg:w-1/3');
    expect(box).not.toHaveClass('md:w-1/2');
    expect(box).not.toHaveClass('sm:w-3/4');
  });
});
