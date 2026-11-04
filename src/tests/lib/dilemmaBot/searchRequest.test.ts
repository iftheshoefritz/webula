// Issue #1298: one function answers a search request, on the worker and on the main thread, and the
// practice table's `'table'` kind skips the baseline. The lab's `'lab'` kind asks the pile bot too (#1509).
import { act, renderHook } from '@testing-library/react';
import { answerSearch, LabSearchRequest } from '../../../lib/dilemmaBot/searchRequest';
import { ThreadedSearchResponse, useSearchWorker } from '../../../lib/dilemmaBot/useSearchWorker';
import { choosePileStack, randomLegalPileStack, scorePileStack } from '../../../lib/dilemmaBot/pile/search';
import { pileAttemptOf } from '../../../lib/dilemmaBot/pile/tableAttempt';
import { seededRandom } from '../../../lib/dilemmaBot/simulator';

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

  // The lab's request of the pile bot (#1509).
  it("answers a 'lab' request with choosePileStack's best and a baseline of 2,000 plays", () => {
    const request: LabSearchRequest = { id: 8, kind: 'lab', attempt: pileAttempt, drawn: titles, n: 4, seed: 3 };
    const response = answerSearch(request);

    expect(response.id).toBe(8);
    expect(response.kind).toBe('lab');
    expect(response.result.method).toBe('beam');
    expect(response.result.best).toEqual(choosePileStack(pileAttempt, titles, 4, 3).best);
    const stack = randomLegalPileStack(pileAttempt, titles, 4, seededRandom(3));
    expect(response.baseline).toEqual(scorePileStack(pileAttempt, stack, 2000, 4, titles.length));
    expect(response.baseline.plays).toBe(2000);
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
