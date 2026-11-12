// Every card row, name, image and email here is invented: no test holds a real playtest card.

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import PlaytestAdminClient, { PlaytestUpload, type PlaytestAdminApi } from '../../components/PlaytestAdminClient';
import { PLAYTEST_COLUMNS } from '../../lib/playtestCards';
import { makeZip } from '../fixtures/makeZip';

jest.mock('next-auth/react', () => ({ signIn: jest.fn() }));

// jsdom has no TextDecoder; every browser and Node do.
beforeAll(() => {
  Object.assign(globalThis, { TextDecoder: jest.requireActual<typeof import('util')>('util').TextDecoder });
});

function row(name: string, collectorsInfo: string, imageFile: string, type: string, extra: Record<string, string> = {}): string {
  const fields: Record<string, string> = Object.fromEntries(PLAYTEST_COLUMNS.map((c) => [c, '']));
  Object.assign(fields, { Name: name, Set: 'Playtest', ImageFile: imageFile, CollectorsInfo: collectorsInfo, Type: type }, extra);
  return PLAYTEST_COLUMNS.map((c) => fields[c]).join('\t');
}
const tsvOf = (...rows: string[]) => [PLAYTEST_COLUMNS.join('\t'), ...rows].join('\n');

const GOOD_TSV = tsvOf(
  row('Invented Officer', '9201', 'PT9201', 'Personnel'),
  row('Invented Helper', '9202', 'PT9202', 'Personnel'),
  row('Invented Vessel', '9203', 'PT9203', 'Ship', { Class: 'Invented' }),
);
const zipOf = (...names: string[]) =>
  makeZip(names.map((name) => ({ name: `images/${name}`, data: new Uint8Array([0xff, 0xd8, 1, 2, 0xff, 0xd9]) })));

function fakeApi(): PlaytestAdminApi & { log: string[] } {
  const log: string[] = [];
  let emails = ['tester@example.com'];
  return {
    log,
    status: async () => ({ version: 5, uploadedAt: '2026-02-03T04:05:06.000Z', cards: 3, images: 3, emails }),
    sendImages: async (images) => { log.push(`images:${images.map((i) => i.imageFile).join(',')}`); },
    sendCards: async () => { log.push('cards'); },
    addEmail: async (email) => { log.push(`add:${email}`); emails = [...emails, email.toLowerCase()]; return emails; },
    removeEmail: async (email) => { log.push(`remove:${email}`); emails = emails.filter((e) => e !== email); return emails; },
  };
}

async function pick(tsv: string, zip: Uint8Array) {
  await act(async () => {
    fireEvent.change(screen.getByTestId('playtest-tsv-input'), { target: { files: [new File([tsv], 'cards.tsv')] } });
  });
  await act(async () => {
    fireEvent.change(screen.getByTestId('playtest-zip-input'), { target: { files: [new File([zip as Uint8Array<ArrayBuffer>], 'images.zip')] } });
  });
  await screen.findByTestId('playtest-preview');
}

describe('PlaytestUpload: the preview', () => {
  it('shows the cards by type, a missing image and an unused image, and an error disables Publish', async () => {
    render(<PlaytestUpload realNames={new Set()} api={fakeApi()} onPublished={() => {}} />);
    await pick(GOOD_TSV, zipOf('PT9201.jpg', 'PT9202.jpg', 'PT9999.jpg', 'notes.txt'));

    expect(screen.getByTestId('playtest-preview-count')).toHaveTextContent('3 card(s)');
    expect(screen.getByTestId('playtest-preview-type-personnel')).toHaveTextContent('personnel: 2');
    expect(screen.getByTestId('playtest-preview-type-ship')).toHaveTextContent('ship: 1');
    expect(within(screen.getByTestId('playtest-preview-missing')).getByText('PT9203')).toBeInTheDocument();
    expect(within(screen.getByTestId('playtest-preview-unused')).getByText('PT9999')).toBeInTheDocument();
    expect(within(screen.getByTestId('playtest-preview-warnings')).getByText(/does not end in " Class"/)).toBeInTheDocument();
    expect(screen.getByTestId('playtest-preview-errors')).toHaveTextContent('1 card image(s) are not in the zip');
    expect(screen.getByTestId('playtest-publish')).toBeDisabled();
  });

  it('lists a TSV error, such as the name of a real card, and disables Publish', async () => {
    render(<PlaytestUpload realNames={new Set(['Invented Helper'])} api={fakeApi()} onPublished={() => {}} />);
    await pick(GOOD_TSV, zipOf('PT9201.jpg', 'PT9202.jpg', 'PT9203.jpg'));
    expect(screen.getByTestId('playtest-preview-errors')).toHaveTextContent('Line 3 (Invented Helper): The name is the name of a real card');
    expect(screen.getByTestId('playtest-publish')).toBeDisabled();
  });

  it('publishes a clean upload: the images, then the cards', async () => {
    const api = fakeApi();
    const onPublished = jest.fn();
    render(<PlaytestUpload realNames={new Set()} api={api} onPublished={onPublished} />);
    await pick(GOOD_TSV, zipOf('PT9201.jpg', 'PT9202.jpg', 'PT9203.jpg'));
    expect(screen.queryByTestId('playtest-preview-errors')).toBeNull();
    const publish = screen.getByTestId('playtest-publish');
    expect(publish).toBeEnabled();
    await act(async () => { fireEvent.click(publish); });
    expect(api.log).toEqual(['images:PT9201,PT9202,PT9203', 'cards']);
    expect(onPublished).toHaveBeenCalled();
    expect(screen.getByTestId('playtest-publish-progress')).toHaveTextContent('Published 3 card(s) and 3 image(s)');
  });
});

describe('PlaytestAdminClient', () => {
  it('shows the current upload and the playtesters, and adds and removes one', async () => {
    const api = fakeApi();
    render(<PlaytestAdminClient realNames={[]} api={api} />);
    expect(await screen.findByTestId('playtest-status-version')).toHaveTextContent('5');
    expect(screen.getByTestId('playtest-status-cards')).toHaveTextContent('3');
    expect(screen.getByTestId('playtest-status-images')).toHaveTextContent('3');
    expect(screen.getAllByTestId('playtest-email-row')).toHaveLength(1);

    fireEvent.change(screen.getByTestId('playtest-email-input'), { target: { value: 'Second@Example.com' } });
    await act(async () => { fireEvent.click(screen.getByTestId('playtest-email-add')); });
    await waitFor(() => expect(screen.getAllByTestId('playtest-email-row')).toHaveLength(2));

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Remove tester@example.com' })); });
    await waitFor(() => expect(screen.getAllByTestId('playtest-email-row')).toHaveLength(1));
    expect(api.log).toEqual(['add:Second@Example.com', 'remove:tester@example.com']);
  });
});
