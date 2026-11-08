import { useRef, useState } from 'react';
import { drawnPileTitles, pileAttemptOf, pileStackCardIds } from '../../../lib/dilemmaBot/pile/tableAttempt';
import { PileSearchResult, randomLegalPileStack } from '../../../lib/dilemmaBot/pile/search';
import { TableSearchRequest, answerSearch } from '../../../lib/dilemmaBot/searchRequest';
import { seededRandom } from '../../../lib/dilemmaBot/simulator';
import { useSearchWorker } from '../../../lib/dilemmaBot/useSearchWorker';
import { useLatest } from '../../../hooks/useLatest';
import { pileTableInputOf } from './attempt';
import { CardInstance, TableAction, TableState, drawFromDilemmaPile } from './tableReducer';

export type BotAttemptAction = Extract<TableAction, { type: 'botAttempt' }>;
export type BotStartFields = Pick<BotAttemptAction, 'missionIndex' | 'shipId' | 'personnel' | 'subtract' | 'botDraw' | 'botSpend'>;

// A new seed for each bot attempt, so two attempts at the same table need not choose alike.
export const newBotSeed = (): number => Math.floor(Math.random() * 2 ** 31);

// The fewest drawn dilemmas for which the bot uses Unexpected Difficulties (#1563).
export const UNEXPECTED_DIFFICULTIES_MIN_DRAWN = 4;

/**
 * Whether the bot uses Unexpected Difficulties on its draw (#1563): its deck holds the card, it has not
 * used it this game, it drew at least 4, and the search found that no stack can end the attempt.
 */
export const botRedraws = (table: TableState, drawnCount: number, result: PileSearchResult): boolean =>
  !!table.botPile?.unexpectedDifficulties &&
  !table.botUsedUnexpectedDifficulties &&
  drawnCount >= UNEXPECTED_DIFFICULTIES_MIN_DRAWN &&
  result.mode === 'cannot-fail';

interface Pending {
  id: number;
  // The table the draw was worked out on: a reply for any other table is dropped (#1299).
  table: TableState;
  action: Omit<BotAttemptAction, 'stack' | 'random'>;
  drawn: CardInstance[];
  request: TableSearchRequest;
  // The ids of the first draw once the bot used Unexpected Difficulties (#1563): the request is then the redraw's.
  redrawn?: string[];
}

/**
 * Start in a bot game (#1299). `start` draws the bot's dilemmas from the table, without touching it,
 * and asks the beam search of the pile bot for the stack (#1508). While the search runs, `choosing` is true.
 * The reply becomes one `botAttempt` action, handed to `onAction`, only when it answers the request
 * still pending and the table has not changed since. `cancel` drops the request. With nothing drawn,
 * or a mission whose requirements the bot cannot read, `start` hands the action over at once.
 * When the first answer lets the bot use Unexpected Difficulties (`botRedraws`, #1563), it puts the
 * drawn dilemmas on the bottom of the pile, face up, draws as many again and asks a second time,
 * under the same pending state, and the action carries both draws.
 */
export function useBotAttemptStart(table: TableState, onAction: (action: BotAttemptAction) => void) {
  const [choosing, setChoosing] = useState(false);
  const pending = useRef<Pending | null>(null);
  const nextId = useRef(0);
  const tableRef = useLatest(table);
  const onActionRef = useLatest(onAction);

  const clear = () => {
    pending.current = null;
    setChoosing(false);
  };

  const finish = (p: Pending, stack: string[]) => {
    clear();
    if (tableRef.current !== p.table) return;
    const redrawn = p.redrawn ? { redrawn: p.redrawn } : {};
    onActionRef.current({ ...p.action, ...redrawn, stack: pileStackCardIds(p.drawn, stack), random: false });
  };

  // The answer to the pending request. On the main thread, after a worker failed, the redraw's request
  // is answered there too.
  const answer = (id: number, result: PileSearchResult, mainThread: boolean) => {
    const p = pending.current;
    if (!p || p.id !== id) return;
    if (p.redrawn || tableRef.current !== p.table || !botRedraws(p.table, p.drawn.length, result)) {
      finish(p, result.best.stack);
      return;
    }
    // Unexpected Difficulties (#1563): the drawn dilemmas go to the bottom of what the draw left, face
    // up, as the switch to `'face'` returns them, and the bot draws an equal number.
    const returned = [...p.action.pile, ...p.drawn.map((c) => ({ ...c, face: 'up' as const }))];
    const { drawn, pile } = drawFromDilemmaPile(returned, p.drawn.length);
    const titles = drawnPileTitles(drawn.map((c) => c.card));
    const attempt = { ...p.request.attempt, botPile: [...drawnPileTitles(pile.map((c) => c.card)), ...titles] };
    const request: TableSearchRequest = { ...p.request, id: ++nextId.current, attempt, drawn: titles, seed: p.request.seed + 1 };
    const next: Pending = {
      ...p,
      id: request.id,
      action: { ...p.action, pile, drawn: drawn.map((c) => c.id) },
      drawn,
      request,
      redrawn: p.drawn.map((c) => c.id),
    };
    pending.current = next;
    if (mainThread) answer(request.id, answerSearch(request).result, true);
    else post(request);
  };

  const post = useSearchWorker(
    (response) => {
      if (response.kind === 'table') answer(response.id, response.result, response.thread === 'main');
    },
    // A worker that fails answers on the main thread, so the popup never waits for ever.
    () => {
      const p = pending.current;
      if (p) answer(p.id, answerSearch(p.request).result, true);
    }
  );

  const start = (fields: BotStartFields, seed: number = newBotSeed()) => {
    if (pending.current) return;
    const { drawn, pile } = drawFromDilemmaPile(table.dilemmaPile, fields.botDraw);
    const action = { type: 'botAttempt' as const, ...fields, pile, drawn: drawn.map((c) => c.id) };
    const titles = drawnPileTitles(drawn.map((c) => c.card));
    const built = pileAttemptOf(pileTableInputOf(table, fields.missionIndex, fields.shipId));
    const { random } = built;
    // The bot's pile while the stack is faced (#1518): what the draw left, with the drawn dilemmas at the
    // bottom. The stack is not chosen yet, so the drawn dilemmas it will take count too. Vault of
    // Tomorrow takes from it, and Outmatched consumes from its top.
    // The spend the player set is N, the cost the bot may spend at each reveal (#1555).
    const attempt = { ...built.attempt, botPile: [...drawnPileTitles(pile.map((c) => c.card)), ...titles], spend: fields.botSpend };
    if (random) {
      const stack = titles.length ? randomLegalPileStack(attempt, titles, fields.botSpend, seededRandom(seed)) : [];
      onActionRef.current({ ...action, stack: pileStackCardIds(drawn, stack), random: true });
      return;
    }
    if (!titles.length) {
      onActionRef.current({ ...action, stack: [], random: false });
      return;
    }
    const id = ++nextId.current;
    const request: TableSearchRequest = { id, kind: 'table', attempt, drawn: titles, n: fields.botSpend, seed };
    pending.current = { id, table, action, drawn, request };
    setChoosing(true);
    post(request);
  };

  return { choosing, start, cancel: clear };
}
