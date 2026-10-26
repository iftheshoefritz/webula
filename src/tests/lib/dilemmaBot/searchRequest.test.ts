// Issue #1298: one function answers a search request, on the worker and on the main thread, and the
// practice table's `'table'` kind skips the baseline.
import { act, renderHook } from '@testing-library/react';
import { answerSearch, SearchRequest } from '../../../lib/dilemmaBot/searchRequest';
import { ThreadedSearchResponse, useSearchWorker } from '../../../lib/dilemmaBot/useSearchWorker';
import { chooseStack } from '../../../lib/dilemmaBot/search';
import { BOT_SKILLS, parseRequirementBranches } from '../../../lib/dilemmaBot/requirements';
import { BotAttempt, BotPersonnel } from '../../../lib/dilemmaBot/simulator';
import { DilemmaId } from '../../../lib/dilemmaBot/opponentPile';

const person = (k: number): BotPersonnel => ({
  name: `P${k}`,
  cost: 2,
  attrs: [5, 5, 5],
  skills: BOT_SKILLS.map((s) => (s === 'physics' || s === 'science' ? 1 : 0)),
});

const attempt: BotAttempt = {
  personnel: [1, 2, 3, 4].map(person),
  requirements: parseRequirementBranches('Physics, 2 Science')!,
  gameOnMission: 0,
  choice: 'best',
};
const drawn: DilemmaId[] = ['game', 'echoes', 'dice', 'pickOne'];
const request = (kind: SearchRequest['kind']): SearchRequest => ({ id: 7, kind, attempt, drawn, n: 4, seed: 3 });

describe('answerSearch (#1298)', () => {
  it("answers a 'table' request with chooseStack's best and no baseline", () => {
    const response = answerSearch(request('table'));

    expect(response.id).toBe(7);
    expect(response.kind).toBe('table');
    expect(response.result.best).toEqual(chooseStack(attempt, drawn, 4, 3).best);
    expect(response).not.toHaveProperty('baseline');
  });

  it("keeps the baseline of the lab's 'choose' and 'full'", () => {
    expect(answerSearch(request('choose')).baseline).toBeDefined();
    expect(answerSearch(request('full')).baseline).toBeDefined();
  });
});

describe('useSearchWorker (#1298)', () => {
  it("answers a 'table' request on the main thread when there is no Worker", () => {
    expect(typeof Worker).toBe('undefined');
    const responses: ThreadedSearchResponse[] = [];
    const { result } = renderHook(() => useSearchWorker((r) => responses.push(r), () => {}));

    act(() => result.current(request('table')));

    expect(responses).toHaveLength(1);
    expect(responses[0].thread).toBe('main');
    expect(responses[0].result.best).toEqual(chooseStack(attempt, drawn, 4, 3).best);
    expect(responses[0]).not.toHaveProperty('baseline');
  });
});
