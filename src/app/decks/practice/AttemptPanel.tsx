import React, { useEffect, useRef, useState } from 'react';
import { LAYER_MODAL, LAYER_MODAL_BACKDROP } from '../../../lib/layers';
import { useEscapeLayer } from './useEscapeLayer';
import { drawSpend, drawSpendText } from './drawSpend';
import { safeModalMaxHeight, safeModalWidth } from './useSafeAreaInsets';
import { AttemptMissionRules, attemptChangeText } from './attemptMissions';
import type { AttemptStartExtras } from './tableReducer';

// An empty or invalid field reads as 0.
const wholeNumber = (text: string): number => {
  const n = Number.parseInt(text, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

function NumberField({
  label,
  testId,
  value,
  onChange,
}: {
  label: string;
  testId: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const step = (delta: number) => onChange(String(Math.max(0, wholeNumber(value) + delta)));
  return (
    <label className="flex items-center justify-between gap-2 text-sm text-text-secondary">
      <span>{label}</span>
      <span className="flex items-center gap-1">
        <button type="button" className="btn-icon !h-10 !w-10 text-base" onClick={() => step(-1)} aria-label={`Decrease ${label.toLowerCase()}`}>
          -
        </button>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          data-testid={testId}
          aria-label={label}
          value={value}
          onChange={(event) => onChange(event.target.value.replace(/[^0-9]/g, ''))}
          className="h-10 w-14 rounded border border-white/20 bg-bg-primary text-center text-base text-text-primary"
        />
        <button type="button" className="btn-icon !h-10 !w-10 text-base" onClick={() => step(1)} aria-label={`Increase ${label.toLowerCase()}`}>
          +
        </button>
      </span>
    </label>
  );
}

// The attempt popup (#1163): the two numbers of a mission attempt, both editable, and the result,
// draw/spend N, live as the player edits. Start confirms the numbers as shown; Cancel, Escape and a
// tap on the backdrop close it with nothing changed. In a bot game (#1291) two more fields set the
// bot's Draw and Spend: each shows N until the player edits it, and keeps the player's number after.
// While the bot chooses its stack (#1299, `choosing`), Start reads "The bot is choosing…" and is
// disabled; Cancel, Escape and the backdrop still close the popup.
// A mission that changes the draw and the spend (#1759, `rules`) names its change under the result,
// and each change the player may take is a toggle, off at first. The result, and a bot game's fields
// until edited, show the numbers with the changes; `onStart` then gets them as `mission`, with the
// cards Rigel X draws and the text of each change for the log.
export function AttemptDialog({
  mission,
  personnel,
  subtract,
  rules,
  bot = false,
  choosing = false,
  onStart,
  onCancel,
}: {
  mission: string;
  personnel: number;
  subtract: number;
  rules?: AttemptMissionRules;
  bot?: boolean;
  choosing?: boolean;
  onStart: (personnel: number, subtract: number, bot?: { botDraw: number; botSpend: number }, mission?: AttemptStartExtras) => void;
  onCancel: () => void;
}) {
  const [personnelText, setPersonnelText] = useState(String(personnel));
  const [subtractText, setSubtractText] = useState(String(subtract));
  // null until the player edits the field: it then shows N, derived on each render.
  const [drawText, setDrawText] = useState<string | null>(null);
  const [spendText, setSpendText] = useState<string | null>(null);
  const [taken, setTaken] = useState<string[]>([]);
  useEscapeLayer(onCancel);

  const p = wholeNumber(personnelText);
  const s = wholeNumber(subtractText);
  const n = drawSpend(p, s);
  const offers = rules?.offers ?? [];
  const changes = [...(rules?.auto ? [rules.auto] : []), ...offers.filter((o) => taken.includes(o.key))];
  const changedDraw = Math.max(0, changes.reduce((sum, c) => sum + c.draw, n));
  const changedSpend = Math.max(0, changes.reduce((sum, c) => sum + c.spend, n));
  const drawCards = offers.reduce((sum, o) => sum + (taken.includes(o.key) ? (o.drawCards ?? 0) : 0), 0);
  const shownDraw = drawText ?? String(changedDraw);
  const shownSpend = spendText ?? String(changedSpend);
  // `wholeNumber` reads empty text as 0, so the check is on the text: the field keeps only digits.
  const botValid = !bot || (shownDraw !== '' && shownSpend !== '');
  const d = bot ? wholeNumber(shownDraw) : changedDraw;
  const sp = bot ? wholeNumber(shownSpend) : changedSpend;
  const missionStart: AttemptStartExtras | undefined = changes.length
    ? {
        ...(bot ? {} : { draw: d, spend: sp }),
        ...(drawCards ? { drawCards } : {}),
        changes: changes.map(attemptChangeText),
      }
    : undefined;
  return (
    <>
      <button type="button" className={`fixed inset-0 ${LAYER_MODAL_BACKDROP} bg-black/40`} onClick={onCancel} aria-label="Cancel the attempt" />
      <div
        role="dialog"
        aria-label={`Attempt ${mission}`}
        data-testid="attempt-dialog"
        className={`fixed left-1/2 top-1/2 ${LAYER_MODAL} flex -translate-x-1/2 -translate-y-1/2 flex-col gap-2 overflow-y-auto rounded-md border border-white/10 bg-bg-secondary p-3 shadow-lg`}
        style={{ maxHeight: safeModalMaxHeight(95), width: safeModalWidth('18rem') }}
      >
        <h2 className="text-sm font-semibold text-text-primary">Attempt {mission}</h2>
        <NumberField label="Personnel" testId="attempt-personnel" value={personnelText} onChange={setPersonnelText} />
        <NumberField label="Subtract" testId="attempt-subtract" value={subtractText} onChange={setSubtractText} />
        <p data-testid="attempt-result" className="text-center text-base font-semibold text-text-primary">
          {drawSpendText(d, sp)}
        </p>
        {rules?.auto && (
          <p data-testid="attempt-mission-change" className="text-center text-sm text-text-secondary">
            {attemptChangeText(rules.auto)}
          </p>
        )}
        {offers.map((offer) => (
          <label key={offer.key} className="flex items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              data-testid={`attempt-mission-offer-${offer.key}`}
              checked={taken.includes(offer.key)}
              onChange={(event) =>
                setTaken((keys) => (event.target.checked ? [...keys, offer.key] : keys.filter((k) => k !== offer.key)))
              }
              className="h-5 w-5"
            />
            <span>
              {offer.source}: {offer.label}
            </span>
          </label>
        ))}
        {bot && (
          <>
            <NumberField label="Draw" testId="attempt-bot-draw" value={shownDraw} onChange={setDrawText} />
            <NumberField label="Spend" testId="attempt-bot-spend" value={shownSpend} onChange={setSpendText} />
          </>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="btn-primary bg-none bg-white/[0.05]">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              const numbers = bot ? { botDraw: d, botSpend: sp } : undefined;
              if (missionStart) onStart(p, s, numbers, missionStart);
              else if (numbers) onStart(p, s, numbers);
              else onStart(p, s);
            }}
            disabled={!botValid || choosing}
            className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="attempt-start"
          >
            {choosing ? 'The bot is choosing…' : 'Start'}
          </button>
        </div>
      </div>
    </>
  );
}

// The overlay on the attempted mission card (#1163) while the attempt runs and the full table shows
// (#1164). Only its button takes a pointer, so a drop under the mission and a double-tap on the card
// still work. The position is set here and the contents are the children.
export function AttemptOverlay({ missionIndex, children }: { missionIndex: number; children: React.ReactNode }) {
  return (
    <div
      data-testid={`attempt-overlay-${missionIndex}`}
      className="absolute inset-x-0 top-1/2 z-20 flex -translate-y-1/2 justify-center pointer-events-none"
    >
      <div className="flex flex-col items-center gap-0.5 rounded bg-black/80 px-1 py-0.5 text-text-primary">{children}</div>
    </div>
  );
}

// The overlay's only contents on the full table (#1164): the button back to the attempt layout.
export function BackToAttemptButton({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      data-testid="attempt-back-to-attempt"
      onClick={(event) => {
        event.stopPropagation();
        onBack();
      }}
      className="pointer-events-auto rounded bg-accent-dark px-1 py-0.5 text-[9px] font-semibold leading-none text-white whitespace-nowrap"
    >
      Back to attempt
    </button>
  );
}
