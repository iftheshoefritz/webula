'use client';

import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FaSignInAlt } from 'react-icons/fa';
import type { PlaytestImage } from '../lib/playtestStore';
import {
  bytesToBase64,
  imageBatches,
  playtestPreview,
  zipImages,
  type PlaytestPreview,
  type ZipImages,
} from '../lib/playtestUpload';
import { readZip } from '../lib/zipReader';

// The owner-only upload page of the playtest cards (#1613): the upload with its preview, the
// current upload, and the playtesters. The page renders this only for an owner; every route it
// calls checks the owner again.

export interface PlaytestAdminStatus {
  version: number;
  uploadedAt: string | null;
  cards: number;
  images: number;
  emails: string[];
}

/** The calls of the page, so a test and the dev fixture can run it with no network. */
export interface PlaytestAdminApi {
  status(): Promise<PlaytestAdminStatus>;
  sendImages(images: PlaytestImage[]): Promise<void>;
  sendCards(tsv: string): Promise<void>;
  addEmail(email: string): Promise<string[]>;
  removeEmail(email: string): Promise<string[]>;
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', ...init });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (typeof body?.error === 'string') message = body.error;
      const missing = body?.missingImages ?? body?.imageFiles;
      if (Array.isArray(missing)) message += `: ${missing.join(', ')}`;
    } catch {
      // No JSON body: the status names the failure.
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const fetchPlaytestAdminApi: PlaytestAdminApi = {
  status: () => call<PlaytestAdminStatus>('/api/playtest/admin/status'),
  async sendImages(images) {
    await call('/api/playtest/admin/images', json('POST', { images }));
  },
  async sendCards(tsv) {
    await call('/api/playtest/admin/cards', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: tsv });
  },
  addEmail: async (email) => (await call<{ emails: string[] }>('/api/playtest/admin/emails', json('POST', { email }))).emails,
  removeEmail: async (email) => (await call<{ emails: string[] }>('/api/playtest/admin/emails', json('DELETE', { email }))).emails,
};

