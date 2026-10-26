'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DILEMMA_BY_ID, DilemmaId, OPPONENT_DILEMMAS } from '../lib/dilemmaBot/opponentPile';
import { meetsRequirements, parseRequirementBranches } from '../lib/dilemmaBot/requirements';
import { BotAttempt, PlayerChoice, botPersonnelOf, playStack, seededRandom } from '../lib/dilemmaBot/simulator';
import {
  SearchResult,
  StackScore,
  chooseStack,
  drawDilemmas,
  fullSearch,
  legalStacks,
  randomLegalStack,
  scoreStack,
} from '../lib/dilemmaBot/search';
import type { SearchRequest, SearchResponse } from '../lib/dilemmaBot/search.worker';
import type { CardData } from '../lib/loadCards';
import CardPreview from '../app/decks/practice/CardPreview';
import { TABLE_CARD_ART_HEIGHT, TABLE_CARD_WIDTH, TableCardImage } from '../app/decks/practice/TableCard';
import { HOLD_DELAY_MS, HOVER_DELAY_MS } from '../app/decks/practice/useCardHold';
import type { PreviewSide } from '../app/decks/practice/useCardHold';
import type { CardInstance } from '../app/decks/practice/tableReducer';

export interface LabMission {
  name: string;
  requirements: string;
}

export interface LabPersonnel {
  originalName: string;
  name: string;
  cost: string;
  integrity: string;
  cunning: string;
  strength: string;
  skills: string;
}

export interface LabDeck {
  label: string;
  personnel: string[];
  missions: string[];
}

interface Props {
  missions: LabMission[];
  personnel: LabPersonnel[];
  decks: LabDeck[];
  /** The card data row of each dilemma of the pile, for its image. */
  dilemmaCards: Record<DilemmaId, CardData>;
}

const title = (id: DilemmaId) => DILEMMA_BY_ID[id].title;
const stackText = (stack: DilemmaId[]) => (stack.length ? stack.map(title).join(' → ') : '(no dilemmas)');
const pct = (p: number) => `${(p * 100).toFixed(1)}%`;

/** A search result, and the thread it ran on. */
type LabResponse = SearchResponse & { thread: 'background' | 'main' };

/** The search off the main thread, or on it when the browser has no worker. */
function useSearchWorker(onResponse: (r: LabResponse) => void) {
  const worker = useRef<Worker | null>(null);
  const handler = useRef(onResponse);
  handler.current = onResponse;
  useEffect(() => () => worker.current?.terminate(), []);

  return (request: SearchRequest) => {
    if (!worker.current && typeof Worker !== 'undefined') {
      try {
        worker.current = new Worker(new URL('../lib/dilemmaBot/search.worker.ts', import.meta.url));
        worker.current.onmessage = (e: MessageEvent<SearchResponse>) => handler.current({ ...e.data, thread: 'background' });
      } catch {
        worker.current = null;
      }
    }
    if (worker.current) {
      worker.current.postMessage(request);
      return;
    }
    const { attempt, drawn, n, seed } = request;
    const start = performance.now();
    const result =
      request.kind === 'choose' ? chooseStack(attempt, drawn, n, seed) : fullSearch(attempt, legalStacks(drawn, n), 500, seed);
    const ms = performance.now() - start;
    const baseline = scoreStack(attempt, randomLegalStack(drawn, n, seededRandom(seed)), 2000, seed + 1);
    handler.current({ id: request.id, kind: request.kind, result, baseline, ms, thread: 'main' });
  };
}

