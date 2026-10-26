import { useRef, useState } from 'react';
import { RANDOM_CHOICE, botAttemptOf, drawnDilemmaIds, stackCardIds } from '../../../lib/dilemmaBot/botAttempt';
import { DilemmaId } from '../../../lib/dilemmaBot/opponentPile';
import { randomLegalStack } from '../../../lib/dilemmaBot/search';
import { SearchRequest, answerSearch } from '../../../lib/dilemmaBot/searchRequest';
import { seededRandom } from '../../../lib/dilemmaBot/simulator';
import { useSearchWorker } from '../../../lib/dilemmaBot/useSearchWorker';
import { attemptingCards } from './attempt';
import { CardInstance, TableAction, TableState, drawFromDilemmaPile } from './tableReducer';

export type BotAttemptAction = Extract<TableAction, { type: 'botAttempt' }>;
export type BotStartFields = Pick<BotAttemptAction, 'missionIndex' | 'shipId' | 'personnel' | 'subtract' | 'botDraw' | 'botSpend'>;

// A new seed for each bot attempt, so two attempts at the same table need not choose alike.
export const newBotSeed = (): number => Math.floor(Math.random() * 2 ** 31);

interface Pending {
  id: number;
  // The table the draw was worked out on: a reply for any other table is dropped (#1299).
  table: TableState;
  action: Omit<BotAttemptAction, 'stack' | 'random'>;
  drawn: CardInstance[];
  request: SearchRequest;
}

/**
 * Start in a bot game (#1299). `start` draws the bot's dilemmas from the table, without touching it,
 * and asks the search of the dilemma bot for the stack. While the search runs, `choosing` is true.
 * The reply becomes one `botAttempt` action, handed to `onAction`, only when it answers the request
 * still pending and the table has not changed since. `cancel` drops the request. With nothing drawn,
 * or a mission whose requirements the bot cannot read, `start` hands the action over at once.
 */
export function useBotAttemptStart(table: TableState, onAction: (action: BotAttemptAction) => void) {
  const [choosing, setChoosing] = useState(false);
  const pending = useRef<Pending | null>(null);
  const nextId = useRef(0);
  const tableRef = useRef(table);
  tableRef.current = table;
  const onActionRef = useRef(onAction);
  onActionRef.current = onAction;

  const clear = () => {
    pending.current = null;
    setChoosing(false);
  };

  const finish = (id: number, stack: DilemmaId[]) => {
    const p = pending.current;
    if (!p || p.id !== id) return;
    clear();
    if (tableRef.current !== p.table) return;
    onActionRef.current({ ...p.action, stack: stackCardIds(p.drawn, stack), random: false });
  };

  const post = useSearchWorker(
    (response) => finish(response.id, response.result.best.stack),
    // A worker that fails answers on the main thread, so the popup never waits for ever.
    () => {
      const p = pending.current;
      if (p) finish(p.id, answerSearch(p.request).result.best.stack);
    }
  );

  const start = (fields: BotStartFields, seed: number = newBotSeed()) => {
    if (pending.current) return;
    const { drawn, pile } = drawFromDilemmaPile(table.dilemmaPile, fields.botDraw);
    const action = { type: 'botAttempt' as const, ...fields, pile, drawn: drawn.map((c) => c.id) };
    const ids = drawnDilemmaIds(drawn.map((c) => c.card));
    const slot = table.missions[fields.missionIndex];
    const cards = attemptingCards(table, fields.missionIndex, fields.shipId) ?? [];
    const attempt = botAttemptOf(cards, slot?.mission?.card ?? {}, (slot?.mission?.placedOn ?? []).map((c) => c.card));
    if (attempt === RANDOM_CHOICE) {
      const stack = ids.length ? randomLegalStack(ids, fields.botSpend, seededRandom(seed)) : [];
      onActionRef.current({ ...action, stack: stackCardIds(drawn, stack), random: true });
      return;
    }
    if (!ids.length) {
      onActionRef.current({ ...action, stack: [], random: false });
      return;
    }
    const id = ++nextId.current;
    const request: SearchRequest = { id, kind: 'table', attempt, drawn: ids, n: fields.botSpend, seed };
    pending.current = { id, table, action, drawn, request };
    setChoosing(true);
    post(request);
  };

  return { choosing, start, cancel: clear };
}
