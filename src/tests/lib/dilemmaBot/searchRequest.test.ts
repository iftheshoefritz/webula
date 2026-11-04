// Issue #1298: one function answers a search request, on the worker and on the main thread, and the
// practice table's `'table'` kind skips the baseline.
import { act, renderHook } from '@testing-library/react';
import { answerSearch, LabSearchRequest } from '../../../lib/dilemmaBot/searchRequest';
import { ThreadedSearchResponse, useSearchWorker } from '../../../lib/dilemmaBot/useSearchWorker';
import { choosePileStack } from '../../../lib/dilemmaBot/pile/search';
import { pileAttemptOf } from '../../../lib/dilemmaBot/pile/tableAttempt';
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
const request = (kind: LabSearchRequest['kind']): LabSearchRequest => ({ id: 7, kind, attempt, drawn, n: 4, seed: 3 });

// The practice table's request (#1508): the pile bot's attempt, over titles.
const pileAttempt = pileAttemptOf({
  cards: [1, 2, 3, 4].map((k) => ({ card: { type: 'personnel', name: `p${k}`, skills: 'Physics, Science', integrity: 5, cunning: 5, strength: 5, cost: 2 } })),
  mission: { missiontype: 'p', skills: 'Physics, 2 Science' },
  placedOn: [],
  underMission: [],
  missions: [],
  hand: [],
  discard: [],
  turn: 1,
}).attempt;
const titles = ['Chula: The Game', 'Chula: Echoes', 'Chula: The Dice', 'Chula: Pick One to Save Two'];

describe('answerSearch (#1298)', () => {
  it("answers a 'table' request with choosePileStack's best and no baseline", () => {
    const response = answerSearch({ id: 7, kind: 'table', attempt: pileAttempt, drawn: titles, n: 4, seed: 3 });

    expect(response.id).toBe(7);
    expect(response.kind).toBe('table');
    expect(response.result.best).toEqual(choosePileStack(pileAttempt, titles, 4, 3).best);
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

    act(() => result.current({ id: 7, kind: 'table', attempt: pileAttempt, drawn: titles, n: 4, seed: 3 }));

    expect(responses).toHaveLength(1);
    expect(responses[0].thread).toBe('main');
    expect(responses[0].result.best).toEqual(choosePileStack(pileAttempt, titles, 4, 3).best);
    expect(responses[0]).not.toHaveProperty('baseline');
  });
});
