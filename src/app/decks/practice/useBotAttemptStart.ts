import { useRef, useState } from 'react';
import { drawnPileTitles, pileAttemptOf, pileStackCardIds } from '../../../lib/dilemmaBot/pile/tableAttempt';
import { randomLegalPileStack } from '../../../lib/dilemmaBot/pile/search';
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

interface Pending {
  id: number;
  // The table the draw was worked out on: a reply for any other table is dropped (#1299).
  table: TableState;
  action: Omit<BotAttemptAction, 'stack' | 'random'>;
  drawn: CardInstance[];
  request: TableSearchRequest;
}

/**
 * Start in a bot game (#1299). `start` draws the bot's dilemmas from the table, without touching it,
 * and asks the beam search of the pile bot for the stack (#1508). While the search runs, `choosing` is true.
 * The reply becomes one `botAttempt` action, handed to `onAction`, only when it answers the request
 * still pending and the table has not changed since. `cancel` drops the request. With nothing drawn,
 * or a mission whose requirements the bot cannot read, `start` hands the action over at once.
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

  const finish = (id: number, stack: string[]) => {
    const p = pending.current;
    if (!p || p.id !== id) return;
    clear();
    if (tableRef.current !== p.table) return;
    onActionRef.current({ ...p.action, stack: pileStackCardIds(p.drawn, stack), random: false });
  };

  const post = useSearchWorker(
    (response) => {
      if (response.kind === 'table') finish(response.id, response.result.best.stack);
    },
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
    const titles = drawnPileTitles(drawn.map((c) => c.card));
    const built = pileAttemptOf(pileTableInputOf(table, fields.missionIndex, fields.shipId));
    // The bot's pile while the stack is faced (#1518): what the draw left, with the drawn dilemmas at the
    // bottom. The stack is not chosen yet, so the drawn dilemmas it will take count too. Vault of Tomorrow
    // takes from it, and Outmatched consumes from its top.
    const { random } = built;
    const attempt = { ...built.attempt, botPile: [...drawnPileTitles(pile.map((c) => c.card)), ...titles] };
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