export default function DilemmaLabClient({ missions, personnel, decks, dilemmaCards }: Props) {
  const byName = useMemo(() => new Map(personnel.map((p) => [p.originalName, p])), [personnel]);

  const [missionName, setMissionName] = useState('');
  const [crew, setCrew] = useState<string[]>([]);
  const [addName, setAddName] = useState('');
  const [deckIndex, setDeckIndex] = useState(0);
  const [crewSize, setCrewSize] = useState(9);
  const [n, setN] = useState(6);
  const [gameOnMission, setGameOnMission] = useState(0);
  const [choice, setChoice] = useState<PlayerChoice>('best');
  const [drawn, setDrawn] = useState<DilemmaId[]>([]);
  const [seed, setSeed] = useState(1);
  const [message, setMessage] = useState('');
  const [chosen, setChosen] = useState<LabResponse | null>(null);
  const [full, setFull] = useState<LabResponse | null>(null);
  const [running, setRunning] = useState<SearchRequest['kind'] | null>(null);
  const requestId = useRef(0);

  const mission = missions.find((m) => m.name === missionName);
  const branches = useMemo(() => (mission ? parseRequirementBranches(mission.requirements) : null), [mission]);
  const crewPersonnel = useMemo(
    () => crew.map((name) => byName.get(name)).filter((p): p is LabPersonnel => !!p).map(botPersonnelOf),
    [crew, byName],
  );
  const meets = branches ? meetsRequirements(branches, crewPersonnel) : false;
  const under = Math.max(0, crew.length - n);
  const stackCount = useMemo(() => legalStacks(drawn, n).length, [drawn, n]);
  const attempt: BotAttempt | null = branches
    ? { personnel: crewPersonnel, requirements: branches, gameOnMission, choice }
    : null;

  // A result belongs to the inputs it came from.
  useEffect(() => {
    setChosen(null);
    setFull(null);
  }, [missionName, crew, n, gameOnMission, choice, drawn]);

  const search = useSearchWorker((response) => {
    if (response.id !== requestId.current) return;
    if (response.kind === 'choose') setChosen(response);
    else setFull(response);
    setRunning(null);
  });

  const run = (kind: SearchRequest['kind']) => {
    if (!attempt) return;
    requestId.current++;
    setRunning(kind);
    search({ id: requestId.current, kind, attempt, drawn, n, seed });
  };

  const draw = () => {
    const next = seed + 1;
    setSeed(next);
    setDrawn(drawDilemmas(n, gameOnMission, under, seededRandom(next)));
  };

  const toggleTitle = (id: DilemmaId) =>
    setDrawn((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));

  const randomCrew = () => {
    const deck = decks[deckIndex];
    if (!deck) return;
    const rand = seededRandom(Date.now() >>> 0);
    let target = mission;
    if (!target || !deck.missions.includes(target.name)) {
      const readable = deck.missions.filter((name) => parseRequirementBranches(missions.find((m) => m.name === name)!.requirements));
      const pick = readable[Math.floor(rand() * readable.length)];
      target = missions.find((m) => m.name === pick);
    }
    const targetBranches = target ? parseRequirementBranches(target.requirements) : null;
    if (!target || !targetBranches) {
      setMessage('This deck has no mission that the bot can read.');
      return;
    }
    const size = Math.min(crewSize, deck.personnel.length);
    for (let t = 0; t < 1000; t++) {
      const pool = deck.personnel.slice();
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      const group = pool.slice(0, size);
      if (meetsRequirements(targetBranches, group.map((name) => botPersonnelOf(byName.get(name)!)))) {
        setMissionName(target.name);
        setCrew(group);
        setMessage('');
        return;
      }
    }
    setMessage(`No random crew of ${size} from this deck meets the requirements of ${target.name}.`);
  };

  const addPersonnel = () => {
    if (!byName.has(addName)) {
      setMessage(`No personnel has the name "${addName}".`);
      return;
    }
    setCrew((c) => [...c, addName]);
    setAddName('');
    setMessage('');
  };

  const samples = useMemo(() => {
    if (!chosen || !attempt) return [];
    return [1, 2, 3].map((s) => {
      const lines: string[] = [];
      playStack(attempt, chosen.result.best.stack, seededRandom(1000 + s), (line) => lines.push(line));
      return lines;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen]);

  return (
    <div className="page-container p-4 flex flex-col gap-6 text-text-primary max-w-5xl mx-auto">
      <header>
        <h1 className="text-2xl font-bold">Dilemma bot lab</h1>
        <p className="text-sm text-text-secondary">
          Set a mission, a crew and N. The bot draws from its Chula pile and chooses an ordered dilemma stack (#1282).
        </p>
      </header>

      <section className="surface p-4 flex flex-col gap-2">
        <h2 className="text-lg font-semibold">1. The mission</h2>
        <input
          className="input"
          list="lab-missions"
          value={missionName}
          onChange={(e) => setMissionName(e.target.value)}
          placeholder="Mission name"
          data-testid="lab-mission"
        />
        <datalist id="lab-missions">
          {missions.map((m) => (
            <option key={m.name} value={m.name} />
          ))}
        </datalist>
        {mission && (
          <p className="text-sm" data-testid="lab-requirements">
            Requirements: {mission.requirements}{' '}
            {branches ? (
              <span className="text-accent">(the bot reads these)</span>
            ) : (
              <span className="text-red-400">(the bot cannot read these)</span>
            )}
          </p>
        )}
      </section>

      <section className="surface p-4 flex flex-col gap-3">
        <h2 className="text-lg font-semibold">2. The crew</h2>
        <div className="flex flex-wrap gap-2 items-center">
          <select className="input max-w-md" value={deckIndex} onChange={(e) => setDeckIndex(Number(e.target.value))}>
            {decks.map((d, i) => (
              <option key={d.label} value={i}>
                {d.label}
              </option>
            ))}
          </select>
          <label className="text-sm flex items-center gap-1">
            Size
            <input
              className="input w-16"
              type="number"
              min={1}
              max={20}
              value={crewSize}
              onChange={(e) => setCrewSize(Number(e.target.value))}
            />
          </label>
          <button className="btn-primary" onClick={randomCrew} data-testid="lab-random-crew">
            Random crew from this deck
          </button>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <input
            className="input max-w-md"
            list="lab-personnel"
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            placeholder="Personnel name"
          />
          <datalist id="lab-personnel">
            {personnel.map((p) => (
              <option key={p.originalName} value={p.originalName} />
            ))}
          </datalist>
          <button className="btn-primary" onClick={addPersonnel}>
            Add
          </button>
          {crew.length > 0 && (
            <button className="text-sm underline text-text-secondary" onClick={() => setCrew([])}>
              Remove all
            </button>
          )}
        </div>
        {message && <p className="text-sm text-red-400">{message}</p>}
        {crew.length > 0 && (
          <table className="text-sm w-full" data-testid="lab-crew">
            <thead className="text-text-secondary text-left">
              <tr>
                <th>Personnel</th>
                <th>Cost</th>
                <th>I / C / S</th>
                <th>Skills</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {crew.map((name, k) => {
                const p = byName.get(name)!;
                return (
                  <tr key={`${name}-${k}`} className="border-t border-default">
                    <td>{name}</td>
                    <td>{p.cost}</td>
                    <td>
                      {p.integrity} / {p.cunning} / {p.strength}
                    </td>
                    <td className="capitalize">{p.skills}</td>
                    <td>
                      <button
                        className="text-text-muted hover:text-text-primary"
                        onClick={() => setCrew((c) => c.filter((_, i) => i !== k))}
                        aria-label={`Remove ${name}`}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {mission && crew.length > 0 && (
          <p className="text-sm" data-testid="lab-meets">
            {crew.length} personnel.{' '}
            {meets ? 'They meet the mission requirements.' : 'They do not meet the mission requirements, so every stack fails the attempt.'}
          </p>
        )}
      </section>

      <section className="surface p-4 flex flex-col gap-3">
        <h2 className="text-lg font-semibold">3. The attempt and the draw</h2>
        <div className="flex flex-wrap gap-4 items-center text-sm">
          <label className="flex items-center gap-1">
            N
            <input
              className="input w-16"
              type="number"
              min={0}
              max={27}
              value={n}
              onChange={(e) => setN(Math.max(0, Number(e.target.value)))}
              data-testid="lab-n"
            />
          </label>
          <span className="text-text-secondary">Dilemmas under the mission: {under}</span>
          <label className="flex items-center gap-1">
            Copies of Chula: The Game on the mission
            <select className="input w-16" value={gameOnMission} onChange={(e) => setGameOnMission(Number(e.target.value))}>
              {[0, 1, 2, 3].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1">
            Pick One to Save Two
            <select className="input" value={choice} onChange={(e) => setChoice(e.target.value as PlayerChoice)}>
              <option value="best">the player&apos;s best choice</option>
              <option value="random">a random choice</option>
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <button className="btn-primary" onClick={draw} data-testid="lab-draw">
            Draw N dilemmas
          </button>
          <span className="text-sm text-text-secondary" data-testid="lab-drawn">
            {drawn.length ? `${drawn.length} dilemmas drawn. Hold or hover a card to preview it.` : 'Nothing drawn yet.'}
          </span>
        </div>
        {drawn.length > 0 && <DrawnCards drawn={drawn} cards={dilemmaCards} />}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {OPPONENT_DILEMMAS.map((d) => (
            <label key={d.id} className="flex items-center gap-1">
              <input type="checkbox" checked={drawn.includes(d.id)} onChange={() => toggleTitle(d.id)} />
              {d.title} ({d.cost})
            </label>
          ))}
        </div>
        <p className="text-sm text-text-secondary">{stackCount.toLocaleString()} legal ordered stacks.</p>
      </section>

      <section className="surface p-4 flex flex-col gap-3">
        <h2 className="text-lg font-semibold">4. The bot&apos;s choice</h2>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn-primary"
            disabled={!attempt || crew.length === 0 || running !== null}
            onClick={() => run('choose')}
            data-testid="lab-choose"
          >
            {running === 'choose' ? 'Choosing…' : 'Choose the stack'}
          </button>
          <button
            className="btn-primary"
            disabled={!chosen || running !== null}
            onClick={() => run('full')}
            data-testid="lab-full"
          >
            {running === 'full' ? 'Searching…' : 'Check with the full search (500 plays of every stack)'}
          </button>
        </div>
        {!attempt && <p className="text-sm text-text-secondary">Choose a mission whose requirements the bot reads.</p>}
        {chosen && <ResultView response={chosen} />}
        {chosen && full && <Comparison chosen={chosen.result} full={full} />}
        {samples.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer">Three sample plays of the chosen stack</summary>
            {samples.map((lines, i) => (
              <pre key={i} className="mt-2 whitespace-pre-wrap text-xs bg-bg-secondary p-2 rounded">
                {lines.join('\n')}
              </pre>
            ))}
          </details>
        )}
      </section>
    </div>
  );
}

interface Preview {
  instance: CardInstance;
  side: PreviewSide;
  /** A hold dims the page; a mouse hover does not, as on the practice table (#985). */
  dim: boolean;
}

/**
 * Each drawn dilemma, duplicates too, as the art crop of a table card. A press and hold (touch or
 * pen) or a mouse hover shows the card in `CardPreview`, with the delays of the practice table.
 * The practice table's `useCardHold` needs its page's provider, so the lab keeps this smaller copy.
 */
function DrawnCards({ drawn, cards }: { drawn: DilemmaId[]; cards: Record<DilemmaId, CardData> }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const later = (ms: number, next: Preview) => {
    cancel();
    timer.current = setTimeout(() => setPreview(next), ms);
  };

  // The preview takes the edge away from the press point (#879).
  const side = (x: number): PreviewSide => (x > window.innerWidth / 2 ? 'left' : 'right');

  // A hold ends wherever the pointer is released.
  useEffect(() => {
    const end = () => {
      cancel();
      setPreview((p) => (p?.dim ? null : p));
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    window.addEventListener('touchend', end);
    return () => {
      cancel();
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      window.removeEventListener('touchend', end);
    };
  }, []);

  return (
    <div className="flex flex-wrap gap-2" data-testid="lab-drawn-cards">
      {drawn.map((id, i) => {
        const instance: CardInstance = { id: `drawn-${i}`, card: cards[id], face: 'up' };
        return (
          <div
            key={instance.id}
            data-testid={`lab-drawn-card-${id}`}
            className="select-none touch-manipulation"
            style={{ width: TABLE_CARD_WIDTH }}
            title={title(id)}
            onContextMenu={(e) => e.preventDefault()}
            onPointerDown={(e) => {
              if (e.pointerType !== 'mouse') later(HOLD_DELAY_MS, { instance, side: side(e.clientX), dim: true });
            }}
            onPointerEnter={(e) => {
              if (e.pointerType === 'mouse' && e.buttons === 0) later(HOVER_DELAY_MS, { instance, side: side(e.clientX), dim: false });
            }}
            onPointerLeave={(e) => {
              if (e.pointerType !== 'mouse') return;
              cancel();
              setPreview((p) => (p && !p.dim ? null : p));
            }}
          >
            <TableCardImage instance={instance} width={TABLE_CARD_WIDTH} height={TABLE_CARD_ART_HEIGHT} />
          </div>
        );
      })}
      {preview && <CardPreview instance={preview.instance} side={preview.side} dim={preview.dim} />}
    </div>
  );
}

function ScoreLine({ score }: { score: StackScore }) {
  return (
    <span>
      P(fail) {pct(score.pFail)}, lasting damage {score.damage.toFixed(2)}, {score.under} under the mission
    </span>
  );
}

function ResultView({ response }: { response: LabResponse }) {
  const { result, baseline, ms, thread } = response;
  return (
    <div className="flex flex-col gap-2 text-sm" data-testid="lab-result">
      <p className="text-base">
        <strong data-testid="lab-result-stack">{stackText(result.best.stack)}</strong>
      </p>
      <p>
        <ScoreLine score={result.best} />
      </p>
      <p className="text-text-secondary">
        Decision mode: {result.mode}. Method: {result.method} search, {result.stackCount.toLocaleString()} legal stacks,{' '}
        {result.plays.toLocaleString()} plays, <span data-testid="lab-ms">{ms.toFixed(0)} ms</span> on the{' '}
        <span data-testid="lab-thread">{thread}</span> thread.
      </p>
      <p className="text-text-secondary">
        A random legal stack, the baseline: {stackText(baseline.stack)}: <ScoreLine score={baseline} />.
      </p>
      <RankTable ranked={result.ranked.slice(0, 10)} caption="The best stacks of the last round" />
    </div>
  );
}

function RankTable({ ranked, caption }: { ranked: StackScore[]; caption: string }) {
  return (
    <table className="text-xs w-full">
      <caption className="text-left text-text-secondary">{caption}</caption>
      <thead className="text-left text-text-secondary">
        <tr>
          <th>Stack</th>
          <th>P(fail)</th>
          <th>Damage</th>
          <th>Under</th>
          <th>Plays</th>
        </tr>
      </thead>
      <tbody>
        {ranked.map((s) => (
          <tr key={s.stack.join(',')} className="border-t border-default">
            <td>{stackText(s.stack)}</td>
            <td>{pct(s.pFail)}</td>
            <td>{s.damage.toFixed(2)}</td>
            <td>{s.under}</td>
            <td>{s.plays}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Comparison({ chosen, full }: { chosen: SearchResult; full: SearchResponse }) {
  const key = (s: DilemmaId[]) => s.join(',');
  const truth = full.result.best;
  const sameStack = key(chosen.best.stack) === key(truth.stack);
  const asJudged = full.result.ranked.find((s) => key(s.stack) === key(chosen.best.stack));
  return (
    <div className="flex flex-col gap-2 text-sm border-t border-default pt-2" data-testid="lab-comparison">
      <p>
        Full search: <strong>{stackText(truth.stack)}</strong>: <ScoreLine score={truth} />, {full.ms.toFixed(0)} ms.
      </p>
      <p data-testid="lab-same">
        {sameStack
          ? 'The bot chose the same stack as the full search.'
          : asJudged
            ? `The bot chose another stack. The full search scores it: P(fail) ${pct(asJudged.pFail)}, damage ${asJudged.damage.toFixed(2)}, ${asJudged.under} under: a loss of ${pct(truth.pFail - asJudged.pFail)} P(fail) and ${(truth.damage - asJudged.damage).toFixed(2)} damage.`
            : 'The bot chose another stack.'}
      </p>
      <RankTable ranked={full.result.ranked.slice(0, 10)} caption="The best stacks of the full search" />
    </div>
  );
}
