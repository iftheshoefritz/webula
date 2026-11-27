import { statSync } from 'fs';
import path from 'path';

// AGENTS.md is read by every agent on every task, so it holds only what its
// section "What goes in this file" allows. The budget counts bytes, not
// characters, and includes the block that `next dev` appends at the end.
const AGENTS_MD = path.join(__dirname, '..', '..', 'AGENTS.md');
const BUDGET_BYTES = 40 * 1024;

describe('AGENTS.md', () => {
  it('stays within its size budget', () => {
    const size = statSync(AGENTS_MD).size;
    if (size > BUDGET_BYTES) {
      throw new Error(
        `AGENTS.md is ${size} bytes, over its budget of ${BUDGET_BYTES} bytes. ` +
          'Follow its section "What goes in this file": move feature detail to a code ' +
          'comment, a test or a file in docs/, instead of raising the budget.',
      );
    }
  });
});
