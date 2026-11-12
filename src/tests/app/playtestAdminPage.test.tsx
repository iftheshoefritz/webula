import { render, screen } from '@testing-library/react';

const mockEmail = jest.fn();
jest.mock('../../lib/pageCallerEmail', () => ({ pageCallerEmail: () => mockEmail() }));
jest.mock('../../lib/loadCards', () => ({ loadCards: () => ({ data: [{ originalName: 'A Real Card Name' }], columns: [] }) }));
jest.mock('../../lib/playtestAdminFixture', () => ({
  playtestAdminFixtureAllowed: () => false,
  playtestAdminFixtureApi: jest.fn(),
}));
jest.mock('../../lib/playtestStore', () => ({ getPlaytestStore: jest.fn() }));
const mockNotFound = jest.fn(() => { throw new Error('NEXT_NOT_FOUND'); });
jest.mock('next/navigation', () => ({ notFound: () => mockNotFound() }));
jest.mock('next-auth/react', () => ({ signIn: jest.fn() }));
jest.mock('../../components/PlaytestAdminClient', () => ({
  __esModule: true,
  default: ({ realNames }: { realNames: string[] }) => <div data-testid="admin">{realNames.join(',')}</div>,
  PlaytestAdminSignIn: () => <button data-testid="playtest-admin-sign-in">Sign in with Google</button>,
}));

import PlaytestAdminPage from '../../app/playtest/admin/page';

const page = async (fixture?: string) =>
  render(await PlaytestAdminPage({ searchParams: Promise.resolve(fixture ? { fixture } : {}) }));

beforeEach(() => { process.env.PLAYTEST_ADMIN_EMAILS = 'owner@example.com'; });
afterEach(() => { delete process.env.PLAYTEST_ADMIN_EMAILS; });

describe('/playtest/admin', () => {
  it('shows a signed-out visitor the sign-in button and nothing else', async () => {
    mockEmail.mockResolvedValue(null);
    await page();
    expect(screen.getByTestId('playtest-admin-sign-in')).toBeInTheDocument();
    expect(screen.queryByTestId('admin')).toBeNull();
  });

  it('gives a signed-in visitor who is not an owner the 404 page', async () => {
    mockEmail.mockResolvedValue('someone@example.com');
    await expect(page()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(mockNotFound).toHaveBeenCalled();
  });

  it('ignores fixture=1 where the fixture is not allowed', async () => {
    mockEmail.mockResolvedValue('someone@example.com');
    await expect(page('1')).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('shows an owner the page, with the names of the real cards', async () => {
    mockEmail.mockResolvedValue('Owner@Example.com');
    await page();
    expect(screen.getByTestId('admin')).toHaveTextContent('A Real Card Name');
  });
});
