// The trigger registry (#1903, part 1 of #1867): every trigger row, by title, and the titles for the model
// backlog. A row is plain data (`model.ts`); the title lists live under `titles/` by family.

import { cardTitleOf } from '../cardTitle';
import type { GameEventKind, TriggerRow } from './model';
import { BOT_TRIGGER_ROWS } from './titles/bot';
import { COMPLETION_TRIGGER_ROWS } from './titles/completion';
import { PERSONNEL_TRIGGER_ROWS } from './titles/personnel';

export * from './model';
export { UNEXPECTED_DIFFICULTIES } from './titles/bot';

/** Every trigger row. */
export const TRIGGER_ROWS: readonly TriggerRow[] = [...COMPLETION_TRIGGER_ROWS, ...PERSONNEL_TRIGGER_ROWS, ...BOT_TRIGGER_ROWS];

const BY_TITLE = new Map<string, TriggerRow[]>();
for (const r of TRIGGER_ROWS) {
  const key = r.title.toLowerCase();
  BY_TITLE.set(key, [...(BY_TITLE.get(key) ?? []), r]);
}

const BY_EVENT = new Map<GameEventKind, TriggerRow[]>();
for (const r of TRIGGER_ROWS) BY_EVENT.set(r.event.kind, [...(BY_EVENT.get(r.event.kind) ?? []), r]);

/** The trigger rows of a card, by its name or title, in row order. */
export const triggerRowsOf = (name: string): readonly TriggerRow[] => BY_TITLE.get(cardTitleOf(name).toLowerCase()) ?? [];

/** The rows that wait for an event of `kind`. */
export const triggerRowsFor = (kind: GameEventKind): readonly TriggerRow[] => BY_EVENT.get(kind) ?? [];

/** The titles of the registry, in the case of the card data, each once: the model backlog's `trigger` and `interrupt`. */
export const TRIGGER_TITLES: readonly string[] = [...new Set(TRIGGER_ROWS.map((r) => r.title))];

/**
 * The titles of the `botDeck` rows (#1906): the trigger cards the bot can use from the `Deck:` section of its pile,
 * in the case of the card data.
 */
export const BOT_TRIGGER_TITLES: readonly string[] = [...new Set(TRIGGER_ROWS.filter((r) => r.source === 'botDeck').map((r) => r.title))];

/** The `botDeck` rows among `titles` that wait for an event of `kind`, in row order. */
export const botTriggerRowsFor = (titles: readonly string[], kind: GameEventKind): readonly TriggerRow[] => {
  const held = new Set(titles.map((t) => cardTitleOf(t).toLowerCase()));
  return triggerRowsFor(kind).filter((r) => r.source === 'botDeck' && held.has(r.title.toLowerCase()));
};
