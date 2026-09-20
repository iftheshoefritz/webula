import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const script = path.join(process.cwd(), 'scripts', 'replace_pr_section.sh');

let workdir: string;

beforeEach(() => {
  workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'replace-pr-section-'));
});

afterEach(() => {
  fs.rmSync(workdir, { recursive: true, force: true });
});

function run(body: string, heading: string, report: string, flags: string[] = []): string {
  const bodyFile = path.join(workdir, 'body.md');
  const reportFile = path.join(workdir, 'report.md');
  fs.writeFileSync(bodyFile, body);
  fs.writeFileSync(reportFile, report);
  return execFileSync('bash', [script, ...flags, '657', heading, reportFile], {
    encoding: 'utf8',
    env: { ...process.env, PR_BODY_FILE: bodyFile },
  });
}

const body = [
  'Closes #644',
  '',
  '## Summary',
  '',
  '- Added a thing.',
  '',
  '## Visual Verification',
  '',
  'Pending.',
  '',
  '## Test plan',
  '',
  '- `yarn test`',
  '',
].join('\n');

describe('replace_pr_section.sh', () => {
  it('keeps the Closes line and the Summary section', () => {
    const out = run(body, '## Visual Verification', 'Visited `/decks?fixture=1`.\n');
    expect(out).toContain('Closes #644');
    expect(out).toContain('## Summary');
    expect(out).toContain('- Added a thing.');
  });

  it('replaces only the text of the named section', () => {
    const out = run(body, '## Visual Verification', 'Visited `/decks?fixture=1`.\n');
    expect(out).toContain('Visited `/decks?fixture=1`.');
    expect(out).not.toContain('Pending.');
    expect(out).toContain('## Test plan');
    expect(out).toContain('- `yarn test`');
  });

  it('replaces a section that ends the body', () => {
    const last = 'Closes #644\n\n## Visual Verification\n\nPending.\n';
    const out = run(last, '## Visual Verification', 'All checks passed.\n');
    expect(out).toContain('Closes #644');
    expect(out).toContain('All checks passed.');
    expect(out).not.toContain('Pending.');
  });

  it('keeps every section that comes after the one it replaces', () => {
    const out = run(body, '## Summary', '- A new summary.\n');
    expect(out).toContain('- A new summary.');
    expect(out).toContain('## Visual Verification');
    expect(out).toContain('Pending.');
  });

  it('keeps a subheading inside the section it replaces', () => {
    const withSub = [
      'Closes #644',
      '',
      '## Visual Verification',
      '',
      '### Viewport',
      '',
      'Pending.',
      '',
      '## Test plan',
      '',
    ].join('\n');
    const out = run(withSub, '## Visual Verification', 'Done.\n');
    expect(out).not.toContain('### Viewport');
    expect(out).toContain('Done.');
    expect(out).toContain('## Test plan');
  });

  it('fails and writes nothing when the body holds no such heading', () => {
    expect(() => run(body, '## Dev Server Issues', 'text\n')).toThrow();
  });

  it('keeps the attribution footer when it replaces the last section', () => {
    const withFooter = [
      'Closes #644',
      '',
      '## Visual Verification',
      '',
      'Pending.',
      '',
      '\u{1F916} Generated with [Claude Code](https://claude.com/claude-code)',
      '',
      'https://claude.ai/code/session_abc',
      '',
    ].join('\n');
    const out = run(withFooter, '## Visual Verification', 'All checks passed.\n');
    expect(out).toContain('Closes #644');
    expect(out).toContain('All checks passed.');
    expect(out).not.toContain('Pending.');
    expect(out).toContain('\u{1F916} Generated with [Claude Code](https://claude.com/claude-code)');
    expect(out).toContain('https://claude.ai/code/session_abc');
  });

  it('adds a missing section before the attribution footer', () => {
    const withFooter = [
      'Closes #644',
      '',
      '## Summary',
      '',
      '- Added a thing.',
      '',
      '\u{1F916} Generated with [Claude Code](https://claude.com/claude-code)',
      '',
    ].join('\n');
    const out = run(withFooter, '## Dev Server Issues', 'The dev server did not start.\n', [
      '--add-if-missing',
    ]);
    expect(out.indexOf('## Dev Server Issues')).toBeLessThan(
      out.indexOf('\u{1F916} Generated with'),
    );
    expect(out).toContain('The dev server did not start.');
  });

  it('adds a missing section at the end with --add-if-missing', () => {
    const out = run(body, '## Dev Server Issues', 'The dev server did not start.\n', [
      '--add-if-missing',
    ]);
    expect(out).toContain('Closes #644');
    expect(out).toContain('## Test plan');
    expect(out).toContain('## Dev Server Issues');
    expect(out).toContain('The dev server did not start.');
    expect(out.indexOf('## Dev Server Issues')).toBeGreaterThan(out.indexOf('## Test plan'));
  });
});
