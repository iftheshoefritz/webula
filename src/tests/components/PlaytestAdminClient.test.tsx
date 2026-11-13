// Every set, card row, name, image and email here is invented: no test holds a real playtest card.

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import PlaytestAdminClient, { PlaytestUpload, type PlaytestAdminApi } from '../../components/PlaytestAdminClient';
import { PLAYTEST_COLUMNS } from '../../lib/playtestCards';
import type { PlaytestSetCards } from '../../lib/playtestUpload';
import { makeZip } from '../fixtures/makeZip';

jest.mock('next-auth/react', () => ({ signIn: jest.fn() }));

// jsdom has no TextDecoder; every browser and Node do.
beforeAll(() => {
  Object.assign(globalThis, { TextDecoder: jest.requireActual<typeof import('util')>('util').TextDecoder });
});

function row(name: string, collectorsInfo: string, imageFile: string, type: string, extra: Record<string, string> = {}): string {
  const fields: Record<string, string> = Object.fromEntries(PLAYTEST_COLUMNS.map((c) => [c, '']));
  Object.assign(fields, { Name: name, Set: 'TestSetA', ImageFile: imageFile, CollectorsInfo: collectorsInfo, Type: type }, extra);
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
    status: async () => ({
      sets: [
        { name: 'TestSetA', version: 5, uploadedAt: '2026-02-03T04:05:06.000Z', cards: 3, images: 3, cardNames: [], collectorsInfo: [] },
        { name: 'TestSetB', version: 1, uploadedAt: '2026-02-03T04:05:06.000Z', cards: 1, images: 1, cardNames: ['Invented B'], collectorsInfo: ['9301'] },
      ],
      legacyError: null,
      emails,
    }),
    sendImages: async (set, images) => { log.push(`images:${set}:${images.map((i) => i.imageFile).join(',')}`); },
    sendCards: async (_, replace) => { log.push(`cards:${replace ?? 'new set'}`); },
    removeSet: async (name) => { log.push(`removeSet:${name}`); },
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
    expect(api.log).toEqual(['images:TestSetA:PT9201,PT9202,PT9203', 'cards:new set']);
    expect(screen.getByTestId('playtest-preview-set')).toHaveTextContent('Set TestSetA: a new set');
    expect(onPublished).toHaveBeenCalled();
    expect(screen.getByTestId('playtest-publish-progress')).toHaveTextContent('Published 3 card(s) and 3 image(s)');
  });
});

