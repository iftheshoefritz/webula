import { execFileSync } from 'child_process';
import path from 'path';

const script = path.join(process.cwd(), 'scripts', 'classify_agent_failure.sh');
const fixtures = path.join(__dirname, 'fixtures');

function classify(fixture: string): Record<string, string> {
  const stdout = execFileSync('bash', [script, '0'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      GITHUB_REPOSITORY: 'iftheshoefritz/webula',
      CLASSIFY_LOG_FILE: path.join(fixtures, fixture),
    },
  });
  const out: Record<string, string> = {};
  for (const line of stdout.split('\n')) {
    const match = line.match(/^(reason|target|target_type)=(.*)$/);
    if (match) out[match[1]] = match[2];
  }
  return out;
}

describe('classify_agent_failure.sh', () => {
  it('calls a usage rate limit a rate limit', () => {
    const out = classify('rate-limit.log');
    expect(out.reason).toBe('rate-limit');
    expect(out.target).toBe('657');
    expect(out.target_type).toBe('pr');
  });

  it('still calls a failure after a clean Claude run a post-run-step failure', () => {
    const out = classify('post-run-step.log');
    expect(out.reason).toBe('post-run-step');
  });
});