function readFile(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

function Section({ title, children, testId }: { title: string; children: React.ReactNode; testId: string }) {
  return (
    <section className="mb-8" data-testid={testId}>
      <h2 className="text-lg font-semibold mb-2 text-white">{title}</h2>
      {children}
    </section>
  );
}

function List({ title, items, testId, tone }: { title: string; items: string[]; testId: string; tone: string }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-3" data-testid={testId}>
      <h3 className={`text-sm font-semibold ${tone}`}>{title} ({items.length})</h3>
      <ul className="mt-1 max-h-48 overflow-y-auto text-sm list-disc pl-5">
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
}

export function PlaytestPreviewView({ preview }: { preview: PlaytestPreview }) {
  return (
    <div className="mt-4 rounded border border-gray-600 p-3" data-testid="playtest-preview">
      <p data-testid="playtest-preview-count">{preview.result.cards} card(s)</p>
      <ul className="mt-1 text-sm" data-testid="playtest-preview-types">
        {preview.byType.map(({ type, count }) => (
          <li key={type} data-testid={`playtest-preview-type-${type}`}>{type}: {count}</li>
        ))}
      </ul>
      <List title="Errors" items={preview.errors} testId="playtest-preview-errors" tone="text-red-400" />
      <List title="Warnings" items={preview.warnings} testId="playtest-preview-warnings" tone="text-amber-400" />
      <List title="Cards with no image in the zip" items={preview.missingImages} testId="playtest-preview-missing" tone="text-red-400" />
      <List title="Images in the zip that no card names" items={preview.unusedImages} testId="playtest-preview-unused" tone="text-gray-300" />
    </div>
  );
}

export function PlaytestUpload({
  realNames,
  api,
  onPublished,
}: {
  realNames: Set<string>;
  api: PlaytestAdminApi;
  onPublished: () => void;
}) {
  const [tsv, setTsv] = useState<string | null>(null);
  const [zip, setZip] = useState<ZipImages | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  const preview = useMemo(
    () => (tsv !== null && zip !== null ? playtestPreview(tsv, zip, realNames) : null),
    [tsv, zip, realNames],
  );

  const pickTsv = async (file: File | undefined) => {
    setProgress(null);
    setTsv(file ? new TextDecoder().decode(await readFile(file)) : null);
  };
  const pickZip = async (file: File | undefined) => {
    setProgress(null);
    setZip(file ? zipImages(await readZip(new Uint8Array(await readFile(file)))) : null);
  };

  const publish = async () => {
    if (!preview?.canPublish || tsv === null || zip === null) return;
    setPublishing(true);
    try {
      const batches = imageBatches(preview.imagesToSend.map((imageFile) => ({
        imageFile,
        bytes: zip.images.get(imageFile)!.length,
      })));
      for (let i = 0; i < batches.length; i++) {
        setProgress(`Sending images: batch ${i + 1} of ${batches.length}`);
        await api.sendImages(batches[i].map((imageFile) => ({
          imageFile,
          base64: bytesToBase64(zip.images.get(imageFile)!),
        })));
      }
      setProgress('Sending the cards');
      await api.sendCards(tsv);
      setProgress(`Published ${preview.result.cards} card(s) and ${preview.imagesToSend.length} image(s)`);
      onPublished();
    } catch (error) {
      setProgress(`Publish failed: ${(error as Error).message}. Nothing was published.`);
    } finally {
      setPublishing(false);
    }
  };

  return (
    <Section title="Upload" testId="playtest-upload">
      <div className="flex flex-wrap gap-6 text-sm">
        <label className="flex flex-col gap-1">
          The playtest TSV
          <input type="file" accept=".tsv,.txt,text/tab-separated-values,text/plain" data-testid="playtest-tsv-input"
            onChange={(e) => pickTsv(e.target.files?.[0])} />
        </label>
        <label className="flex flex-col gap-1">
          images.zip
          <input type="file" accept=".zip,application/zip" data-testid="playtest-zip-input"
            onChange={(e) => pickZip(e.target.files?.[0])} />
        </label>
      </div>
      {preview && <PlaytestPreviewView preview={preview} />}
      <button
        className="btn-primary mt-4 disabled:opacity-50"
        data-testid="playtest-publish"
        disabled={!preview?.canPublish || publishing}
        onClick={publish}
      >
        Publish
      </button>
      {progress && <p className="mt-2 text-sm" data-testid="playtest-publish-progress">{progress}</p>}
    </Section>
  );
}

function CurrentUpload({ status }: { status: PlaytestAdminStatus }) {
  return (
    <Section title="The current upload" testId="playtest-status">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 text-sm">
        <dt>Version</dt><dd data-testid="playtest-status-version">{status.version}</dd>
        <dt>Uploaded</dt>
        <dd data-testid="playtest-status-uploaded-at">
          {status.uploadedAt ? new Date(status.uploadedAt).toLocaleString() : 'Never'}
        </dd>
        <dt>Cards</dt><dd data-testid="playtest-status-cards">{status.cards}</dd>
        <dt>Images</dt><dd data-testid="playtest-status-images">{status.images}</dd>
      </dl>
    </Section>
  );
}

function Playtesters({ emails, api, onChange }: { emails: string[]; api: PlaytestAdminApi; onChange: (emails: string[]) => void }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  const run = async (action: Promise<string[]>) => {
    setError(null);
    try {
      onChange(await action);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  };

  return (
    <Section title="Playtesters" testId="playtest-emails">
      <form
        className="flex gap-2 text-sm"
        onSubmit={async (e) => {
          e.preventDefault();
          if (email.trim() && await run(api.addEmail(email))) setEmail('');
        }}
      >
        <input
          type="email"
          className="rounded bg-gray-800 border border-gray-600 px-2 py-1 flex-1 max-w-sm"
          placeholder="name@example.com"
          aria-label="Playtester email"
          data-testid="playtest-email-input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button type="submit" className="btn-primary" data-testid="playtest-email-add">Add</button>
      </form>
      {error && <p className="mt-2 text-sm text-red-400" data-testid="playtest-email-error">{error}</p>}
      {emails.length === 0
        ? <p className="mt-2 text-sm text-gray-400">No playtesters yet. The owners always have access.</p>
        : (
          <ul className="mt-2 text-sm">
            {emails.map((row) => (
              <li key={row} className="flex items-center gap-3 py-0.5" data-testid="playtest-email-row">
                <span>{row}</span>
                <button
                  className="text-xs underline hover:text-white"
                  data-testid="playtest-email-remove"
                  aria-label={`Remove ${row}`}
                  onClick={() => run(api.removeEmail(row))}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
    </Section>
  );
}

type LoadState = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; status: PlaytestAdminStatus };

export default function PlaytestAdminClient({ realNames, api = fetchPlaytestAdminApi }: { realNames: string[]; api?: PlaytestAdminApi }) {
  const names = useMemo(() => new Set(realNames), [realNames]);
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api.status()
      .then((status) => { if (!cancelled) setState({ kind: 'ready', status }); })
      .catch((error: Error) => { if (!cancelled) setState({ kind: 'error', message: error.message }); });
    return () => { cancelled = true; };
  }, [api, reload]);

  const refresh = useCallback(() => setReload((n) => n + 1), []);
  const setEmails = (emails: string[]) =>
    setState((s) => (s.kind === 'ready' ? { kind: 'ready', status: { ...s.status, emails } } : s));

  return (
    <PlaytestAdminFrame>
      <PlaytestUpload realNames={names} api={api} onPublished={refresh} />
      {state.kind === 'loading' && <p className="text-gray-400">Loading…</p>}
      {state.kind === 'error' && (
        <p className="text-red-400" data-testid="playtest-status-error">The store could not be read: {state.message}</p>
      )}
      {state.kind === 'ready' && (
        <>
          <CurrentUpload status={state.status} />
          <Playtesters emails={state.status.emails} api={api} onChange={setEmails} />
        </>
      )}
    </PlaytestAdminFrame>
  );
}

function PlaytestAdminFrame({ title = 'Playtest cards', children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-page font-body text-text-primary">
      <div className="max-w-3xl mx-auto px-3 py-6 sm:px-4 sm:py-10">
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <h1 className="text-2xl font-bold text-white">{title}</h1>
          <Link href="/decks" className="text-sm underline hover:text-white">Deck builder</Link>
        </div>
        {children}
      </div>
    </div>
  );
}

/** A signed-out visitor: a plain Google sign-in, no Drive scope, back to this page (as `/stats`, #1442). */
export function PlaytestAdminSignIn() {
  return (
    <PlaytestAdminFrame title="Sign in">
      <button
        className="btn-primary"
        data-testid="playtest-admin-sign-in"
        onClick={() => signIn('google', { callbackUrl: '/playtest/admin' })}
      >
        <FaSignInAlt className="inline mr-2" />
        Sign in with Google
      </button>
    </PlaytestAdminFrame>
  );
}