describe('PlaytestUpload: the sets in testing (#1644)', () => {
  const inTesting: PlaytestSetCards[] = [
    { name: 'TestSetA', cardNames: ['Invented Officer'], collectorsInfo: ['9201'] },
    { name: 'TestSetB', cardNames: ['Invented B'], collectorsInfo: ['9301'] },
  ];

  it('replaces the set of the same name in testing', async () => {
    const api = fakeApi();
    render(<PlaytestUpload realNames={new Set()} sets={inTesting} api={api} onPublished={() => {}} />);
    await pick(GOOD_TSV, zipOf('PT9201.jpg', 'PT9202.jpg', 'PT9203.jpg'));
    expect(screen.getByTestId('playtest-preview-set')).toHaveTextContent('Set TestSetA: replaces TestSetA');
    await act(async () => { fireEvent.click(screen.getByTestId('playtest-publish')); });
    expect(api.log).toEqual(['images:TestSetA:PT9201,PT9202,PT9203', 'cards:TestSetA']);
  });

  it('pre-selects Replace of the same name, and lists New set and every set in testing (#1645)', async () => {
    render(<PlaytestUpload realNames={new Set()} sets={inTesting} api={fakeApi()} onPublished={() => {}} />);
    await pick(GOOD_TSV, zipOf('PT9201.jpg', 'PT9202.jpg', 'PT9203.jpg'));
    const choice = screen.getByTestId('playtest-replace-choice') as HTMLSelectElement;
    expect(choice.value).toBe('testseta');
    expect(Array.from(choice.options).map((o) => o.textContent)).toEqual(['New set', 'Replace TestSetA', 'Replace TestSetB']);
  });

  it('a new set of a name in testing is an error that disables Publish', async () => {
    render(<PlaytestUpload realNames={new Set()} sets={inTesting} api={fakeApi()} onPublished={() => {}} />);
    await pick(GOOD_TSV, zipOf('PT9201.jpg', 'PT9202.jpg', 'PT9203.jpg'));
    fireEvent.change(screen.getByTestId('playtest-replace-choice'), { target: { value: '' } });
    expect(screen.getByTestId('playtest-preview-set')).toHaveTextContent('Set TestSetA: a new set');
    expect(screen.getByTestId('playtest-preview-errors')).toHaveTextContent('The set TestSetA is already in testing');
    expect(screen.getByTestId('playtest-publish')).toBeDisabled();
  });

  it('publishes a set of another name that replaces the chosen set (#1645)', async () => {
    const api = fakeApi();
    const tsv = tsvOf(row('Invented B2', '9501', 'PT9501', 'Event', { Set: 'TestSetB2' }));
    render(<PlaytestUpload realNames={new Set()} sets={inTesting} api={api} onPublished={() => {}} />);
    await pick(tsv, zipOf('PT9501.jpg'));
    const choice = screen.getByTestId('playtest-replace-choice') as HTMLSelectElement;
    expect(choice.value).toBe('');
    fireEvent.change(choice, { target: { value: 'testsetb' } });
    expect(screen.getByTestId('playtest-preview-set')).toHaveTextContent('Set TestSetB2: replaces TestSetB');
    await act(async () => { fireEvent.click(screen.getByTestId('playtest-publish')); });
    expect(api.log).toEqual(['images:TestSetB2:PT9501', 'cards:TestSetB']);
  });

  it('disables Publish for a card name or a CollectorsInfo of another set in testing', async () => {
    const tsv = tsvOf(row('Invented B', '9401', 'PT9201', 'Personnel', { Set: 'TestSetC' }), row('Invented C', '9301', 'PT9202', 'Personnel', { Set: 'TestSetC' }));
    render(<PlaytestUpload realNames={new Set()} sets={inTesting} api={fakeApi()} onPublished={() => {}} />);
    await pick(tsv, zipOf('PT9201.jpg', 'PT9202.jpg'));
    const errors = screen.getByTestId('playtest-preview-errors');
    expect(errors).toHaveTextContent('Line 2 (Invented B): The name is used by a card of the playtest set TestSetB');
    expect(errors).toHaveTextContent('Line 3 (Invented C): The CollectorsInfo 9301 is used by a card of the playtest set TestSetB');
    expect(screen.getByTestId('playtest-publish')).toBeDisabled();
  });

  it('disables Publish for rows with two sets, and for the name of a real set', async () => {
    const { rerender } = render(<PlaytestUpload realNames={new Set()} sets={inTesting} api={fakeApi()} onPublished={() => {}} />);
    await pick(tsvOf(row('Invented X', '9401', 'PT9201', 'Event'), row('Invented Y', '9402', 'PT9202', 'Event', { Set: 'TestSetC' })), zipOf('PT9201.jpg', 'PT9202.jpg'));
    expect(screen.getByTestId('playtest-preview-errors')).toHaveTextContent('The rows name more than one Set: TestSetA, TestSetC');
    expect(screen.getByTestId('playtest-publish')).toBeDisabled();
    rerender(<PlaytestUpload realNames={new Set()} sets={[]} api={fakeApi()} onPublished={() => {}} />);
    await pick(tsvOf(row('Invented X', '9401', 'PT9201', 'Event', { Set: 'Playtest' })), zipOf('PT9201.jpg'));
    expect(screen.getByTestId('playtest-preview-errors')).toHaveTextContent('The Set Playtest is the name of a real set');
  });
});

describe('PlaytestAdminClient', () => {
  it('lists every set in testing, and removes one behind a confirm (#1645)', async () => {
    const api = fakeApi();
    render(<PlaytestAdminClient realNames={[]} api={api} />);
    const rows = await screen.findAllByTestId('playtest-status-set');
    expect(rows.map((r) => r.getAttribute('data-set'))).toEqual(['TestSetA', 'TestSetB']);
    expect(within(rows[0]).getByTestId('playtest-status-version')).toHaveTextContent('5');
    expect(within(rows[1]).getByTestId('playtest-status-cards')).toHaveTextContent('1');
    expect(within(rows[1]).getByTestId('playtest-status-images')).toHaveTextContent('1');

    fireEvent.click(within(rows[1]).getByRole('button', { name: 'Remove TestSetB' }));
    fireEvent.click(within(rows[1]).getByTestId('playtest-status-remove-cancel'));
    expect(api.log).toEqual([]);
    fireEvent.click(within(rows[1]).getByRole('button', { name: 'Remove TestSetB' }));
    await act(async () => { fireEvent.click(within(rows[1]).getByTestId('playtest-status-remove-confirm')); });
    expect(api.log).toEqual(['removeSet:TestSetB']);
  });

  it('shows the playtesters, and adds and removes one', async () => {
    const api = fakeApi();
    render(<PlaytestAdminClient realNames={[]} api={api} />);
    await screen.findAllByTestId('playtest-status-set');
    expect(screen.getAllByTestId('playtest-email-row')).toHaveLength(1);

    fireEvent.change(screen.getByTestId('playtest-email-input'), { target: { value: 'Second@Example.com' } });
    await act(async () => { fireEvent.click(screen.getByTestId('playtest-email-add')); });
    await waitFor(() => expect(screen.getAllByTestId('playtest-email-row')).toHaveLength(2));

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Remove tester@example.com' })); });
    await waitFor(() => expect(screen.getAllByTestId('playtest-email-row')).toHaveLength(1));
    expect(api.log).toEqual(['add:Second@Example.com', 'remove:tester@example.com']);
  });
});
