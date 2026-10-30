'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DILEMMA_BY_ID, DilemmaId, OPPONENT_DILEMMAS } from '../lib/dilemmaBot/opponentPile';
import { meetsRequirements, parseRequirementBranches } from '../lib/dilemmaBot/requirements';
import {
  BotAttempt,
  PlayerChoice,
  botPersonnelOf,
  playStack,
  requirementProfileOf,
  seededRandom,
  partnerGroupOf,
} from '../lib/dilemmaBot/simulator';
import { SearchResult, StackScore, drawDilemmas, legalStacks } from '../lib/dilemmaBot/search';
import type { SearchRequest, SearchResponse } from '../lib/dilemmaBot/searchRequest';
import { ThreadedSearchResponse, useSearchWorker } from '../lib/dilemmaBot/useSearchWorker';
import type { AttemptedMission } from '../lib/dilemmaBot/gains';
import type { CardData } from '../lib/loadCards';
import CardPreview from '../app/decks/practice/CardPreview';
import { TABLE_CARD_ART_HEIGHT, TABLE_CARD_WIDTH, TableCardImage } from '../app/decks/practice/TableCard';
import { HOLD_DELAY_MS, HOVER_DELAY_MS } from '../app/decks/practice/useCardHold';
import type { PreviewSide } from '../app/decks/practice/useCardHold';
import type { CardInstance } from '../app/decks/practice/tableReducer';

/** A mission, with the fields of its row that the gains read (`attemptedMissionOf`), as the table passes them. */
export interface LabMission extends AttemptedMission {
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
  /** The game text, only for a personnel with a gain or a skill loss the bot reads (`personnelGainsOf`, `personnelLossOf`). */
  gametext?: string;
  /** The printed traits a partner test reads, for every personnel, each only when not empty. */
  affiliation?: string;
  species?: string;
  keywords?: string;
  icons?: string;
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
type LabResponse = ThreadedSearchResponse;

/** The lab's two searches; `'table'` is the practice table's. */
type LabKind = Exclude<SearchRequest['kind'], 'table'>;

export default function DilemmaLabClient({ missions, personnel, decks, dilemmaCards }: Props) {
  const byName = useMemo(() => new Map(personnel.map((p) => [p.originalName, p])), [personnel]);

  const [missionName, setMissionName] = useState('');
  const [crew, setCrew] = useState<string[]>([]);
  const [addName, setAddName] = useState('');
  const [deckIndex, setDeckIndex] = useState<number | null>(null);
  const [crewSize, setCrewSize] = useState(9);
  const [n, setN] = useState(6);
  const [gameOnMission, setGameOnMission] = useState(0);
  const [choice, setChoice] = useState<PlayerChoice>('best');
  const [drawn, setDrawn] = useState<DilemmaId[]>([]);
  const [seed, setSeed] = useState(1);
  const [message, setMessage] = useState('');
  const [chosen, setChosen] = useState<LabResponse | null>(null);
  const [full, setFull] = useState<LabResponse | null>(null);
  const [running, setRunning] = useState<LabKind | null>(null);
  const [searchError, setSearchError] = useState('');
  const requestId = useRef(0);
  const fullRef = useRef<HTMLDivElement>(null);

  const deck = deckIndex === null ? null : decks[deckIndex];
  // The deck's missions, in the order of its list.
  const deckMissions = useMemo(
    () =>
      deck
        ? deck.missions.map((name) => missions.find((m) => m.name === name)).filter((m): m is LabMission => !!m)
        : [],
    [deck, missions],
  );
  const mission = deckMissions.find((m) => m.name === missionName);
  const branches = useMemo(() => (mission ? parseRequirementBranches(mission.requirements) : null), [mission]);
  const crewGroup = useMemo(
    () =>
      partnerGroupOf(
        crew
          .map((name) => byName.get(name))
          .filter((p): p is LabPersonnel => !!p)
          .map((p) => botPersonnelOf(p, mission)),
      ),
    [crew, byName, mission],
  );
  const crewPersonnel = crewGroup.personnel;
  const meets = branches ? meetsRequirements(branches, crewPersonnel.map(requirementProfileOf)) : false;
  const under = Math.max(0, crew.length - n);
  const stackCount = useMemo(() => legalStacks(drawn, n).length, [drawn, n]);
  const attempt: BotAttempt | null = branches
    ? { ...crewGroup, requirements: branches, gameOnMission, choice }
    : null;

  // A result belongs to the inputs it came from: when one changes, both results clear in render.
  const inputs = [missionName, crew, n, gameOnMission, choice, drawn] as const;
  const [resultInputs, setResultInputs] = useState(inputs);
  if (inputs.some((input, i) => input !== resultInputs[i])) {
    setResultInputs(inputs);
    setChosen(null);
    setFull(null);
  }

  const search = useSearchWorker((response) => {
    if (response.id !== requestId.current) return;
    if (response.kind === 'choose') setChosen(response);
    else setFull(response);
    setRunning(null);
  }, (error) => {
    setRunning(null);
    setSearchError(`The search failed: ${error}`);
  });

  // The full search's result shows below the buttons; bring it into view when it arrives.
  useEffect(() => {
    if (full) fullRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  }, [full]);

  const run = (kind: LabKind) => {
    if (!attempt) return;
    requestId.current++;
    setSearchError('');
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

  // The mission list follows the deck: a new deck starts on its first mission that the bot reads.
  const chooseDeck = (index: number | null) => {
    setDeckIndex(index);
    const next = index === null ? undefined : decks[index];
    const readable = next
      ? next.missions.find((name) => parseRequirementBranches(missions.find((m) => m.name === name)?.requirements ?? ''))
      : undefined;
    setMissionName(readable ?? '');
    setCrew([]);
    setMessage('');
  };

  const randomCrew = () => {
    if (!deck) return;
    const rand = seededRandom(Date.now() >>> 0);
    const target = mission;
    const targetBranches = branches;
    if (!target || !targetBranches) {
      setMessage('Choose a mission of this deck whose requirements the bot reads.');
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
      const profiles = partnerGroupOf(group.map((name) => botPersonnelOf(byName.get(name)!, target))).personnel.map(requirementProfileOf);
      if (meetsRequirements(targetBranches, profiles)) {
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
          Choose a deck, one of its missions, a crew and N. The bot draws from its Chula pile and chooses an ordered dilemma stack (#1282).
        </p>
      </header>

      <section className="surface p-4 flex flex-col gap-2">
        <h2 className="text-lg font-semibold">1. The deck and the mission</h2>
        <select
          className="input max-w-md"
          value={deckIndex ?? ''}
          onChange={(e) => chooseDeck(e.target.value === '' ? null : Number(e.target.value))}
          data-testid="lab-deck"
        >
          <option value="">Choose a Championship deck</option>
          {decks.map((d, i) => (
            <option key={d.label} value={i}>
              {d.label}
            </option>
          ))}
        </select>
        {deck && (
          <select
            className="input max-w-md"
            value={missionName}
            onChange={(e) => setMissionName(e.target.value)}
            data-testid="lab-mission"
          >
            <option value="">Choose a mission of this deck</option>
            {deckMissions.map((m) => (
              <option key={m.name} value={m.name}>
                {m.name}
                {parseRequirementBranches(m.requirements) ? '' : ' (the bot cannot read its requirements)'}
              </option>
            ))}
          </select>
        )}
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
          <button className="btn-primary" onClick={randomCrew} disabled={!mission} data-testid="lab-random-crew">
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
            {drawn.length ? `${drawn.length} dilemmas drawn, in the order drawn: the first on the left. Hold or hover a card to preview it.` : 'Nothing drawn yet.'}
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
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!attempt || crew.length === 0 || running !== null}
            onClick={() => run('choose')}
            data-testid="lab-choose"
          >
            {running === 'choose' ? 'Choosing…' : 'Choose the stack'}
          </button>
          <button
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!chosen || running !== null}
            onClick={() => run('full')}
            data-testid="lab-full"
          >
            {running === 'full' ? 'Searching…' : 'Check with the full search (500 plays of every stack)'}
          </button>
        </div>
        {!attempt && <p className="text-sm text-text-secondary">Choose a deck, then a mission whose requirements the bot reads.</p>}
        {attempt && !chosen && running === null && (
          <p className="text-sm text-text-secondary" data-testid="lab-full-hint">
            The full search checks the bot&apos;s choice, so choose the stack first.
          </p>
        )}
        {running && (
          <p className="text-sm" role="status" data-testid="lab-status">
            {running === 'choose'
              ? 'The bot is choosing a stack…'
              : `Playing each of the ${stackCount.toLocaleString()} legal stacks 500 times…`}
          </p>
        )}
        {searchError && <p className="text-sm text-red-400" data-testid="lab-search-error">{searchError}</p>}
        {chosen && full && (
          <div ref={fullRef}>
            <Comparison chosen={chosen.result} full={full} />
          </div>
        )}
        {chosen && <ResultView response={chosen} />}
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
            data-draw-index={i + 1}
            className="relative select-none touch-manipulation"
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
            <span className="absolute bottom-1 right-1 bg-black/70 text-text-primary text-xs font-medium px-1 rounded pointer-events-none">
              {i + 1}
            </span>
          </div>
        );
      })}
      {preview && <CardPreview instance={preview.instance} side={preview.side} dim={preview.dim} />}
    </div>
  );
}

const DAMAGE_HELP =
  'Lasting damage is the average number of personnel a stack returns to the hand, over its plays. Stops do not count: a stopped personnel is unstopped at the start of the next turn.';

function DamageHelp() {
  return (
    <p className="text-text-secondary" data-testid="lab-damage-help">
      {DAMAGE_HELP} It breaks ties between stacks with the same P(fail), and a tie after that goes to the stack with
      fewer dilemmas under the mission. When no stack can fail (P(fail) under 5%), damage alone ranks them, and when
      some stack is all but sure to fail (90% or more), damage ranks those stacks.
    </p>
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
      <DamageHelp />
      <p className="text-text-secondary">
        Decision mode: {result.mode}. Method: {result.method} search, {result.stackCount.toLocaleString()} legal stacks,{' '}
        {result.plays.toLocaleString()} plays, <span data-testid="lab-ms">{ms.toFixed(0)} ms</span> on the{' '}
        <span data-testid="lab-thread">{thread}</span> thread.
      </p>
      {baseline && (
        <p className="text-text-secondary">
          A random legal stack, the baseline: {stackText(baseline.stack)}: <ScoreLine score={baseline} />.
        </p>
      )}
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
          <th title={DAMAGE_HELP}>Damage</th>
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
